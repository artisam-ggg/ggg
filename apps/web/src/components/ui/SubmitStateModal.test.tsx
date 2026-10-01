import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SubmitStateModal } from "./SubmitStateModal";

describe("SubmitStateModal", () => {
  it("renders nothing when open=false", () => {
    render(<SubmitStateModal open={false} phase="signing" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders a dialog with aria-modal when open=true", () => {
    render(<SubmitStateModal open={true} phase="signing" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("shows 'SIGNING…' label in signing phase", () => {
    render(<SubmitStateModal open={true} phase="signing" />);
    expect(screen.getByRole("status")).toHaveTextContent("SIGNING…");
  });

  it("shows 'SUBMITTING…' label in submitting phase", () => {
    render(<SubmitStateModal open={true} phase="submitting" />);
    expect(screen.getByRole("status")).toHaveTextContent("SUBMITTING…");
  });

  it("shows 'SETTLED' label in success phase", () => {
    render(<SubmitStateModal open={true} phase="success" />);
    expect(screen.getByRole("status")).toHaveTextContent("SETTLED");
  });

  it("shows 'FAILED' label in error phase with no message", () => {
    render(<SubmitStateModal open={true} phase="error" />);
    expect(screen.getByRole("status")).toHaveTextContent("FAILED");
  });

  it("shows custom error message in error phase when message provided", () => {
    render(<SubmitStateModal open={true} phase="error" message="TX rejected by network" />);
    expect(screen.getByRole("status")).toHaveTextContent("TX rejected by network");
  });

  it("shows a close button in success phase when onClose is provided", () => {
    const onClose = vi.fn();
    render(<SubmitStateModal open={true} phase="success" onClose={onClose} />);
    const closeBtn = screen.getByRole("button", { name: /close/i });
    expect(closeBtn).toBeInTheDocument();
    expect(closeBtn).toHaveFocus();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a close button in error phase when onClose is provided", () => {
    const onClose = vi.fn();
    render(<SubmitStateModal open={true} phase="error" onClose={onClose} />);
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("does not show a close button in signing phase", () => {
    const onClose = vi.fn();
    render(<SubmitStateModal open={true} phase="signing" onClose={onClose} />);
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("does not show a close button when onClose is not provided", () => {
    render(<SubmitStateModal open={true} phase="success" />);
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("has label-caps class on the status label", () => {
    render(<SubmitStateModal open={true} phase="signing" />);
    const status = screen.getByRole("status");
    expect(status).toHaveClass("label-caps");
  });

  it("idle phase shows empty label", () => {
    render(<SubmitStateModal open={true} phase="idle" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
  });

  it("dialog aria-label reflects the success phase", () => {
    render(<SubmitStateModal open={true} phase="success" />);
    const dialog = screen.getByRole("dialog", { name: "Transaction settled" });
    expect(dialog).toBeInTheDocument();
  });

  it("dialog aria-label reflects the error phase", () => {
    render(<SubmitStateModal open={true} phase="error" />);
    const dialog = screen.getByRole("dialog", { name: "Transaction failed" });
    expect(dialog).toBeInTheDocument();
  });

  it("dialog aria-label reflects the signing phase", () => {
    render(<SubmitStateModal open={true} phase="signing" />);
    const dialog = screen.getByRole("dialog", { name: "Signing transaction" });
    expect(dialog).toBeInTheDocument();
  });

  it("dialog aria-label reflects the submitting phase", () => {
    render(<SubmitStateModal open={true} phase="submitting" />);
    const dialog = screen.getByRole("dialog", { name: "Submitting transaction" });
    expect(dialog).toBeInTheDocument();
  });
});
