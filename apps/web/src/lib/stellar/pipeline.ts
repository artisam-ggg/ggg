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

export async function simulateAndAssemble(tx: Transaction): Promise<Transaction> {
  const server = getRpc();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new StellarError("SIMULATION_FAILED", sim.error);
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
  intent: "deploy" | "initialize" | "join" | "finalize" | "cancel",
  opts: { attempts?: number; intervalMs?: number } = {},
): Promise<SubmitResult> {
  const parsed = signedXdrSchema.safeParse(signedXdrStr);
  if (!parsed.success) throw new StellarError("INVALID_INPUT", "Malformed signed XDR");

  const server = getRpc();
  const tx = TransactionBuilder.fromXDR(parsed.data, networkPassphrase());
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new StellarError("SUBMIT_FAILED", `Submit rejected (${intent})`);
  }
  const hash = sent.hash;

  const attempts = opts.attempts ?? 30;
  const intervalMs = opts.intervalMs ?? 1000;
  for (let i = 0; i < attempts; i++) {
    const got = await server.getTransaction(hash);
    if (got.status === "SUCCESS") {
      const contractId = extractContractId(intent, got);
      return contractId ? { hash, status: "SUCCESS", contractId } : { hash, status: "SUCCESS" };
    }
    if (got.status === "FAILED") return { hash, status: "FAILED" };
    if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new StellarError("TX_TIMEOUT", `Timed out polling ${hash}`);
}

function extractContractId(
  intent: "deploy" | "initialize" | "join" | "finalize" | "cancel",
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
