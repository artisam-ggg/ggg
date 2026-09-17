import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, updateMock, submitMock, validateDeployMock, lookupDeployMock } = vi.hoisted(
  () => ({
    findUniqueMock: vi.fn(),
    updateMock: vi.fn(),
    submitMock: vi.fn(),
    validateDeployMock: vi.fn(),
    lookupDeployMock: vi.fn(),
  }),
);

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
  deploymentTxHash: vi.fn(() => "CURRENT_HASH"),
  explorerContractUrl: vi.fn(),
  explorerTxUrl: vi.fn(),
  lookupDeployment: lookupDeployMock,
  resolveSacAddress: vi.fn(),
  StellarError: class StellarError extends Error {
    readonly txHash?: string;
    readonly retryable?: boolean;
    constructor(
      readonly code: string,
      message: string,
      options?: { txHash?: string; retryable?: boolean },
    ) {
      super(message);
      if (options?.txHash !== undefined) this.txHash = options.txHash;
      if (options?.retryable !== undefined) this.retryable = options.retryable;
    }
  },
  submitSignedXdr: submitMock,
  validateDeployXdr: validateDeployMock,
}));

import { getTournamentDetail, getTournamentDisplayStatus, submitTournamentTx } from "./tournaments";
import { StellarError } from "@/lib/stellar";

describe("getTournamentDisplayStatus", () => {
  const deadline = new Date("2026-09-17T12:00:00.000Z");
  const confirmedAt = new Date("2026-09-16T12:00:00.000Z");

  it("keeps the tournament active immediately before the deadline", () => {
    expect(
      getTournamentDisplayStatus(
        {
          status: "ACTIVE",
          settlementDeadline: deadline,
          deadlineConfirmedAt: confirmedAt,
          participantAddresses: ["GA", "GB"],
          refundClaimedPlayers: [],
        },
        deadline.getTime() - 1,
      ),
    ).toBe("ACTIVE");
  });

  it("opens refunds at the exact deadline and during partial claims", () => {
    expect(
      getTournamentDisplayStatus(
        {
          status: "ACTIVE",
          settlementDeadline: deadline,
          deadlineConfirmedAt: confirmedAt,
          participantAddresses: ["GA", "GB"],
          refundClaimedPlayers: ["GA"],
        },
        deadline.getTime(),
      ),
    ).toBe("REFUNDS_OPEN");
  });

  it("marks all confirmed participant claims as refunded", () => {
    expect(
      getTournamentDisplayStatus(
        {
          status: "ACTIVE",
          settlementDeadline: deadline,
          deadlineConfirmedAt: confirmedAt,
          participantAddresses: ["GA", "GB"],
          refundClaimedPlayers: ["GA", "GB"],
        },
        deadline.getTime(),
      ),
    ).toBe("REFUNDED");
  });

  it("does not infer a full refund from an empty pool", () => {
    expect(
      getTournamentDisplayStatus(
        {
          status: "ACTIVE",
          settlementDeadline: deadline,
          deadlineConfirmedAt: confirmedAt,
          participantAddresses: [],
          refundClaimedPlayers: [],
        },
        deadline.getTime(),
      ),
    ).toBe("REFUNDS_OPEN");
  });

  it.each(["CANCELLED", "FINISHED"] as const)("preserves confirmed %s state", (status) => {
    expect(
      getTournamentDisplayStatus({
        status,
        settlementDeadline: deadline,
        deadlineConfirmedAt: confirmedAt,
        participantAddresses: ["GA", "GB"],
        refundClaimedPlayers: ["GA", "GB"],
      }),
    ).toBe(status);
  });

  it("does not infer a full refund from equal counts with different addresses", () => {
    expect(
      getTournamentDisplayStatus(
        {
          status: "ACTIVE",
          settlementDeadline: deadline,
          deadlineConfirmedAt: confirmedAt,
          participantAddresses: ["GA", "GB"],
          refundClaimedPlayers: ["GA", "GC"],
        },
        deadline.getTime(),
      ),
    ).toBe("REFUNDS_OPEN");
  });
});

describe("getTournamentDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subtracts persisted refund claims from the displayed pool", async () => {
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      name: "Tournament",
      gameTitle: "Game",
      coverImageKey: "covers/123e4567-e89b-12d3-a456-426614174000.png",
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
      coverImageUrl: "/api/tournaments/t_1/cover",
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

    await expect(getTournamentDetail("t_1")).resolves.toMatchObject({
      pool: "0",
      coverImageUrl: null,
    });
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

  it("uses one timestamp for deadline status and refund eligibility", async () => {
    const deadline = new Date("2026-09-17T12:00:00.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(deadline.getTime());
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      name: "Tournament",
      gameTitle: "Game",
      coverImageKey: null,
      status: "ACTIVE",
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
      settlementDeadline: deadline,
      deadlineConfirmedAt: new Date("2026-09-16T12:00:00.000Z"),
      participants: [{ playerAddr: "GA", joinedAt: new Date(), joinTxHash: null }],
      payouts: [],
      events: [],
    });

    await expect(getTournamentDetail("t_1")).resolves.toMatchObject({
      displayStatus: "REFUNDS_OPEN",
      refundsClaimable: true,
    });
    expect(nowSpy).toHaveBeenCalledOnce();
    nowSpy.mockRestore();
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
    pendingDeployTxHash: null,
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-09-09T00:00:00.000Z"));
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue(draft);
    lookupDeployMock.mockResolvedValue(null);
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
      data: { pendingDeployTxHash: "CURRENT_HASH" },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: {
        contractId: "CDEPLOYED",
        deployTxHash: "TX_DEPLOY",
        pendingDeployTxHash: null,
        status: "ACTIVE",
        deadlineConfirmedAt: expect.any(Date),
      },
    });
  });

  it("does not persist success for a failed deployment", async () => {
    submitMock.mockResolvedValue({ hash: "TX_FAILED", status: "FAILED" });
    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toMatchObject({ code: "TX_FAILED" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: { pendingDeployTxHash: null },
    });
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
  });

  it("does not persist success without a contract ID", async () => {
    submitMock.mockResolvedValue({ hash: "TX_DEPLOY", status: "SUCCESS" });
    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toMatchObject({ status: 502 });
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
  });

  it("retains the attempted hash after a timeout without marking the draft active", async () => {
    submitMock.mockRejectedValueOnce(new Error("RPC timed out"));

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toThrow("RPC timed out");
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: { pendingDeployTxHash: "CURRENT_HASH" },
    });
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
  });

  it("reconciles a late successful deployment before another broadcast", async () => {
    findUniqueMock.mockResolvedValue({ ...draft, pendingDeployTxHash: "OLD_HASH" });
    lookupDeployMock.mockResolvedValue({
      hash: "OLD_HASH",
      status: "SUCCESS",
      contractId: "CDEPLOYED",
    });
    vi.setSystemTime(deadline);

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).resolves.toMatchObject({ txHash: "OLD_HASH", contractId: "CDEPLOYED", status: "ACTIVE" });
    expect(lookupDeployMock).toHaveBeenCalledWith("OLD_HASH");
    expect(submitMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: {
        contractId: "CDEPLOYED",
        deployTxHash: "OLD_HASH",
        pendingDeployTxHash: null,
        status: "ACTIVE",
        deadlineConfirmedAt: expect.any(Date),
      },
    });
  });

  it("blocks a different transaction while the previous deployment is unconfirmed", async () => {
    findUniqueMock.mockResolvedValue({ ...draft, pendingDeployTxHash: "OLD_HASH" });

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toMatchObject({ code: "TX_TIMEOUT", txHash: "OLD_HASH" });
    expect(submitMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows a new transaction after the previous deployment is confirmed failed", async () => {
    findUniqueMock.mockResolvedValue({ ...draft, pendingDeployTxHash: "OLD_HASH" });
    lookupDeployMock.mockResolvedValue({ hash: "OLD_HASH", status: "FAILED" });
    submitMock.mockResolvedValue({
      hash: "CURRENT_HASH",
      status: "SUCCESS",
      contractId: "CDEPLOYED",
    });

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).resolves.toMatchObject({ status: "ACTIVE" });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: { pendingDeployTxHash: "CURRENT_HASH" },
    });
    expect(submitMock).toHaveBeenCalledOnce();
  });

  it("retries the same signed transaction while its result is still unknown", async () => {
    findUniqueMock.mockResolvedValue({ ...draft, pendingDeployTxHash: "CURRENT_HASH" });
    submitMock.mockResolvedValue({
      hash: "CURRENT_HASH",
      status: "SUCCESS",
      contractId: "CDEPLOYED",
    });

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).resolves.toMatchObject({ status: "ACTIVE" });
    expect(submitMock).toHaveBeenCalledOnce();
    expect(updateMock).not.toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: { pendingDeployTxHash: "CURRENT_HASH" },
    });
  });

  it("recovers a deployment confirmed between lookup and a rejected retry", async () => {
    findUniqueMock.mockResolvedValue({ ...draft, pendingDeployTxHash: "CURRENT_HASH" });
    lookupDeployMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      hash: "CURRENT_HASH",
      status: "SUCCESS",
      contractId: "CDEPLOYED",
    });
    submitMock.mockRejectedValueOnce(
      new StellarError("SUBMIT_FAILED", "Sequence number already used", { retryable: false }),
    );

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).resolves.toMatchObject({ status: "ACTIVE", contractId: "CDEPLOYED" });
    expect(lookupDeployMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: expect.objectContaining({ status: "ACTIVE", deployTxHash: "CURRENT_HASH" }),
    });
  });

  it("keeps an uncertain deployment hash after a rejected retry", async () => {
    findUniqueMock.mockResolvedValue({ ...draft, pendingDeployTxHash: "CURRENT_HASH" });
    submitMock.mockRejectedValueOnce(
      new StellarError("SUBMIT_FAILED", "Sequence number already used", { retryable: false }),
    );

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toMatchObject({ code: "TX_TIMEOUT", txHash: "CURRENT_HASH" });
    expect(lookupDeployMock).toHaveBeenCalledTimes(2);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns the original rejection and clears the hash for a first broadcast", async () => {
    const rejection = new StellarError("SUBMIT_FAILED", "Stellar rejected deploy (txTooLate)", {
      retryable: false,
    });
    submitMock.mockRejectedValueOnce(rejection);

    await expect(
      submitTournamentTx("t_1", { signedXdr: "XDR", intent: "deploy" }, "user_1"),
    ).rejects.toBe(rejection);
    expect(lookupDeployMock).toHaveBeenCalledWith("CURRENT_HASH");
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: { pendingDeployTxHash: null },
    });
    expect(updateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
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
