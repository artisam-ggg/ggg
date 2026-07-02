import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/session-store", () => ({ isSessionValid: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { auth } from "@/lib/auth";
import { isSessionValid } from "@/lib/session-store";
import { redirect } from "next/navigation";
import { getCurrentUser, requireUser, AuthError, hasRole, ROLE_RANK } from "./auth-guards";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const isSessionValidMock = isSessionValid as unknown as ReturnType<typeof vi.fn>;
const redirectMock = redirect as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  authMock.mockReset();
  isSessionValidMock.mockReset();
  redirectMock.mockClear();
});

function session(role = "ORGANIZER") {
  return { user: { id: "u1", username: "org", role }, sid: "sid-1" };
}

describe("getCurrentUser", () => {
  it("returns the user when the session exists AND is valid in Redis", async () => {
    authMock.mockResolvedValue(session());
    isSessionValidMock.mockResolvedValue(true);
    expect(await getCurrentUser()).toEqual({ id: "u1", username: "org", role: "ORGANIZER" });
  });

  it("returns null when the session was revoked in Redis (live revocation)", async () => {
    authMock.mockResolvedValue(session());
    isSessionValidMock.mockResolvedValue(false);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when there is no session", async () => {
    authMock.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("hasRole", () => {
  it("ADMIN satisfies ORGANIZER", () => {
    expect(hasRole("ADMIN", "ORGANIZER")).toBe(true);
  });

  it("ADMIN satisfies ADMIN", () => {
    expect(hasRole("ADMIN", "ADMIN")).toBe(true);
  });

  it("ORGANIZER satisfies ORGANIZER", () => {
    expect(hasRole("ORGANIZER", "ORGANIZER")).toBe(true);
  });

  it("ORGANIZER does not satisfy ADMIN", () => {
    expect(hasRole("ORGANIZER", "ADMIN")).toBe(false);
  });

  it("ranks are ordered correctly", () => {
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.ORGANIZER);
  });
});

describe("requireUser", () => {
  it("redirects to /login when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("throws AuthError (403) when the role does not match", async () => {
    authMock.mockResolvedValue(session("ORGANIZER"));
    isSessionValidMock.mockResolvedValue(true);
    await expect(requireUser("ADMIN")).rejects.toThrow(AuthError);
  });

  it("returns the user when role matches", async () => {
    authMock.mockResolvedValue(session("ADMIN"));
    isSessionValidMock.mockResolvedValue(true);
    expect(await requireUser("ADMIN")).toEqual({ id: "u1", username: "org", role: "ADMIN" });
  });

  it("allows ADMIN to access ORGANIZER-scoped resources", async () => {
    authMock.mockResolvedValue(session("ADMIN"));
    isSessionValidMock.mockResolvedValue(true);
    expect(await requireUser("ORGANIZER")).toEqual({ id: "u1", username: "org", role: "ADMIN" });
  });

  it("still rejects ORGANIZER for ADMIN-scoped resources", async () => {
    authMock.mockResolvedValue(session("ORGANIZER"));
    isSessionValidMock.mockResolvedValue(true);
    await expect(requireUser("ADMIN")).rejects.toThrow(AuthError);
  });
});
