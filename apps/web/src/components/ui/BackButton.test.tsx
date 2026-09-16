import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBack = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
}));

import { BackButton } from "./BackButton";

describe("BackButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with default 'Back' text", () => {
    render(<BackButton />);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("renders custom children", () => {
    render(<BackButton>Back to tournaments</BackButton>);
    expect(screen.getByRole("button", { name: "Back to tournaments" })).toBeInTheDocument();
  });

  it("renders an icon", () => {
    render(<BackButton />);
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("calls router.back() when clicked", () => {
    render(<BackButton />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("navigates to href instead of browser history when configured", () => {
    render(<BackButton href="/tournaments">Back to tournaments</BackButton>);
    fireEvent.click(screen.getByRole("button", { name: "Back to tournaments" }));
    expect(mockPush).toHaveBeenCalledWith("/tournaments");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("accepts a custom aria-label", () => {
    render(<BackButton aria-label="Go back">Return</BackButton>);
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });
});
