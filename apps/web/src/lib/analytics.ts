"use client";

import posthog from "posthog-js";

export const ANALYTICS_CONSENT_KEY = "ggg_cookie_consent";

export type WalletTransactionType = "deploy" | "join" | "claim_refund" | "finalize" | "cancel";

function captureWithConsent(event: string, properties: Record<string, string>): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || typeof window === "undefined") return;

  try {
    if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== "accepted") return;
    posthog.capture(event, properties);
  } catch {
    // Optional analytics must never interrupt wallet or transaction access.
  }
}

export function captureWalletConnected(address: string): void {
  captureWithConsent("wallet_connected", { wallet_address: address });
}

export function captureWalletTransactionSucceeded(
  address: string,
  txHash: string,
  transactionType: WalletTransactionType,
): void {
  captureWithConsent("wallet_transaction_succeeded", {
    wallet_address: address,
    tx_hash: txHash,
    transaction_type: transactionType,
  });
}
