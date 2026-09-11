import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@stellar/freighter-api", () => ({
  default: {
    isConnected: vi.fn(async () => ({ isConnected: true })),
    requestAccess: vi.fn(async () => ({ address: "G_ME" })),
    getAddress: vi.fn(async () => ({ address: "G_ME" })),
    getNetwork: vi.fn(async () => ({ networkPassphrase: "Test SDF Network ; September 2015" })),
    signTransaction: vi.fn(async () => ({ signedTxXdr: "SIGNED", signerAddress: "G_ME" })),
  },
}));

import freighterApi from "@stellar/freighter-api";
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
    expect(await ensureWallet(PASS)).toBe("G_ME");
  });

  it("throws on wrong network passphrase", async () => {
    mocked.getNetwork.mockResolvedValueOnce({
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    });
    await expect(ensureWallet(PASS)).rejects.toThrow(/network/i);
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
});

describe("signAndSubmit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signs then POSTs signed XDR with an Idempotency-Key header and correct body", async () => {
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
  });

  it("throws on a non-ok envelope response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          // HTTP 200 with an application-level ok:false envelope (the API's own error format)
          new Response(
            JSON.stringify({ ok: false, error: { code: "SUBMIT_FAILED", message: "boom" } }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    await expect(signAndSubmit("U", "deploy", "/x", PASS)).rejects.toThrow("boom");
  });

  it("throws a generic message when envelope ok:false has no error field", async () => {
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
  });

  it("throws a clean Error (not SyntaxError) when server returns non-JSON 5xx", async () => {
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
  });

  it.each([401, 403, 405])("handles a non-JSON %i submit response safely", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("METHOD NOT ALLOWED", { status })),
    );
    await expect(signAndSubmit("U", "deploy", "/x", PASS)).rejects.toThrow(
      status === 401 || status === 403
        ? "Your session has ended. Please log in again."
        : "Transaction submission failed. Please try again.",
    );
  });

  it("throws when signTransaction returns an error field", async () => {
    mocked.signTransaction.mockResolvedValueOnce({
      signedTxXdr: "",
      signerAddress: "",
      error: { code: 4, message: "Signing rejected" },
    });
    vi.stubGlobal("fetch", vi.fn());
    await expect(signAndSubmit("U", "finalize", "/x", PASS)).rejects.toThrow("Signing rejected");
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
