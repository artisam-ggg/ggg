// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";

const fakes = vi.hoisted(() => ({
  getHash: vi.fn(),
  findPrepared: vi.fn(),
  findTournament: vi.fn(),
  upsertPrepared: vi.fn(),
  deletePrepared: vi.fn(),
}));

vi.mock("@goodgameguild/escrow-sdk", async (original) => {
  const actual = await original<typeof import("@goodgameguild/escrow-sdk")>();
  return {
    ...actual,
    escrowTransactionHash: vi.fn(() => "prepared-hash"),
    getEscrowWasmHash: fakes.getHash,
  };
});
vi.mock("@/lib/env", () => ({
  env: {
    SOROBAN_RPC_URL: "https://rpc.example.org",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    STELLAR_NETWORK: "testnet",
    ESCROW_WASM_HASH: "b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9",
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    preparedEscrowTransaction: {
      findUnique: fakes.findPrepared,
      upsert: fakes.upsertPrepared,
      deleteMany: fakes.deletePrepared,
    },
    tournament: { findUnique: fakes.findTournament },
  },
}));

import {
  CURRENT_ESCROW_WASM_HASH,
  escrowVersion,
  findPrepared,
  requireCurrentEscrow,
  savePrepared,
  forgetPrepared,
} from "./escrow-sdk";

const contractId = StrKey.encodeContract(Buffer.alloc(32, 8));

beforeEach(() => {
  vi.clearAllMocks();
  fakes.findTournament.mockResolvedValue({ contractId });
  fakes.findPrepared.mockResolvedValue({
    hash: "prepared-hash",
    tournamentId: "t1",
    intent: "join",
    source: "GPLAYER",
    xdr: "PREPARED",
  });
});

it("checks executable WASM before allowing the current binding", async () => {
  fakes.getHash.mockResolvedValueOnce(CURRENT_ESCROW_WASM_HASH);
  await expect(escrowVersion(contractId)).resolves.toBe("CURRENT");
  fakes.getHash.mockResolvedValueOnce(
    "2dcfb4c3ed77863269a347308156021de08427f5e6aa77ba15a08d9476c03f77",
  );
  await expect(requireCurrentEscrow(contractId)).rejects.toMatchObject({ status: 409 });
});

it("fails closed when the instance version cannot be read", async () => {
  fakes.getHash.mockRejectedValueOnce(new Error("RPC unavailable"));
  await expect(requireCurrentEscrow(contractId)).rejects.toThrow("RPC unavailable");
});

it("binds each prepared transaction to its tournament and intent", async () => {
  await expect(findPrepared("t1", "SIGNED", "join")).resolves.toMatchObject({
    xdr: "PREPARED",
    hash: "prepared-hash",
    contractId,
  });
  await expect(findPrepared("other", "SIGNED", "join")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(findPrepared("t1", "SIGNED", "cancel")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});

it("stores the exact SDK-prepared XDR before returning it", async () => {
  const built = {
    xdr: "PREPARED",
    hash: "prepared-hash",
    intent: "join" as const,
    source: "GPLAYER",
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId,
  };
  await expect(savePrepared("t1", built)).resolves.toEqual({
    unsignedXdr: "PREPARED",
    network: "testnet",
  });
  expect(fakes.upsertPrepared).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({ tournamentId: "t1", intent: "join", xdr: "PREPARED" }),
    }),
  );
  expect(fakes.deletePrepared).toHaveBeenCalledWith({
    where: {
      createdAt: { lt: expect.any(Date) },
      OR: [{ intent: { not: "deploy" } }, { tournament: { pendingDeployTxHash: null } }],
    },
  });
});

it("removes a confirmed prepared transaction by hash", async () => {
  await forgetPrepared("prepared-hash");
  expect(fakes.deletePrepared).toHaveBeenCalledWith({ where: { hash: "prepared-hash" } });
});
