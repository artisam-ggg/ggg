import { afterEach, describe, it, expect, vi } from "vitest";
import { buildSecurityHeaders } from "./security-headers";

describe("buildSecurityHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns expected header names", () => {
    const headers = buildSecurityHeaders();
    const names = headers.map(([key]) => key);
    expect(names).toContain("Content-Security-Policy");
    expect(names).toContain("X-Content-Type-Options");
    expect(names).toContain("Referrer-Policy");
    expect(names).toContain("Strict-Transport-Security");
    expect(names).toContain("X-Frame-Options");
    expect(names).toContain("Permissions-Policy");
  });

  it("sets the exact hardening header values (AGENT §7)", () => {
    const h = new Map(buildSecurityHeaders());
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(h.get("X-Frame-Options")).toBe("DENY");
    expect(h.get("Permissions-Policy")).toContain("camera=()");
  });

  it("CSP locks defaults to self and forbids framing/objects", () => {
    const csp = new Map(buildSecurityHeaders()).get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("CSP allows the Stellar RPC/Horizon, the explorer, and S3 image origin", () => {
    const csp = new Map(buildSecurityHeaders()).get("Content-Security-Policy") ?? "";
    // RPC + Horizon (testnet/mainnet) via the *.stellar.org wildcard
    expect(csp).toContain("connect-src 'self' https://*.stellar.org");
    // Stellar.Expert is a distinct domain — must be listed for fetch + images
    expect(csp).toContain("https://stellar.expert");
    // S3/MinIO origin for tournament banner images
    expect(csp).toContain("img-src 'self' data: blob: https://stellar.expert");
  });

  it("allows eval for React debugging only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const developmentCsp = new Map(buildSecurityHeaders()).get("Content-Security-Policy") ?? "";
    expect(developmentCsp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");

    vi.stubEnv("NODE_ENV", "production");
    const productionCsp = new Map(buildSecurityHeaders()).get("Content-Security-Policy") ?? "";
    expect(productionCsp).not.toContain("'unsafe-eval'");
  });
});
