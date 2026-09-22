import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { EscrowSdkError, type ConfirmedEscrowTransaction } from "@ggg/escrow-sdk";
import {
  escrowSdk,
  escrowToken,
  escrowVersion,
  requireCurrentEscrow,
  savePrepared,
  findPrepared,
  deploymentSalt,
  CURRENT_ESCROW_WASM_HASH,
} from "@/lib/stellar/escrow-sdk";
import { explorerContractUrl, explorerTxUrl, StellarError } from "@/lib/stellar";

import type {
  CreateTournamentInput,
  FinalizeInput,
  ListQueryInput,
  SubmitInput,
} from "@/lib/validation/tournament";

export type TournamentDisplayStatus =
  | "DRAFT"
  | "ACTIVE"
  | "REFUNDS_OPEN"
  | "REFUNDED"
  | "CANCELLED"
  | "FINISHED";

type PersistedStatus = "DRAFT" | "ACTIVE" | "CANCELLED" | "FINISHED";

export function getTournamentDisplayStatus(
  tournament: {
    status: PersistedStatus;
    settlementDeadline: Date | null;
    deadlineConfirmedAt: Date | null;
    participantAddresses: string[];
    refundClaimedPlayers: string[];
  },
  now = Date.now(),
): TournamentDisplayStatus {
  if (tournament.status !== "ACTIVE") return tournament.status;
  if (
    !tournament.deadlineConfirmedAt ||
    !tournament.settlementDeadline ||
    tournament.settlementDeadline.getTime() > now
  ) {
    return "ACTIVE";
  }
  const claimedPlayers = new Set(tournament.refundClaimedPlayers);
  return tournament.participantAddresses.length > 0 &&
    tournament.participantAddresses.every((player) => claimedPlayers.has(player))
    ? "REFUNDED"
    : "REFUNDS_OPEN";
}

function parseRefundClaims(events: { payload: unknown }[]) {
  return events.flatMap((event) => {
    const payload = event.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
    const { player, amount } = payload as Record<string, unknown>;
    return typeof player === "string" && typeof amount === "string" && /^[1-9]\d*$/.test(amount)
      ? [{ player, amount }]
      : [];
  });
}

function sumRefundClaims(claims: { player: string; amount: string }[]) {
  return [...new Map(claims.map((claim) => [claim.player, BigInt(claim.amount)])).values()].reduce(
    (total, amount) => total + amount,
    0n,
  );
}

export async function createTournament(
  input: CreateTournamentInput,
  userId: string,
): Promise<{ tournamentId: string; unsignedXdr: string; network: string }> {
  if (env.ESCROW_WASM_HASH?.toLowerCase() !== CURRENT_ESCROW_WASM_HASH) {
    throw new EscrowSdkError(
      "INVALID_INPUT",
      "The configured escrow WASM is not the supported SDK ABI",
    );
  }
  const tokenAddr = escrowToken(input.asset);

  const tournament = await prisma.tournament.create({
    data: {
      name: input.name,
      gameTitle: input.gameTitle,
      asset: input.asset,
      entryFee: input.entryFee,
      distributionBps: input.distributionBps,
      organizerId: userId,
      organizerAddr: input.organizerAddress,
      refereeAddr: input.refereeAddress,
      settlementDeadline: new Date(input.settlementDeadline * 1000),
      tokenAddr,
      coverImageKey: input.coverImageKey ?? null,
      status: "DRAFT",
    },
  });

  const built = await escrowSdk().buildDeploy(input.organizerAddress, {
    referee: input.refereeAddress,
    token: tokenAddr,
    entryFee: input.entryFee,
    distributionBps: input.distributionBps,
    settlementDeadline: BigInt(input.settlementDeadline),
    salt: deploymentSalt(tournament.id),
  });
  const { unsignedXdr } = await savePrepared(tournament.id, built);
  return { tournamentId: tournament.id, unsignedXdr, network: env.STELLAR_NETWORK };
}

export interface SubmitTxResult {
  txHash: string;
  contractId?: string | null;
  status: string;
  explorerUrl: string;
}

function requireFutureSettlementDeadline(deadline: Date | null): Date {
  if (!deadline) {
    throw Object.assign(new Error("Tournament is missing a settlement deadline"), { status: 409 });
  }
  if (deadline.getTime() <= Date.now()) {
    throw Object.assign(new Error("Settlement deadline has expired"), { status: 409 });
  }
  return deadline;
}

/**
 * Submits a client-signed XDR on-chain and reconciles confirmed state into the
 * database. Mutates the tournament record ONLY after the Stellar network
 * confirms success (`status === "SUCCESS"`). Never persists success state on an
 * optimistic or failed result.
 *
 * Ownership: deploy/cancel are organiser-only; finalize is organiser/referee;
 * join is public and its confirmed participant is reconciled with the event subscriber.
 */
export async function submitTournamentTx(
  id: string,
  input: SubmitInput,
  userId: string | null,
): Promise<SubmitTxResult> {
  const submittedAt = new Date();
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    throw Object.assign(new Error("Tournament not found"), { status: 404 });
  }

  // Deploy and cancel are organiser-scoped (IDOR guard).
  if (
    (input.intent === "deploy" || input.intent === "cancel") &&
    tournament.organizerId !== userId
  ) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  const sdk =
    input.intent === "deploy"
      ? escrowSdk()
      : tournament.contractId
        ? await requireCurrentEscrow(tournament.contractId)
        : escrowSdk();
  const built = await findPrepared(id, input.signedXdr, input.intent);
  sdk.validateSignedXdr(input.signedXdr, built, env.NETWORK_PASSPHRASE);
  let recoveredDeployment: ConfirmedEscrowTransaction | null = null;
  if (input.intent === "deploy") {
    if (tournament.status !== "DRAFT" || tournament.contractId || tournament.deployTxHash) {
      throw Object.assign(new Error("Tournament has already been deployed"), { status: 409 });
    }
    const settlementDeadline = tournament.settlementDeadline;
    if (!settlementDeadline) {
      throw Object.assign(new Error("Tournament is missing a settlement deadline"), {
        status: 409,
      });
    }
    if (!tournament.tokenAddr) {
      throw Object.assign(new Error("Tournament is missing its escrow token"), { status: 409 });
    }
    if (built.source !== tournament.organizerAddr) {
      throw Object.assign(new Error("Deployment signer differs from organizer"), { status: 403 });
    }
    const currentHash = built.hash;
    const pendingHash = tournament.pendingDeployTxHash;
    if (pendingHash) {
      const prior = await sdk.lookup(pendingHash, "deploy");
      if (prior.status === "SUCCESS") {
        recoveredDeployment = prior;
      } else if (prior.status === "FAILED" && pendingHash === currentHash) {
        await prisma.tournament.update({ where: { id }, data: { pendingDeployTxHash: null } });
        throw new StellarError("TX_FAILED", "Transaction failed on-chain", {
          txHash: pendingHash,
          retryable: false,
        });
      } else if (prior.status === "PENDING" && pendingHash !== currentHash) {
        throw new StellarError("TX_TIMEOUT", "Previous deployment is still unconfirmed", {
          txHash: pendingHash,
          retryable: true,
        });
      }
    }
    if (!recoveredDeployment) {
      requireFutureSettlementDeadline(settlementDeadline);
      if (pendingHash !== currentHash) {
        await prisma.tournament.update({
          where: { id },
          data: { pendingDeployTxHash: currentHash },
        });
      }
    }
  }

  let joinPlayer: string | null = null;
  let joinTxHash: string | null = null;
  let joinSubmittedAt: Date | null = null;
  if (input.intent === "join") {
    if (tournament.status !== "ACTIVE" || !tournament.contractId) {
      throw Object.assign(new Error("Tournament is not open for joining"), { status: 409 });
    }
    joinPlayer = built.source;
    joinTxHash = built.hash;
    const submission = await prisma.joinSubmission.upsert({
      where: { txHash: joinTxHash },
      create: {
        txHash: joinTxHash,
        tournamentId: id,
        playerAddr: joinPlayer,
        submittedAt,
      },
      update: {},
    });
    joinSubmittedAt = submission.submittedAt;
  }

  let result: ConfirmedEscrowTransaction;
  try {
    result =
      recoveredDeployment ?? (await sdk.submit(input.signedXdr, built, env.NETWORK_PASSPHRASE));
  } catch (error) {
    if (
      input.intent === "deploy" &&
      error instanceof EscrowSdkError &&
      error.code === "SUBMIT_REJECTED"
    ) {
      const currentHash = built.hash;
      const landed = await sdk.lookup(currentHash, "deploy");
      if (landed.status === "SUCCESS") {
        result = landed;
      } else if (landed.status === "FAILED" || tournament.pendingDeployTxHash !== currentHash) {
        await prisma.tournament.update({ where: { id }, data: { pendingDeployTxHash: null } });
        throw error;
      } else {
        throw new StellarError("TX_TIMEOUT", "Deployment result is still unconfirmed", {
          txHash: currentHash,
          retryable: true,
        });
      }
    } else {
      throw error;
    }
  }

  if (result.status === "FAILED") {
    if (joinTxHash) {
      await prisma.joinSubmission.deleteMany({ where: { txHash: joinTxHash } });
    }
    if (input.intent === "deploy") {
      await prisma.tournament.update({ where: { id }, data: { pendingDeployTxHash: null } });
    }
    // Do NOT mutate tournament to any success state.
    throw new StellarError("TX_FAILED", "Transaction failed on-chain", {
      txHash: result.hash,
      retryable: false,
    });
  }

  // Persist confirmed on-chain state.
  if (input.intent === "deploy") {
    if (!result.contractId) {
      throw Object.assign(new Error("Deployment succeeded without a contract ID"), { status: 502 });
    }
    const updated = await prisma.tournament.update({
      where: { id },
      data: {
        contractId: result.contractId,
        deployTxHash: result.hash,
        pendingDeployTxHash: null,
        status: "ACTIVE",
        deadlineConfirmedAt: new Date(),
      },
    });
    return {
      txHash: result.hash,
      contractId: updated.contractId,
      status: updated.status,
      explorerUrl: explorerTxUrl(result.hash),
    };
  }

  if (input.intent === "cancel") {
    const updated = await prisma.tournament.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return {
      txHash: result.hash,
      status: updated.status,
      explorerUrl: explorerTxUrl(result.hash),
    };
  }

  if (input.intent === "finalize") {
    const updated = await prisma.tournament.update({
      where: { id },
      data: { status: "FINISHED", finalizedAt: new Date() },
    });
    return {
      txHash: result.hash,
      status: updated.status,
      explorerUrl: explorerTxUrl(result.hash),
    };
  }

  if (input.intent === "join" && joinPlayer && joinTxHash && joinSubmittedAt) {
    try {
      await prisma.participant.upsert({
        where: { tournamentId_playerAddr: { tournamentId: id, playerAddr: joinPlayer } },
        create: {
          tournamentId: id,
          playerAddr: joinPlayer,
          joinTxHash: result.hash,
          joinedAt: joinSubmittedAt,
        },
        update: { joinTxHash: result.hash, joinedAt: joinSubmittedAt },
      });
      await prisma.joinSubmission.deleteMany({ where: { txHash: joinTxHash } });
    } catch (error) {
      console.error("Confirmed join participant reconciliation deferred", {
        tournamentId: id,
        playerAddr: joinPlayer,
        txHash: result.hash,
        submittedAt: joinSubmittedAt,
        error,
      });
    }
  }

  return {
    txHash: result.hash,
    status: tournament.status,
    explorerUrl: explorerTxUrl(result.hash),
  };
}

export async function listTournaments(userId: string, q: ListQueryInput) {
  const rows = await prisma.tournament.findMany({
    where: {
      organizerId: userId,
      ...(q.status ? { status: q.status } : {}),
    },
    include: {
      _count: { select: { participants: true } },
      participants: { select: { playerAddr: true } },
      payouts: { select: { amount: true } },
      events: {
        where: { type: "REFUND_CLAIMED" },
        select: { payload: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });

  const items = rows.slice(0, q.take).map((t) => {
    const participantAddresses = (t.participants ?? []).map(
      (participant) => participant.playerAddr,
    );
    const refundClaims = parseRefundClaims(t.events ?? []);
    const refundClaimedPlayers = [...new Set(refundClaims.map((claim) => claim.player))];
    const participants = new Set(participantAddresses);
    const totalCollected = t.entryFee * BigInt(t._count.participants);
    const totalPaidOut = (t.payouts ?? []).reduce((total, payout) => total + payout.amount, 0n);
    const totalRefunded = sumRefundClaims(refundClaims);
    const distributed = totalPaidOut + totalRefunded;
    const pool = totalCollected > distributed ? totalCollected - distributed : 0n;

    return {
      id: t.id,
      name: t.name,
      gameTitle: t.gameTitle,
      status: t.status,
      displayStatus: getTournamentDisplayStatus({
        status: t.status,
        settlementDeadline: t.settlementDeadline,
        deadlineConfirmedAt: t.deadlineConfirmedAt,
        participantAddresses,
        refundClaimedPlayers,
      }),
      asset: t.asset,
      entryFee: t.entryFee.toString(),
      pool: pool.toString(),
      totalCollected: totalCollected.toString(),
      totalPaidOut: totalPaidOut.toString(),
      totalRefunded: totalRefunded.toString(),
      participantCount: t._count.participants,
      refundClaimedCount: refundClaimedPlayers.filter((player) => participants.has(player)).length,
    };
  });

  const nextCursor = rows.length > q.take ? (rows[q.take]?.id ?? null) : null;

  return { items, nextCursor };
}

export async function buildJoin(
  id: string,
  playerAddress: string,
): Promise<{ unsignedXdr: string; network: string }> {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) {
    throw Object.assign(new Error("Tournament not found"), { status: 404 });
  }
  if (t.status !== "ACTIVE" || !t.contractId) {
    throw Object.assign(new Error("Tournament is not open for joining"), { status: 409 });
  }
  const participant = await prisma.participant.findUnique({
    where: { tournamentId_playerAddr: { tournamentId: id, playerAddr: playerAddress } },
  });
  if (participant) {
    throw Object.assign(new Error("You are already a participant in this tournament."), {
      status: 409,
    });
  }
  const sdk = await requireCurrentEscrow(t.contractId);
  return savePrepared(id, await sdk.buildJoin(playerAddress));
}

export async function buildRefundClaim(
  id: string,
  playerAddress: string,
  submitterAddress: string,
): Promise<{ unsignedXdr: string; network: string }> {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) throw Object.assign(new Error("Tournament not found"), { status: 404 });
  const deadlineReached =
    t.deadlineConfirmedAt != null &&
    t.settlementDeadline != null &&
    t.settlementDeadline.getTime() <= Date.now();
  if ((t.status !== "CANCELLED" && !(t.status === "ACTIVE" && deadlineReached)) || !t.contractId) {
    throw Object.assign(new Error("Tournament is not available for refund claims"), {
      status: 409,
    });
  }
  const sdk = await requireCurrentEscrow(t.contractId);
  return savePrepared(id, await sdk.buildClaimRefund(submitterAddress, playerAddress));
}

export async function buildFinalize(
  id: string,
  input: FinalizeInput,
  walletAddress: string,
): Promise<{ unsignedXdr: string; network: string }> {
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: { participants: true },
  });
  if (!t) {
    throw Object.assign(new Error("Tournament not found"), { status: 404 });
  }
  if (t.refereeAddr !== walletAddress) {
    throw Object.assign(new Error("Only the referee can finalize"), { status: 403 });
  }
  if (t.status !== "ACTIVE" || !t.contractId) {
    throw Object.assign(new Error("Tournament is not finalizable"), { status: 409 });
  }
  if (input.winners.length !== t.distributionBps.length) {
    throw Object.assign(new Error("Winner count must match the tournament payout split"), {
      status: 409,
    });
  }
  const registered = new Set(t.participants.map((p) => p.playerAddr));
  for (const addr of input.winners) {
    if (!registered.has(addr)) {
      throw Object.assign(new Error(`Winner ${addr} is not a registered participant`), {
        status: 422,
      });
    }
  }
  const sdk = await requireCurrentEscrow(t.contractId);
  return savePrepared(id, await sdk.buildFinalize(t.refereeAddr, input.winners));
}

export async function buildCancel(
  id: string,
  userId: string,
): Promise<{ unsignedXdr: string; network: string }> {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) {
    throw Object.assign(new Error("Tournament not found"), { status: 404 });
  }
  if (t.organizerId !== userId) {
    throw Object.assign(new Error("Only the organiser can cancel this tournament"), {
      status: 403,
    });
  }
  if (t.status !== "ACTIVE" || !t.contractId) {
    throw Object.assign(new Error("Only an active, deployed tournament can be cancelled"), {
      status: 409,
    });
  }
  const sdk = await requireCurrentEscrow(t.contractId);
  return savePrepared(id, await sdk.buildCancel(t.organizerAddr));
}

export async function getTournamentDetail(id: string) {
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      participants: { orderBy: { joinedAt: "asc" } },
      payouts: { orderBy: { rank: "asc" } },
      events: {
        where: { type: "REFUND_CLAIMED" },
        select: { payload: true },
      },
    },
  });

  if (!t) return null;

  const refundClaims = parseRefundClaims(t.events);
  const refundClaimedPlayers = [...new Set(refundClaims.map((claim) => claim.player))];
  const refunded = sumRefundClaims(refundClaims);
  const paidOut = t.payouts.reduce((total, payout) => total + payout.amount, 0n);
  const grossPool = t.entryFee * BigInt(t.participants.length);
  const distributed = paidOut + refunded;
  const pool = (grossPool > distributed ? grossPool - distributed : 0n).toString();
  const now = Date.now();
  let contractVersion: "CURRENT" | "UNSUPPORTED" | "UNAVAILABLE" | "PENDING" = "PENDING";
  let onChainDeadline: number | null = null;
  if (t.contractId) {
    try {
      contractVersion = await escrowVersion(t.contractId);
      if (contractVersion === "CURRENT") {
        const state = await escrowSdk(t.contractId).readTournament(t.organizerAddr);
        onChainDeadline = Number(state.settlement_deadline);
      }
    } catch {
      contractVersion = "UNAVAILABLE";
    }
  }

  return {
    id: t.id,
    name: t.name,
    gameTitle: t.gameTitle,
    coverImageUrl: t.coverImageKey ? `/api/tournaments/${encodeURIComponent(t.id)}/cover` : null,
    status: t.status,
    displayStatus: getTournamentDisplayStatus(
      {
        status: t.status,
        settlementDeadline: t.settlementDeadline,
        deadlineConfirmedAt: t.deadlineConfirmedAt,
        participantAddresses: t.participants.map((participant) => participant.playerAddr),
        refundClaimedPlayers,
      },
      now,
    ),
    asset: t.asset,
    entryFee: t.entryFee.toString(),
    distributionBps: t.distributionBps,
    contractId: t.contractId,
    settlementDeadline: onChainDeadline,
    contractVersion,
    contractUrl: t.contractId ? explorerContractUrl(t.contractId) : null,
    tokenAddr: t.tokenAddr,
    organizerId: t.organizerId,
    organizerAddr: t.organizerAddr,
    refereeAddr: t.refereeAddr,
    pool,
    refundClaimedPlayers,
    participants: t.participants.map((p) => ({
      playerAddr: p.playerAddr,
      joinedAt: p.joinedAt.toISOString(),
      joinTxHash: p.joinTxHash,
    })),
    winners: t.payouts.map((p) => ({
      rank: p.rank,
      playerAddr: p.playerAddr,
      amount: p.amount.toString(),
      txHash: p.txHash,
      explorerUrl: p.txHash ? explorerTxUrl(p.txHash) : null,
    })),
    refundsClaimable:
      t.status === "CANCELLED" ||
      (t.status === "ACTIVE" &&
        t.deadlineConfirmedAt != null &&
        t.settlementDeadline != null &&
        t.settlementDeadline.getTime() <= now),
  };
}
