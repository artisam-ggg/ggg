import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  buildCancelTx,
  buildDeployInitializeTx,
  buildInitializeTx,
  buildFinalizeTx,
  buildJoinTx,
  explorerContractUrl,
  explorerTxUrl,
  resolveSacAddress,
  submitSignedXdr,
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
      settlementDeadline: input.settlementDeadline,
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
    const initializeXdr = await buildInitXdrFor(tournament, tournament.contractId);
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
    requireFutureSettlementDeadline(tournament.settlementDeadline);
    validateInitializeXdr(input.signedXdr, tournament.contractId);
  }

  const result = await submitSignedXdr(input.signedXdr, input.intent);

  if (result.status === "FAILED") {
    // Do NOT mutate tournament to any success state.
    throw Object.assign(new Error(`Transaction failed on-chain (${result.hash})`), { status: 502 });
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
    const initializeXdr = await buildInitXdrFor(updated, updated.contractId);
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
    const updated = await prisma.tournament.update({
      where: { id },
      data: { status: "ACTIVE" },
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
  const { xdr, network } = await buildJoinTx({
    contractId: t.contractId,
    playerAddress,
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
    },
  });

  if (!t) return null;

  const pool = (t.entryFee * BigInt(t.participants.length)).toString();

  return {
    id: t.id,
    name: t.name,
    gameTitle: t.gameTitle,
    status: t.status,
    asset: t.asset,
    entryFee: t.entryFee.toString(),
    distributionBps: [t.firstBps, t.secondBps, t.thirdBps] as const,
    contractId: t.contractId,
    contractUrl: t.contractId ? explorerContractUrl(t.contractId) : null,
    tokenAddr: t.tokenAddr,
    organizerId: t.organizerId,
    organizerAddr: t.organizerAddr,
    refereeAddr: t.refereeAddr,
    pool,
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
  };
}
