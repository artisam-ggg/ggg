import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Page from "./page";

describe("/ landing", () => {
  it("renders the hero thesis and a Create Tournament CTA linking to /tournaments/new", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /create tournament/i });
    expect(cta).toHaveAttribute("href", "/tournaments/new");
    expect(cta.className).toMatch(/electric-violet/);
  });
});
