import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external boundaries before importing the route
vi.mock("@/lib/stellar", async (orig) => {
  const actual = await orig<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    buildDeployInitializeTx: vi.fn(async () => ({ xdr: "UNSIGNED_XDR", network: "testnet" })),
    resolveSacAddress: vi.fn(() => "CSAC...NATIVE"),
  };
});
vi.mock("@/lib/auth-guards", () => ({
  requireUser: vi.fn(async () => ({
    id: "user_1",
    username: "organizer",
    role: "ORGANIZER",
  })),
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
  CsrfError: class CsrfError extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 9 })),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    tournament: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "t_1",
        ...data,
      })),
    },
  },
}));
vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    STELLAR_NETWORK: "testnet",
  },
}));

import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { buildDeployInitializeTx, resolveSacAddress } from "@/lib/stellar";
import { POST } from "./route";

const tournamentCreate = prisma.tournament.create as ReturnType<typeof vi.fn>;
const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const assertSameOriginMock = assertSameOrigin as ReturnType<typeof vi.fn>;
const rateLimitMock = rateLimit as ReturnType<typeof vi.fn>;
const buildDeployInitializeTxMock = buildDeployInitializeTx as ReturnType<typeof vi.fn>;
const resolveSacAddressMock = resolveSacAddress as ReturnType<typeof vi.fn>;

const VALID_ORGANIZER = "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB";
const VALID_REFEREE = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

const validBody = {
  name: "Cup",
  gameTitle: "SF6",
  entryFee: "10000000",
  asset: "XLM",
  refereeAddress: VALID_REFEREE,
  organizerAddress: VALID_ORGANIZER,
  settlementDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  distributionBps: [6000, 3000, 1000],
};

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/tournaments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tournaments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertSameOriginMock.mockReturnValue(undefined);
    requireUserMock.mockResolvedValue({ id: "user_1", username: "organizer", role: "ORGANIZER" });
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 9 });
    resolveSacAddressMock.mockReturnValue("CSAC...NATIVE");
    buildDeployInitializeTxMock.mockResolvedValue({ xdr: "UNSIGNED_XDR", network: "testnet" });
    tournamentCreate.mockResolvedValue({ id: "t_1", ...validBody });
  });

  it("creates a DRAFT tournament and returns unsigned XDR (201)", async () => {
    const res = await POST(makeReq(validBody) as Parameters<typeof POST>[0]);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.tournamentId).toBe("t_1");
    expect(json.data.unsignedXdr).toBe("UNSIGNED_XDR");
    expect(json.data.network).toBe("testnet");
  });

  it("persists tournament as DRAFT with correct fields", async () => {
    await POST(makeReq(validBody) as Parameters<typeof POST>[0]);

    expect(tournamentCreate).toHaveBeenCalledOnce();
    const createCall = tournamentCreate.mock.calls[0];
    expect(createCall).toBeDefined();
    const createArgs = createCall![0].data;
    expect(createArgs.status).toBe("DRAFT");
    expect(createArgs.organizerId).toBe("user_1");
    expect(createArgs.firstBps).toBe(6000);
    expect(createArgs.secondBps).toBe(3000);
    expect(createArgs.thirdBps).toBe(1000);
    expect(createArgs.organizerAddr).toBe(VALID_ORGANIZER);
    expect(createArgs.refereeAddr).toBe(VALID_REFEREE);
    expect(createArgs.settlementDeadline).toBeInstanceOf(Date);
  });

  it("calls buildDeployInitializeTx with correct parameters", async () => {
    await POST(makeReq(validBody) as Parameters<typeof POST>[0]);

    expect(buildDeployInitializeTxMock).toHaveBeenCalledOnce();
    const txCall = buildDeployInitializeTxMock.mock.calls[0];
    expect(txCall).toBeDefined();
    const txParams = txCall![0];
    expect(txParams.organizerAddress).toBe(VALID_ORGANIZER);
    expect(txParams.refereeAddress).toBe(VALID_REFEREE);
    expect(txParams.tokenAddr).toBe("CSAC...NATIVE");
    expect(txParams.entryFee).toBe(10000000n);
    expect(txParams.distributionBps).toEqual([6000, 3000, 1000]);
  });

  it("rejects a distribution that doesn't sum to 10000 with 400", async () => {
    const res = await POST(
      makeReq({ ...validBody, distributionBps: [6000, 3000, 500] }) as Parameters<typeof POST>[0],
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(tournamentCreate).not.toHaveBeenCalled();
  });

  it("rejects invalid entryFee with 400", async () => {
    const res = await POST(
      makeReq({ ...validBody, entryFee: "not-a-number" }) as Parameters<typeof POST>[0],
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(tournamentCreate).not.toHaveBeenCalled();
  });

  it("rejects missing required fields with 400", async () => {
    const res = await POST(makeReq({ name: "Cup" }) as Parameters<typeof POST>[0]);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("re-throws NEXT_REDIRECT when unauthenticated (requireUser redirects, not returns 401)", async () => {
    // requireUser calls redirect("/login") when unauthenticated — Next.js throws a NEXT_REDIRECT
    // error that the framework handles. The route must re-throw it (not swallow it as 401).
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" });
    requireUserMock.mockRejectedValue(redirectError);

    await expect(POST(makeReq(validBody) as Parameters<typeof POST>[0])).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(tournamentCreate).not.toHaveBeenCalled();
  });

  it("rejects wrong-role requests with 403", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Forbidden", 403));

    const res = await POST(makeReq(validBody) as Parameters<typeof POST>[0]);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
    expect(tournamentCreate).not.toHaveBeenCalled();
  });

  it("enforces ownership: organizerId is the authenticated user's id", async () => {
    requireUserMock.mockResolvedValue({ id: "other_user_99", username: "bob", role: "ORGANIZER" });

    await POST(makeReq(validBody) as Parameters<typeof POST>[0]);

    const ownershipCall = tournamentCreate.mock.calls[0];
    expect(ownershipCall).toBeDefined();
    expect(ownershipCall![0].data.organizerId).toBe("other_user_99");
  });

  it("rate-limits requests and returns 429", async () => {
    rateLimitMock.mockResolvedValue({ ok: false, remaining: 0 });

    const res = await POST(makeReq(validBody) as Parameters<typeof POST>[0]);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.ok).toBe(false);
    expect(tournamentCreate).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests with 403", async () => {
    const { CsrfError } = await import("@/lib/csrf");
    assertSameOriginMock.mockImplementation(() => {
      throw new CsrfError();
    });

    const res = await POST(
      makeReq(validBody, { origin: "https://evil.example.com" }) as Parameters<typeof POST>[0],
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(tournamentCreate).not.toHaveBeenCalled();
  });

  it("rejects same organizer and referee addresses with 400", async () => {
    const res = await POST(
      makeReq({
        ...validBody,
        refereeAddress: VALID_ORGANIZER, // same as organizerAddress
      }) as Parameters<typeof POST>[0],
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(tournamentCreate).not.toHaveBeenCalled();
  });
});
