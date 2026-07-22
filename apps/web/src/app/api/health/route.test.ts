import { describe, expect, it } from "vitest";

async function healthHandler() {
  // Import the handler inside the test so Vitest's path aliasing resolves.
  const { GET } = await import("./route");
  return GET();
}

describe("GET /api/health", () => {
  it("returns a 200 ok payload", async () => {
    const res = await healthHandler();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("ok");
    expect(json.data.service).toBe("ggg-web");
    expect(typeof json.data.timestamp).toBe("string");
  });
});
