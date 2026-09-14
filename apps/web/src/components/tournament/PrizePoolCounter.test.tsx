import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrizePoolCounter } from "./PrizePoolCounter";

class FakeES {
  static instances: FakeES[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeES.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeEach(() => {
  FakeES.instances = [];
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeES;
  // Reduced motion → skip the pop timer for deterministic tests.
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

afterEach(() => {
  delete (globalThis as unknown as { matchMedia?: unknown }).matchMedia;
});

function renderCounter(
  initialPool = "30000000",
  participantCount = 3,
  initialRefundPlayers?: string[],
) {
  return render(
    <PrizePoolCounter
      tournamentId="t_1"
      initialPool={initialPool}
      asset="XLM"
      participantCount={participantCount}
      entryFee="10000000"
      {...(initialRefundPlayers ? { initialRefundPlayers } : {})}
    />,
  );
}

describe("PrizePoolCounter", () => {
  it("renders the initial pool in acid data-mono and the unit", () => {
    renderCounter();
    const num = screen.getByTestId("pool-amount");
    expect(num).toHaveTextContent("3.0000000");
    expect(num.className).toMatch(/acid-yellow/);
    expect(screen.getByText("XLM")).toBeInTheDocument();
  });

  it("pool-amount element has aria-live polite", () => {
    renderCounter("10000000", 1);
    expect(screen.getByTestId("pool-amount")).toHaveAttribute("aria-live", "polite");
  });

  it("ticks the pool up to poolAfter on a live REGISTERED event", () => {
    renderCounter();
    act(() =>
      FakeES.instances[0]!.emit({
        type: "REGISTERED",
        txHash: "tx1",
        data: { player: "GA", poolAfter: "50000000" },
      }),
    );
    expect(screen.getByTestId("pool-amount")).toHaveTextContent("5.0000000");
    expect(screen.getByText("4 players")).toBeInTheDocument();
  });

  it("ignores registrations without the contract-emitted poolAfter", () => {
    renderCounter();
    act(() =>
      FakeES.instances[0]!.emit({
        type: "REGISTERED",
        txHash: "tx1",
        data: { player: "GA", poolAfter: null },
      }),
    );
    expect(screen.getByTestId("pool-amount")).toHaveTextContent("3.0000000");
  });

  it("decreases the pool once for a live refund claim", () => {
    renderCounter();
    act(() =>
      FakeES.instances[0]!.emit({
        type: "REFUND_CLAIMED",
        txHash: "tx-refund",
        data: { player: "GA", amount: "10000000" },
      }),
    );
    expect(screen.getByTestId("pool-amount")).toHaveTextContent("2.0000000");
  });

  it("does not replay a refund already reflected in the initial pool", () => {
    renderCounter("20000000", 3, ["GA"]);
    act(() =>
      FakeES.instances[0]!.emit({
        type: "REFUND_CLAIMED",
        txHash: "tx-refund",
        data: { player: "GA", amount: "10000000" },
      }),
    );
    expect(screen.getByTestId("pool-amount")).toHaveTextContent("2.0000000");
  });
});
