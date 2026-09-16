import { act, render } from "@testing-library/react";
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
    const { unmount } = render(<SettlementSyncStatus />);

    act(() => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledOnce();

    unmount();
    act(() => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
