import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signAndSubmit } = vi.hoisted(() => ({ signAndSubmit: vi.fn() }));
vi.mock("@/lib/wallet", () => ({ signAndSubmit }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./WalletButton", () => ({
  WalletButton: ({ onConnected }: { onConnected: (address: string) => void }) => (
    <button onClick={() => onConnected("GPLAYER")}>Connect wallet</button>
  ),
}));

import { ClaimRefundButton } from "./ClaimRefundButton";

describe("ClaimRefundButton", () => {
  beforeEach(() => {
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

  it("keeps the claim disabled until subscriber confirmation reaches the component", async () => {
    const { rerender } = render(<ClaimRefundButton tournamentId="t1" passphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim refund/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/waiting for confirmed on-chain event/i),
    );
    expect(screen.getByRole("button", { name: /claim refund/i })).toBeDisabled();
    expect(screen.queryByText("SETTLED")).not.toBeInTheDocument();

    rerender(
      <ClaimRefundButton tournamentId="t1" passphrase="P" confirmedClaimedPlayers={["GPLAYER"]} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/refund confirmed/i);
    expect(screen.getByRole("button", { name: /claim refund/i })).toBeDisabled();
  });
});
