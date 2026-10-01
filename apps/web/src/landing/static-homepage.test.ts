import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homepage = readFileSync(resolve(process.cwd(), "../../homepage/index.html"), "utf8");
const homepageServerConfig = readFileSync(
  resolve(process.cwd(), "../../homepage/Caddyfile"),
  "utf8",
);
const sdkUrl = "https://www.npmjs.com/package/@goodgameguild/escrow-sdk";
const explainerUrl = "https://www.youtube-nocookie.com/embed/K0GpI1Xg6uk";

describe("static marketing homepage", () => {
  it("exposes an understandable hero SDK call-to-action to the canonical npm package", () => {
    expect(homepage).toContain(`href="${sdkUrl}"`);
    expect(homepage).toMatch(
      /aria-label="Get the reusable GGG Stellar escrow SDK on npm"[^>]*>[\s\S]*?Get the SDK[\s\S]*?<\/a>/,
    );
  });

  it("embeds the explainer video before the features section", () => {
    expect(homepage).toContain(`src="${explainerUrl}"`);
    expect(homepage).toContain('title="GGG - Quick Explainer"');
    expect(homepage.indexOf('id="explainer"')).toBeLessThan(homepage.indexOf('id="features"'));
  });

  it("ships a narrow static-host policy for the explainer frame", () => {
    expect(homepageServerConfig).toContain("frame-src https://www.youtube-nocookie.com");
    expect(homepageServerConfig).not.toMatch(/frame-src[^\n"]*\*/);
    expect(homepageServerConfig).toContain("Strict-Transport-Security");
    expect(homepageServerConfig).toContain('X-Content-Type-Options "nosniff"');
    expect(homepageServerConfig).toContain('X-Frame-Options "SAMEORIGIN"');
    expect(homepageServerConfig).toContain('Referrer-Policy "strict-origin-when-cross-origin"');
    expect(homepageServerConfig).toContain("Permissions-Policy");
  });
});
