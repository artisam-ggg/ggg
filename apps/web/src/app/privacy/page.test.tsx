import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("discloses PostHog analytics and session replay", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText(/PostHog Cloud in the United States/i)).toBeInTheDocument();
    expect(screen.getByText(/Analytics remains disabled if you decline/i)).toBeInTheDocument();
    expect(
      screen.getByText(/public address may be included as an event property/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/transaction.*hash and type may also be included/i),
    ).toBeInTheDocument();
  });
});
