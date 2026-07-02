import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-guards", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", username: "admin", role: "ADMIN" })),
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
vi.mock("@/server/services/admin", () => ({
  getTournamentAdminDetail: vi.fn(),
  updateTournament: vi.fn(),
}));

import { requireUser } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { getTournamentAdminDetail, updateTournament } from "@/server/services/admin";
import { GET, PATCH } from "./route";

const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const assertSameOriginMock = assertSameOrigin as ReturnType<typeof vi.fn>;
const rateLimitMock = rateLimit as ReturnType<typeof vi.fn>;
const getTournamentAdminDetailMock = getTournamentAdminDetail as ReturnType<typeof vi.fn>;
const updateTournamentMock = updateTournament as ReturnType<typeof vi.fn>;

function makeCtx(id = "t1") {
  return { params: Promise.resolve({ id }) };
}

function makeReq(method: string, body?: unknown) {
  return new Request("http://localhost:3000/api/admin/tournaments/t1", {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: body ? JSON.stringify(body) : null,
  });
}

describe("GET /api/admin/tournaments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "u1", username: "admin", role: "ADMIN" });
    getTournamentAdminDetailMock.mockResolvedValue({ id: "t1", name: "Cup" });
  });

  it("returns tournament detail", async () => {
    const res = await GET(makeReq("GET") as Parameters<typeof GET>[0], makeCtx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe("Cup");
  });

  it("returns 404 when tournament not found", async () => {
    getTournamentAdminDetailMock.mockResolvedValue(null);

    const res = await GET(makeReq("GET") as Parameters<typeof GET>[0], makeCtx());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
  });
});

describe("PATCH /api/admin/tournaments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertSameOriginMock.mockReturnValue(undefined);
    requireUserMock.mockResolvedValue({ id: "u1", username: "admin", role: "ADMIN" });
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 9 });
    updateTournamentMock.mockResolvedValue(undefined);
  });

  it("updates tournament metadata", async () => {
    const res = await PATCH(
      makeReq("PATCH", { name: "New Cup" }) as Parameters<typeof PATCH>[0],
      makeCtx(),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateTournamentMock).toHaveBeenCalledWith("t1", { name: "New Cup" }, "u1");
  });

  it("cancels tournament in DB only", async () => {
    const res = await PATCH(
      makeReq("PATCH", { status: "CANCELLED" }) as Parameters<typeof PATCH>[0],
      makeCtx(),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateTournamentMock).toHaveBeenCalledWith("t1", { status: "CANCELLED" }, "u1");
  });

  it("rejects invalid body with 400", async () => {
    const res = await PATCH(makeReq("PATCH", {}) as Parameters<typeof PATCH>[0], makeCtx());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });
});
