import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stellar", async (orig) => ({
  ...(await orig<typeof import("@/lib/stellar")>()),
  buildJoinTx: vi.fn(async () => ({ xdr: "JOIN_XDR", network: "testnet" })),
  StellarError: class StellarError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "StellarError";
      this.code = code;
    }
  },
}));
vi.mock("@/lib/csrf", () => ({
  assertSameOrigin: vi.fn(),
  CsrfError: class CsrfError extends Error {
    constructor() {
      super("Cross-origin request rejected");
      this.name = "CsrfError";
    }
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 29 })),
}));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost:3000", STELLAR_NETWORK: "testnet" },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(async () => ({
        id: "t_1",
        status: "ACTIVE",
        contractId: "CCGRFT3LGSQ6S7OEFMVWPVIJWZMHLLQPBPXB2GBMXFBF5XXFM4HQZ7B",
        entryFee: 10n,
        tokenAddr: "CSAC",
      })),
    },
    participant: { findUnique: vi.fn() },
  },
}));

import { POST } from "./route";
import { prisma } from "@/lib/db";
import { buildJoinTx } from "@/lib/stellar";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";

// A valid Stellar G-address for testing.
const G = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

const ctx = { params: Promise.resolve({ id: "t_1" }) };

const findUniqueMock = prisma.tournament.findUnique as ReturnType<typeof vi.fn>;
const findParticipantMock = prisma.participant.findUnique as ReturnType<typeof vi.fn>;
const buildJoinTxMock = buildJoinTx as ReturnType<typeof vi.fn>;
const assertSameOriginMock = assertSameOrigin as ReturnType<typeof vi.fn>;
const rateLimitMock = rateLimit as ReturnType<typeof vi.fn>;

function makeReq(body: unknown, origin = "http://localhost:3000"): Parameters<typeof POST>[0] {
  return new Request("http://localhost:3000/api/tournaments/t_1/join", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

describe("POST /api/tournaments/[id]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      status: "ACTIVE",
      contractId: "CCGRFT3LGSQ6S7OEFMVWPVIJWZMHLLQPBPXB2GBMXFBF5XXFM4HQZ7B",
      entryFee: 10n,
      tokenAddr: "CSAC",
    });
    findParticipantMock.mockResolvedValue(null);
    buildJoinTxMock.mockResolvedValue({ xdr: "JOIN_XDR", network: "testnet" });
    assertSameOriginMock.mockImplementation(() => undefined);
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 29 });
  });

  it("returns unsigned XDR for a valid player joining an ACTIVE tournament", async () => {
    const res = await POST(makeReq({ playerAddress: G }), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.unsignedXdr).toBe("JOIN_XDR");
    expect(json.data.network).toBe("testnet");
    expect(buildJoinTxMock).toHaveBeenCalledWith({
      contractId: "CCGRFT3LGSQ6S7OEFMVWPVIJWZMHLLQPBPXB2GBMXFBF5XXFM4HQZ7B",
      playerAddress: G,
    });
  });

  it("returns 409 when tournament is not ACTIVE", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "t_1", status: "DRAFT", contractId: null });

    const res = await POST(makeReq({ playerAddress: G }), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 409 when tournament is ACTIVE but contractId is null (not yet deployed)", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "t_1", status: "ACTIVE", contractId: null });

    const res = await POST(makeReq({ playerAddress: G }), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
  });

  it("returns a clear conflict before building a second join for the same wallet", async () => {
    findParticipantMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "participant_1" });

    const first = await POST(makeReq({ playerAddress: G }), ctx);
    expect(first.status).toBe(200);

    const res = await POST(makeReq({ playerAddress: G }), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "You are already a participant in this tournament." },
    });
    expect(buildJoinTxMock).toHaveBeenCalledOnce();
  });

  it("returns 404 when tournament does not exist", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const res = await POST(makeReq({ playerAddress: G }), ctx);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid playerAddress", async () => {
    const res = await POST(makeReq({ playerAddress: "nope" }), ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when playerAddress is missing", async () => {
    const res = await POST(makeReq({}), ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("returns 422 when buildJoinTx throws a StellarError", async () => {
    const { StellarError: SE } = await import("@/lib/stellar");
    buildJoinTxMock.mockRejectedValueOnce(new SE("INVALID_INPUT", "Invalid contract"));

    const res = await POST(makeReq({ playerAddress: G }), ctx);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("STELLAR_ERROR");
    expect(json.error.message).toBe("Invalid contract");
  });

  it("returns 403 when CSRF check fails", async () => {
    const { CsrfError } = await import("@/lib/csrf");
    assertSameOriginMock.mockImplementationOnce(() => {
      throw new CsrfError();
    });

    const res = await POST(makeReq({ playerAddress: G }, "http://evil.com"), ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CSRF_VIOLATION");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    rateLimitMock.mockResolvedValueOnce({ ok: false, remaining: 0 });

    const res = await POST(makeReq({ playerAddress: G }), ctx);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("TOO_MANY_REQUESTS");
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/tournaments/t_1/join", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: "not-json",
    }) as Parameters<typeof POST>[0];

    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });
});
