import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GABCDEFGHIJABCDEFGHIJ"),
}));

import { WalletButton } from "./WalletButton";
import { ensureWallet } from "@/lib/wallet";

const mockedEnsureWallet = ensureWallet as ReturnType<typeof vi.fn>;

describe("WalletButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnsureWallet.mockResolvedValue("GABCDEFGHIJABCDEFGHIJ");
  });

  it("renders 'Connect Wallet' button with label-caps class initially", () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    const btn = screen.getByRole("button", { name: /connect wallet/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveClass("label-caps");
  });

  it("calls ensureWallet with the provided expectedPassphrase on click", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="Test Network" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(mockedEnsureWallet).toHaveBeenCalledWith("Test Network"));
  });

  it("calls onConnected with the returned address on success", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith("GABCDEFGHIJABCDEFGHIJ"));
  });

  it("shows a truncated acid wallet chip after successful connection", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    // GABCDEFGHIJABCDEFGHIJ → slice(0,6)=GABCDE, slice(-5)=FGHIJ
    await waitFor(() => expect(screen.getByText(/GABCDE…FGHIJ/)).toBeInTheDocument());
  });

  it("connected chip has aria-label with full address", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() =>
      expect(screen.getByLabelText("Wallet GABCDEFGHIJABCDEFGHIJ")).toBeInTheDocument(),
    );
  });

  it("updates the connected address when re-checking wallets", async () => {
    const onConnected = vi.fn();
    mockedEnsureWallet
      .mockResolvedValueOnce("GABCDEFGHIJABCDEFGHIJ")
      .mockResolvedValueOnce("GNEWADDRESSNEWADDRESS");
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByRole("button", { name: /re-check wallet/i });
    fireEvent.click(screen.getByRole("button", { name: /re-check wallet/i }));

    await waitFor(() => expect(onConnected).toHaveBeenLastCalledWith("GNEWADDRESSNEWADDRESS"));
    expect(screen.getByLabelText("Wallet GNEWADDRESSNEWADDRESS")).toBeInTheDocument();
  });

  it("keeps the current wallet and shows an error when re-checking fails", async () => {
    const onConnected = vi.fn();
    mockedEnsureWallet
      .mockResolvedValueOnce("GABCDEFGHIJABCDEFGHIJ")
      .mockRejectedValueOnce(new Error("Freighter access denied"));
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByRole("button", { name: /re-check wallet/i });
    fireEvent.click(screen.getByRole("button", { name: /re-check wallet/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Freighter access denied");
    expect(screen.getByLabelText("Wallet GABCDEFGHIJABCDEFGHIJ")).toBeInTheDocument();
  });

  it("acknowledges a re-check when the wallet is unchanged", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByRole("button", { name: /re-check wallet/i });
    fireEvent.click(screen.getByRole("button", { name: /re-check wallet/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Wallet re-checked");
    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  it("clears the connected address when disconnecting", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByRole("button", { name: /disconnect wallet/i });
    fireEvent.click(screen.getByRole("button", { name: /disconnect wallet/i }));

    expect(onConnected).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("ignores a pending re-check after disconnecting", async () => {
    const onConnected = vi.fn();
    let resolveRecheck: (address: string) => void;
    const recheck = new Promise<string>((resolve) => {
      resolveRecheck = resolve;
    });
    mockedEnsureWallet.mockResolvedValueOnce("GABCDEFGHIJABCDEFGHIJ").mockReturnValueOnce(recheck);
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByRole("button", { name: /re-check wallet/i });
    fireEvent.click(screen.getByRole("button", { name: /re-check wallet/i }));
    expect(screen.getByRole("button", { name: /re-checking/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /disconnect wallet/i }));
    resolveRecheck!("GNEWADDRESSNEWADDRESS");

    await waitFor(() => expect(onConnected).toHaveBeenLastCalledWith(null));
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("serializes rapid re-check attempts", async () => {
    const onConnected = vi.fn();
    let resolveRecheck: (address: string) => void;
    const recheck = new Promise<string>((resolve) => {
      resolveRecheck = resolve;
    });
    mockedEnsureWallet.mockResolvedValueOnce("GABCDEFGHIJABCDEFGHIJ").mockReturnValueOnce(recheck);
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByRole("button", { name: /re-check wallet/i });
    const recheckButton = screen.getByRole("button", { name: /re-check wallet/i });
    fireEvent.click(recheckButton);
    fireEvent.click(recheckButton);
    expect(mockedEnsureWallet).toHaveBeenCalledTimes(2);
    resolveRecheck!("GNEWADDRESSNEWADDRESS");

    await waitFor(() =>
      expect(screen.getByLabelText("Wallet GNEWADDRESSNEWADDRESS")).toBeInTheDocument(),
    );
  });

  it("clears a re-check error when disconnecting", async () => {
    const onConnected = vi.fn();
    mockedEnsureWallet
      .mockResolvedValueOnce("GABCDEFGHIJABCDEFGHIJ")
      .mockRejectedValueOnce(new Error("Freighter access denied"));
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByRole("button", { name: /re-check wallet/i });
    fireEvent.click(screen.getByRole("button", { name: /re-check wallet/i }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: /disconnect wallet/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error message when ensureWallet throws", async () => {
    const onConnected = vi.fn();
    mockedEnsureWallet.mockRejectedValueOnce(new Error("Freighter not installed"));
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Freighter not installed"),
    );
    expect(onConnected).not.toHaveBeenCalled();
  });

  it("replaces connect with wallet controls after address is set", async () => {
    const onConnected = vi.fn();
    render(<WalletButton onConnected={onConnected} expectedPassphrase="P" />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /connect wallet/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /re-check wallet/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disconnect wallet/i })).toBeInTheDocument();
  });
});
