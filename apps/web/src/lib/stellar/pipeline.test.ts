// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Address, Keypair, nativeToScVal, TransactionBuilder } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { makeFakeRpc, errorSim, txStatus } from "./__mocks__/rpc";

vi.mock("@/lib/env", () => ({ env: { ESCROW_WASM_HASH: "01".repeat(32) } }));

const rpcRef: { current: ReturnType<typeof makeFakeRpc> } = { current: makeFakeRpc() };
vi.mock("./client", () => ({
  getRpc: () => rpcRef.current,
  networkPassphrase: () => "Test SDF Network ; September 2015",
}));

// assembleTransaction returns a tx whose .toXDR() is deterministic
vi.mock("@stellar/stellar-sdk", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    rpc: {
      ...(actual.rpc as object),
      assembleTransaction: vi.fn(() => ({ build: () => ({ toXDR: () => "ASSEMBLED_XDR" }) })),
      Api: { isSimulationError: (s: { error?: string }) => "error" in s && !!s.error },
    },
    TransactionBuilder: {
      fromXDR: vi.fn(() => ({ hash: () => Buffer.from("HASH") })),
    },
  };
});

beforeEach(() => {
  rpcRef.current = makeFakeRpc();
  vi.mocked(TransactionBuilder.fromXDR).mockReset();
  vi.mocked(TransactionBuilder.fromXDR).mockReturnValue({
    hash: () => Buffer.from("HASH"),
  } as never);
});

describe("simulateAndAssemble", () => {
  it("returns assembled tx when simulation succeeds", async () => {
    const { simulateAndAssemble } = await import("./pipeline");
    const out = await simulateAndAssemble({} as never);
    expect(out.toXDR()).toBe("ASSEMBLED_XDR");
    expect(rpcRef.current.simulateTransaction).toHaveBeenCalledOnce();
  });
  it("throws SIMULATION_FAILED when simulation errors", async () => {
    const logSimulation = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpcRef.current = makeFakeRpc({ simulateTransaction: errorSim("boom") });
    const { simulateAndAssemble } = await import("./pipeline");
    await expect(simulateAndAssemble({} as never)).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
      message: "Transaction simulation failed",
      retryable: false,
    });
    expect(logSimulation).toHaveBeenCalledWith("Stellar simulation failed", { error: "boom" });
    logSimulation.mockRestore();
  });
  it("classifies an RPC simulation exception", async () => {
    const rpcError = new Error("RPC unavailable");
    const logSimulation = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpcRef.current = makeFakeRpc({
      simulateTransaction: vi.fn().mockRejectedValue(rpcError),
    });
    const { simulateAndAssemble } = await import("./pipeline");
    await expect(simulateAndAssemble({} as never)).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
      retryable: true,
    });
    expect(logSimulation).toHaveBeenCalledWith("Stellar simulation RPC failed", {
      error: rpcError,
    });
    logSimulation.mockRestore();
  });
});

describe("submitSignedXdr", () => {
  it("submits and polls until SUCCESS, returning hash", async () => {
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue({
      hash: () => Buffer.from("HASH"),
      source: "GPLAYER",
    } as never);
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "HASH" }),
      getTransaction: txStatus("SUCCESS"),
    });
    const { submitSignedXdr } = await import("./pipeline");
    const res = await submitSignedXdr("AAAAAgAAAAA=", "join");
    expect(res).toMatchObject({ hash: "HASH", source: "GPLAYER", status: "SUCCESS" });
  });
  it("returns FAILED status when getTransaction is FAILED", async () => {
    rpcRef.current = makeFakeRpc({ getTransaction: txStatus("FAILED") });
    const { submitSignedXdr } = await import("./pipeline");
    const res = await submitSignedXdr("AAAAAgAAAAA=", "join");
    expect(res.status).toBe("FAILED");
  });
  it("throws SUBMIT_FAILED when sendTransaction errors", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({ status: "ERROR", errorResult: "nope" }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "join")).rejects.toMatchObject({
      code: "SUBMIT_FAILED",
    });
  });
  it("classifies a bad-auth submission result as a rejected signature", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({
        status: "ERROR",
        errorResult: { result: () => ({ switch: () => ({ name: "txBadAuth" }) }) },
      }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "join")).rejects.toMatchObject({
      code: "TX_BAD_AUTH",
      retryable: false,
    });
  });
  it("fails closed when the RPC rejection result has an unexpected shape", async () => {
    const logRejected = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({
        status: "ERROR",
        errorResult: { result: () => ({ switch: () => ({ name: 1 }) }) },
      }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "join")).rejects.toMatchObject({
      code: "SUBMIT_FAILED",
      message: "Stellar rejected join (unknown)",
      retryable: false,
    });
    expect(logRejected).toHaveBeenCalledWith("Stellar transaction rejected", {
      intent: "join",
      result: "unknown",
    });
    logRejected.mockRestore();
  });
  it("identifies a protocol-malformed envelope without treating it as an RPC outage", async () => {
    const logMalformed = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({
        status: "ERROR",
        errorResult: { result: () => ({ switch: () => ({ name: "txMalformed" }) }) },
      }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "deploy")).rejects.toMatchObject({
      code: "TX_MALFORMED",
      message:
        "Transaction was rejected as malformed. Refresh the page and sign a newly generated transaction.",
      retryable: false,
    });
    expect(logMalformed).toHaveBeenCalledWith("Stellar transaction rejected as malformed", {
      intent: "deploy",
      result: "txMalformed",
    });
    logMalformed.mockRestore();
  });
  it("reads receiver-sensitive generated XDR accessors", async () => {
    const logMalformed = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = {
      code: "txMalformed",
      switch() {
        return { name: this.code };
      },
    };
    const errorResult = {
      payload: result,
      result() {
        return this.payload;
      },
    };
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({ status: "ERROR", errorResult }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "deploy")).rejects.toMatchObject({
      code: "TX_MALFORMED",
    });
    logMalformed.mockRestore();
  });
  it("accepts the direct result field returned by the Stellar SDK XDR object", async () => {
    const logMalformed = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({
        status: "ERROR",
        errorResult: { result: { switch: () => ({ name: "txMalformed" }) } },
      }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "deploy")).rejects.toMatchObject({
      code: "TX_MALFORMED",
    });
    logMalformed.mockRestore();
  });
  it("reads the SDK XDR result representation without inspecting unvalidated fields", async () => {
    const logMalformed = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({
        status: "ERROR",
        errorResult: {
          _attributes: { result: { _switch: { name: "txMalformed" } } },
        },
      }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "deploy")).rejects.toMatchObject({
      code: "TX_MALFORMED",
    });
    logMalformed.mockRestore();
  });
  it("prefers public SDK accessors over the v15 private fallback", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({
        status: "ERROR",
        errorResult: {
          result: () => ({ switch: () => ({ name: "txBadAuth" }) }),
          _attributes: { result: { _switch: { name: "txMalformed" } } },
        },
      }),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "join")).rejects.toMatchObject({
      code: "TX_BAD_AUTH",
    });
  });
  it("classifies an RPC submission exception as retryable", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "join")).rejects.toMatchObject({
      code: "SUBMIT_FAILED",
      retryable: true,
    });
  });
  it("rejects XDR that passes the schema but cannot be parsed", async () => {
    vi.mocked(TransactionBuilder.fromXDR).mockImplementationOnce(() => {
      throw new Error("invalid XDR");
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "join")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
  it("preserves the transaction hash when RPC confirmation polling fails", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "HASH" }),
      getTransaction: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("AAAAAgAAAAA=", "join")).rejects.toMatchObject({
      code: "SUBMIT_FAILED",
      txHash: "HASH",
      retryable: true,
    });
  });
  it("throws TX_TIMEOUT when polling never leaves NOT_FOUND", async () => {
    rpcRef.current = makeFakeRpc({ getTransaction: txStatus("NOT_FOUND") });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(
      submitSignedXdr("AAAAAgAAAAA=", "join", { attempts: 2, intervalMs: 0 }),
    ).rejects.toMatchObject({ code: "TX_TIMEOUT", txHash: "HASH", retryable: true });
  });
  it("rejects malformed XDR before submitting", async () => {
    const send = vi.fn();
    rpcRef.current = makeFakeRpc({ sendTransaction: send });
    const { submitSignedXdr } = await import("./pipeline");
    await expect(submitSignedXdr("!!!", "join")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("deployment retry reconciliation", () => {
  const contractId = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";

  it("derives the same hash from the signed XDR", async () => {
    const { deploymentTxHash } = await import("./pipeline");
    expect(deploymentTxHash("AAAAAgAAAAA=")).toBe(Buffer.from("HASH").toString("hex"));
  });

  it("recovers a confirmed deployment and its contract ID", async () => {
    rpcRef.current = makeFakeRpc({
      getTransaction: vi.fn().mockResolvedValue({
        status: "SUCCESS",
        returnValue: Address.fromString(contractId).toScVal(),
      }),
    });
    const { lookupDeployment } = await import("./pipeline");
    await expect(lookupDeployment("hash")).resolves.toEqual({
      hash: "hash",
      status: "SUCCESS",
      contractId,
    });
  });

  it("distinguishes a failed deployment from an unconfirmed one", async () => {
    const { lookupDeployment } = await import("./pipeline");
    rpcRef.current = makeFakeRpc({ getTransaction: txStatus("FAILED") });
    await expect(lookupDeployment("hash")).resolves.toEqual({ hash: "hash", status: "FAILED" });
    rpcRef.current = makeFakeRpc({ getTransaction: txStatus("NOT_FOUND") });
    await expect(lookupDeployment("hash")).resolves.toBeNull();
  });

  it("fails closed when the retry lookup cannot reach RPC", async () => {
    rpcRef.current = makeFakeRpc({
      getTransaction: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    });
    const { lookupDeployment } = await import("./pipeline");
    await expect(lookupDeployment("hash")).rejects.toMatchObject({
      code: "SUBMIT_FAILED",
      txHash: "hash",
      retryable: true,
    });
  });
});

describe("validateDeployXdr", () => {
  const tokenAddr = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";
  const terms = {
    tournamentId: "t_1",
    organizerAddress: Keypair.random().publicKey(),
    refereeAddress: Keypair.random().publicKey(),
    tokenAddr,
    entryFee: 10n,
    distributionBps: [6000, 3000, 1000] as [number, number, number],
    settlementDeadline: 1_800_000_000n,
  };

  function deployment(entryFee = terms.entryFee) {
    return {
      source: terms.organizerAddress,
      operations: [
        {
          type: "invokeHostFunction",
          func: {
            switch: () => ({ name: "hostFunctionTypeCreateContractV2" }),
            value: () => ({
              contractIdPreimage: () => ({
                switch: () => ({ name: "contractIdPreimageFromAddress" }),
                value: () => ({
                  address: () => Address.fromString(terms.organizerAddress).toScVal().address(),
                  salt: () => createHash("sha256").update(terms.tournamentId).digest(),
                }),
              }),
              executable: () => ({
                switch: () => ({ name: "contractExecutableWasm" }),
                value: () => Buffer.alloc(32, 1),
              }),
              constructorArgs: () => [
                nativeToScVal(terms.organizerAddress, { type: "address" }),
                nativeToScVal(terms.refereeAddress, { type: "address" }),
                nativeToScVal(terms.tokenAddr, { type: "address" }),
                nativeToScVal(entryFee, { type: "i128" }),
                nativeToScVal(terms.distributionBps, { type: ["u32"] }),
                nativeToScVal(terms.settlementDeadline, { type: "u64" }),
              ],
            }),
          },
        },
      ],
    };
  }

  it("accepts a matching constructor deployment", async () => {
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue(deployment() as never);
    const { validateDeployXdr } = await import("./pipeline");
    expect(() => validateDeployXdr("AAAAAgAAAAA=", terms)).not.toThrow();
  });

  it("accepts the SDK's real createContractV2 XDR shape", async () => {
    const sdk =
      await vi.importActual<typeof import("@stellar/stellar-sdk")>("@stellar/stellar-sdk");
    const args = [
      sdk.nativeToScVal(terms.organizerAddress, { type: "address" }),
      sdk.nativeToScVal(terms.refereeAddress, { type: "address" }),
      sdk.nativeToScVal(terms.tokenAddr, { type: "address" }),
      sdk.nativeToScVal(terms.entryFee, { type: "i128" }),
      sdk.nativeToScVal(terms.distributionBps, { type: ["u32"] }),
      sdk.nativeToScVal(terms.settlementDeadline, { type: "u64" }),
    ];
    const tx = new sdk.TransactionBuilder(new sdk.Account(terms.organizerAddress, "1"), {
      fee: "100",
      networkPassphrase: "Test SDF Network ; September 2015",
    })
      .addOperation(
        sdk.Operation.createCustomContract({
          address: new sdk.Address(terms.organizerAddress),
          wasmHash: Buffer.alloc(32, 1),
          salt: createHash("sha256").update(terms.tournamentId).digest(),
          constructorArgs: args,
        }),
      )
      .setTimeout(0)
      .build();
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue(
      sdk.TransactionBuilder.fromXDR(tx.toXDR(), "Test SDF Network ; September 2015") as never,
    );
    const { validateDeployXdr } = await import("./pipeline");
    expect(() => validateDeployXdr(tx.toXDR(), terms)).not.toThrow();
  });

  it("rejects a substituted constructor fee", async () => {
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue(deployment(11n) as never);
    const { validateDeployXdr } = await import("./pipeline");
    expect(() => validateDeployXdr("AAAAAgAAAAA=", terms)).toThrow(
      "Deployment must use this tournament's constructor terms and escrow Wasm",
    );
  });

  it("rejects a salt from another tournament", async () => {
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue(deployment() as never);
    const { validateDeployXdr } = await import("./pipeline");
    expect(() => validateDeployXdr("AAAAAgAAAAA=", { ...terms, tournamentId: "other" })).toThrow(
      "Deployment must use this tournament's constructor terms and escrow Wasm",
    );
  });
});
