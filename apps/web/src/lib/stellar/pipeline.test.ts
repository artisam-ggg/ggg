// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Address, Keypair, nativeToScVal, TransactionBuilder } from "@stellar/stellar-sdk";
import { makeFakeRpc, errorSim, txStatus } from "./__mocks__/rpc";

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
    rpcRef.current = makeFakeRpc({ simulateTransaction: errorSim("boom") });
    const { simulateAndAssemble } = await import("./pipeline");
    await expect(simulateAndAssemble({} as never)).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
      message: "Transaction simulation failed",
      retryable: false,
    });
  });
  it("classifies an RPC simulation exception", async () => {
    rpcRef.current = makeFakeRpc({
      simulateTransaction: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    });
    const { simulateAndAssemble } = await import("./pipeline");
    await expect(simulateAndAssemble({} as never)).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
      retryable: true,
    });
  });
});

describe("submitSignedXdr", () => {
  it("submits and polls until SUCCESS, returning hash", async () => {
    rpcRef.current = makeFakeRpc({
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "HASH" }),
      getTransaction: txStatus("SUCCESS"),
    });
    const { submitSignedXdr } = await import("./pipeline");
    const res = await submitSignedXdr("AAAAAgAAAAA=", "join");
    expect(res).toMatchObject({ hash: "HASH", status: "SUCCESS" });
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
  it("classifies a bad-auth submission result as a signature failure", async () => {
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
    await expect(submitSignedXdr("AAAAAgAAAAA=", "initialize")).rejects.toMatchObject({
      code: "TX_MALFORMED",
      message:
        "Transaction was rejected as malformed. Refresh the page and sign a newly generated transaction.",
      retryable: false,
    });
    expect(logMalformed).toHaveBeenCalledWith("Stellar transaction rejected as malformed", {
      intent: "initialize",
      result: "txMalformed",
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
    await expect(submitSignedXdr("AAAAAgAAAAA=", "initialize")).rejects.toMatchObject({
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
    await expect(submitSignedXdr("AAAAAgAAAAA=", "initialize")).rejects.toMatchObject({
      code: "TX_MALFORMED",
    });
    logMalformed.mockRestore();
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

describe("validateInitializeXdr", () => {
  const contractId = "CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5";
  const terms = {
    contractId,
    organizerAddress: Keypair.random().publicKey(),
    refereeAddress: Keypair.random().publicKey(),
    tokenAddr: contractId,
    entryFee: 10n,
    distributionBps: [6000, 3000, 1000] as [number, number, number],
    settlementDeadline: 1_800_000_000n,
  };

  function initializeOperation(entryFee = terms.entryFee) {
    const args = [
      nativeToScVal(terms.organizerAddress, { type: "address" }),
      nativeToScVal(terms.refereeAddress, { type: "address" }),
      nativeToScVal(terms.tokenAddr, { type: "address" }),
      nativeToScVal(entryFee, { type: "i128" }),
      nativeToScVal(terms.distributionBps, { type: ["u32"] }),
      nativeToScVal(terms.settlementDeadline, { type: "u64" }),
    ];
    return {
      operations: [
        {
          type: "invokeHostFunction",
          func: {
            switch: () => ({ name: "hostFunctionTypeInvokeContract" }),
            value: () => ({
              contractAddress: () => Address.fromString(contractId).toScVal().address(),
              functionName: () => ({ toString: () => "initialize" }),
              args: () => args,
            }),
          },
        },
      ],
    };
  }

  it("rejects initialize terms that differ from the persisted tournament", async () => {
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue(initializeOperation(11n) as never);
    const { validateInitializeXdr } = await import("./pipeline");

    expect(() => validateInitializeXdr("AAAAAgAAAAA=", terms)).toThrow(
      "Initialize transaction must target this tournament's escrow contract",
    );
  });

  it("accepts an initialize transaction with the persisted terms", async () => {
    vi.mocked(TransactionBuilder.fromXDR).mockReturnValue(initializeOperation() as never);
    const { validateInitializeXdr } = await import("./pipeline");

    expect(() => validateInitializeXdr("AAAAAgAAAAA=", terms)).not.toThrow();
  });
});
