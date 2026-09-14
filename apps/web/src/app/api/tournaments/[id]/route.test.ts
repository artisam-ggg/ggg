import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/stellar", async (orig) => ({
  ...(await orig<typeof import("@/lib/stellar")>()),
  explorerContractUrl: () => "https://stellar.expert/contract/C1",
  explorerTxUrl: (h: string) => `https://stellar.expert/tx/${h}`,
}));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost:3000", STELLAR_NETWORK: "testnet" },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(async () => ({
        id: "t_1",
        name: "Cup",
        gameTitle: "SF6",
        status: "FINISHED",
        asset: "XLM",
        entryFee: 10000000n,
        firstBps: 6000,
        secondBps: 3000,
        thirdBps: 1000,
        contractId: "C1",
        tokenAddr: null,
        organizerId: "user_org_test",
        organizerAddr: "G_ORG",
        refereeAddr: "G_REF",
        participants: [
          { playerAddr: "G_P1", joinedAt: new Date("2025-01-01T00:00:00Z"), joinTxHash: "JT1" },
        ],
        payouts: [{ rank: 1, playerAddr: "G_P1", amount: 6000000n, txHash: "PT1" }],
        events: [],
      })),
    },
  },
}));

import { GET } from "./route";

describe("GET /api/tournaments/[id]", () => {
  it("returns public detail with pool + winners + explorer links", async () => {
    const res = await GET(new Request("http://localhost/api/tournaments/t_1"), {
      params: Promise.resolve({ id: "t_1" }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.pool).toBe("10000000"); // 1 participant * 10000000 entryFee
    expect(json.data.entryFee).toBe("10000000");
    expect(typeof json.data.entryFee).toBe("string");
    expect(json.data.contractUrl).toContain("stellar.expert");
    expect(json.data.contractUrl).toContain("C1");
    expect(json.data.winners).toHaveLength(1);
    expect(json.data.winners[0].rank).toBe(1);
    expect(json.data.winners[0].amount).toBe("6000000");
    expect(typeof json.data.winners[0].amount).toBe("string");
    expect(json.data.winners[0].explorerUrl).toContain("PT1");
    expect(json.data.participants).toHaveLength(1);
    expect(json.data.participants[0].playerAddr).toBe("G_P1");
  });

  it("serializes all BigInt fields as strings", async () => {
    const res = await GET(new Request("http://localhost/api/tournaments/t_1"), {
      params: Promise.resolve({ id: "t_1" }),
    });
    // If any BigInt is leaked, JSON.stringify would have thrown before getting here
    // so verifying we can parse is sufficient
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.data.pool).toBe("string");
    expect(typeof json.data.entryFee).toBe("string");
    expect(typeof json.data.winners[0].amount).toBe("string");
  });

  it("does NOT expose organizerId in the public response", async () => {
    const res = await GET(new Request("http://localhost/api/tournaments/t_1"), {
      params: Promise.resolve({ id: "t_1" }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).not.toHaveProperty("organizerId");
    // Other expected public fields are still present
    expect(json.data).toHaveProperty("id");
    expect(json.data).toHaveProperty("name");
    expect(json.data).toHaveProperty("pool");
    expect(json.data).toHaveProperty("participants");
  });

  it("404s unknown id", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.tournament.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost/api/tournaments/x"), {
      params: Promise.resolve({ id: "x" }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("returns empty winners for non-FINISHED tournament", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.tournament.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "t_2",
      name: "Active Cup",
      gameTitle: "SF6",
      status: "ACTIVE",
      asset: "XLM",
      entryFee: 5000000n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
      contractId: "C2",
      tokenAddr: null,
      organizerAddr: "G_ORG",
      refereeAddr: "G_REF",
      participants: [
        { playerAddr: "G_P1", joinedAt: new Date("2025-01-01T00:00:00Z"), joinTxHash: "JT1" },
        { playerAddr: "G_P2", joinedAt: new Date("2025-01-02T00:00:00Z"), joinTxHash: "JT2" },
      ],
      payouts: [],
      events: [],
    });

    const res = await GET(new Request("http://localhost/api/tournaments/t_2"), {
      params: Promise.resolve({ id: "t_2" }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.pool).toBe("10000000"); // 2 * 5000000
    expect(json.data.winners).toHaveLength(0);
    expect(json.data.participants).toHaveLength(2);
  });
});
