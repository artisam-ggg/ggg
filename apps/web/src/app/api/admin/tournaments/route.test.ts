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
  listAllTournaments: vi.fn(),
}));

import { requireUser, AuthError } from "@/lib/auth-guards";
import { listAllTournaments } from "@/server/services/admin";
import { GET } from "./route";

const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const listAllTournamentsMock = listAllTournaments as ReturnType<typeof vi.fn>;

function makeReq(search = "") {
  return new Request(`http://localhost:3000/api/admin/tournaments${search}`, {
    method: "GET",
  });
}

describe("GET /api/admin/tournaments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: "u1", username: "admin", role: "ADMIN" });
    listAllTournamentsMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("returns all tournaments", async () => {
    listAllTournamentsMock.mockResolvedValue({
      items: [
        {
          id: "t1",
          name: "Cup",
          gameTitle: "SF6",
          status: "ACTIVE",
          organizerUsername: "org",
          participantCount: 5,
        },
      ],
      nextCursor: null,
    });

    const res = await GET(makeReq() as unknown as Parameters<typeof GET>[0]);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.items[0]!.organizerUsername).toBe("org");
  });

  it("rejects non-admin with 403", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Forbidden", 403));

    const res = await GET(makeReq() as unknown as Parameters<typeof GET>[0]);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
  });
});
