import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://app.ggg.gg" } }));

import { assertSameOrigin, CsrfError } from "./csrf";

function req(headers: Record<string, string>) {
  return new Request("https://app.ggg.gg/api/auth/register", { method: "POST", headers });
}

describe("assertSameOrigin", () => {
  it("passes when Origin matches the app origin", () => {
    expect(() => assertSameOrigin(req({ origin: "https://app.ggg.gg" }))).not.toThrow();
  });

  it("falls back to Host header when Origin is absent", () => {
    expect(() => assertSameOrigin(req({ host: "app.ggg.gg" }))).not.toThrow();
  });

  it("accepts a forwarded host header from a proxy", () => {
    expect(() => assertSameOrigin(req({ "x-forwarded-host": "app.ggg.gg" }))).not.toThrow();
  });

  it("accepts a forwarded host with the default HTTPS port", () => {
    expect(() => assertSameOrigin(req({ "x-forwarded-host": "app.ggg.gg:443" }))).not.toThrow();
  });

  it("accepts a browser request when Origin and Host match even if APP_URL differs", () => {
    expect(() => assertSameOrigin(req({ origin: "https://app.ggg.quest", host: "app.ggg.quest" }))).not.toThrow();
  });

  it("throws CsrfError on a cross-origin request", () => {
    expect(() => assertSameOrigin(req({ origin: "https://evil.example" }))).toThrow(CsrfError);
  });

  it("throws when neither Origin nor Host is present", () => {
    expect(() => assertSameOrigin(req({}))).toThrow(CsrfError);
  });
});
