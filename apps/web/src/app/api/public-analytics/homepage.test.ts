import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const homepage = readFileSync(resolve(process.cwd(), "../../homepage/index.html"), "utf8");
const analyticsScript = homepage.slice(
  homepage.indexOf("// Homepage metrics"),
  homepage.lastIndexOf("      })();"),
);

function renderHomepage(fetchImpl: typeof fetch) {
  const parsed = new DOMParser().parseFromString(homepage, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  vi.stubGlobal("fetch", fetchImpl);
  runInThisContext(analyticsScript);
  return document;
}

describe("homepage public analytics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the aggregate pageview count", async () => {
    const page = renderHomepage(
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, data: { pageviewsLast30Days: 42 } })),
        ),
    );

    await vi.waitFor(() =>
      expect(page.getElementById("analytics-pageviews")).toHaveTextContent("42"),
    );
    expect(page.getElementById("analytics-status")).toHaveTextContent(
      "Updated from aggregate PostHog data.",
    );
  });

  it("renders the fallback when analytics are unavailable", async () => {
    const page = renderHomepage(vi.fn().mockRejectedValue(new Error("Unavailable")));

    await vi.waitFor(() =>
      expect(page.getElementById("analytics-status")).toHaveTextContent(
        "Live analytics are temporarily unavailable.",
      ),
    );
  });

  it("contains no PostHog personal credential", () => {
    expect(homepage).not.toContain("POSTHOG_PERSONAL_API_KEY");
    expect(homepage).not.toContain("phx_");
  });
});
