import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Page from "./page";

describe("/ landing", () => {
  it("renders organizer and developer CTAs", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /create tournament/i });
    expect(cta).toHaveAttribute("href", "/tournaments/new");
    expect(cta.className).toMatch(/electric-violet/);

    const sdkCta = screen.getByRole("link", { name: /reusable ggg stellar escrow sdk on npm/i });
    expect(sdkCta).toHaveAttribute(
      "href",
      "https://www.npmjs.com/package/@goodgameguild/escrow-sdk",
    );
    expect(sdkCta).toHaveAttribute("target", "_blank");
    expect(sdkCta).toHaveAttribute("rel", "noreferrer");
  });
});
