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
vi.mock("@/server/services/admin", () => ({
  listUsers: vi.fn(),
}));

import { requireUser, AuthError } from "@/lib/auth-guards";
import { listUsers } from "@/server/services/admin";
import { GET } from "./route";

const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const listUsersMock = listUsers as ReturnType<typeof vi.fn>;

function makeReq(search = "") {
  return new Request(`http://localhost:3000/api/admin/users${search}`, {
    method: "GET",
  });
}

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "u1", username: "admin", role: "ADMIN" });
    listUsersMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("returns paginated users", async () => {
    listUsersMock.mockResolvedValue({
      items: [
        { id: "u2", username: "org", role: "ORGANIZER", createdAt: new Date(0).toISOString() },
      ],
      nextCursor: null,
    });

    const res = await GET(makeReq() as unknown as Parameters<typeof GET>[0]);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.items).toHaveLength(1);
  });

  it("rejects invalid take with 400", async () => {
    const res = await GET(makeReq("?take=0") as unknown as Parameters<typeof GET>[0]);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("rejects non-admin with 403", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Forbidden", 403));

    const res = await GET(makeReq() as unknown as Parameters<typeof GET>[0]);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
  });
});
