import {
  rpc,
  TransactionBuilder,
  type Transaction,
  Address,
  scValToNative,
} from "@stellar/stellar-sdk";
import { getRpc, networkPassphrase } from "./client";
import { signedXdr as signedXdrSchema } from "./validation";
import { StellarError } from "./errors";
import { z } from "zod";

const rpcErrorResultSchema = z.object({ result: z.unknown() });
const transactionResultSchema = z.object({ switch: z.unknown() });
const transactionResultSwitchSchema = z.object({ name: z.string() });
const xdrTransactionResultSchema = z.object({
  _attributes: z.object({ result: z.object({ _switch: z.object({ name: z.string() }) }) }),
});

export async function simulateAndAssemble(tx: Transaction): Promise<Transaction> {
  const server = getRpc();
  let sim: Awaited<ReturnType<typeof server.simulateTransaction>>;
  try {
    sim = await server.simulateTransaction(tx);
  } catch {
    throw new StellarError("SIMULATION_FAILED", "Transaction simulation could not be completed", {
      retryable: true,
    });
  }
  if (rpc.Api.isSimulationError(sim)) {
    throw new StellarError("SIMULATION_FAILED", "Transaction simulation failed", {
      retryable: false,
    });
  }
  return rpc.assembleTransaction(tx, sim as never).build();
}

export interface SubmitResult {
  hash: string;
  contractId?: string;
  status: "SUCCESS" | "FAILED";
}

/** The persisted escrow terms a signed `initialize` invocation must exactly match. */
export interface InitializeTerms {
  contractId: string;
  organizerAddress: string;
  refereeAddress: string;
  tokenAddr: string;
  entryFee: bigint;
  distributionBps: [number, number, number];
  settlementDeadline: bigint;
}

/** Reject a signed initialize transaction unless it targets the escrow with the persisted terms. */
export function validateInitializeXdr(signedXdrStr: string, expected: InitializeTerms): void {
  const parsed = signedXdrSchema.safeParse(signedXdrStr);
  if (!parsed.success) throw new StellarError("INVALID_INPUT", "Malformed signed XDR");

  try {
    const tx = TransactionBuilder.fromXDR(parsed.data, networkPassphrase());
    if (tx.operations.length !== 1) throw new Error("expected one operation");

    const operation = tx.operations[0] as unknown as {
      type?: string;
      func?: {
        switch(): { name?: string };
        value(): {
          contractAddress(): never;
          functionName(): { toString(encoding: string): string };
          args(): Parameters<typeof scValToNative>[0][];
        };
      };
    };
    if (
      operation.type !== "invokeHostFunction" ||
      operation.func?.switch().name !== "hostFunctionTypeInvokeContract"
    ) {
      throw new Error("not an invokeContract operation");
    }

    const args = operation.func.value();
    const contractId = Address.fromScAddress(args.contractAddress()).toString();
    if (
      contractId !== expected.contractId ||
      args.functionName().toString("utf-8") !== "initialize"
    ) {
      throw new Error("unexpected contract or method");
    }

    const values = args.args().map(scValToNative);
    if (
      values.length !== 6 ||
      values[0] !== expected.organizerAddress ||
      values[1] !== expected.refereeAddress ||
      values[2] !== expected.tokenAddr ||
      values[3] !== expected.entryFee ||
      !Array.isArray(values[4]) ||
      values[4].length !== 3 ||
      values[4].some(
        (value, index) =>
          (typeof value !== "number" && typeof value !== "bigint") ||
          Number(value) !== expected.distributionBps[index],
      ) ||
      values[5] !== expected.settlementDeadline
    ) {
      throw new Error("unexpected initialize arguments");
    }
  } catch {
    throw new StellarError(
      "INVALID_INPUT",
      "Initialize transaction must target this tournament's escrow contract",
    );
  }
}

export async function submitSignedXdr(
  signedXdrStr: string,
  intent: "deploy" | "initialize" | "join" | "claim_refund" | "finalize" | "cancel",
  opts: { attempts?: number; intervalMs?: number } = {},
): Promise<SubmitResult> {
  const parsed = signedXdrSchema.safeParse(signedXdrStr);
  if (!parsed.success) throw new StellarError("INVALID_INPUT", "Malformed signed XDR");

  const server = getRpc();
  let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    tx = TransactionBuilder.fromXDR(parsed.data, networkPassphrase());
  } catch {
    throw new StellarError("INVALID_INPUT", "Malformed signed XDR");
  }

  let sent: Awaited<ReturnType<typeof server.sendTransaction>>;
  try {
    sent = await server.sendTransaction(tx);
  } catch {
    throw new StellarError("SUBMIT_FAILED", "Transaction submission could not be completed", {
      retryable: true,
    });
  }
  if (sent.status === "ERROR") {
    const rejectionCode = transactionResultCode(sent.errorResult);
    if (rejectionCode === "txBadAuth") {
      throw new StellarError(
        "TX_BAD_AUTH",
        "Transaction signature was rejected. Reconnect Freighter and sign again.",
        { retryable: false },
      );
    }
    if (rejectionCode === "txMalformed") {
      console.error("Stellar transaction rejected as malformed", { intent, result: "txMalformed" });
      throw new StellarError(
        "TX_MALFORMED",
        "Transaction was rejected as malformed. Refresh the page and sign a newly generated transaction.",
        { retryable: false },
      );
    }
    console.error("Stellar transaction rejected", { intent, result: rejectionCode ?? "unknown" });
    throw new StellarError(
      "SUBMIT_FAILED",
      `Stellar rejected ${intent} (${rejectionCode ?? "unknown"})`,
      { retryable: false },
    );
  }
  const hash = sent.hash;

  const attempts = opts.attempts ?? 30;
  const intervalMs = opts.intervalMs ?? 1000;
  for (let i = 0; i < attempts; i++) {
    let got: Awaited<ReturnType<typeof server.getTransaction>>;
    try {
      got = await server.getTransaction(hash);
    } catch {
      throw new StellarError("SUBMIT_FAILED", "Transaction confirmation could not be completed", {
        txHash: hash,
        retryable: true,
      });
    }
    if (got.status === "SUCCESS") {
      const contractId = extractContractId(intent, got);
      return contractId ? { hash, status: "SUCCESS", contractId } : { hash, status: "SUCCESS" };
    }
    if (got.status === "FAILED") return { hash, status: "FAILED" };
    if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new StellarError("TX_TIMEOUT", "Transaction confirmation timed out", {
    txHash: hash,
    retryable: true,
  });
}

function transactionResultCode(errorResult: unknown): string | undefined {
  const parsedXdrResult = xdrTransactionResultSchema.safeParse(errorResult);
  if (parsedXdrResult.success) return parsedXdrResult.data._attributes.result._switch.name;

  const parsedError = rpcErrorResultSchema.safeParse(errorResult);
  if (!parsedError.success) return undefined;
  try {
    const result =
      typeof parsedError.data.result === "function"
        ? parsedError.data.result()
        : parsedError.data.result;
    const parsedResult = transactionResultSchema.safeParse(result);
    if (!parsedResult.success) return undefined;
    const resultSwitch =
      typeof parsedResult.data.switch === "function"
        ? parsedResult.data.switch()
        : parsedResult.data.switch;
    const parsedSwitch = transactionResultSwitchSchema.safeParse(resultSwitch);
    return parsedSwitch.success ? parsedSwitch.data.name : undefined;
  } catch {
    return undefined;
  }
}

function extractContractId(
  intent: "deploy" | "initialize" | "join" | "claim_refund" | "finalize" | "cancel",
  got: { returnValue?: unknown },
): string | undefined {
  if (intent !== "deploy" || !got.returnValue) return undefined;
  try {
    // deploy returns the new contract Address scVal; decode to a C-address string.
    // Address.fromScVal(...).toString() yields the C... id; guarded so polling never throws.
    return Address.fromScVal(got.returnValue as never).toString();
  } catch {
    return undefined;
  }
}
