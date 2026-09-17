import posthog from "posthog-js";

export const ANALYTICS_CONSENT_KEY = "ggg_cookie_consent";

export function captureWalletConnected(address: string): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || typeof window === "undefined") return;

  try {
    if (localStorage.getItem(ANALYTICS_CONSENT_KEY) !== "accepted") return;
    posthog.capture("wallet_connected", { wallet_address: address });
  } catch {
    // Optional analytics must never interrupt wallet access.
  }
}
