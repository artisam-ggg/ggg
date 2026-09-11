import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  buildCancelTx,
  buildDeployInitializeTx,
  buildInitializeTx,
  readSettlementDeadline,
  buildFinalizeTx,
  buildClaimRefundTx,
  buildJoinTx,
  explorerContractUrl,
  explorerTxUrl,
  resolveSacAddress,
  StellarError,
  submitSignedXdr,
  StellarError,
  validateInitializeXdr,
} from "@/lib/stellar";

import type {
  CreateTournamentInput,
  FinalizeInput,
  ListQueryInput,
  SubmitInput,
} from "@/lib/validation/tournament";

export async function createTournament(
  input: CreateTournamentInput,
  userId: string,
): Promise<{ tournamentId: string; unsignedXdr: string; network: string }> {
  const tokenAddr = resolveSacAddress(input.asset);

  const tournament = await prisma.tournament.create({
    data: {
      name: input.name,
      gameTitle: input.gameTitle,
      asset: input.asset,
      entryFee: input.entryFee,
      firstBps: input.distributionBps[0],
      secondBps: input.distributionBps[1],
      thirdBps: input.distributionBps[2],
      organizerId: userId,
      organizerAddr: input.organizerAddress,
      refereeAddr: input.refereeAddress,
      settlementDeadline: new Date(input.settlementDeadline * 1000),
      tokenAddr,
      coverImageKey: input.coverImageKey ?? null,
      status: "DRAFT",
    },
  });

  const { xdr: unsignedXdr } = await buildDeployInitializeTx({
    organizerAddress: input.organizerAddress,
    refereeAddress: input.refereeAddress,
    tokenAddr,
    entryFee: input.entryFee,
    distributionBps: input.distributionBps,
    settlementDeadline: BigInt(input.settlementDeadline),
  });

  return { tournamentId: tournament.id, unsignedXdr, network: env.STELLAR_NETWORK };
}

export interface SubmitTxResult {
  txHash: string;
  contractId?: string | null;
  status: string;
  explorerUrl: string;
  /**
   * Set on a successful `deploy`: the unsigned `initialize` XDR for the
   * just-created contract. The escrow Wasm has no Soroban constructor, so the
   * organiser must sign this second transaction to set the contract's state
   * (organizer/referee/token/fee) before anyone can join. See buildInitializeTx.
   */
  initializeXdr?: string;
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
 * Builds the unsigned `initialize` XDR for a deployed tournament contract from
 * its persisted parameters. Missing or expired deadlines fail closed: the
 * contract must never be presented as active without a valid initialization.
 */
async function buildInitXdrFor(
  tournament: {
    organizerAddr: string;
    refereeAddr: string;
    tokenAddr: string | null;
    entryFee: bigint;
    firstBps: number;
    secondBps: number;
    thirdBps: number;
    settlementDeadline: Date | null;
  },
  contractId: string,
): Promise<string> {
  const settlementDeadline = requireFutureSettlementDeadline(tournament.settlementDeadline);
  if (!tournament.tokenAddr) {
    throw Object.assign(new Error("Tournament is missing its escrow token"), { status: 409 });
  }
  const { xdr } = await buildInitializeTx({
    contractId,
    organizerAddress: tournament.organizerAddr,
    refereeAddress: tournament.refereeAddr,
    tokenAddr: tournament.tokenAddr,
    entryFee: tournament.entryFee,
    distributionBps: [tournament.firstBps, tournament.secondBps, tournament.thirdBps],
    settlementDeadline: BigInt(Math.floor(settlementDeadline.getTime() / 1000)),
  });
  return xdr;
}

async function buildInitRecoveryXdr(
  tournament: Parameters<typeof buildInitXdrFor>[0],
  contractId: string,
): Promise<string> {
  try {
    return await buildInitXdrFor(tournament, contractId);
  } catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    throw new StellarError(
      "SIMULATION_FAILED",
      "Contract deployed successfully, but initialization needs to be retried.",
      { cause: error },
    );
  }
}

/**
 * Submits a client-signed XDR on-chain and reconciles confirmed state into the
 * database. Mutates the tournament record ONLY after the Stellar network
 * confirms success (`status === "SUCCESS"`). Never persists success state on an
 * optimistic or failed result.
 *
 * Ownership: deploy/cancel are organiser-only; finalize is organiser/referee;
 * join is public (participant records are created by the event subscriber in
 * Phase 5).
 */
export async function submitTournamentTx(
  id: string,
  input: SubmitInput,
  userId: string,
): Promise<SubmitTxResult> {
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    throw Object.assign(new Error("Tournament not found"), { status: 404 });
  }

  // deploy, initialize and cancel are organiser-scoped (IDOR guard).
  if (
    (input.intent === "deploy" || input.intent === "initialize" || input.intent === "cancel") &&
    tournament.organizerId !== userId
  ) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  // Guard against re-submitting an already-confirmed deploy. contractId has a
  // @unique constraint in the Prisma schema, so return a fresh initialize XDR
  // for an interrupted deploy→initialize flow instead of submitting again.
  if (input.intent === "deploy" && tournament.contractId) {
    const initializeXdr = await buildInitRecoveryXdr(tournament, tournament.contractId);
    return {
      txHash: tournament.deployTxHash ?? "",
      contractId: tournament.contractId,
      status: tournament.status,
      explorerUrl: explorerTxUrl(tournament.deployTxHash ?? ""),
      initializeXdr,
    };
  }

  if (input.intent === "deploy") {
    requireFutureSettlementDeadline(tournament.settlementDeadline);
  }

  if (input.intent === "initialize") {
    if (tournament.status !== "DRAFT" || !tournament.contractId) {
      throw Object.assign(new Error("Tournament is not ready for initialization"), { status: 409 });
    }
    const settlementDeadline = requireFutureSettlementDeadline(tournament.settlementDeadline);
    if (!tournament.tokenAddr) {
      throw Object.assign(new Error("Tournament is missing its escrow token"), { status: 409 });
    }
    validateInitializeXdr(input.signedXdr, {
      contractId: tournament.contractId,
      organizerAddress: tournament.organizerAddr,
      refereeAddress: tournament.refereeAddr,
      tokenAddr: tournament.tokenAddr,
      entryFee: tournament.entryFee,
      distributionBps: [tournament.firstBps, tournament.secondBps, tournament.thirdBps],
      settlementDeadline: BigInt(Math.floor(settlementDeadline.getTime() / 1000)),
    });

    // A previous initialize may have succeeded while its read-back failed. Avoid
    // re-submitting it: initialize is one-time on the contract.
    let confirmedDeadline: bigint | undefined;
    try {
      confirmedDeadline = await readSettlementDeadline({
        contractId: tournament.contractId,
        sourceAddress: tournament.organizerAddr,
      });
    } catch {
      // Once initialize has been submitted, never replay its signed XDR while
      // chain-state reconciliation is unavailable.
      if (tournament.initializeTxHash) {
        throw Object.assign(new Error("Unable to confirm on-chain initialization"), {
          status: 502,
        });
      }
    }
    if (confirmedDeadline !== undefined) {
      if (confirmedDeadline !== BigInt(Math.floor(settlementDeadline.getTime() / 1000))) {
        throw Object.assign(
          new Error("On-chain settlement deadline does not match this tournament"),
          { status: 502 },
        );
      }
      const updated = await prisma.tournament.update({
        where: { id },
        data: { status: "ACTIVE", deadlineConfirmedAt: new Date() },
      });
      return {
        txHash: tournament.deployTxHash ?? "",
        contractId: updated.contractId,
        status: updated.status,
        explorerUrl: explorerContractUrl(tournament.contractId),
      };
    }
    if (tournament.initializeTxHash) {
      throw Object.assign(new Error("On-chain initialization could not be confirmed"), {
        status: 502,
      });
    }
  }

  const result = await submitSignedXdr(input.signedXdr, input.intent);

  if (result.status === "FAILED") {
    // Do NOT mutate tournament to any success state.
    throw new StellarError("TX_FAILED", "Transaction failed on-chain", {
      txHash: result.hash,
      retryable: false,
    });
  }

  // Persist confirmed on-chain state.
  if (input.intent === "deploy") {
    const updated = await prisma.tournament.update({
      where: { id },
      data: {
        contractId: result.contractId ?? null,
        deployTxHash: result.hash,
      },
    });
    // The contract is deployed but remains DRAFT until initialize confirms.
    if (!updated.contractId) {
      throw Object.assign(new Error("Deployment succeeded without a contract ID"), { status: 502 });
    }
    const initializeXdr = await buildInitRecoveryXdr(updated, updated.contractId);
    return {
      txHash: result.hash,
      contractId: updated.contractId,
      status: updated.status,
      explorerUrl: explorerTxUrl(result.hash),
      initializeXdr,
    };
  }

  // initialize: a confirmed state-setting transaction makes the tournament
  // joinable.
  if (input.intent === "initialize") {
    const settlementDeadline = requireFutureSettlementDeadline(tournament.settlementDeadline);
    const expectedDeadline = BigInt(Math.floor(settlementDeadline.getTime() / 1000));
    await prisma.tournament.update({ where: { id }, data: { initializeTxHash: result.hash } });
    let confirmedDeadline: bigint | undefined;
    try {
      confirmedDeadline = await readSettlementDeadline({
        contractId: tournament.contractId!,
        sourceAddress: tournament.organizerAddr,
      });
    } catch {
      throw Object.assign(new Error("Unable to confirm on-chain initialization"), { status: 502 });
    }
    if (confirmedDeadline === undefined) {
      throw Object.assign(new Error("On-chain initialization could not be confirmed"), {
        status: 502,
      });
    }
    if (confirmedDeadline !== expectedDeadline) {
      throw Object.assign(
        new Error("On-chain settlement deadline does not match this tournament"),
        {
          status: 502,
        },
      );
    }
    const updated = await prisma.tournament.update({
      where: { id },
      data: { status: "ACTIVE", deadlineConfirmedAt: new Date() },
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

  // join: participant records created by event subscriber (Phase 5); no DB mutation here.
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
    include: { _count: { select: { participants: true } } },
    orderBy: { createdAt: "desc" },
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });

  const items = rows.slice(0, q.take).map((t) => ({
    id: t.id,
    name: t.name,
    gameTitle: t.gameTitle,
    status: t.status,
    asset: t.asset,
    entryFee: t.entryFee.toString(),
    pool: (t.entryFee * BigInt(t._count.participants)).toString(),
    participantCount: t._count.participants,
  }));

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
  const { xdr, network } = await buildJoinTx({
    contractId: t.contractId,
    playerAddress,
  });
  return { unsignedXdr: xdr, network };
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
  const { xdr, network } = await buildClaimRefundTx({
    contractId: t.contractId,
    playerAddress,
    submitterAddress,
  });
  return { unsignedXdr: xdr, network };
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
  const registered = new Set(t.participants.map((p) => p.playerAddr));
  for (const addr of [input.first, input.second, input.third]) {
    if (!registered.has(addr)) {
      throw Object.assign(new Error(`Winner ${addr} is not a registered participant`), {
        status: 422,
      });
    }
  }
  const { xdr, network } = await buildFinalizeTx({
    contractId: t.contractId,
    refereeAddress: t.refereeAddr,
    first: input.first,
    second: input.second,
    third: input.third,
  });
  return { unsignedXdr: xdr, network };
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
  const { xdr, network } = await buildCancelTx({
    contractId: t.contractId,
    organizerAddress: t.organizerAddr,
  });
  return { unsignedXdr: xdr, network };
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

  const refundClaims = t.events.flatMap((event) => {
    const payload = event.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
    const { player, amount } = payload as Record<string, unknown>;
    return typeof player === "string" && typeof amount === "string" && /^[1-9]\d*$/.test(amount)
      ? [{ player, amount }]
      : [];
  });
  const refunded = refundClaims.reduce((total, claim) => total + BigInt(claim.amount), 0n);
  const grossPool = t.entryFee * BigInt(t.participants.length);
  const pool = (grossPool > refunded ? grossPool - refunded : 0n).toString();
  const confirmedSettlementDeadline = t.deadlineConfirmedAt ? t.settlementDeadline : null;

  return {
    id: t.id,
    name: t.name,
    gameTitle: t.gameTitle,
    status: t.status,
    asset: t.asset,
    entryFee: t.entryFee.toString(),
    distributionBps: [t.firstBps, t.secondBps, t.thirdBps] as const,
    contractId: t.contractId,
    settlementDeadline: confirmedSettlementDeadline
      ? Math.floor(confirmedSettlementDeadline.getTime() / 1000)
      : null,
    contractVersion: confirmedSettlementDeadline
      ? "DEADLINE"
      : t.status === "DRAFT"
        ? "PENDING"
        : "LEGACY",
    contractUrl: t.contractId ? explorerContractUrl(t.contractId) : null,
    tokenAddr: t.tokenAddr,
    organizerId: t.organizerId,
    organizerAddr: t.organizerAddr,
    refereeAddr: t.refereeAddr,
    pool,
    refundClaimedPlayers: refundClaims.map((claim) => claim.player),
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
        t.settlementDeadline.getTime() <= Date.now()),
  };
}
