"use client";
import freighter from "@stellar/freighter-api";

export type SubmitResult = {
  txHash: string;
  contractId?: string;
  status?: string;
  initializeXdr?: string;
};

export async function ensureWallet(expectedPassphrase: string): Promise<string> {
  const connected = await freighter.isConnected();
  if (connected.error) throw new Error(`Freighter error: ${connected.error.message}`);
  if (!connected.isConnected)
    throw new Error(
      "Freighter is not installed or unavailable. Please install the Freighter extension.",
    );

  const access = await freighter.requestAccess();
  if (access.error) throw new Error(`Freighter access denied: ${access.error.message}`);

  const { address, error: addrError } = await freighter.getAddress();
  if (addrError) throw new Error(`Freighter could not get address: ${addrError.message}`);

  const { networkPassphrase, error: netError } = await freighter.getNetwork();
  if (netError) throw new Error(`Freighter could not get network: ${netError.message}`);

  if (networkPassphrase !== expectedPassphrase)
    throw new Error(
      `Wrong network — switch Freighter to the tournament's network. Expected: "${expectedPassphrase}", got: "${networkPassphrase}"`,
    );

  return address;
}

export async function signAndSubmit(
  unsignedXdr: string,
  intent: "deploy" | "initialize" | "join" | "claim_refund" | "finalize" | "cancel",
  submitUrl: string,
  expectedPassphrase: string,
): Promise<SubmitResult> {
  const address = await ensureWallet(expectedPassphrase);

  const { signedTxXdr, error: signError } = await freighter.signTransaction(unsignedXdr, {
    networkPassphrase: expectedPassphrase,
    address,
  });
  if (signError) throw new Error(`Freighter signing failed: ${signError.message}`);

  const res = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ signedXdr: signedTxXdr, intent }),
  });

  // Guard against non-JSON error responses (e.g. a 5xx HTML error page from a proxy)
  // before attempting res.json(), which would throw a raw SyntaxError on non-JSON bodies.
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`);

  const json = (await res.json()) as { ok: boolean; data?: SubmitResult; error?: string };
  if (!json.ok) throw new Error(json.error ?? "Submission failed");
  return json.data as SubmitResult;
}
