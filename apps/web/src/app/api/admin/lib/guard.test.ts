import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth-guards", () => ({
  requireUser: vi.fn(),
  AuthError: class AuthError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "AuthError";
    }
  },
}));
vi.mock("@/lib/csrf", () => ({
  assertSameOrigin: vi.fn(),
  CsrfError: class CsrfError extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin } from "@/lib/csrf";
import { requireAdminApi, withAdminMutation } from "./guard";

const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const assertSameOriginMock = assertSameOrigin as ReturnType<typeof vi.fn>;

describe("admin API guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertSameOriginMock.mockReturnValue(undefined);
  });

  it("returns a 401 envelope for an expired admin session", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Authentication required", 401));

    const res = await requireAdminApi();

    expect(res?.status).toBe(401);
    await expect(res?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(requireUserMock).toHaveBeenCalledWith("ADMIN", false);
  });

  it("returns a 401 envelope for an expired admin mutation session", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Authentication required", 401));
    const handler = vi.fn();

    const res = await withAdminMutation(
      new Request("http://localhost:3000/api/admin/users", { method: "PATCH" }) as NextRequest,
      "admin:update_user",
      handler,
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(requireUserMock).toHaveBeenCalledWith("ADMIN", false);
    expect(handler).not.toHaveBeenCalled();
  });
});
