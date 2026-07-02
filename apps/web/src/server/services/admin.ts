import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { revokeAllForUser } from "@/lib/session-store";
import type { AppRole } from "../../../types/next-auth";
import type {
  AdminListQueryInput,
  AdminUpdateTournamentInput,
  AdminUpdateUserInput,
} from "@/lib/validation/admin";

function generateTempPassword(): string {
  return randomBytes(24).toString("hex");
}

export async function getAdminOverview() {
  const [userCount, tournamentCount, grouped, users] = await Promise.all([
    prisma.user.count(),
    prisma.tournament.count(),
    prisma.tournament.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const byStatus: Record<string, number> = {
    DRAFT: 0,
    ACTIVE: 0,
    FINISHED: 0,
    CANCELLED: 0,
  };
  for (const g of grouped) byStatus[g.status] = g._count._all;

  return {
    userCount,
    tournamentCount,
    byStatus,
    users: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
  };
}

export async function listUsers(q: AdminListQueryInput) {
  const rows = await prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });

  const items = rows.slice(0, q.take).map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  const nextCursor = rows.length > q.take ? (rows[q.take]?.id ?? null) : null;

  return { items, nextCursor };
}

export async function getUserAdminDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      tournaments: {
        select: {
          id: true,
          name: true,
          gameTitle: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) return null;

  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    tournaments: user.tournaments.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

export async function updateUser(
  id: string,
  input: AdminUpdateUserInput,
  actor: { id: string; role: AppRole },
): Promise<{ tempPassword?: string }> {
  if (id === actor.id && input.role && input.role !== "ADMIN") {
    throw Object.assign(new Error("Admins cannot demote themselves"), { status: 409 });
  }

  const updateData: { role?: AppRole; passwordHash?: string } = {};
  let tempPassword: string | undefined;

  if (input.role) {
    updateData.role = input.role;
  }

  if (input.resetPassword) {
    tempPassword = generateTempPassword();
    updateData.passwordHash = await hashPassword(tempPassword);
  }

  if (input.role) {
    console.log(`[admin:audit] role changed by ${actor.id}: user ${id} -> ${input.role}`);
  }
  if (input.resetPassword) {
    console.log(`[admin:audit] password reset by ${actor.id}: user ${id}`);
  }

  // Invalidate existing sessions BEFORE persisting the change so a Redis failure
  // cannot leave stale sessions attached to a new role/password.
  if (input.role || input.resetPassword) {
    await revokeAllForUser(id);
  }

  try {
    await prisma.user.update({
      where: { id },
      data: updateData,
    });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "P2025") {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }
    throw e;
  }

  return tempPassword ? { tempPassword } : {};
}

export async function deleteUser(id: string, actorId: string) {
  if (id === actorId) {
    throw Object.assign(new Error("Admins cannot delete themselves"), { status: 409 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { tournaments: true } } },
  });

  if (!user) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }

  if (user._count.tournaments > 0) {
    throw Object.assign(
      new Error(
        "Cannot delete a user who owns tournaments. Reassign or remove their tournaments first.",
      ),
      { status: 409 },
    );
  }

  await revokeAllForUser(id);
  await prisma.user.delete({ where: { id } });
  console.log(`[admin:audit] user deleted by ${actorId}: user ${id}`);
}

export async function listAllTournaments(q: AdminListQueryInput) {
  const rows = await prisma.tournament.findMany({
    include: {
      organizer: { select: { id: true, username: true } },
      _count: { select: { participants: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
    organizerId: t.organizerId,
    organizerUsername: t.organizer.username,
    createdAt: t.createdAt.toISOString(),
  }));

  const nextCursor = rows.length > q.take ? (rows[q.take]?.id ?? null) : null;

  return { items, nextCursor };
}

export async function getTournamentAdminDetail(id: string) {
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      organizer: { select: { id: true, username: true } },
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
    tokenAddr: t.tokenAddr,
    organizerId: t.organizerId,
    organizerUsername: t.organizer.username,
    organizerAddr: t.organizerAddr,
    refereeAddr: t.refereeAddr,
    coverImageKey: t.coverImageKey,
    pool,
    participants: t.participants.map((p) => ({
      playerAddr: p.playerAddr,
      joinedAt: p.joinedAt.toISOString(),
      joinTxHash: p.joinTxHash,
    })),
    payouts: t.payouts.map((p) => ({
      rank: p.rank,
      playerAddr: p.playerAddr,
      amount: p.amount.toString(),
      txHash: p.txHash,
    })),
    createdAt: t.createdAt.toISOString(),
    finalizedAt: t.finalizedAt?.toISOString() ?? null,
    cancelledAt: t.cancelledAt?.toISOString() ?? null,
  };
}

export async function updateTournament(
  id: string,
  input: AdminUpdateTournamentInput,
  actorId: string,
) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!tournament) {
    throw Object.assign(new Error("Tournament not found"), { status: 404 });
  }

  const data: { name?: string; gameTitle?: string; status?: "CANCELLED"; cancelledAt?: Date } = {};

  if (input.name) data.name = input.name;
  if (input.gameTitle) data.gameTitle = input.gameTitle;
  if (input.status === "CANCELLED") {
    if (tournament.status === "CANCELLED") {
      throw Object.assign(new Error("Tournament is already cancelled"), { status: 409 });
    }
    if (tournament.status === "FINISHED") {
      throw Object.assign(new Error("Cannot cancel a finished tournament"), { status: 409 });
    }
    data.status = "CANCELLED";
    data.cancelledAt = new Date();
  }

  await prisma.tournament.update({ where: { id }, data });

  if (input.name || input.gameTitle) {
    console.log(`[admin:audit] tournament metadata updated by ${actorId}: tournament ${id}`, {
      name: input.name,
      gameTitle: input.gameTitle,
    });
  }
  if (input.status === "CANCELLED") {
    console.log(`[admin:audit] tournament cancelled by ${actorId}: tournament ${id}`);
  }
}
