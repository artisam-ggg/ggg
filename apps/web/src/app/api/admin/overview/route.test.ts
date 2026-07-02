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
  getAdminOverview: vi.fn(),
}));

import { requireUser, AuthError } from "@/lib/auth-guards";
import { getAdminOverview } from "@/server/services/admin";
import { GET } from "./route";

const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const getAdminOverviewMock = getAdminOverview as ReturnType<typeof vi.fn>;

describe("GET /api/admin/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "u1", username: "admin", role: "ADMIN" });
    getAdminOverviewMock.mockResolvedValue({
      userCount: 4,
      tournamentCount: 7,
      byStatus: { DRAFT: 1, ACTIVE: 2, FINISHED: 3, CANCELLED: 1 },
      users: [],
    });
  });

  it("returns overview stats", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.userCount).toBe(4);
    expect(json.data.tournamentCount).toBe(7);
  });

  it("rejects non-admin with 403", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Forbidden", 403));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
  });
});
