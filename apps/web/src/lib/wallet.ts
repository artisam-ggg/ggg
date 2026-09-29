"use client";
import freighter from "@stellar/freighter-api";
import { apiResponseSchema } from "@/lib/api";
import { captureWalletTransactionSucceeded, type WalletTransactionType } from "@/lib/analytics";
import { stellarPublicKey } from "@/lib/validation/tournament";
import { stellarNetworkLabel } from "@/lib/stellar-network";
import { z } from "zod";

export type SubmitResult = {
  txHash: string;
  contractId?: string | undefined;
  status?: string | undefined;
};

const submitResponseSchema = apiResponseSchema(
  z.object({
    txHash: z.string().min(1),
    contractId: z.string().optional(),
    status: z.string().optional(),
  }),
);

type SubmissionErrorDetails = {
  code: string;
  txHash?: string;
  retryable?: boolean;
};

export class SubmissionError extends Error {
  constructor(
    message: string,
    readonly details: SubmissionErrorDetails,
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}

export async function ensureWallet(expectedPassphrase: string): Promise<string> {
  const connected = await freighter.isConnected();
  if (connected.error) throw new Error(`Freighter error: ${connected.error.message}`);
  if (!connected.isConnected)
    throw new Error(
      "Freighter is not installed or unavailable. Please install the Freighter extension.",
    );

  const access = await freighter.requestAccess();
  if (access.error)
    throw new Error(
      "Wallet connection was not approved. Approve the Freighter request, then try again.",
    );

  const { address, error: addrError } = await freighter.getAddress();
  if (addrError)
    throw new Error(
      "Freighter could not read the active account. Unlock Freighter, then try again.",
    );
  const parsedAddress = stellarPublicKey.safeParse(address);
  if (!parsedAddress.success) throw new Error("Freighter returned an invalid Stellar address.");

  const { networkPassphrase, error: netError } = await freighter.getNetwork();
  if (netError)
    throw new Error(
      "Freighter could not read the active network. Unlock Freighter, then try again.",
    );

  if (networkPassphrase !== expectedPassphrase)
    throw new SubmissionError(
      `Wrong network. Switch Freighter to ${stellarNetworkLabel(expectedPassphrase)}, then try again.`,
      {
        code: "NETWORK_MISMATCH",
        retryable: false,
      },
    );

  return parsedAddress.data;
}

export async function signAndSubmit(
  unsignedXdr: string,
  intent: WalletTransactionType,
  submitUrl: string,
  expectedPassphrase: string,
): Promise<SubmitResult> {
  const address = await ensureWallet(expectedPassphrase);

  const { signedTxXdr, error: signError } = await freighter.signTransaction(unsignedXdr, {
    networkPassphrase: expectedPassphrase,
    address,
  });
  if (signError)
    throw new Error(
      "Transaction signature was not approved. Review the request in Freighter, then try again. Nothing was submitted.",
    );

  const res = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ signedXdr: signedTxXdr, intent }),
  });

  const raw = await res.text();
  let json: ReturnType<typeof submitResponseSchema.safeParse>;
  try {
    json = submitResponseSchema.safeParse(JSON.parse(raw));
  } catch {
    if (res.status === 401 || res.status === 403)
      throw new Error("Your session has ended. Please log in again.");
    throw new Error("Transaction submission failed. Please try again.");
  }
  if (!json.success || (json.data.ok && !res.ok)) {
    if (res.status === 401 || res.status === 403)
      throw new Error("Your session has ended. Please log in again.");
    throw new Error("Submission failed");
  }
  if (json.data.ok) {
    const result = json.data.data;
    captureWalletTransactionSucceeded(address, result.txHash, intent);
    return result;
  }
  const { code, message, txHash, retryable } = json.data.error;
  const recoveryMessage =
    code === "TX_BAD_AUTH" || code === "TX_MALFORMED"
      ? "The signed transaction is no longer valid. Re-check your wallet, then build and sign a fresh transaction."
      : code === "SUBMIT_REJECTED"
        ? "Stellar rejected the transaction. Re-check your wallet, then build and sign a fresh transaction."
        : message;
  throw new SubmissionError(recoveryMessage, {
    code,
    ...(txHash ? { txHash } : {}),
    ...(retryable === undefined ? {} : { retryable }),
  });
}
