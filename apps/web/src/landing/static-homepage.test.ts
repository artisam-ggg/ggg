import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homepage = readFileSync(resolve(process.cwd(), "../../homepage/index.html"), "utf8");
const sdkUrl = "https://www.npmjs.com/package/@goodgameguild/escrow-sdk";

describe("static marketing homepage", () => {
  it("exposes an understandable hero SDK call-to-action to the canonical npm package", () => {
    expect(homepage).toContain(`href="${sdkUrl}"`);
    expect(homepage).toMatch(
      /aria-label="Get the reusable GGG Stellar escrow SDK on npm"[^>]*>[\s\S]*?Get the SDK[\s\S]*?<\/a>/,
    );
  });
});
