import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Guidelines } from "./Guidelines";

describe("Guidelines", () => {
  it.each([
    [
      "organizer",
      "Create a tournament",
      /set the entry fee/i,
      "https://goodgameguild.gitbook.io/ggg/role-guides/organizer-guide",
    ],
    [
      "player",
      "Join a tournament",
      /public tournament page/i,
      "https://goodgameguild.gitbook.io/ggg/role-guides/player-guide",
    ],
    [
      "referee",
      "Finalize payouts",
      /exact referee wallet/i,
      "https://goodgameguild.gitbook.io/ggg/role-guides/referee-guide",
    ],
    [
      "refund",
      "Claim a refund",
      /wallet that joined/i,
      "https://goodgameguild.gitbook.io/ggg/role-guides/player-guide",
    ],
  ] as const)("opens %s guidance and links to its full guide", (journey, title, step, href) => {
    render(<Guidelines journey={journey} />);

    fireEvent.click(screen.getByRole("button", { name: `Open ${journey} guidelines` }));

    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
    expect(screen.getByText(step)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read the full guide/i })).toHaveAttribute(
      "href",
      href,
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

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(guideLink).toHaveFocus();

    guideLink.focus();
    fireEvent.keyDown(guideLink, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes with the visible close control and restores focus", () => {
    render(<Guidelines journey="referee" />);

    const trigger = screen.getByRole("button", {
      name: "Open referee guidelines",
    });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
