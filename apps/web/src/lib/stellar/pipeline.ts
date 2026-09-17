import {
  rpc,
  TransactionBuilder,
  type Transaction,
  Address,
  scValToNative,
} from "@stellar/stellar-sdk";
import { getRpc, networkPassphrase } from "./client";
import { env } from "@/lib/env";
import { createHash } from "node:crypto";
import { signedXdr as signedXdrSchema, stellarPublicKey } from "./validation";
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
  } catch (error) {
    console.error("Stellar simulation RPC failed", { error });
    throw new StellarError("SIMULATION_FAILED", "Transaction simulation could not be completed", {
      retryable: true,
    });
  }
  if (rpc.Api.isSimulationError(sim)) {
    console.error("Stellar simulation failed", { error: sim.error });
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

/** Hash the signed transaction independently of its signatures for retry reconciliation. */
export function deploymentTxHash(signedXdrStr: string): string {
  const parsed = signedXdrSchema.safeParse(signedXdrStr);
  if (!parsed.success) throw new StellarError("INVALID_INPUT", "Malformed signed XDR");
  try {
    return TransactionBuilder.fromXDR(parsed.data, networkPassphrase()).hash().toString("hex");
  } catch {
    throw new StellarError("INVALID_INPUT", "Malformed signed XDR");
  }
}

/** Return a confirmed deployment result, or null while RPC has no final result. */
export async function lookupDeployment(hash: string): Promise<SubmitResult | null> {
  let got: Awaited<ReturnType<ReturnType<typeof getRpc>["getTransaction"]>>;
  try {
    got = await getRpc().getTransaction(hash);
  } catch {
    throw new StellarError("SUBMIT_FAILED", "Transaction confirmation could not be completed", {
      txHash: hash,
      retryable: true,
    });
  }
  if (got.status === "FAILED") return { hash, status: "FAILED" };
  if (got.status === "SUCCESS") {
    const contractId = extractContractId("deploy", got);
    return contractId ? { hash, status: "SUCCESS", contractId } : { hash, status: "SUCCESS" };
  }
  return null;
}

/** The persisted escrow terms a signed constructor deployment must match. */
export interface DeployTerms {
  tournamentId: string;
  organizerAddress: string;
  refereeAddress: string;
  tokenAddr: string;
  entryFee: bigint;
  distributionBps: [number, number, number];
  settlementDeadline: bigint;
}

/** Reject a substituted deploy or constructor whose terms differ from the draft. */
export function validateDeployXdr(signedXdrStr: string, expected: DeployTerms): void {
  const parsed = signedXdrSchema.safeParse(signedXdrStr);
  if (!parsed.success) throw new StellarError("INVALID_INPUT", "Malformed signed XDR");

  try {
    const tx = TransactionBuilder.fromXDR(parsed.data, networkPassphrase());
    if (
      tx.operations.length !== 1 ||
      !("source" in tx) ||
      tx.source !== expected.organizerAddress
    ) {
      throw new Error("unexpected source or operation count");
    }

    const operation = tx.operations[0] as unknown as {
      type?: string;
      func?: {
        switch(): { name?: string };
        value(): {
          contractIdPreimage(): {
            switch(): { name?: string };
            value(): { address(): never; salt(): Buffer };
          };
          executable(): { switch(): { name?: string }; value(): Buffer };
          constructorArgs(): Parameters<typeof scValToNative>[0][];
        };
      };
    };
    if (
      operation.type !== "invokeHostFunction" ||
      operation.func?.switch().name !== "hostFunctionTypeCreateContractV2"
    ) {
      throw new Error("not a constructor deployment");
    }

    const args = operation.func.value();
    if (
      args.contractIdPreimage().switch().name !== "contractIdPreimageFromAddress" ||
      Address.fromScAddress(args.contractIdPreimage().value().address()).toString() !==
        expected.organizerAddress ||
      !args
        .contractIdPreimage()
        .value()
        .salt()
        .equals(createHash("sha256").update(expected.tournamentId).digest()) ||
      args.executable().switch().name !== "contractExecutableWasm" ||
      !env.ESCROW_WASM_HASH ||
      args.executable().value().toString("hex") !== env.ESCROW_WASM_HASH.toLowerCase()
    ) {
      throw new Error("unexpected deployer or Wasm");
    }

    const values = args.constructorArgs().map(scValToNative);
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
      throw new Error("unexpected constructor arguments");
    }
  } catch {
    throw new StellarError(
      "INVALID_INPUT",
      "Deployment must use this tournament's constructor terms and escrow Wasm",
    );
  }
}

/** Validate a join invocation and return the player authorized by the contract call. */
export function validateJoinXdr(signedXdrStr: string, expected: { contractId: string }): string {
  const parsed = signedXdrSchema.safeParse(signedXdrStr);
  if (!parsed.success) throw new StellarError("INVALID_INPUT", "Malformed signed XDR");

  try {
    const tx = TransactionBuilder.fromXDR(parsed.data, networkPassphrase());
    if (tx.operations.length !== 1) throw new Error("unexpected operation count");

    const operation = tx.operations[0] as unknown as {
      type?: string;
      func?: {
        switch(): { name?: string };
        value(): {
          contractAddress(): never;
          functionName(): { toString(): string };
          args(): Parameters<typeof scValToNative>[0][];
        };
      };
    };
    if (
      operation.type !== "invokeHostFunction" ||
      operation.func?.switch().name !== "hostFunctionTypeInvokeContract"
    ) {
      throw new Error("not a contract invocation");
    }

    const invocation = operation.func.value();
    const args = invocation.args().map(scValToNative);
    const player = args[0];
    if (
      Address.fromScAddress(invocation.contractAddress()).toString() !== expected.contractId ||
      invocation.functionName().toString() !== "join_tournament" ||
      args.length !== 1 ||
      !stellarPublicKey.safeParse(player).success
    ) {
      throw new Error("unexpected join invocation");
    }
    return player as string;
  } catch {
    throw new StellarError(
      "INVALID_INPUT",
      "Join must invoke this tournament's join_tournament function",
    );
  }
}

export async function submitSignedXdr(
  signedXdrStr: string,
  intent: "deploy" | "join" | "claim_refund" | "finalize" | "cancel",
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
        "Transaction signatures were rejected. Check the signing wallet and network.",
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
      return {
        hash,
        status: "SUCCESS",
        ...(contractId ? { contractId } : {}),
      };
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
  const parsedError = rpcErrorResultSchema.safeParse(errorResult);
  if (parsedError.success) {
    try {
      const result =
        typeof parsedError.data.result === "function"
          ? parsedError.data.result.call(errorResult)
          : parsedError.data.result;
      const parsedResult = transactionResultSchema.safeParse(result);
      if (parsedResult.success) {
        const resultSwitch =
          typeof parsedResult.data.switch === "function"
            ? parsedResult.data.switch.call(result)
            : parsedResult.data.switch;
        const parsedSwitch = transactionResultSwitchSchema.safeParse(resultSwitch);
        if (parsedSwitch.success) return parsedSwitch.data.name;
      }
    } catch {
      // Fall back to the SDK's observed v15 XDR representation below.
    }
  }

  // Fallback for @stellar/stellar-sdk v15 generated XDR objects.
  const parsedXdrResult = xdrTransactionResultSchema.safeParse(errorResult);
  return parsedXdrResult.success ? parsedXdrResult.data._attributes.result._switch.name : undefined;
}

function extractContractId(
  intent: "deploy" | "join" | "claim_refund" | "finalize" | "cancel",
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
