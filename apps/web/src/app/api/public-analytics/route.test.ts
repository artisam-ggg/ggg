import { beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  POSTHOG_PERSONAL_API_KEY: "phx_test",
  POSTHOG_PROJECT_ID: "123",
  POSTHOG_API_HOST: "https://us.posthog.com",
};

vi.mock("@/lib/env", () => ({ env }));

describe("GET /api/public-analytics", () => {
  beforeEach(() => {
    env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    env.POSTHOG_PROJECT_ID = "123";
    vi.restoreAllMocks();
  });

  it("returns an aggregate 30-day visit count with homepage-only CORS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [[42]] }))),
    );
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://ggg.quest");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { visitsLast30Days: 42 },
    });
  });

  it("does not query PostHog without server credentials", async () => {
    env.POSTHOG_PERSONAL_API_KEY = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
