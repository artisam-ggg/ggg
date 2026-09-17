import { beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  POSTHOG_PERSONAL_API_KEY: "phx_test",
  POSTHOG_PROJECT_ID: "123",
  POSTHOG_API_HOST: "https://us.posthog.com",
  ALLOWED_ORIGINS: "http://localhost:4173",
};

vi.mock("@/lib/env", () => ({ env }));

describe("GET /api/public-analytics", () => {
  beforeEach(() => {
    env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    env.POSTHOG_PROJECT_ID = "123";
    vi.restoreAllMocks();
  });

  function request(origin = "https://ggg.quest") {
    return new Request("http://localhost/api/public-analytics", { headers: { origin } });
  }

  it("returns an aggregate 30-day pageview count with homepage-only CORS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [[42]] }))),
    );
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://ggg.quest");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { pageviewsLast30Days: 42 },
    });
  });

  it("allows a configured local homepage origin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [[42]] }))),
    );
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost:4173"));

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4173");
  });

  it("does not allow an unconfigured origin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [[42]] }))),
    );
    const { GET } = await import("./route");

    const response = await GET(request("https://attacker.example"));

    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it.each([
    ["empty", { results: [] }],
    ["null", { results: [[null]] }],
    ["blank", { results: [[""]] }],
    ["fractional", { results: [[1.5]] }],
  ])("fails closed for %s PostHog data", async (_case, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns the unavailable response when PostHog times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    );
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not query PostHog without server credentials", async () => {
    env.POSTHOG_PERSONAL_API_KEY = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose the personal API key in its public response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [[42]] }))),
    );
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(await response.text()).not.toContain(env.POSTHOG_PERSONAL_API_KEY);
  });
});
