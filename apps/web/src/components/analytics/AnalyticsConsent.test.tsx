import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsConsent } from "./AnalyticsConsent";

const posthog = vi.hoisted(() => ({
  has_opted_out_capturing: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: posthog }));

describe("AnalyticsConsent", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    posthog.has_opted_out_capturing.mockReturnValue(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("stays hidden when PostHog is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    render(<AnalyticsConsent />);
    act(() => vi.runAllTimers());
    expect(screen.queryByLabelText("Analytics consent")).not.toBeInTheDocument();
  });

  it("opts in and saves consent when accepted", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    render(<AnalyticsConsent />);
    act(() => vi.runAllTimers());
    expect(screen.getByLabelText("Analytics consent")).toHaveClass(
      "w-[calc(100%-2rem)]",
      "max-w-[576px]",
    );
    expect(screen.getByText(/product analytics and session replay/i)).toBeInTheDocument();
    expect(screen.getByText(/public address may be sent to PostHog/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept analytics" }));

    expect(posthog.opt_in_capturing).toHaveBeenCalledOnce();
    expect(localStorage.getItem("ggg_cookie_consent")).toBe("accepted");
    expect(screen.queryByLabelText("Analytics consent")).not.toBeInTheDocument();
  });

  it("opts out and saves consent when declined", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    render(<AnalyticsConsent />);
    act(() => vi.runAllTimers());
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(posthog.opt_out_capturing).toHaveBeenCalledOnce();
    expect(localStorage.getItem("ggg_cookie_consent")).toBe("declined");
  });

  it("does not opt in again when saved consent is already active", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    localStorage.setItem("ggg_cookie_consent", "accepted");
    posthog.has_opted_out_capturing.mockReturnValue(false);

    render(<AnalyticsConsent />);

    expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Analytics consent")).not.toBeInTheDocument();
  });

  it("keeps the banner hidden when declined consent is already active", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    localStorage.setItem("ggg_cookie_consent", "declined");
    posthog.has_opted_out_capturing.mockReturnValue(true);

    render(<AnalyticsConsent />);

    expect(posthog.opt_out_capturing).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Analytics consent")).not.toBeInTheDocument();
  });
});
