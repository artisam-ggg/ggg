import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Boundary mocks – must be declared before importing the route
// vi.hoisted is used so that submitMock is available inside the hoisted vi.mock call.
// ---------------------------------------------------------------------------

const { submitMock, buildInitializeMock, validateInitializeMock, readSettlementDeadlineMock } =
  vi.hoisted(() => ({
    submitMock: vi.fn(async () => ({
      hash: "TX1" as string,
      contractId: "CDEPLOYED" as string | undefined,
      status: "SUCCESS" as "SUCCESS" | "FAILED",
    })),
    buildInitializeMock: vi.fn(async () => ({ xdr: "INITIALIZE_XDR", network: "testnet" })),
    validateInitializeMock: vi.fn(),
    readSettlementDeadlineMock: vi.fn(),
  }));

vi.mock("@/lib/stellar", async (orig) => {
  const actual = await orig<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    buildInitializeTx: buildInitializeMock,
    submitSignedXdr: submitMock,
    validateInitializeXdr: validateInitializeMock,
    readSettlementDeadline: readSettlementDeadlineMock,
    explorerTxUrl: (_hash: string) => `https://stellar.expert/tx/${_hash}`,
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
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 19 })),
}));

vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    STELLAR_NETWORK: "testnet",
  },
}));

// Simple in-memory idempotency store for tests
const store = new Map<string, string>();
vi.mock("@/server/services/idempotency", () => ({
  withIdempotency: vi.fn(async (key: string, fn: () => Promise<unknown>) => {
    if (store.has(key)) return JSON.parse(store.get(key)!);
    const r = await fn();
    store.set(key, JSON.stringify(r));
    return r;
  }),
}));

const dbTournament = {
  id: "t_1",
  organizerId: "user_1",
  organizerAddr: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  refereeAddr: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBGPB",
  tokenAddr: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  entryFee: 10n,
  firstBps: 6000,
  secondBps: 3000,
  thirdBps: 1000,
  settlementDeadline: new Date("2099-01-01T00:00:00.000Z"),
  status: "DRAFT",
  contractId: null,
};
vi.mock("@/lib/db", () => ({
  prisma: {
    tournament: {
      findUnique: vi.fn(async () => ({ ...dbTournament })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...dbTournament,
        ...data,
      })),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { POST } from "./route";

const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const assertSameOriginMock = assertSameOrigin as ReturnType<typeof vi.fn>;
const rateLimitMock = rateLimit as ReturnType<typeof vi.fn>;
const findUniqueMock = prisma.tournament.findUnique as ReturnType<typeof vi.fn>;
const updateMock = prisma.tournament.update as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Valid base64 string (matches signedXdr validator – must be proper base64)
const VALID_XDR =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function makeReq(idemKey?: string, body: object = { signedXdr: VALID_XDR, intent: "deploy" }) {
  return new Request("http://localhost:3000/api/tournaments/t_1/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...(idemKey ? { "idempotency-key": idemKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "t_1" }) };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/tournaments/[id]/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    submitMock.mockResolvedValue({ hash: "TX1", contractId: "CDEPLOYED", status: "SUCCESS" });
    buildInitializeMock.mockResolvedValue({ xdr: "INITIALIZE_XDR", network: "testnet" });
    validateInitializeMock.mockReturnValue(undefined);
    readSettlementDeadlineMock
      .mockReset()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(4_070_908_800n);
    assertSameOriginMock.mockReturnValue(undefined);
    requireUserMock.mockResolvedValue({ id: "user_1", username: "organizer", role: "ORGANIZER" });
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 19 });
    findUniqueMock.mockResolvedValue({ ...dbTournament });
    updateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...dbTournament,
      ...data,
    }));
  });

  // ---------------------------------------------------------------------------
  // Happy path: deploy persists contractId but remains DRAFT until initialize.
  // ---------------------------------------------------------------------------

  it("submits deploy and returns initialize XDR while tournament remains DRAFT (200)", async () => {
    const res = await POST(makeReq("k1") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.txHash).toBe("TX1");
    expect(json.data.contractId).toBe("CDEPLOYED");
    expect(json.data.status).toBe("DRAFT");
    expect(json.data.initializeXdr).toBe("INITIALIZE_XDR");
    expect(json.data.explorerUrl).toContain("TX1");
  });

  it("calls prisma.tournament.update with contractId and deployTxHash on deploy", async () => {
    await POST(makeReq("k1") as Parameters<typeof POST>[0], ctx);

    expect(updateMock).toHaveBeenCalledOnce();
    const updateData = updateMock.mock.calls[0]![0].data;
    expect(updateData.contractId).toBe("CDEPLOYED");
    expect(updateData.status).toBeUndefined();
    expect(updateData.deployTxHash).toBe("TX1");
  });

  it("sets ACTIVE only after initialize succeeds", async () => {
    findUniqueMock.mockResolvedValueOnce({ ...dbTournament, contractId: "CDEPLOYED" });

    const res = await POST(
      makeReq("k_initialize", { signedXdr: VALID_XDR, intent: "initialize" }) as Parameters<
        typeof POST
      >[0],
      ctx,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe("ACTIVE");
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "t_1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        deadlineConfirmedAt: expect.any(Date),
      }),
    });
    expect(validateInitializeMock).toHaveBeenCalledWith(
      VALID_XDR,
      expect.objectContaining({ contractId: "CDEPLOYED" }),
    );
  });

  it("rejects initialize before an escrow contract has been deployed", async () => {
    const res = await POST(
      makeReq("k_initialize_undeployed", {
        signedXdr: VALID_XDR,
        intent: "initialize",
      }) as Parameters<typeof POST>[0],
      ctx,
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
    expect(validateInitializeMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects initialize for a cancelled tournament", async () => {
    findUniqueMock.mockResolvedValueOnce({
      ...dbTournament,
      contractId: "CDEPLOYED",
      status: "CANCELLED",
    });

    const res = await POST(
      makeReq("k_initialize_cancelled", {
        signedXdr: VALID_XDR,
        intent: "initialize",
      }) as Parameters<typeof POST>[0],
      ctx,
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
    expect(validateInitializeMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Idempotency: second call with same key returns cached result, no re-submit
  // ---------------------------------------------------------------------------

  it("dedupes repeated idempotency key (second call must not re-submit)", async () => {
    await POST(makeReq("k2") as Parameters<typeof POST>[0], ctx);
    const res2 = await POST(makeReq("k2") as Parameters<typeof POST>[0], ctx);
    const json2 = await res2.json();

    // withIdempotency was called twice but submitSignedXdr only once
    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(json2.ok).toBe(true);
    expect(json2.data.txHash).toBe("TX1");
  });

  // ---------------------------------------------------------------------------
  // Fix 2: confirmed-state dedupe — already ACTIVE deploy must NOT re-submit
  // ---------------------------------------------------------------------------

  it("returns existing contractId WITHOUT calling submitSignedXdr when tournament is already deployed", async () => {
    // Simulate an already-deployed, not-yet-initialized tournament.
    findUniqueMock.mockResolvedValueOnce({
      ...dbTournament,
      contractId: "C_EXISTING",
      deployTxHash: "TX_EXISTING",
    });

    const res = await POST(makeReq("k_active") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.contractId).toBe("C_EXISTING");
    expect(json.data.txHash).toBe("TX_EXISTING");
    expect(json.data.status).toBe("DRAFT");
    expect(json.data.initializeXdr).toBe("INITIALIZE_XDR");
    // The key assertion: on-chain submission must NOT happen.
    expect(submitMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Failed on-chain transaction must NOT persist success state
  // ---------------------------------------------------------------------------

  it("does NOT update tournament when submitSignedXdr returns FAILED", async () => {
    submitMock.mockResolvedValueOnce({ hash: "TX_FAIL", contractId: undefined, status: "FAILED" });

    const res = await POST(makeReq("k3") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Missing idempotency key → 400
  // ---------------------------------------------------------------------------

  it("rejects missing idempotency key with 400", async () => {
    const res = await POST(makeReq(undefined) as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("MISSING_IDEMPOTENCY_KEY");
    expect(submitMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Malformed XDR → rejected by schema before submitting
  // ---------------------------------------------------------------------------

  it("rejects malformed signedXdr with 400 (schema validation)", async () => {
    const res = await POST(
      makeReq("k4", { signedXdr: "!!!NOT_BASE64!!!", intent: "deploy" }) as Parameters<
        typeof POST
      >[0],
      ctx,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(submitMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Ownership: non-owner cannot deploy
  // ---------------------------------------------------------------------------

  it("rejects deploy by non-owner with 403", async () => {
    requireUserMock.mockResolvedValueOnce({
      id: "other_user",
      username: "hacker",
      role: "ORGANIZER",
    });

    const res = await POST(makeReq("k5") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Auth: NEXT_REDIRECT propagates (unauthenticated)
  // ---------------------------------------------------------------------------

  it("re-throws NEXT_REDIRECT when unauthenticated", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" });
    requireUserMock.mockRejectedValueOnce(redirectError);

    await expect(POST(makeReq("k6") as Parameters<typeof POST>[0], ctx)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(submitMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Auth: wrong role → 403
  // ---------------------------------------------------------------------------

  it("returns 403 when AuthError is thrown (wrong role)", async () => {
    requireUserMock.mockRejectedValueOnce(new AuthError("Forbidden", 403));

    const res = await POST(makeReq("k7") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
    expect(submitMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // CSRF violation → 403
  // ---------------------------------------------------------------------------

  it("rejects cross-origin requests with 403", async () => {
    const { CsrfError } = await import("@/lib/csrf");
    assertSameOriginMock.mockImplementationOnce(() => {
      throw new CsrfError();
    });

    const res = await POST(makeReq("k8") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CSRF_VIOLATION");
    expect(submitMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Rate limit → 429
  // ---------------------------------------------------------------------------

  it("returns 429 when rate limit is exceeded", async () => {
    rateLimitMock.mockResolvedValueOnce({ ok: false, remaining: 0 });

    const res = await POST(makeReq("k9") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.ok).toBe(false);
    expect(submitMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Tournament not found → 404
  // ---------------------------------------------------------------------------

  it("returns 404 when tournament does not exist", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const res = await POST(makeReq("k10") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
    expect(updateMock).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Cancel intent: sets status=CANCELLED, cancelledAt
  // ---------------------------------------------------------------------------

  it("cancels tournament and sets status=CANCELLED", async () => {
    const res = await POST(
      makeReq("k11", { signedXdr: VALID_XDR, intent: "cancel" }) as Parameters<typeof POST>[0],
      ctx,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("CANCELLED");

    const updateData = updateMock.mock.calls[0]![0].data;
    expect(updateData.status).toBe("CANCELLED");
    expect(updateData.cancelledAt).toBeInstanceOf(Date);
  });

  // ---------------------------------------------------------------------------
  // Finalize intent: sets status=FINISHED, finalizedAt
  // ---------------------------------------------------------------------------

  it("finalizes tournament and sets status=FINISHED", async () => {
    const res = await POST(
      makeReq("k12", { signedXdr: VALID_XDR, intent: "finalize" }) as Parameters<typeof POST>[0],
      ctx,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("FINISHED");

    const updateData = updateMock.mock.calls[0]![0].data;
    expect(updateData.status).toBe("FINISHED");
    expect(updateData.finalizedAt).toBeInstanceOf(Date);
  });

  // ---------------------------------------------------------------------------
  // Fix 4: StellarError status mapping by code
  // ---------------------------------------------------------------------------

  it("maps StellarError TX_TIMEOUT to 504", async () => {
    const { StellarError } = await import("@/lib/stellar");
    submitMock.mockRejectedValueOnce(new StellarError("TX_TIMEOUT", "timed out"));

    const res = await POST(makeReq("k13") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(504);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("STELLAR_ERROR");
  });

  it("maps StellarError SUBMIT_FAILED to 502", async () => {
    const { StellarError } = await import("@/lib/stellar");
    submitMock.mockRejectedValueOnce(new StellarError("SUBMIT_FAILED", "submit failed"));

    const res = await POST(makeReq("k14") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("STELLAR_ERROR");
  });

  it("maps StellarError SIMULATION_FAILED to 422", async () => {
    const { StellarError } = await import("@/lib/stellar");
    submitMock.mockRejectedValueOnce(new StellarError("SIMULATION_FAILED", "simulation failed"));

    const res = await POST(makeReq("k15") as Parameters<typeof POST>[0], ctx);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("STELLAR_ERROR");
  });
});
