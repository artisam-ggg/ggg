import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const PLAYER = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const { listPlayerParticipations, rateLimit } = vi.hoisted(() => ({
  listPlayerParticipations: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/server/services/tournaments", () => ({ listPlayerParticipations }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));

import { GET, POST } from "./route";

describe("/api/participations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.mockResolvedValue({ ok: true, remaining: 29 });
    listPlayerParticipations.mockResolvedValue([{ tournamentId: "t_1" }]);
  });

  it("returns confirmed participations for the validated public wallet", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/participations?playerAddress=${PLAYER}`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { items: [{ tournamentId: "t_1" }] } });
    expect(listPlayerParticipations).toHaveBeenCalledWith(PLAYER);
  });

  it("rejects an invalid wallet before querying confirmed state", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/participations?playerAddress=not-a-wallet"),
    );

    expect(response.status).toBe(400);
    expect(listPlayerParticipations).not.toHaveBeenCalled();
  });

  it("rate-limits repeated public lookups", async () => {
    rateLimit.mockResolvedValueOnce({ ok: false, remaining: 0 });

    const response = await GET(
      new NextRequest(`http://localhost/api/participations?playerAddress=${PLAYER}`),
    );

    expect(response.status).toBe(429);
    expect(listPlayerParticipations).not.toHaveBeenCalled();
  });

  it("returns a safe error when confirmed state cannot be read", async () => {
    listPlayerParticipations.mockRejectedValueOnce(new Error("database detail"));

    const response = await GET(
      new NextRequest(`http://localhost/api/participations?playerAddress=${PLAYER}`),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Participation status is temporarily unavailable",
      },
    });
  });

  it("returns a safe error when rate limiting is unavailable", async () => {
    rateLimit.mockRejectedValueOnce(new Error("redis detail"));

    const response = await GET(
      new NextRequest(`http://localhost/api/participations?playerAddress=${PLAYER}`),
    );

    expect(response.status).toBe(503);
    expect(listPlayerParticipations).not.toHaveBeenCalled();
  });

  it("keeps the endpoint read-only", () => {
    expect(POST()).toHaveProperty("status", 405);
  });
});
