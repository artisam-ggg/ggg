import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Guidelines } from "./Guidelines";

describe("Guidelines", () => {
  it("opens contextual guidance and links to the full guide", () => {
    render(<Guidelines journey="organizer" />);

    fireEvent.click(screen.getByRole("button", { name: "Open organizer guidelines" }));

    expect(screen.getByRole("dialog", { name: "Create a tournament" })).toBeInTheDocument();
    expect(screen.getByText(/set the entry fee/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read the full guide/i })).toHaveAttribute(
      "href",
      "https://goodgameguild.gitbook.io/ggg/role-guides/organizer-guide",
    );
  });

  it("closes with Escape, restores focus, and keeps Tab inside the modal", () => {
    render(<Guidelines journey="player" />);

    const trigger = screen.getByRole("button", {
      name: "Open player guidelines",
    });
    fireEvent.click(trigger);

    const closeButton = screen.getByRole("button", { name: "Close" });
    const guideLink = screen.getByRole("link", { name: /read the full guide/i });
    expect(closeButton).toHaveFocus();

    guideLink.focus();
    fireEvent.keyDown(guideLink, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
