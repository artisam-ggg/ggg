import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signAndSubmit, refresh, MockSubmissionError } = vi.hoisted(() => {
  class MockSubmissionError extends Error {
    constructor(
      message: string,
      readonly details: { code: string; txHash?: string; retryable?: boolean },
    ) {
      super(message);
      this.name = "SubmissionError";
    }
  }
  return {
    signAndSubmit: vi.fn(),
    refresh: vi.fn(),
    MockSubmissionError,
  };
});
vi.mock("@/lib/wallet", () => ({ signAndSubmit, SubmissionError: MockSubmissionError }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./WalletButton", () => ({
  WalletButton: ({ onConnected }: { onConnected: (address: string) => void }) => (
    <button onClick={() => onConnected("GPLAYER")}>Connect wallet</button>
  ),
}));

import { ClaimRefundButton } from "./ClaimRefundButton";

describe("ClaimRefundButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signAndSubmit.mockResolvedValue({ txHash: "TX" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, data: { unsignedXdr: "XDR" } }), { status: 200 }),
        ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the claim disabled until subscriber confirmation reaches the component", async () => {
    const { rerender } = render(
      <ClaimRefundButton tournamentId="t1" passphrase="Testnet" entryFee="10000000" asset="XLM" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim refund/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/waiting for confirmed on-chain event/i),
    );
    expect(screen.getByRole("button", { name: /claim refund/i })).toBeDisabled();
    expect(screen.queryByText("SETTLED")).not.toBeInTheDocument();

    rerender(
      <ClaimRefundButton
        tournamentId="t1"
        passphrase="Testnet"
        entryFee="10000000"
        asset="XLM"
        confirmedClaimedPlayers={["GPLAYER"]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/refund confirmed/i);
    expect(screen.getByRole("button", { name: /claim refund/i })).toBeDisabled();
  });

  it("refreshes canonical state with bounded backoff until confirmation arrives", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ClaimRefundButton tournamentId="t1" passphrase="Testnet" entryFee="10000000" asset="XLM" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim refund/i }));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(screen.getByRole("status")).toHaveTextContent(/waiting for confirmed on-chain event/i);
    act(() => vi.advanceTimersByTime(1_000));
    expect(refresh).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(2_000));
    expect(refresh).toHaveBeenCalledTimes(2);

    rerender(
      <ClaimRefundButton
        tournamentId="t1"
        passphrase="Testnet"
        entryFee="10000000"
        asset="XLM"
        confirmedClaimedPlayers={["GPLAYER"]}
      />,
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent(/refund confirmed/i);
  });

  it("stops after the bounded polling window and offers a manual status refresh", async () => {
    vi.useFakeTimers();
    render(
      <ClaimRefundButton tournamentId="t1" passphrase="Testnet" entryFee="10000000" asset="XLM" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim refund/i }));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]) {
      act(() => vi.advanceTimersByTime(delay));
    }

    expect(refresh).toHaveBeenCalledTimes(8);
    expect(screen.getByRole("status")).toHaveTextContent(/still processing/i);
    const refreshButton = screen.getByRole("button", { name: /refresh refund status/i });
    fireEvent.click(refreshButton);
    expect(refresh).toHaveBeenCalledTimes(9);
  });

  it("cleans up automatic refresh when the component unmounts", async () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <ClaimRefundButton tournamentId="t1" passphrase="Testnet" entryFee="10000000" asset="XLM" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim refund/i }));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps an uncertain hashed submission pending and prevents another transaction", async () => {
    signAndSubmit.mockRejectedValueOnce(
      new MockSubmissionError("Confirmation timed out", {
        code: "TX_TIMEOUT",
        txHash: "TX_PENDING",
        retryable: true,
      }),
    );
    render(
      <ClaimRefundButton tournamentId="t1" passphrase="Testnet" entryFee="10000000" asset="XLM" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim refund/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/submitted.*still pending/i),
    );
    fireEvent.click(screen.getByRole("button", { name: /claim refund/i }));
    expect(signAndSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /claim refund/i })).toBeDisabled();
  });

  it("shows a failed submission separately and allows a deliberate retry", async () => {
    signAndSubmit.mockRejectedValueOnce(
      new MockSubmissionError("Transaction failed on-chain", {
        code: "TX_FAILED",
        txHash: "TX_FAILED",
        retryable: false,
      }),
    );
    render(
      <ClaimRefundButton tournamentId="t1" passphrase="Testnet" entryFee="10000000" asset="XLM" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim refund/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /refund submission failed.*transaction failed on-chain/i,
      ),
    );
    expect(screen.getByRole("button", { name: /claim refund/i })).not.toBeDisabled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
