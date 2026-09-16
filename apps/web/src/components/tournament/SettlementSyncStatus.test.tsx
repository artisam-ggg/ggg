import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { SettlementSyncStatus } from "./SettlementSyncStatus";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("SettlementSyncStatus", () => {
  it("refreshes after one interval and stops after unmount", () => {
    vi.useFakeTimers();
    const { unmount } = render(<SettlementSyncStatus contractUrl={null} />);

    act(() => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledOnce();

    unmount();
    act(() => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("stops automatic refreshes after the subscriber grace window", () => {
    vi.useFakeTimers();
    render(<SettlementSyncStatus contractUrl="https://stellar.expert/contract/C1" />);

    act(() => vi.advanceTimersByTime(15 * 60 * 1_000));
    expect(refresh).toHaveBeenCalledTimes(180);
    expect(screen.getByText(/settlement sync needs attention/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view contract on stellar explorer/i }),
    ).toHaveAttribute("href", "https://stellar.expert/contract/C1");

    act(() => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledTimes(180);
  });
});
