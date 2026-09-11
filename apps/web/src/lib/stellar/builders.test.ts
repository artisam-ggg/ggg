// @vitest-environment node
// Pure Stellar XDR-builder logic with no DOM; runs in node so Keypair.random()
// gets a real WebCrypto seed (jsdom's crypto yields the wrong seed type).
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Account,
  Keypair,
  nativeToScVal,
  Operation,
  scValToNative,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const pipeline = vi.hoisted(() => ({ simulateAndAssemble: vi.fn() }));

const built = (xdr: string) => ({ toXDR: () => xdr });
const joinFn = vi.fn();
const claimRefundFn = vi.fn();
const finalizeFn = vi.fn();
const cancelFn = vi.fn();
const initializeFn = vi.fn();
const getSettlementDeadlineFn = vi.fn();
const deployFn = vi.fn();
const ClientCtor = vi.fn().mockImplementation(function () {
  return {
    join_tournament: joinFn,
    claim_refund: claimRefundFn,
    finalize_results: finalizeFn,
    cancel_tournament: cancelFn,
    initialize: initializeFn,
    get_settlement_deadline: getSettlementDeadlineFn,
  };
});
(ClientCtor as unknown as { deploy: typeof deployFn }).deploy = deployFn;

vi.mock("@/contract-client", () => ({ Client: ClientCtor }));
vi.mock("./pipeline", () => pipeline);
vi.mock("./client", () => ({
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
const INITIALIZE_XDR = new TransactionBuilder(new Account(G, "1"), {
  fee: "100",
  networkPassphrase: "Test SDF Network ; September 2015",
})
  .addOperation(
    Operation.invokeContractFunction({
      contract: C,
      function: "initialize",
      args: [
        nativeToScVal(G, { type: "address" }),
        nativeToScVal(G2, { type: "address" }),
        nativeToScVal(C, { type: "address" }),
        nativeToScVal(10_000_000n, { type: "i128" }),
        nativeToScVal([6000, 3000, 1000], { type: ["u32"] }),
        nativeToScVal(1_800_000_000n, { type: "u64" }),
      ],
    }),
  )
  .setTimeout(0)
  .build()
  .toXDR();
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
  initializeFn.mockClear();
  getSettlementDeadlineFn.mockReset();
  ClientCtor.mockClear();
  joinFn.mockResolvedValue(built(RAW_XDR));
  claimRefundFn.mockResolvedValue(built(RAW_XDR));
  finalizeFn.mockResolvedValue(built(RAW_XDR));
  cancelFn.mockResolvedValue(built(RAW_XDR));
  initializeFn.mockResolvedValue(built(INITIALIZE_XDR));
  getSettlementDeadlineFn.mockResolvedValue({ result: null });
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

describe("buildInitializeTx", () => {
  it("assembles the expected initialize invocation before returning its XDR", async () => {
    const { buildInitializeTx } = await import("./builders");
    const settlementDeadline = 1_800_000_000n;
    const res = await buildInitializeTx({
      contractId: C,
      organizerAddress: G,
      refereeAddress: G2,
      tokenAddr: C,
      entryFee: 10000000n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline,
    });

    expect(res).toEqual({ xdr: "PREPARED_XDR", network: "testnet" });
    expect(initializeFn).toHaveBeenCalledWith(
      expect.objectContaining({ settlement_deadline: settlementDeadline }),
    );
    expect(pipeline.simulateAndAssemble).toHaveBeenCalledOnce();
    const prepared = pipeline.simulateAndAssemble.mock.calls[0]![0];
    expect(prepared.toXDR()).toBe(INITIALIZE_XDR);
    const op = prepared.operations[0] as unknown as {
      func: {
        value(): { functionName(): { toString(encoding: string): string }; args(): unknown[] };
      };
    };
    expect(op.func.value().functionName().toString("utf-8")).toBe("initialize");
    const values = op.func
      .value()
      .args()
      .map((arg) => scValToNative(arg as never));
    expect(values.slice(0, 4)).toEqual([G, G2, C, 10_000_000n]);
    expect((values[4] as (number | bigint)[]).map(Number)).toEqual([6000, 3000, 1000]);
    expect(values[5]).toBe(settlementDeadline);
  });
});

describe("buildFinalizeTx", () => {
  it("passes referee as source and three winners", async () => {
    const { buildFinalizeTx } = await import("./builders");
    const res = await buildFinalizeTx({
      contractId: C,
      refereeAddress: G,
      first: G,
      second: G2,
      third: G3,
    });
    expect(res.xdr).toBe("PREPARED_XDR");
    expect(finalizeFn).toHaveBeenCalledWith({ first: G, second: G2, third: G3 });
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
      organizerAddress: G,
      refereeAddress: G2,
      tokenAddr: C,
      entryFee: 10000000n,
      distributionBps: [6000, 3000, 1000],
      settlementDeadline: 1_800_000_000n,
    });
    expect(res).toEqual({ xdr: "PREPARED_XDR", network: "testnet" });
  });
  it("rejects when organizer === referee", async () => {
    const { buildDeployInitializeTx } = await import("./builders");
    await expect(
      buildDeployInitializeTx({
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
