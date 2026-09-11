import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external boundaries before importing the route.
vi.mock("@/lib/stellar", async (orig) => {
  const actual = await orig<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    buildCancelTx: vi.fn(async () => ({ xdr: "CANCEL_XDR", network: "testnet" })),
    StellarError: class StellarError extends Error {
      readonly code: string;
      constructor(code: string, message: string) {
        super(message);
        this.name = "StellarError";
        this.code = code;
      }
    },
  };
});

vi.mock("@/lib/auth-guards", () => ({
  requireUser: vi.fn(async () => ({ id: "user_1", username: "organizer", role: "ORGANIZER" })),
  AuthError: class AuthError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "AuthError";
      this.status = status;
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
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 9 })),
}));

vi.mock("@/lib/env", () => ({
  env: { APP_URL: "http://localhost:3000", STELLAR_NETWORK: "testnet" },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(async () => ({
        id: "t_1",
        organizerId: "user_1",
        organizerAddr: "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB",
        status: "ACTIVE",
        contractId: "CCGRFT3LGSQ6S7OEFMVWPVIJWZMHLLQPBPXB2GBMXFBF5XXFM4HQZ7B",
      })),
    },
  },
}));

import { POST } from "./route";
import { prisma } from "@/lib/db";
import { buildCancelTx } from "@/lib/stellar";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";

const findUniqueMock = prisma.tournament.findUnique as ReturnType<typeof vi.fn>;
const buildCancelTxMock = buildCancelTx as ReturnType<typeof vi.fn>;
const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const assertSameOriginMock = assertSameOrigin as ReturnType<typeof vi.fn>;
const rateLimitMock = rateLimit as ReturnType<typeof vi.fn>;

const ORGANIZER_ADDR = "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB";
const CONTRACT_ID = "CCGRFT3LGSQ6S7OEFMVWPVIJWZMHLLQPBPXB2GBMXFBF5XXFM4HQZ7B";

const ctx = { params: Promise.resolve({ id: "t_1" }) };

function makeReq(origin = "http://localhost:3000"): Parameters<typeof POST>[0] {
  return new Request("http://localhost:3000/api/tournaments/t_1/cancel", {
    method: "POST",
    headers: { origin },
  }) as Parameters<typeof POST>[0];
}

describe("POST /api/tournaments/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({
      id: "t_1",
      organizerId: "user_1",
      organizerAddr: ORGANIZER_ADDR,
      status: "ACTIVE",
      contractId: CONTRACT_ID,
    });
    buildCancelTxMock.mockResolvedValue({ xdr: "CANCEL_XDR", network: "testnet" });
    requireUserMock.mockResolvedValue({ id: "user_1", username: "organizer", role: "ORGANIZER" });
    assertSameOriginMock.mockReturnValue(undefined);
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 9 });
  });

  it("returns unsigned cancel XDR for the organiser of an ACTIVE tournament (200)", async () => {
    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.unsignedXdr).toBe("CANCEL_XDR");
    expect(json.data.network).toBe("testnet");
    expect(buildCancelTxMock).toHaveBeenCalledWith({
      contractId: CONTRACT_ID,
      organizerAddress: ORGANIZER_ADDR,
    });
  });

  it("returns the standard 401 envelope when the session has ended", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Authentication required", 401));

    const res = await POST(makeReq(), ctx);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(requireUserMock).toHaveBeenCalledWith("ORGANIZER", false);
    expect(buildCancelTxMock).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-owner tries to cancel", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "t_1",
      organizerId: "other_user",
      organizerAddr: ORGANIZER_ADDR,
      status: "ACTIVE",
      contractId: CONTRACT_ID,
    });

    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
    expect(buildCancelTxMock).not.toHaveBeenCalled();
  });

  it("returns 404 when tournament does not exist", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 when tournament is FINISHED (post-finalisation)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "t_1",
      organizerId: "user_1",
      organizerAddr: ORGANIZER_ADDR,
      status: "FINISHED",
      contractId: CONTRACT_ID,
    });

    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 409 when tournament is already CANCELLED", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "t_1",
      organizerId: "user_1",
      organizerAddr: ORGANIZER_ADDR,
      status: "CANCELLED",
      contractId: CONTRACT_ID,
    });

    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 409 when tournament is DRAFT (not yet deployed, no contractId)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "t_1",
      organizerId: "user_1",
      organizerAddr: ORGANIZER_ADDR,
      status: "DRAFT",
      contractId: null,
    });

    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 409 when tournament is ACTIVE but not yet deployed (contractId null)", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "t_1",
      organizerId: "user_1",
      organizerAddr: ORGANIZER_ADDR,
      status: "ACTIVE",
      contractId: null,
    });

    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("re-throws NEXT_REDIRECT when unauthenticated (does not swallow it as 401)", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" });
    requireUserMock.mockRejectedValueOnce(redirectError);

    await expect(POST(makeReq(), ctx)).rejects.toThrow("NEXT_REDIRECT");
    expect(buildCancelTxMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the authenticated user has the wrong role", async () => {
    requireUserMock.mockRejectedValueOnce(new AuthError("Forbidden", 403));

    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
    expect(buildCancelTxMock).not.toHaveBeenCalled();
  });

  it("returns 422 when buildCancelTx throws a StellarError", async () => {
    const { StellarError: SE } = await import("@/lib/stellar");
    buildCancelTxMock.mockRejectedValueOnce(new SE("SIMULATION_FAILED", "Contract call failed"));

    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("STELLAR_ERROR");
    expect(json.error.message).toContain("Contract call failed");
  });

  it("returns 403 when CSRF check fails", async () => {
    const { CsrfError } = await import("@/lib/csrf");
    assertSameOriginMock.mockImplementationOnce(() => {
      throw new CsrfError();
    });

    const res = await POST(makeReq("http://evil.com"), ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CSRF_VIOLATION");
    expect(buildCancelTxMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    rateLimitMock.mockResolvedValueOnce({ ok: false, remaining: 0 });

    const res = await POST(makeReq(), ctx);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("TOO_MANY_REQUESTS");
    expect(buildCancelTxMock).not.toHaveBeenCalled();
  });
});
