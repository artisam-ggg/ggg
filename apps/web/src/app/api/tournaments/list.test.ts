import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth-guards", () => ({
  requireUser: vi.fn(async () => ({ id: "user_1", role: "ORGANIZER" })),
  AuthError: class AuthError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "AuthError";
      this.status = status;
    }
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: { tournament: { findMany: vi.fn() } },
}));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost:3000", STELLAR_NETWORK: "testnet" },
}));
vi.mock("@/lib/stellar", async (orig) => {
  const actual = await orig<typeof import("@/lib/stellar")>();
  return { ...actual, resolveSacAddress: vi.fn(() => "CSAC...NATIVE") };
});
vi.mock("@/lib/csrf", () => ({
  assertSameOrigin: vi.fn(),
  CsrfError: class CsrfError extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 9 })),
}));

import { GET } from "./route";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const findMany = prisma.tournament.findMany as ReturnType<typeof vi.fn>;

function makeGetReq(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

describe("GET /api/tournaments", () => {
  beforeEach(() => {
    findMany.mockReset();
    requireUserMock.mockResolvedValue({ id: "user_1", role: "ORGANIZER" });
  });

  it("scopes to the owner and applies status filter", async () => {
    findMany.mockResolvedValue([
      {
        id: "t_1",
        name: "Cup",
        gameTitle: "SF6",
        status: "ACTIVE",
        entryFee: 10n,
        asset: "XLM",
        _count: { participants: 3 },
      },
    ]);
    const res = await GET(makeGetReq("http://localhost/api/tournaments?status=ACTIVE&take=20"));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(findMany.mock.calls[0]![0].where).toMatchObject({
      organizerId: "user_1",
      status: "ACTIVE",
    });
    expect(json.data.items[0].entryFee).toBe("10"); // BigInt serialized to string
    expect(json.data.items[0].participantCount).toBe(3);
  });

  it("excludes another owner's tournaments (IDOR check)", async () => {
    findMany.mockResolvedValue([]);
    requireUserMock.mockResolvedValue({ id: "user_2", role: "ORGANIZER" });

    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=20"));
    const json = await res.json();

    expect(json.ok).toBe(true);
    // The where clause must scope to user_2, not user_1
    expect(findMany.mock.calls[0]![0].where).toMatchObject({ organizerId: "user_2" });
    expect(json.data.items).toHaveLength(0);
  });

  it("returns nextCursor when more rows exist", async () => {
    // Request take=2, return 3 rows → hasMore=true, nextCursor = 3rd item id
    const rows = [
      {
        id: "t_1",
        name: "A",
        gameTitle: "G",
        status: "ACTIVE",
        entryFee: 5n,
        asset: "XLM",
        _count: { participants: 1 },
      },
      {
        id: "t_2",
        name: "B",
        gameTitle: "G",
        status: "ACTIVE",
        entryFee: 5n,
        asset: "XLM",
        _count: { participants: 2 },
      },
      {
        id: "t_3",
        name: "C",
        gameTitle: "G",
        status: "ACTIVE",
        entryFee: 5n,
        asset: "XLM",
        _count: { participants: 0 },
      },
    ];
    findMany.mockResolvedValue(rows);

    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=2"));
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.items).toHaveLength(2);
    expect(json.data.nextCursor).toBe("t_3");
  });

  it("returns null nextCursor when no more rows", async () => {
    findMany.mockResolvedValue([
      {
        id: "t_1",
        name: "A",
        gameTitle: "G",
        status: "DRAFT",
        entryFee: 5n,
        asset: "XLM",
        _count: { participants: 0 },
      },
    ]);

    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=20"));
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.nextCursor).toBeNull();
  });

  it("computes pool = participantCount * entryFee as string", async () => {
    findMany.mockResolvedValue([
      {
        id: "t_1",
        name: "Cup",
        gameTitle: "G",
        status: "ACTIVE",
        entryFee: 1000000n,
        asset: "XLM",
        _count: { participants: 4 },
      },
    ]);

    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=20"));
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.items[0].pool).toBe("4000000");
    expect(typeof json.data.items[0].pool).toBe("string");
    expect(typeof json.data.items[0].entryFee).toBe("string");
  });

  it("derives refund lifecycle status from confirmed events, not the pool", async () => {
    findMany.mockResolvedValue([
      {
        id: "t_1",
        name: "Cup",
        gameTitle: "G",
        status: "ACTIVE",
        settlementDeadline: new Date("2026-09-17T00:00:00.000Z"),
        deadlineConfirmedAt: new Date("2026-09-16T00:00:00.000Z"),
        entryFee: 10n,
        asset: "XLM",
        events: [{ payload: { player: "GPLAYER", amount: "10" } }],
        participants: [{ playerAddr: "GPLAYER" }, { playerAddr: "GOTHER" }],
        _count: { participants: 2 },
      },
    ]);

    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=20"));
    const json = await res.json();

    expect(json.data.items[0]).toMatchObject({
      status: "ACTIVE",
      displayStatus: "REFUNDS_OPEN",
      pool: "10",
      totalCollected: "20",
      totalPaidOut: "0",
      totalRefunded: "10",
      refundClaimedCount: 1,
    });
  });

  it("does not mark a roster refunded when claim addresses only match its size", async () => {
    findMany.mockResolvedValue([
      {
        id: "t_1",
        name: "Cup",
        gameTitle: "G",
        status: "ACTIVE",
        settlementDeadline: new Date("2026-09-17T00:00:00.000Z"),
        deadlineConfirmedAt: new Date("2026-09-16T00:00:00.000Z"),
        entryFee: 10n,
        asset: "XLM",
        events: [
          { payload: { player: "GPLAYER", amount: "10" } },
          { payload: { player: "GDIFFERENT", amount: "10" } },
        ],
        participants: [{ playerAddr: "GPLAYER" }, { playerAddr: "GOTHER" }],
        _count: { participants: 2 },
      },
    ]);

    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=20"));
    const json = await res.json();

    expect(json.data.items[0]).toMatchObject({
      displayStatus: "REFUNDS_OPEN",
      pool: "0",
      totalCollected: "20",
      totalPaidOut: "0",
      totalRefunded: "20",
      refundClaimedCount: 1,
    });
  });

  it("shows zero remaining after confirmed winner payouts", async () => {
    findMany.mockResolvedValue([
      {
        id: "t_1",
        name: "Finished Cup",
        gameTitle: "G",
        status: "FINISHED",
        entryFee: 10n,
        asset: "XLM",
        payouts: [{ amount: 18n }, { amount: 9n }, { amount: 3n }],
        events: [],
        _count: { participants: 3 },
      },
    ]);

    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=20"));
    const json = await res.json();

    expect(json.data.items[0]).toMatchObject({
      pool: "0",
      totalCollected: "30",
      totalPaidOut: "30",
      totalRefunded: "0",
    });
  });

  it("shows zero remaining after every confirmed refund", async () => {
    findMany.mockResolvedValue([
      {
        id: "t_1",
        name: "Refunded Cup",
        gameTitle: "G",
        status: "CANCELLED",
        entryFee: 10n,
        asset: "XLM",
        payouts: [],
        events: [
          { payload: { player: "GA", amount: "10" } },
          { payload: { player: "GB", amount: "10" } },
        ],
        _count: { participants: 2 },
      },
    ]);

    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=20"));
    const json = await res.json();

    expect(json.data.items[0]).toMatchObject({
      pool: "0",
      totalCollected: "20",
      totalPaidOut: "0",
      totalRefunded: "20",
    });
  });

  it("passes cursor to prisma for pagination", async () => {
    findMany.mockResolvedValue([]);
    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=10&cursor=t_5"));
    const json = await res.json();

    expect(json.ok).toBe(true);
    const call = findMany.mock.calls[0]![0];
    expect(call.cursor).toEqual({ id: "t_5" });
    expect(call.skip).toBe(1);
  });

  it("returns 403 for wrong-role via AuthError", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Forbidden", 403));

    const res = await GET(makeGetReq("http://localhost/api/tournaments"));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
  });

  it("re-throws NEXT_REDIRECT for unauthenticated", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT",
    });
    requireUserMock.mockRejectedValue(redirectError);

    await expect(GET(makeGetReq("http://localhost/api/tournaments"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("returns 400 for invalid take param", async () => {
    const res = await GET(makeGetReq("http://localhost/api/tournaments?take=99"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });
});
