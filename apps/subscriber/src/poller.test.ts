import { describe, it, expect, vi, beforeEach } from "vitest";

const { getEvents, decodeScVal, getEscrowAbi, getCursor, setCursor, applyEvent, publishChange } =
  vi.hoisted(() => ({
    getEvents: vi.fn(),
    decodeScVal: vi.fn(),
    getEscrowAbi: vi.fn(),
    getCursor: vi.fn(),
    setCursor: vi.fn(),
    applyEvent: vi.fn(),
    publishChange: vi.fn(),
  }));

vi.mock("./stellar", () => ({ getEvents, decodeScVal, getEscrowAbi }));
vi.mock("./cursor", () => ({ getCursor, setCursor }));
vi.mock("./reconcile", () => ({ applyEvent }));
vi.mock("./publish", () => ({ publishChange }));

import { pollTournament } from "./poller";

const tournament = { id: "t1", contractId: "CABC" };
const PLAYER = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const PLAYER_2 = "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB";
const PLAYER_3 = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

beforeEach(() => {
  getEscrowAbi.mockResolvedValue("CURRENT");
  getCursor.mockResolvedValue({ ledger: 100, hzCursor: null });
  getEvents.mockResolvedValue({
    latestLedger: 300,
    events: [
      {
        eventId: "event-reg-1",
        type: "contract",
        ledger: 105,
        txHash: "tx-reg-1",
        topic: ["REG", "PLY"],
        value: "VAL",
      },
    ],
  });
  // topic[0] → the "registered" symbol, topic[1] → the player address; the value
  // decodes to the post-join pool total (a bare i128).
  decodeScVal.mockImplementation((b64: string) => {
    if (b64 === "REG") return "registered";
    if (b64 === "PLY") return PLAYER;
    return 10000000n;
  });
  applyEvent.mockResolvedValue({
    type: "REGISTERED",
    txHash: "tx-reg-1",
    data: { player: PLAYER, poolAfter: "10000000" },
  });
  setCursor.mockReset();
  publishChange.mockReset();
});

describe("pollTournament", () => {
  it("ingests a registered event, publishes it, and advances the cursor", async () => {
    await pollTournament(tournament);
    expect(applyEvent).toHaveBeenCalledTimes(1);
    expect(applyEvent.mock.calls[0]?.[1]).toMatchObject({
      type: "REGISTERED",
      txHash: "tx-reg-1",
      ledger: 105,
    });
    expect(publishChange).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ type: "REGISTERED", txHash: "tx-reg-1" }),
    );
    expect(setCursor).toHaveBeenCalledWith("CABC", 201); // latestLedger + 1 - SAFETY_LAG(100)
  });

  it("does not publish a duplicate (applyEvent returns null on replay)", async () => {
    applyEvent.mockResolvedValue(null);
    await pollTournament(tournament);
    expect(publishChange).not.toHaveBeenCalled();
    expect(setCursor).toHaveBeenCalledWith("CABC", 201);
  });

  it("decodes finalized winners and amounts from the event value", async () => {
    getEvents.mockResolvedValue({
      latestLedger: 300,
      events: [
        {
          eventId: "event-finalized",
          type: "contract",
          ledger: 105,
          txHash: "tx-finalized",
          topic: ["FIN"],
          value: "RESULTS",
        },
      ],
    });
    decodeScVal.mockImplementation((b64: string) => {
      if (b64 === "FIN") return "finalized";
      return [
        [PLAYER, PLAYER_2, PLAYER_3],
        [6_000_000n, 3_000_000n, 1_000_000n],
      ];
    });
    applyEvent.mockResolvedValue({ type: "FINALIZED", txHash: "tx-finalized", data: {} });

    await pollTournament(tournament);

    expect(applyEvent).toHaveBeenCalledWith(
      tournament,
      expect.objectContaining({
        type: "FINALIZED",
        data: {
          winners: [PLAYER, PLAYER_2, PLAYER_3],
          amounts: ["6000000", "3000000", "1000000"],
        },
      }),
    );
  });

  it("stops before advancing the cursor for malformed finalized values", async () => {
    getEvents.mockResolvedValue({
      latestLedger: 300,
      events: [
        {
          eventId: "event-finalized-malformed",
          type: "contract",
          ledger: 105,
          txHash: "tx-finalized-malformed",
          topic: ["FIN"],
          value: "RESULTS",
        },
      ],
    });
    decodeScVal.mockImplementation((b64: string) => {
      if (b64 === "FIN") return "finalized";
      return [
        [PLAYER, PLAYER_2],
        [6_000_000n, 3_000_000n, 1_000_000n],
      ];
    });
    const applyCallsBefore = applyEvent.mock.calls.length;
    const publishCallsBefore = publishChange.mock.calls.length;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(pollTournament(tournament)).rejects.toThrow();

    expect(applyEvent).toHaveBeenCalledTimes(applyCallsBefore);
    expect(publishChange).toHaveBeenCalledTimes(publishCallsBefore);
    expect(setCursor).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "[subscriber] could not decode event; cursor will not advance",
      expect.objectContaining({
        txHash: "tx-finalized-malformed",
        eventId: "event-finalized-malformed",
        ledger: 105,
      }),
    );
    error.mockRestore();
  });

  it("stops before advancing the cursor for malformed external event payloads", async () => {
    decodeScVal.mockImplementation((b64: string) => {
      if (b64 === "REG") return "registered";
      if (b64 === "PLY") return "not-a-stellar-address";
      return 10000000n;
    });
    const callsBefore = applyEvent.mock.calls.length;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(pollTournament(tournament)).rejects.toThrow();

    expect(applyEvent).toHaveBeenCalledTimes(callsBefore);
    expect(setCursor).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "[subscriber] could not decode event; cursor will not advance",
      expect.objectContaining({ txHash: "tx-reg-1", eventId: "event-reg-1", ledger: 105 }),
    );
    error.mockRestore();
  });

  it("decodes cancellation availability and refund-claim events", async () => {
    getEvents.mockResolvedValue({
      latestLedger: 300,
      events: [
        {
          eventId: "event-can",
          type: "contract",
          ledger: 105,
          txHash: "tx-can",
          topic: ["CAN"],
          value: "COUNT",
        },
        {
          eventId: "event-ref",
          type: "contract",
          ledger: 106,
          txHash: "tx-ref",
          topic: ["REF", "PLY"],
          value: "REFUND",
        },
      ],
    });
    decodeScVal.mockImplementation((b64: string) => {
      if (b64 === "CAN") return "cancelled";
      if (b64 === "REF") return "refund_claimed";
      if (b64 === "PLY") return PLAYER;
      if (b64 === "COUNT") return 3n;
      return { amount: 10000000n };
    });
    applyEvent.mockResolvedValueOnce({ type: "CANCELLED", txHash: "tx-can", data: {} });
    applyEvent.mockResolvedValueOnce({ type: "REFUND_CLAIMED", txHash: "tx-ref", data: {} });

    await pollTournament(tournament);

    expect(applyEvent.mock.calls.slice(-2).map((call) => call[1])).toEqual([
      expect.objectContaining({ type: "CANCELLED", data: { claimableCount: 3 } }),
      expect.objectContaining({
        type: "REFUND_CLAIMED",
        data: { player: PLAYER, amount: "10000000" },
      }),
    ]);
  });
});
