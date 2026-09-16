import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/wallet", () => ({
  ensureWallet: vi.fn(async () => "GREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFRE"),
  signAndSubmit: vi.fn(async () => ({ txHash: "FTX", status: "FINISHED" })),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SettlementConsole } from "./SettlementConsole";
import { signAndSubmit } from "@/lib/wallet";

const REF = "GREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFREFRE";

// Valid 56-char Stellar G-addresses (padded to correct length)
const ADDR_A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const ADDR_B = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBGV3";
const ADDR_C = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCMXS";

const players = [
  { playerAddr: ADDR_A, joinedAt: "" },
  { playerAddr: ADDR_B, joinedAt: "" },
  { playerAddr: ADDR_C, joinedAt: "" },
];

function dropOnto(slotTestId: string, addr: string) {
  const slot = screen.getByTestId(slotTestId);
  const dt = {
    getData: () => addr,
    setData: () => {},
    dropEffect: "",
  } as unknown as DataTransfer;
  fireEvent.drop(slot, { dataTransfer: dt });
}

describe("SettlementConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    push.mockReset();
  });

  it("links Back to the tournament detail page", () => {
    render(
      <SettlementConsole
        tournamentId="t_1"
        refereeAddr={REF}
        participants={players}
        passphrase="P"
      />,
    );

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/tournaments/t_1");
  });

  it("assigns three distinct winners then finalizes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: true, data: { unsignedXdr: "FU", network: "testnet" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    render(
      <SettlementConsole
        tournamentId="t_1"
        refereeAddr={REF}
        participants={players}
        passphrase="P"
      />,
    );

    // Connect wallet
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GREFRE…REFRE/i);

    // Assign players via keyboard buttons (a11y path).
    // There are 3 players × 3 rank buttons = 9 total initially.
    // After assigning player[0] to 1st, player[0] becomes "used" (buttons hidden).
    // After assigning player[1] to 2nd, player[1] becomes "used" (buttons hidden).
    // Only player[2]'s buttons remain, so assign3Buttons has index [0] only.
    const assign1Buttons = screen.getAllByRole("button", { name: /assign 1st/i });
    fireEvent.click(assign1Buttons[0]!); // assign player[0] → 1st
    const assign2Buttons = screen.getAllByRole("button", { name: /assign 2nd/i });
    fireEvent.click(assign2Buttons[0]!); // assign player[1] → 2nd (player[0] now hidden)
    const assign3Buttons = screen.getAllByRole("button", { name: /assign 3rd/i });
    fireEvent.click(assign3Buttons[0]!); // assign player[2] → 3rd (only player[2] remains)

    // Finalize button should now be enabled
    const finalizeBtn = screen.getByRole("button", { name: /finalize payouts/i });
    expect(finalizeBtn).not.toBeDisabled();

    fireEvent.click(finalizeBtn);

    await waitFor(() =>
      expect(signAndSubmit).toHaveBeenCalledWith(
        "FU",
        "finalize",
        "/api/tournaments/t_1/submit",
        "P",
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/tournaments/t_1"));
  });

  it("disables finalize until all three slots are filled (filled+distinct guard, not wallet guard)", async () => {
    render(
      <SettlementConsole
        tournamentId="t_1"
        refereeAddr={REF}
        participants={players}
        passphrase="P"
      />,
    );

    // First: connect the referee wallet so isReferee becomes true.
    // This rules out the wallet guard as the reason finalize is disabled.
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GREFRE…REFRE/i);

    const finalizeBtn = screen.getByRole("button", { name: /finalize payouts/i });

    // 0 slots filled — disabled because slots are not filled (isReferee is true)
    expect(finalizeBtn).toBeDisabled();

    // 1 slot filled — still disabled
    const assign1Buttons = screen.getAllByRole("button", { name: /assign 1st/i });
    fireEvent.click(assign1Buttons[0]!); // assign player[0] → 1st
    expect(finalizeBtn).toBeDisabled();

    // 2 slots filled — still disabled
    const assign2Buttons = screen.getAllByRole("button", { name: /assign 2nd/i });
    fireEvent.click(assign2Buttons[0]!); // assign player[1] → 2nd
    expect(finalizeBtn).toBeDisabled();

    // 3rd distinct slot filled — now enabled
    const assign3Buttons = screen.getAllByRole("button", { name: /assign 3rd/i });
    fireEvent.click(assign3Buttons[0]!); // assign player[2] → 3rd
    expect(finalizeBtn).not.toBeDisabled();
  });

  it("POSTs with x-wallet-address header and {first,second,third} body", async () => {
    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, data: { unsignedXdr: "FU", network: "testnet" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", mockFetch);

    render(
      <SettlementConsole
        tournamentId="t_1"
        refereeAddr={REF}
        participants={players}
        passphrase="P"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GREFRE…REFRE/i);

    // Assign via drop (native DnD path)
    dropOnto("slot-1", ADDR_A);
    dropOnto("slot-2", ADDR_B);
    dropOnto("slot-3", ADDR_C);

    fireEvent.click(screen.getByRole("button", { name: /finalize payouts/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/tournaments/t_1/finalize");
    // Header contract: x-wallet-address = connected referee G-address
    const headers = init.headers as Record<string, string>;
    expect(headers["x-wallet-address"]).toBe(REF);
    // Body contract: { first, second, third }
    expect(JSON.parse(init.body as string)).toEqual({
      first: ADDR_A,
      second: ADDR_B,
      third: ADDR_C,
    });
  });

  it("shows error and does NOT redirect on {ok:false} (e.g. 403)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, error: "Only the referee can finalize" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    render(
      <SettlementConsole
        tournamentId="t_1"
        refereeAddr={REF}
        participants={players}
        passphrase="P"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GREFRE…REFRE/i);

    dropOnto("slot-1", ADDR_A);
    dropOnto("slot-2", ADDR_B);
    dropOnto("slot-3", ADDR_C);

    fireEvent.click(screen.getByRole("button", { name: /finalize payouts/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Only the referee can finalize"),
    );
    expect(push).not.toHaveBeenCalled();
    expect(signAndSubmit).not.toHaveBeenCalled();
  });

  it("keeps finalize disabled if same player assigned to two slots (non-distinct)", async () => {
    render(
      <SettlementConsole
        tournamentId="t_1"
        refereeAddr={REF}
        participants={players}
        passphrase="P"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GREFRE…REFRE/i);

    // Assign same player to slots 1 and 2 (de-dupe moves them)
    dropOnto("slot-1", ADDR_A);
    dropOnto("slot-2", ADDR_A); // same addr — de-dupe clears slot-1, sets slot-2
    // Slot-1 is now empty, slot-2 has ADDR_A → only 1/3 filled

    expect(screen.getByRole("button", { name: /finalize payouts/i })).toBeDisabled();
  });

  it("modal is visible while signing/submitting", async () => {
    let resolveFetch!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(
      <SettlementConsole
        tournamentId="t_1"
        refereeAddr={REF}
        participants={players}
        passphrase="P"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    await screen.findByText(/GREFRE…REFRE/i);

    dropOnto("slot-1", ADDR_A);
    dropOnto("slot-2", ADDR_B);
    dropOnto("slot-3", ADDR_C);

    fireEvent.click(screen.getByRole("button", { name: /finalize payouts/i }));

    // Modal should appear while fetch is in-flight
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // Resolve to clean up
    resolveFetch(
      new Response(JSON.stringify({ ok: false, error: "cancelled" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
  });
});
