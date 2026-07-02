import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tournament: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/session-store", () => ({
  revokeAllForUser: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { revokeAllForUser } from "@/lib/session-store";
import {
  getAdminOverview,
  listUsers,
  getUserAdminDetail,
  updateUser,
  deleteUser,
  listAllTournaments,
  getTournamentAdminDetail,
  updateTournament,
} from "./admin";

const userMocks = prisma.user as unknown as {
  count: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const tournamentMocks = prisma.tournament as unknown as {
  count: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const revokeAllForUserMock = revokeAllForUser as ReturnType<typeof vi.fn>;

function mockUser(
  overrides: Partial<{
    id: string;
    username: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    tournaments: unknown[];
  }> = {},
) {
  return {
    id: "u1",
    username: "admin",
    role: "ADMIN",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    tournaments: [],
    ...overrides,
  };
}

function mockTournament(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "t1",
    name: "Tournament",
    gameTitle: "Game",
    status: "ACTIVE",
    asset: "XLM",
    entryFee: BigInt(100),
    firstBps: 5000,
    secondBps: 3000,
    thirdBps: 2000,
    contractId: "contract-id",
    tokenAddr: "token-addr",
    organizerId: "u2",
    organizer: { id: "u2", username: "organizer" },
    organizerAddr: "organizer-addr",
    refereeAddr: "referee-addr",
    coverImageKey: null,
    participants: [],
    payouts: [],
    createdAt: new Date(0),
    finalizedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

describe("getAdminOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userMocks.count.mockResolvedValue(4);
    tournamentMocks.count.mockResolvedValue(7);
    tournamentMocks.groupBy.mockResolvedValue([{ status: "ACTIVE", _count: { _all: 2 } }]);
    userMocks.findMany.mockResolvedValue([
      { id: "u1", username: "admin", role: "ADMIN", createdAt: new Date(0) },
    ]);
  });

  it("returns counts and users", async () => {
    const o = await getAdminOverview();
    expect(o.userCount).toBe(4);
    expect(o.tournamentCount).toBe(7);
    expect(o.byStatus.ACTIVE).toBe(2);
    expect(o.users[0]!.username).toBe("admin");
  });

  it("initialises zero counts for statuses not returned by groupBy", async () => {
    const o = await getAdminOverview();
    expect(o.byStatus.DRAFT).toBe(0);
    expect(o.byStatus.FINISHED).toBe(0);
    expect(o.byStatus.CANCELLED).toBe(0);
  });

  it("serialises createdAt to ISO string", async () => {
    const o = await getAdminOverview();
    expect(typeof o.users[0]!.createdAt).toBe("string");
    expect(o.users[0]!.createdAt).toBe(new Date(0).toISOString());
  });

  it("does not include passwordHash in returned users", async () => {
    const o = await getAdminOverview();
    for (const u of o.users) {
      expect(u).not.toHaveProperty("passwordHash");
    }
  });
});

describe("listUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paginates users and returns a nextCursor", async () => {
    const users = Array.from({ length: 21 }, (_, i) => ({
      id: `u${i}`,
      username: `user${i}`,
      role: "ORGANIZER",
      createdAt: new Date(i * 1000),
    }));
    userMocks.findMany.mockResolvedValue(users);

    const { items, nextCursor } = await listUsers({ take: 20 });
    expect(items).toHaveLength(20);
    expect(nextCursor).toBe("u20");
  });

  it("returns null nextCursor when there are no more pages", async () => {
    userMocks.findMany.mockResolvedValue([
      { id: "u1", username: "user1", role: "ORGANIZER", createdAt: new Date(0) },
    ]);

    const { items, nextCursor } = await listUsers({ take: 20 });
    expect(items).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });
});

describe("getUserAdminDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user detail with tournaments and serialised dates", async () => {
    userMocks.findUnique.mockResolvedValue(
      mockUser({
        tournaments: [
          { id: "t1", name: "T1", gameTitle: "G1", status: "ACTIVE", createdAt: new Date(1000) },
        ],
      }),
    );

    const detail = await getUserAdminDetail("u1");
    expect(detail).not.toBeNull();
    expect(detail!.username).toBe("admin");
    expect(detail!.tournaments).toHaveLength(1);
    expect(detail!.tournaments[0]!.createdAt).toBe(new Date(1000).toISOString());
    expect(detail).not.toHaveProperty("passwordHash");
  });

  it("returns null when user is not found", async () => {
    userMocks.findUnique.mockResolvedValue(null);
    expect(await getUserAdminDetail("missing")).toBeNull();
  });
});

describe("updateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userMocks.update.mockResolvedValue({});
  });

  it("updates the user role and revokes sessions", async () => {
    const result = await updateUser("u2", { role: "ADMIN" }, { id: "u1", role: "ADMIN" });
    expect(userMocks.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { role: "ADMIN" },
    });
    expect(revokeAllForUserMock).toHaveBeenCalledWith("u2");
    expect(result).toEqual({});
  });

  it("blocks self-demote", async () => {
    await expect(
      updateUser("u1", { role: "ORGANIZER" }, { id: "u1", role: "ADMIN" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(userMocks.update).not.toHaveBeenCalled();
    expect(revokeAllForUserMock).not.toHaveBeenCalled();
  });

  it("generates and persists a temporary password and revokes sessions", async () => {
    const result = await updateUser("u2", { resetPassword: true }, { id: "u1", role: "ADMIN" });
    expect(result.tempPassword).toBeDefined();
    expect(result.tempPassword).toHaveLength(48);
    expect(revokeAllForUserMock).toHaveBeenCalledWith("u2");

    const call = userMocks.update.mock.calls[0] as [
      { where: { id: string }; data: { passwordHash?: string } },
    ];
    const passwordHash = call[0].data.passwordHash;
    expect(passwordHash).toBeDefined();
    expect(await verifyPassword(passwordHash!, result.tempPassword!)).toBe(true);
  });

  it("throws 404 when user does not exist", async () => {
    const error = new Error("Record not found") as Error & { code: string };
    error.code = "P2025";
    userMocks.update.mockRejectedValue(error);

    await expect(
      updateUser("missing", { role: "ADMIN" }, { id: "u1", role: "ADMIN" }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("deleteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a user with no tournaments", async () => {
    userMocks.findUnique.mockResolvedValue({ id: "u2", _count: { tournaments: 0 } });
    await deleteUser("u2", "u1");
    expect(revokeAllForUserMock).toHaveBeenCalledWith("u2");
    expect(userMocks.delete).toHaveBeenCalledWith({ where: { id: "u2" } });
  });

  it("blocks self-delete", async () => {
    await expect(deleteUser("u1", "u1")).rejects.toMatchObject({ status: 409 });
    expect(userMocks.findUnique).not.toHaveBeenCalled();
  });

  it("blocks deletion when user owns tournaments", async () => {
    userMocks.findUnique.mockResolvedValue({ id: "u2", _count: { tournaments: 3 } });
    await expect(deleteUser("u2", "u1")).rejects.toMatchObject({ status: 409 });
    expect(userMocks.delete).not.toHaveBeenCalled();
  });

  it("throws 404 when user does not exist", async () => {
    userMocks.findUnique.mockResolvedValue(null);
    await expect(deleteUser("missing", "u1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("listAllTournaments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tournaments with organizer and participant count", async () => {
    tournamentMocks.findMany.mockResolvedValue([mockTournament({ _count: { participants: 5 } })]);

    const { items, nextCursor } = await listAllTournaments({ take: 20 });
    expect(items).toHaveLength(1);
    expect(items[0]!.organizerUsername).toBe("organizer");
    expect(items[0]!.participantCount).toBe(5);
    expect(items[0]!.pool).toBe("500");
    expect(nextCursor).toBeNull();
  });

  it("paginates tournaments", async () => {
    const tournaments = Array.from({ length: 21 }, (_, i) =>
      mockTournament({ id: `t${i}`, _count: { participants: 0 } }),
    );
    tournamentMocks.findMany.mockResolvedValue(tournaments);

    const { items, nextCursor } = await listAllTournaments({ take: 20 });
    expect(items).toHaveLength(20);
    expect(nextCursor).toBe("t20");
  });
});

describe("getTournamentAdminDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tournament detail with organizer and serialized dates", async () => {
    tournamentMocks.findUnique.mockResolvedValue(
      mockTournament({
        participants: [{ playerAddr: "p1", joinedAt: new Date(1000), joinTxHash: "tx1" }],
        payouts: [{ rank: 1, playerAddr: "p1", amount: BigInt(100), txHash: "tx2" }],
      }),
    );

    const detail = await getTournamentAdminDetail("t1");
    expect(detail).not.toBeNull();
    expect(detail!.organizerUsername).toBe("organizer");
    expect(detail!.participants).toHaveLength(1);
    expect(detail!.payouts).toHaveLength(1);
    expect(detail!.pool).toBe("100");
  });

  it("returns null when tournament is not found", async () => {
    tournamentMocks.findUnique.mockResolvedValue(null);
    expect(await getTournamentAdminDetail("missing")).toBeNull();
  });
});

describe("updateTournament", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tournamentMocks.findUnique.mockResolvedValue(mockTournament({ status: "ACTIVE" }));
    tournamentMocks.update.mockResolvedValue({});
  });

  it("updates name and gameTitle", async () => {
    await updateTournament("t1", { name: "New Name", gameTitle: "New Game" }, "admin");
    expect(tournamentMocks.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { name: "New Name", gameTitle: "New Game" },
    });
  });

  it("marks tournament as cancelled in DB only", async () => {
    await updateTournament("t1", { status: "CANCELLED" }, "admin");
    const call = tournamentMocks.update.mock.calls[0] as [
      { where: { id: string }; data: { status: string; cancelledAt: Date } },
    ];
    expect(call[0].data.status).toBe("CANCELLED");
    expect(call[0].data.cancelledAt).toBeInstanceOf(Date);
  });

  it("throws 404 when tournament does not exist", async () => {
    tournamentMocks.findUnique.mockResolvedValue(null);

    await expect(updateTournament("missing", { name: "X" }, "admin")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 when tournament is already cancelled", async () => {
    tournamentMocks.findUnique.mockResolvedValue(mockTournament({ status: "CANCELLED" }));

    await expect(updateTournament("t1", { status: "CANCELLED" }, "admin")).rejects.toMatchObject({
      status: 409,
    });
    expect(tournamentMocks.update).not.toHaveBeenCalled();
  });

  it("throws 409 when tournament is finished", async () => {
    tournamentMocks.findUnique.mockResolvedValue(mockTournament({ status: "FINISHED" }));

    await expect(updateTournament("t1", { status: "CANCELLED" }, "admin")).rejects.toMatchObject({
      status: 409,
    });
    expect(tournamentMocks.update).not.toHaveBeenCalled();
  });
});
