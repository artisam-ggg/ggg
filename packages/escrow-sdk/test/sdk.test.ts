// @vitest-environment node
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Account,
  Address,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { EscrowSdk, getEscrowWasmHash, resolveSacAddress } from "../src/sdk.js";

const fakes = vi.hoisted(() => ({
  deploy: vi.fn(),
  join: vi.fn(),
  finalize: vi.fn(),
  cancel: vi.fn(),
  refund: vi.fn(),
  tournament: vi.fn(),
  pool: vi.fn(),
  reward: vi.fn(),
  players: vi.fn(),
  finished: vi.fn(),
  deadline: vi.fn(),
}));
vi.mock("../src/contract/index.js", () => ({
  Client: class {
    static deploy = fakes.deploy;
    join_tournament = fakes.join;
    finalize_results = fakes.finalize;
    cancel_tournament = fakes.cancel;
    claim_refund = fakes.refund;
    get_tournament = fakes.tournament;
    get_pool = fakes.pool;
    get_reward = fakes.reward;
    get_players = fakes.players;
    is_finished = fakes.finished;
    get_settlement_deadline = fakes.deadline;
  },
}));
vi.mock("@stellar/stellar-sdk", async (original) => {
  const actual = await original<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      assembleTransaction: (transaction: unknown) => ({ build: () => transaction }),
    },
  };
});

const network = "Test SDF Network ; September 2015";
const key = Keypair.random();
const other = Keypair.random();
const contract = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";
const config = {
  rpcUrl: "https://rpc.example",
  networkPassphrase: network,
  contractId: contract,
  wasmHash: "01".repeat(32),
};
const tournamentResult = {
  cancelled: false,
  distribution_bps: [10000],
  entry_fee: 1n,
  finished: false,
  organizer: key.publicKey(),
  player_count: 0,
  referee: other.publicKey(),
  settlement_deadline: 1_800_000_000n,
  token: contract,
  winners: [],
};
const rpcCalls = { simulate: vi.fn(), send: vi.fn(), get: vi.fn() };

function tx(method: string, args: ReturnType<Address["toScVal"]>[] = []) {
  return new TransactionBuilder(new Account(key.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: network,
  })
    .addOperation(new Contract(contract).call(method, ...args))
    .setTimeout(300)
    .build();
}
function assembled(method: string, args: ReturnType<Address["toScVal"]>[] = []) {
  return { toXDR: () => tx(method, args).toXDR() };
}
function signed(xdr: string) {
  const result = TransactionBuilder.fromXDR(xdr, network);
  result.sign(key);
  return result.toXDR();
}

beforeEach(() => {
  vi.restoreAllMocks();
  Object.values(fakes).forEach((fn) => fn.mockReset());
  Object.values(rpcCalls).forEach((fn) => fn.mockReset());
  vi.spyOn(rpc.Server.prototype, "simulateTransaction").mockImplementation(rpcCalls.simulate);
  vi.spyOn(rpc.Server.prototype, "sendTransaction").mockImplementation(rpcCalls.send);
  vi.spyOn(rpc.Server.prototype, "getTransaction").mockImplementation(rpcCalls.get);
  rpcCalls.simulate.mockResolvedValue({ result: { retval: {}, auth: [] }, minResourceFee: "100" });
  fakes.join.mockResolvedValue(
    assembled("join_tournament", [Address.fromString(key.publicKey()).toScVal()]),
  );
  fakes.finalize.mockResolvedValue(assembled("finalize_results"));
  fakes.cancel.mockResolvedValue(assembled("cancel_tournament"));
  fakes.refund.mockResolvedValue(
    assembled("claim_refund", [Address.fromString(other.publicKey()).toScVal()]),
  );
  fakes.deploy.mockResolvedValue(assembled("join_tournament"));
  fakes.tournament.mockResolvedValue({ result: tournamentResult });
  fakes.pool.mockResolvedValue({ result: 123n });
  fakes.reward.mockResolvedValue({ result: 5n });
  fakes.players.mockResolvedValue({ result: [key.publicKey()] });
  fakes.finished.mockResolvedValue({ result: false });
  fakes.deadline.mockResolvedValue({ result: 1_800_000_000n });
});

describe("configuration and validation", () => {
  it("reads the instance executable hash before selecting an ABI", async () => {
    const hash = Buffer.from("ab".repeat(32), "hex");
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValue({
      entries: [
        {
          val: {
            contractData: () => ({
              val: () => ({
                instance: () => ({
                  executable: () => ({
                    switch: () => ({ name: "contractExecutableWasm" }),
                    wasmHash: () => hash,
                  }),
                }),
              }),
            }),
          },
        },
      ],
    } as never);
    await expect(getEscrowWasmHash(config.rpcUrl, contract)).resolves.toBe("ab".repeat(32));
  });

  it("rejects malformed executable ledger entries", async () => {
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValueOnce({
      entries: [],
    } as never);
    await expect(getEscrowWasmHash(config.rpcUrl, contract)).rejects.toMatchObject({
      code: "CONFIRMATION_FAILED",
    });
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValueOnce({
      entries: [
        {
          val: {
            contractData: () => ({
              val: () => ({
                instance: () => ({
                  executable: () => ({
                    switch: () => ({ name: "contractExecutableWasm" }),
                    wasmHash: () => new Uint8Array(31),
                  }),
                }),
              }),
            }),
          },
        },
      ],
    } as never);
    await expect(getEscrowWasmHash(config.rpcUrl, contract)).rejects.toMatchObject({
      code: "CONFIRMATION_FAILED",
    });
  });

  it("requires explicit, valid network and destination", () => {
    expect(() => new EscrowSdk({ rpcUrl: "", networkPassphrase: network })).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(() => new EscrowSdk({ rpcUrl: config.rpcUrl, networkPassphrase: "" })).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(() => new EscrowSdk({ ...config, contractId: "CINVALID" })).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(() => new EscrowSdk({ ...config, wasmHash: "abc" })).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(
      () => new EscrowSdk({ ...config, rpcUrl: "https://user:pass@rpc.example" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(() => new EscrowSdk({ ...config, rpcUrl: "HTTP://rpc.example" })).not.toThrow();
  });
  it("resolves SACs only from explicit addresses and network", () => {
    expect(resolveSacAddress("XLM", network, { nativeSacAddress: contract })).toBe(contract);
    expect(resolveSacAddress("USDC", network, { usdcIssuer: key.publicKey() })).toMatch(/^C/);
    expect(() => resolveSacAddress("XLM", network, {})).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });
  it("rejects invalid constructor and payout terms before simulation", async () => {
    const sdk = new EscrowSdk(config);
    const terms = {
      referee: other.publicKey(),
      token: contract,
      entryFee: 1n,
      distributionBps: [10000],
      settlementDeadline: 1_800_000_000n,
      salt: new Uint8Array(32),
    };
    await expect(
      sdk.buildDeploy(key.publicKey(), { ...terms, entryFee: 0n }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      sdk.buildDeploy(key.publicKey(), { ...terms, distributionBps: [5000, 4999] }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      sdk.buildDeploy(key.publicKey(), { ...terms, distributionBps: Array(11).fill(1000) }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      sdk.buildDeploy(key.publicKey(), { ...terms, settlementDeadline: 1n << 64n }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      sdk.buildFinalize(key.publicKey(), [key.publicKey(), key.publicKey()]),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(sdk.buildFinalize(key.publicKey(), ["bad"])).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(rpcCalls.simulate).not.toHaveBeenCalled();
  });
  it("accepts ten winners when the on-chain distribution has ten entries", async () => {
    const sdk = new EscrowSdk(config);
    const winners = Array.from({ length: 10 }, () => Keypair.random().publicKey());
    fakes.tournament.mockResolvedValue({
      result: { ...tournamentResult, distribution_bps: Array(10).fill(1000) },
    });
    await expect(sdk.buildFinalize(key.publicKey(), winners)).resolves.toMatchObject({
      intent: "finalize",
    });
    expect(fakes.finalize).toHaveBeenCalledWith({ winners });
    await expect(sdk.buildFinalize(key.publicKey(), winners.slice(1))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("public transaction and read paths", () => {
  it("builds each transaction through the finalized binding and simulates it", async () => {
    const sdk = new EscrowSdk(config);
    const terms = {
      referee: other.publicKey(),
      token: contract,
      entryFee: 1n,
      distributionBps: [10000],
      settlementDeadline: 1_800_000_000n,
      salt: new Uint8Array(32),
    };
    expect((await sdk.buildDeploy(key.publicKey(), terms)).intent).toBe("deploy");
    expect(fakes.deploy).toHaveBeenCalledWith(
      expect.objectContaining({ entry_fee: 1n, distribution_bps: [10000] }),
      expect.objectContaining({ wasmHash: config.wasmHash, publicKey: key.publicKey() }),
    );
    expect((await sdk.buildJoin(key.publicKey())).intent).toBe("join");
    expect(fakes.join).toHaveBeenCalledWith({ player: key.publicKey() });
    expect((await sdk.buildFinalize(key.publicKey(), [other.publicKey()])).intent).toBe("finalize");
    expect(fakes.finalize).toHaveBeenCalledWith({ winners: [other.publicKey()] });
    expect((await sdk.buildCancel(key.publicKey())).intent).toBe("cancel");
    expect((await sdk.buildClaimRefund(key.publicKey(), other.publicKey())).intent).toBe(
      "claim_refund",
    );
    expect(fakes.refund).toHaveBeenCalledWith({ player: other.publicKey() });
    expect(rpcCalls.simulate).toHaveBeenCalledTimes(5);
  });
  it("validates a signed constructor deployment and rejects a different WASM", async () => {
    const sdk = new EscrowSdk(config);
    const salt = new Uint8Array(32);
    const op = Operation.createCustomContract({
      address: new Address(key.publicKey()),
      wasmHash: Buffer.from(config.wasmHash, "hex"),
      salt: Buffer.from(salt),
      constructorArgs: [
        Address.fromString(key.publicKey()).toScVal(),
        Address.fromString(other.publicKey()).toScVal(),
        Address.fromString(contract).toScVal(),
        nativeToScVal(1n, { type: "i128" }),
        xdr.ScVal.scvVec([nativeToScVal(10000, { type: "u32" })]),
        nativeToScVal(1_800_000_000n, { type: "u64" }),
      ],
    });
    const deployment = new TransactionBuilder(new Account(key.publicKey(), "1"), {
      fee: "100",
      networkPassphrase: network,
    })
      .addOperation(op)
      .setTimeout(300)
      .build();
    fakes.deploy.mockResolvedValue({ toXDR: () => deployment.toXDR() });
    const built = await sdk.buildDeploy(key.publicKey(), {
      referee: other.publicKey(),
      token: contract,
      entryFee: 1n,
      distributionBps: [10000],
      settlementDeadline: 1_800_000_000n,
      salt,
    });
    expect(sdk.validateSignedXdr(signed(built.xdr), built, network).hash().toString("hex")).toBe(
      built.hash,
    );
    expect(() =>
      new EscrowSdk({ ...config, wasmHash: "02".repeat(32) }).validateSignedXdr(
        signed(built.xdr),
        built,
        network,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
  });
  it("exposes typed reads without a signer", async () => {
    const sdk = new EscrowSdk(config);
    expect(await sdk.readPool(key.publicKey())).toBe(123n);
    expect(await sdk.readReward(key.publicKey(), other.publicKey())).toBe(5n);
    expect(await sdk.readPlayers(key.publicKey())).toEqual([key.publicKey()]);
    expect(await sdk.readFinished(key.publicKey())).toBe(false);
    expect(await sdk.readSettlementDeadline(key.publicKey())).toBe(1_800_000_000n);
    expect((await sdk.readTournament(key.publicKey())).distribution_bps).toEqual([10000]);
    await expect(sdk.readPool("bad")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("rejects malformed generated-client reads before returning them or building finalize", async () => {
    const sdk = new EscrowSdk(config);
    fakes.tournament.mockResolvedValue({ result: { ...tournamentResult, entry_fee: "1" } });
    await expect(sdk.readTournament(key.publicKey())).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
    });
    await expect(sdk.buildFinalize(key.publicKey(), [other.publicKey()])).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
    });
    expect(fakes.finalize).not.toHaveBeenCalled();
    fakes.pool.mockResolvedValue({ result: "123" });
    await expect(sdk.readPool(key.publicKey())).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
    });
    fakes.players.mockResolvedValue({ result: ["bad"] });
    await expect(sdk.readPlayers(key.publicKey())).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
    });
    fakes.deadline.mockResolvedValue({ result: 1n << 64n });
    await expect(sdk.readSettlementDeadline(key.publicKey())).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
    });
  });
  it("redacts simulation failure details", async () => {
    rpcCalls.simulate.mockRejectedValue(new Error("secret RPC body"));
    await expect(new EscrowSdk(config).buildJoin(key.publicKey())).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
      message: "Escrow simulation could not be completed",
    });
  });
});

describe("signed transaction submission", () => {
  it("rejects wrong network, contract, operation, missing signature and malformed XDR before RPC", async () => {
    const sdk = new EscrowSdk(config);
    const built = await sdk.buildJoin(key.publicKey());
    rpcCalls.send.mockClear();
    expect(() => sdk.validateSignedXdr(signed(built.xdr), built, "wrong network")).toThrowError(
      expect.objectContaining({ code: "NETWORK_MISMATCH" }),
    );
    expect(() => sdk.validateSignedXdr("garbage", built, network)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(() => sdk.validateSignedXdr(built.xdr, built, network)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(() =>
      sdk.validateSignedXdr(signed(tx("cancel_tournament").toXDR()), built, network),
    ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(() =>
      sdk.validateSignedXdr(
        signed(built.xdr),
        { ...built, contractId: other.publicKey() },
        network,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(rpcCalls.send).not.toHaveBeenCalled();
  });
  it("submits, confirms, and reconciles a timeout by hash", async () => {
    const sdk = new EscrowSdk(config);
    const built = await sdk.buildJoin(key.publicKey());
    rpcCalls.send.mockResolvedValue({ status: "PENDING", hash: built.hash });
    rpcCalls.get
      .mockResolvedValueOnce({ status: "NOT_FOUND" })
      .mockResolvedValueOnce({ status: "SUCCESS" });
    await expect(
      sdk.submit(signed(built.xdr), built, network, { attempts: 1, intervalMs: 0 }),
    ).rejects.toMatchObject({ code: "TX_TIMEOUT", hash: built.hash });
    expect(await sdk.lookup(built.hash)).toEqual({ hash: built.hash, status: "SUCCESS" });
    expect(rpcCalls.send).toHaveBeenCalledTimes(1);
  });
  it("reports rejection and lookup errors without raw RPC details", async () => {
    const sdk = new EscrowSdk(config);
    const built = await sdk.buildJoin(key.publicKey());
    rpcCalls.send.mockResolvedValue({ status: "ERROR", errorResult: "credential=private" });
    await expect(sdk.submit(signed(built.xdr), built, network)).rejects.toMatchObject({
      code: "SUBMIT_REJECTED",
      message: "Stellar rejected the transaction",
    });
    rpcCalls.send.mockResolvedValue({ status: "TRY_AGAIN_LATER" });
    await expect(sdk.submit(signed(built.xdr), built, network)).rejects.toMatchObject({
      code: "SUBMIT_REJECTED",
      message: "RPC asked to retry later; the same signed transaction may be resubmitted",
      hash: built.hash,
    });
    expect(rpcCalls.get).not.toHaveBeenCalled();
    rpcCalls.get.mockRejectedValue(new Error("credential=private"));
    await expect(sdk.lookup(built.hash)).rejects.toMatchObject({
      code: "CONFIRMATION_FAILED",
      message: "Transaction confirmation could not be looked up",
    });
  });
});
