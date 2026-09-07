import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, updateMock, submitMock, buildInitializeMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  submitMock: vi.fn(),
  buildInitializeMock: vi.fn(),
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
}));

import { submitTournamentTx } from "./tournaments";

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
});
