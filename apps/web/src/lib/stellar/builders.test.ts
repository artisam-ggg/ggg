// @vitest-environment node
// Pure Stellar XDR-builder logic with no DOM; runs in node so Keypair.random()
// gets a real WebCrypto seed (jsdom's crypto yields the wrong seed type).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { Account, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const pipeline = vi.hoisted(() => ({ simulateAndAssemble: vi.fn() }));

const built = (xdr: string) => ({ toXDR: () => xdr });
const joinFn = vi.fn();
const claimRefundFn = vi.fn();
const finalizeFn = vi.fn();
const cancelFn = vi.fn();
const getSettlementDeadlineFn = vi.fn();
const deployFn = vi.fn();
const getLedgerEntriesFn = vi.fn();
const legacyFinalizeFn = vi.fn();
const legacyEscrowClientFn = vi.fn(() => ({ finalize_results: legacyFinalizeFn }));
const ClientCtor = vi.fn().mockImplementation(function () {
  return {
    join_tournament: joinFn,
    claim_refund: claimRefundFn,
    finalize_results: finalizeFn,
    cancel_tournament: cancelFn,
    get_settlement_deadline: getSettlementDeadlineFn,
  };
});
(ClientCtor as unknown as { deploy: typeof deployFn }).deploy = deployFn;

vi.mock("@/contract-client", () => ({ Client: ClientCtor }));
vi.mock("./legacy-escrow-client", () => ({ legacyEscrowClient: legacyEscrowClientFn }));
vi.mock("./pipeline", () => pipeline);
vi.mock("./client", () => ({
  getRpc: () => ({ getLedgerEntries: getLedgerEntriesFn }),
  networkPassphrase: () => "Test SDF Network ; September 2015",
  networkName: () => "testnet",
}));
vi.mock("@/lib/env", () => ({
  env: {
    SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
    ESCROW_WASM_HASH: "0101010101010101010101010101010101010101010101010101010101010101",
  },
}));

const G = Keypair.random().publicKey();
const G2 = Keypair.random().publicKey();
const G3 = Keypair.random().publicKey();
const C = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";
const CURRENT_WASM_HASH = "01".repeat(32);
const RAW_XDR = new TransactionBuilder(new Account(G, "1"), {
  fee: "100",
  networkPassphrase: "Test SDF Network ; September 2015",
})
  .addOperation(Operation.manageData({ name: "test", value: "test" }))
  .setTimeout(0)
  .build()
  .toXDR();

beforeEach(() => {
  joinFn.mockClear();
  claimRefundFn.mockClear();
  finalizeFn.mockClear();
  cancelFn.mockClear();
  getSettlementDeadlineFn.mockReset();
  getLedgerEntriesFn.mockReset();
  legacyFinalizeFn.mockReset();
  legacyEscrowClientFn.mockClear();
  ClientCtor.mockClear();
  joinFn.mockResolvedValue(built(RAW_XDR));
  claimRefundFn.mockResolvedValue(built(RAW_XDR));
  finalizeFn.mockResolvedValue(built(RAW_XDR));
  cancelFn.mockResolvedValue(built(RAW_XDR));
  getSettlementDeadlineFn.mockResolvedValue({ result: null });
  getLedgerEntriesFn.mockResolvedValue({
    entries: [
      {
        val: {
          contractData: () => ({
            val: () => ({
              instance: () => ({
                executable: () => ({
                  switch: () => ({ name: "contractExecutableWasm" }),
                  wasmHash: () => Buffer.from(CURRENT_WASM_HASH, "hex"),
                }),
              }),
            }),
          }),
        },
      },
    ],
  });
  legacyFinalizeFn.mockResolvedValue(built(RAW_XDR));
  deployFn.mockResolvedValue(built(RAW_XDR));
  pipeline.simulateAndAssemble.mockReset();
  pipeline.simulateAndAssemble.mockResolvedValue(built("PREPARED_XDR"));
});

describe("buildClaimRefundTx", () => {
  it("uses the relay as source while paying the registered player", async () => {
    const { buildClaimRefundTx } = await import("./builders");
    const res = await buildClaimRefundTx({
      contractId: C,
      playerAddress: G,
      submitterAddress: G2,
    });
    expect(res).toEqual({ xdr: "PREPARED_XDR", network: "testnet" });
    expect(ClientCtor).toHaveBeenCalledWith(expect.objectContaining({ publicKey: G2 }));
    expect(claimRefundFn).toHaveBeenCalledWith({ player: G });
    expect(pipeline.simulateAndAssemble).toHaveBeenCalledOnce();
  });
});

describe("buildJoinTx", () => {
  it("instantiates Client with contract+source and returns simulated XDR", async () => {
    const { buildJoinTx } = await import("./builders");
    const res = await buildJoinTx({ contractId: C, playerAddress: G });
    expect(res).toEqual({ xdr: "PREPARED_XDR", network: "testnet" });
    expect(ClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: C, publicKey: G }),
    );
    expect(joinFn).toHaveBeenCalledWith({ player: G });
    expect(pipeline.simulateAndAssemble).toHaveBeenCalledOnce();
  });
  it("rejects an invalid contract id", async () => {
    const { buildJoinTx } = await import("./builders");
    await expect(buildJoinTx({ contractId: G, playerAddress: G })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
  it("rejects an invalid player address", async () => {
    const { buildJoinTx } = await import("./builders");
    await expect(buildJoinTx({ contractId: C, playerAddress: "x" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("readSettlementDeadline", () => {
  it("normalizes an uninitialized contract's Option::None to undefined", async () => {
    const { readSettlementDeadline } = await import("./builders");

    await expect(
      readSettlementDeadline({ contractId: C, sourceAddress: G }),
    ).resolves.toBeUndefined();
    expect(getSettlementDeadlineFn).toHaveBeenCalledOnce();
  });
});

describe("buildFinalizeTx", () => {
  it("uses the winner vector for a contract on the current Wasm", async () => {
    const { buildFinalizeTx } = await import("./builders");
    const res = await buildFinalizeTx({
      contractId: C,
      refereeAddress: G,
      first: G,
      second: G2,
      third: G3,
    });
    expect(res.xdr).toBe("PREPARED_XDR");
    expect(finalizeFn).toHaveBeenCalledWith({ winners: [G, G2, G3] });
    expect(legacyFinalizeFn).not.toHaveBeenCalled();
  });
  it("uses the three-address ABI for a contract on an older Wasm", async () => {
    getLedgerEntriesFn.mockResolvedValueOnce({
      entries: [
        {
          val: {
            contractData: () => ({
              val: () => ({
                instance: () => ({
                  executable: () => ({
                    switch: () => ({ name: "contractExecutableWasm" }),
                    wasmHash: () => Buffer.alloc(32, 2),
                  }),
                }),
              }),
            }),
          },
        },
      ],
    });
    const { buildFinalizeTx } = await import("./builders");

    const res = await buildFinalizeTx({
      contractId: C,
      refereeAddress: G,
      first: G,
      second: G2,
      third: G3,
    });

    expect(res.xdr).toBe("PREPARED_XDR");
    expect(legacyEscrowClientFn).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: C, publicKey: G }),
    );
    expect(legacyFinalizeFn).toHaveBeenCalledWith({ first: G, second: G2, third: G3 });
    expect(finalizeFn).not.toHaveBeenCalled();
  });
  it("rejects non-distinct winners", async () => {
    const { buildFinalizeTx } = await import("./builders");
    await expect(
      buildFinalizeTx({ contractId: C, refereeAddress: G, first: G2, second: G2, third: G3 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("buildCancelTx", () => {
  it("passes organizer as source", async () => {
    const { buildCancelTx } = await import("./builders");
    const res = await buildCancelTx({ contractId: C, organizerAddress: G });
    expect(res.xdr).toBe("PREPARED_XDR");
    expect(ClientCtor).toHaveBeenCalledWith(expect.objectContaining({ publicKey: G }));
  });
});

describe("buildDeployInitializeTx", () => {
  it("returns simulated deploy+initialize XDR with token + bps", async () => {
    const { buildDeployInitializeTx } = await import("./builders");
    const res = await buildDeployInitializeTx({
      tournamentId: "t_1",
      organizerAddress: G,
      refereeAddress: G2,
      tokenAddr: C,
      entryFee: 10000000n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline: 1_800_000_000n,
    });
    expect(res).toEqual({ xdr: "PREPARED_XDR", network: "testnet" });
    expect(deployFn).toHaveBeenCalledWith(
      {
        organizer: G,
        referee: G2,
        token: C,
        entry_fee: 10000000n,
        distribution_bps: [6000, 3000, 1000],
        settlement_deadline: 1_800_000_000n,
      },
      expect.objectContaining({
        publicKey: G,
        salt: createHash("sha256").update("t_1").digest(),
      }),
    );
    expect(pipeline.simulateAndAssemble).toHaveBeenCalledOnce();
  });
  it("rejects when organizer === referee", async () => {
    const { buildDeployInitializeTx } = await import("./builders");
    await expect(
      buildDeployInitializeTx({
        tournamentId: "t_1",
        organizerAddress: G,
        refereeAddress: G,
        tokenAddr: C,
        entryFee: 1n,
        distributionBps: [6000, 3000, 1000],
        settlementDeadline: 1_800_000_000n,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("rejects bps not summing to 10000", async () => {
    const { buildDeployInitializeTx } = await import("./builders");
    await expect(
      buildDeployInitializeTx({
        tournamentId: "t_1",
        organizerAddress: G,
        refereeAddress: G2,
        tokenAddr: C,
        entryFee: 1n,
        distributionBps: [6000, 3000, 999],
        settlementDeadline: 1_800_000_000n,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("rejects non-positive entry fee", async () => {
    const { buildDeployInitializeTx } = await import("./builders");
    await expect(
      buildDeployInitializeTx({
        tournamentId: "t_1",
        organizerAddress: G,
        refereeAddress: G2,
        tokenAddr: C,
        entryFee: 0n,
        distributionBps: [6000, 3000, 1000],
        settlementDeadline: 1_800_000_000n,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
