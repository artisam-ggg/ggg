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
  getUserAdminDetail: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

import { requireUser } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { getUserAdminDetail, updateUser, deleteUser } from "@/server/services/admin";
import { GET, PATCH, DELETE } from "./route";

const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const assertSameOriginMock = assertSameOrigin as ReturnType<typeof vi.fn>;
const rateLimitMock = rateLimit as ReturnType<typeof vi.fn>;
const getUserAdminDetailMock = getUserAdminDetail as ReturnType<typeof vi.fn>;
const updateUserMock = updateUser as ReturnType<typeof vi.fn>;
const deleteUserMock = deleteUser as ReturnType<typeof vi.fn>;

function makeCtx(id = "u2") {
  return { params: Promise.resolve({ id }) };
}

function makeReq(method: string, body?: unknown) {
  return new Request("http://localhost:3000/api/admin/users/u2", {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: body ? JSON.stringify(body) : null,
  });
}

describe("GET /api/admin/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "u1", username: "admin", role: "ADMIN" });
    getUserAdminDetailMock.mockResolvedValue({ id: "u2", username: "org", role: "ORGANIZER" });
  });

  it("returns user detail", async () => {
    const res = await GET(makeReq("GET") as Parameters<typeof GET>[0], makeCtx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.username).toBe("org");
  });

  it("returns 404 when user not found", async () => {
    getUserAdminDetailMock.mockResolvedValue(null);

    const res = await GET(makeReq("GET") as Parameters<typeof GET>[0], makeCtx());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
  });
});

describe("PATCH /api/admin/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertSameOriginMock.mockReturnValue(undefined);
    requireUserMock.mockResolvedValue({ id: "u1", username: "admin", role: "ADMIN" });
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 9 });
    updateUserMock.mockResolvedValue({});
  });

  it("updates user role", async () => {
    const res = await PATCH(
      makeReq("PATCH", { role: "ADMIN" }) as Parameters<typeof PATCH>[0],
      makeCtx(),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateUserMock).toHaveBeenCalledWith(
      "u2",
      { role: "ADMIN" },
      { id: "u1", username: "admin", role: "ADMIN" },
    );
  });

  it("returns temp password on reset", async () => {
    updateUserMock.mockResolvedValue({ tempPassword: "abc123" });

    const res = await PATCH(
      makeReq("PATCH", { resetPassword: true }) as Parameters<typeof PATCH>[0],
      makeCtx(),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.tempPassword).toBe("abc123");
  });

  it("rejects invalid body with 400", async () => {
    const res = await PATCH(makeReq("PATCH", {}) as Parameters<typeof PATCH>[0], makeCtx());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("maps service 409 to conflict response", async () => {
    updateUserMock.mockRejectedValue(Object.assign(new Error("Self-demote"), { status: 409 }));

    const res = await PATCH(
      makeReq("PATCH", { role: "ORGANIZER" }) as Parameters<typeof PATCH>[0],
      makeCtx(),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("rejects cross-origin with 403", async () => {
    const { CsrfError } = await import("@/lib/csrf");
    assertSameOriginMock.mockImplementation(() => {
      throw new CsrfError();
    });

    const res = await PATCH(
      makeReq("PATCH", { role: "ADMIN" }) as Parameters<typeof PATCH>[0],
      makeCtx(),
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("CSRF_VIOLATION");
  });
});

describe("DELETE /api/admin/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertSameOriginMock.mockReturnValue(undefined);
    requireUserMock.mockResolvedValue({ id: "u1", username: "admin", role: "ADMIN" });
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 9 });
    deleteUserMock.mockResolvedValue(undefined);
  });

  it("deletes a user", async () => {
    const res = await DELETE(makeReq("DELETE") as Parameters<typeof DELETE>[0], makeCtx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(deleteUserMock).toHaveBeenCalledWith("u2", "u1");
  });

  it("maps service 409 to conflict response", async () => {
    deleteUserMock.mockRejectedValue(Object.assign(new Error("Self-delete"), { status: 409 }));

    const res = await DELETE(makeReq("DELETE") as Parameters<typeof DELETE>[0], makeCtx());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("CONFLICT");
  });
});
