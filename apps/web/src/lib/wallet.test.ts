import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("posthog-js", () => ({ default: posthog }));

vi.mock("@stellar/freighter-api", () => ({
  default: {
    isConnected: vi.fn(async () => ({ isConnected: true })),
    requestAccess: vi.fn(async () => ({
      address: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    })),
    getAddress: vi.fn(async () => ({
      address: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    })),
    getNetwork: vi.fn(async () => ({ networkPassphrase: "Test SDF Network ; September 2015" })),
    signTransaction: vi.fn(async () => ({
      signedTxXdr: "SIGNED",
      signerAddress: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    })),
  },
}));

import freighterApi from "@stellar/freighter-api";
import { ANALYTICS_CONSENT_KEY } from "./analytics";
import { ensureWallet, signAndSubmit } from "./wallet";

const PASS = "Test SDF Network ; September 2015";

// Cast to mocked versions for .mockResolvedValueOnce usage
const mocked = freighterApi as unknown as {
  isConnected: ReturnType<typeof vi.fn>;
  requestAccess: ReturnType<typeof vi.fn>;
  getAddress: ReturnType<typeof vi.fn>;
  getNetwork: ReturnType<typeof vi.fn>;
  signTransaction: ReturnType<typeof vi.fn>;
};

describe("ensureWallet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns address when network matches", async () => {
    expect(await ensureWallet(PASS)).toBe(
      "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    );
  });

  it("throws on wrong network passphrase", async () => {
    mocked.getNetwork.mockResolvedValueOnce({
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    });
    await expect(ensureWallet(PASS)).rejects.toMatchObject({
      name: "SubmissionError",
      details: { code: "NETWORK_MISMATCH", retryable: false },
    });
  });

  it("throws when Freighter is not installed (isConnected returns false)", async () => {
    mocked.isConnected.mockResolvedValueOnce({ isConnected: false });
    await expect(ensureWallet(PASS)).rejects.toThrow(/Freighter/);
  });

  it("throws when isConnected returns an error field", async () => {
    mocked.isConnected.mockResolvedValueOnce({
      isConnected: false,
      error: { code: 1, message: "Extension unavailable" },
    });
    await expect(ensureWallet(PASS)).rejects.toThrow(/Extension unavailable/);
  });

  it("throws when requestAccess is denied (error field)", async () => {
    mocked.requestAccess.mockResolvedValueOnce({
      address: "",
      error: { code: 3, message: "User rejected" },
    });
    await expect(ensureWallet(PASS)).rejects.toThrow(/User rejected/);
  });

  it("throws when getAddress returns an error field", async () => {
    mocked.getAddress.mockResolvedValueOnce({
      address: "",
      error: { code: 2, message: "Could not get address" },
    });
    await expect(ensureWallet(PASS)).rejects.toThrow(/Could not get address/);
  });

  it("rejects an invalid address returned by Freighter", async () => {
    mocked.getAddress.mockResolvedValueOnce({ address: "G_INVALID" });

    await expect(ensureWallet(PASS)).rejects.toThrow(/invalid Stellar address/);
  });
});

describe("signAndSubmit", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("signs then POSTs signed XDR with an Idempotency-Key header and correct body", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, data: { txHash: "TX" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await signAndSubmit("UNSIGNED", "deploy", "/api/tournaments/t_1/submit", PASS);

    expect(r.txHash).toBe("TX");
    const [callUrl, callInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(callUrl).toBe("/api/tournaments/t_1/submit");
    expect((callInit.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
    expect((callInit.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(callInit.body as string)).toMatchObject({
      signedXdr: "SIGNED",
      intent: "deploy",
    });
    expect(posthog.capture).toHaveBeenCalledOnce();
    expect(posthog.capture).toHaveBeenCalledWith("wallet_transaction_succeeded", {
      wallet_address: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
      tx_hash: "TX",
      transaction_type: "deploy",
    });
  });

  it("returns the successful result when analytics capture fails", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
    posthog.capture.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, data: { txHash: "TX" } }), { status: 200 }),
      ),
    );

    await expect(signAndSubmit("UNSIGNED", "join", "/x", PASS)).resolves.toEqual({ txHash: "TX" });
    expect(posthog.capture).toHaveBeenCalledOnce();
  });

  it("preserves structured submission failure details", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          // HTTP 200 with an application-level ok:false envelope (the API's own error format)
          new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: "TX_FAILED",
                message: "Transaction failed on-chain",
                txHash: "TX_FAIL",
                retryable: false,
              },
            }),
            {
              status: 422,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    await expect(signAndSubmit("U", "deploy", "/x", PASS)).rejects.toMatchObject({
      name: "SubmissionError",
      message: "Transaction failed on-chain",
      details: { code: "TX_FAILED", txHash: "TX_FAIL", retryable: false },
    });
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("throws a generic message when envelope ok:false has no error field", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          // HTTP 200 with an application-level ok:false envelope (no error message)
          new Response(JSON.stringify({ ok: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(signAndSubmit("U", "join", "/x", PASS)).rejects.toThrow("Submission failed");
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it.each([{}, { txHash: "" }])(
    "does not capture a malformed success response: %j",
    async (data) => {
      localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ ok: true, data }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        ),
      );

      await expect(signAndSubmit("U", "join", "/x", PASS)).rejects.toThrow("Submission failed");
      expect(posthog.capture).not.toHaveBeenCalled();
    },
  );

  it("throws a clean Error (not SyntaxError) when server returns non-JSON 5xx", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        text: async () => "<html>bad gateway</html>",
      })),
    );
    await expect(signAndSubmit("U", "deploy", "/x", PASS)).rejects.toThrow(
      "Transaction submission failed. Please try again.",
    );
    await expect(signAndSubmit("U", "deploy", "/x", PASS)).rejects.not.toThrow(
      expect.any(SyntaxError),
    );
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it.each([401, 403, 405])("handles a non-JSON %i submit response safely", async (status) => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("METHOD NOT ALLOWED", { status })),
    );
    await expect(signAndSubmit("U", "deploy", "/x", PASS)).rejects.toThrow(
      status === 401 || status === 403
        ? "Your session has ended. Please log in again."
        : "Transaction submission failed. Please try again.",
    );
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("throws when signTransaction returns an error field", async () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
    mocked.signTransaction.mockResolvedValueOnce({
      signedTxXdr: "",
      signerAddress: "",
      error: { code: 4, message: "Signing rejected" },
    });
    vi.stubGlobal("fetch", vi.fn());
    await expect(signAndSubmit("U", "finalize", "/x", PASS)).rejects.toThrow("Signing rejected");
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("generates a unique Idempotency-Key for each call", async () => {
    const keys: string[] = [];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, data: { txHash: "TX" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await signAndSubmit("UNSIGNED", "deploy", "/url", PASS);
    await signAndSubmit("UNSIGNED", "cancel", "/url", PASS);

    for (const [, callInit] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      keys.push((callInit.headers as Record<string, string>)["Idempotency-Key"] ?? "");
    }
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[0]).not.toBe(keys[1]);
  });
});
