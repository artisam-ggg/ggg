import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, updateMock, submitMock, validateDeployMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  submitMock: vi.fn(),
  validateDeployMock: vi.fn(),
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
  buildFinalizeTx: vi.fn(),
  buildJoinTx: vi.fn(),
  explorerContractUrl: vi.fn(),
  explorerTxUrl: vi.fn(),
  resolveSacAddress: vi.fn(),
  StellarError: class StellarError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  submitSignedXdr: submitMock,
  validateDeployXdr: validateDeployMock,
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

describe("submitTournamentTx constructor deployment", () => {
  const deadline = new Date("2030-09-10T00:00:00.000Z");
  const draft = {
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
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-09-09T00:00:00.000Z"));
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue(draft);
    updateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...draft,
      ...data,
    }));
  });
  afterEach(() => vi.useRealTimers());

  it("persists a confirmed constructor deployment as immediately active", async () => {
    submitMock.mockResolvedValue({ hash: "TX_DEPLOY", contractId: "CDEPLOYED", status: "SUCCESS" });
    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).resolves.toMatchObject({ txHash: "TX_DEPLOY", contractId: "CDEPLOYED", status: "ACTIVE" });
    expect(validateDeployMock).toHaveBeenCalledWith("XDR", {
      tournamentId: "t_1",
      organizerAddress: "GORG",
      refereeAddress: "GREF",
      tokenAddr: "CTOKEN",
      entryFee: 10n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline: BigInt(Math.floor(deadline.getTime() / 1000)),
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: {
        contractId: "CDEPLOYED",
        deployTxHash: "TX_DEPLOY",
        status: "ACTIVE",
        deadlineConfirmedAt: expect.any(Date),
      },
    });
  });

  it("does not persist a failed deployment", async () => {
    submitMock.mockResolvedValue({ hash: "TX_FAILED", status: "FAILED" });
    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toMatchObject({ code: "TX_FAILED" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not persist success without a contract ID", async () => {
    submitMock.mockResolvedValue({ hash: "TX_DEPLOY", status: "SUCCESS" });
    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toMatchObject({ status: 502 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses a second deployment before broadcasting", async () => {
    findUniqueMock.mockResolvedValue({ ...draft, contractId: "CDEPLOYED", status: "ACTIVE" });
    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toMatchObject({ status: 409 });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("rejects an expired deadline before broadcasting", async () => {
    vi.setSystemTime(deadline);
    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toMatchObject({ status: 409 });
    expect(submitMock).not.toHaveBeenCalled();
  });
});
