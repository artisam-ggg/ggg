import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it("renders ACTIVE with acid-yellow styling and label-caps", () => {
    render(<StatusChip status="ACTIVE" />);
    const chip = screen.getByText("ACTIVE");
    expect(chip).toHaveClass("label-caps");
    expect(chip.className).toMatch(/acid-yellow/);
  });

  it("renders CANCELLED with error tint", () => {
    render(<StatusChip status="CANCELLED" />);
    const chip = screen.getByText("CANCELLED");
    expect(chip.className).toMatch(/error/);
  });

  it("renders DRAFT with muted styling", () => {
    render(<StatusChip status="DRAFT" />);
    const chip = screen.getByText("DRAFT");
    expect(chip).toHaveClass("label-caps");
    expect(chip.className).toMatch(/outline-variant/);
  });

  it("renders FINISHED with muted styling", () => {
    render(<StatusChip status="FINISHED" />);
    const chip = screen.getByText("FINISHED");
    expect(chip).toHaveClass("label-caps");
    expect(chip.className).toMatch(/outline-variant/);
  });

  it("renders the refunds-open label with spaces", () => {
    render(<StatusChip status="REFUNDS_OPEN" />);
    expect(screen.getByText("REFUNDS OPEN")).toHaveAttribute("data-status", "REFUNDS_OPEN");
  });

  it("renders REFUNDED with muted styling", () => {
    render(<StatusChip status="REFUNDED" />);
    expect(screen.getByText("REFUNDED").className).toMatch(/outline-variant/);
  });

  it("sets data-status attribute to the status value", () => {
    render(<StatusChip status="ACTIVE" />);
    const chip = screen.getByText("ACTIVE");
    expect(chip).toHaveAttribute("data-status", "ACTIVE");
  });

  it("renders as a span element", () => {
    render(<StatusChip status="ACTIVE" />);
    const chip = screen.getByText("ACTIVE");
    expect(chip.tagName.toLowerCase()).toBe("span");
  });
});
