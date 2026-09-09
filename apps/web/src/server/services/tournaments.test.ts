import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, updateMock, submitMock, buildInitializeMock, validateInitializeMock } =
  vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    updateMock: vi.fn(),
    submitMock: vi.fn(),
    buildInitializeMock: vi.fn(),
    validateInitializeMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: {
    tournament: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

vi.mock("@/lib/env", () => ({ env: { STELLAR_NETWORK: "testnet" } }));

vi.mock("@/lib/stellar", () => ({
  buildCancelTx: vi.fn(),
  buildDeployInitializeTx: vi.fn(),
  buildInitializeTx: buildInitializeMock,
  buildFinalizeTx: vi.fn(),
  buildJoinTx: vi.fn(),
  explorerContractUrl: vi.fn(),
  explorerTxUrl: vi.fn(),
  resolveSacAddress: vi.fn(),
  submitSignedXdr: submitMock,
  validateInitializeXdr: validateInitializeMock,
}));

import { getTournamentDetail, submitTournamentTx } from "./tournaments";

describe("getTournamentDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subtracts persisted refund claims from the displayed pool", async () => {
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      name: "Tournament",
      gameTitle: "Game",
      status: "CANCELLED",
      asset: "XLM",
      entryFee: 10_000_000n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
      contractId: "CESCROW",
      tokenAddr: "CTOKEN",
      organizerId: "user_1",
      organizerAddr: "GORG",
      refereeAddr: "GREF",
      settlementDeadline: null,
      deadlineConfirmedAt: null,
      participants: [
        { playerAddr: "GA", joinedAt: new Date(), joinTxHash: null },
        { playerAddr: "GB", joinedAt: new Date(), joinTxHash: null },
        { playerAddr: "GC", joinedAt: new Date(), joinTxHash: null },
      ],
      payouts: [],
      events: [
        { payload: { player: "GA", amount: "10000000" } },
        { payload: { player: "GB", amount: "not-a-number" } },
      ],
    });

    await expect(getTournamentDetail("t_1")).resolves.toMatchObject({
      pool: "20000000",
      refundClaimedPlayers: ["GA"],
      settlementDeadline: null,
      contractVersion: "LEGACY",
    });
  });

  it("clamps the displayed pool at zero when refunds exceed persisted participants", async () => {
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      name: "Tournament",
      gameTitle: "Game",
      status: "CANCELLED",
      asset: "XLM",
      entryFee: 10_000_000n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
      contractId: "CESCROW",
      tokenAddr: "CTOKEN",
      organizerId: "user_1",
      organizerAddr: "GORG",
      refereeAddr: "GREF",
      settlementDeadline: null,
      participants: [],
      payouts: [],
      events: [{ payload: { player: "GA", amount: "10000000" } }],
    });

    await expect(getTournamentDetail("t_1")).resolves.toMatchObject({ pool: "0" });
  });

  it("does not present a draft deadline as confirmed", async () => {
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      name: "Tournament",
      gameTitle: "Game",
      status: "DRAFT",
      asset: "XLM",
      entryFee: 10_000_000n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
      contractId: null,
      tokenAddr: "CTOKEN",
      organizerId: "user_1",
      organizerAddr: "GORG",
      refereeAddr: "GREF",
      settlementDeadline: new Date("2026-10-01T00:00:00.000Z"),
      deadlineConfirmedAt: null,
      participants: [],
      payouts: [],
      events: [],
    });

    await expect(getTournamentDetail("t_1")).resolves.toMatchObject({
      settlementDeadline: null,
      contractVersion: "PENDING",
    });
  });

  it("keeps a pre-deadline contract with an unconfirmed stored value in legacy state", async () => {
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      name: "Tournament",
      gameTitle: "Game",
      status: "ACTIVE",
      asset: "XLM",
      entryFee: 10_000_000n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
      contractId: "CLEGACY",
      tokenAddr: "CTOKEN",
      organizerId: "user_1",
      organizerAddr: "GORG",
      refereeAddr: "GREF",
      settlementDeadline: new Date("2026-10-01T00:00:00.000Z"),
      deadlineConfirmedAt: null,
      participants: [],
      payouts: [],
      events: [],
    });
    await expect(getTournamentDetail("t_1")).resolves.toMatchObject({
      settlementDeadline: null,
      contractVersion: "LEGACY",
    });
  });

  it("does not make expired legacy active contracts refundable", async () => {
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      name: "Tournament",
      gameTitle: "Game",
      status: "ACTIVE",
      asset: "XLM",
      entryFee: 10_000_000n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
      contractId: "CLEGACY",
      tokenAddr: "CTOKEN",
      organizerId: "user_1",
      organizerAddr: "GORG",
      refereeAddr: "GREF",
      settlementDeadline: new Date("2020-01-01T00:00:00.000Z"),
      deadlineConfirmedAt: null,
      participants: [],
      payouts: [],
      events: [],
    });

    await expect(getTournamentDetail("t_1")).resolves.toMatchObject({
      contractVersion: "LEGACY",
      refundsClaimable: false,
    });
  });

  it("keeps refunds immediately claimable for cancelled contracts", async () => {
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      name: "Tournament",
      gameTitle: "Game",
      status: "CANCELLED",
      asset: "XLM",
      entryFee: 10_000_000n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
      contractId: "CLEGACY",
      tokenAddr: "CTOKEN",
      organizerId: "user_1",
      organizerAddr: "GORG",
      refereeAddr: "GREF",
      settlementDeadline: null,
      deadlineConfirmedAt: null,
      participants: [],
      payouts: [],
      events: [],
    });

    await expect(getTournamentDetail("t_1")).resolves.toMatchObject({ refundsClaimable: true });
  });
});

describe("submitTournamentTx", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not activate or initialize a deployment whose deadline expires during confirmation", async () => {
    const deadline = new Date("2026-09-08T00:00:00.000Z");
    vi.setSystemTime(new Date(deadline.getTime() - 1_000));
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      organizerId: "user_1",
      organizerAddr: "GORG",
      refereeAddr: "GREF",
      tokenAddr: "CTOKEN",
      entryFee: 10n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
      settlementDeadline: deadline,
      status: "DRAFT",
      contractId: null,
      deployTxHash: null,
    });
    submitMock.mockImplementation(async () => {
      vi.setSystemTime(deadline);
      return { hash: "TX_DEPLOY", contractId: "CDEPLOYED", status: "SUCCESS" };
    });
    updateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      status: "DRAFT",
      contractId: data.contractId,
      deployTxHash: data.deployTxHash,
      settlementDeadline: deadline,
      tokenAddr: "CTOKEN",
      organizerAddr: "GORG",
      refereeAddr: "GREF",
      entryFee: 10n,
      firstBps: 6000,
      secondBps: 3000,
      thirdBps: 1000,
    }));

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toMatchObject({ message: "Settlement deadline has expired", status: 409 });

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: { contractId: "CDEPLOYED", deployTxHash: "TX_DEPLOY" },
    });
    expect(buildInitializeMock).not.toHaveBeenCalled();
  });

  it("does not broadcast initialize after its deadline has expired", async () => {
    const deadline = new Date("2026-09-08T00:00:00.000Z");
    vi.setSystemTime(deadline);
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      organizerId: "user_1",
      settlementDeadline: deadline,
      status: "DRAFT",
      contractId: "CDEPLOYED",
    });

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "initialize" }, "user_1"),
    ).rejects.toMatchObject({ message: "Settlement deadline has expired", status: 409 });

    expect(validateInitializeMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
