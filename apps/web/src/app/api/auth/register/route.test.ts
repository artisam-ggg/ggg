import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { user: { create: vi.fn() } } }));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://app.ggg.gg" } }));
vi.mock("@/lib/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/password")>();
  return {
    ...actual,
    hashPassword: vi.fn(async () => "$argon2id$hashed"),
  };
});
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { POST } from "./route";

const create = prisma.user.create as unknown as ReturnType<typeof vi.fn>;
const rateLimitMock = rateLimit as unknown as ReturnType<typeof vi.fn>;

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.ggg.gg/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.ggg.gg", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  create.mockReset();
  rateLimitMock.mockReset().mockResolvedValue({ ok: true, remaining: 4 });
});

describe("POST /api/auth/register", () => {
  it("creates an ORGANIZER and returns ok (no password material echoed)", async () => {
    create.mockResolvedValue({ id: "u1", username: "newbie", role: "ORGANIZER" });
    const res = await POST(makeReq({ username: "newbie", password: "a-good-enough-password" }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ id: "u1", username: "newbie" });
    expect(JSON.stringify(json)).not.toContain("password");
  });

  it("returns a GENERIC error on duplicate username (no enumeration)", async () => {
    create.mockRejectedValue({ code: "P2002" }); // Prisma unique violation
    const res = await POST(makeReq({ username: "taken", password: "a-good-enough-password" }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.message).toBe("Could not create account");
  });

  it("blocks when rate-limited", async () => {
    rateLimitMock.mockResolvedValue({ ok: false, remaining: 0 });
    const res = await POST(makeReq({ username: "spammer", password: "a-good-enough-password" }));
    expect(res.status).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });

  it("falls back when rate-limit service is unavailable", async () => {
    rateLimitMock.mockRejectedValue(new Error("redis down"));
    create.mockResolvedValue({ id: "u2", username: "fallback", role: "ORGANIZER" });

    const res = await POST(makeReq({ username: "fallback", password: "a-good-enough-password" }));

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalled();
  });

  it("rejects a cross-origin request (CSRF)", async () => {
    const res = await POST(
      makeReq(
        { username: "x", password: "a-good-enough-password" },
        { origin: "https://evil.example" },
      ),
    );
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a validation error on a too-short password (generic field)", async () => {
    const res = await POST(makeReq({ username: "ok", password: "short" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
