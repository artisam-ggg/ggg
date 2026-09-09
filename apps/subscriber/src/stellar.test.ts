import { describe, it, expect, vi } from "vitest";

const getEventsMock = vi.fn();
vi.mock("@stellar/stellar-sdk", () => ({
  rpc: { Server: vi.fn(() => ({ getEvents: getEventsMock })) },
  scValToNative: vi.fn(),
  xdr: { ScVal: { fromXDR: vi.fn() } },
}));

import { decodeEventsResponse } from "./stellar";

describe("decodeEventsResponse", () => {
  it("validates and maps a registered event", () => {
    const raw = {
      latestLedger: 105,
      events: [
        {
          eventId: "event-1",
          type: "contract",
          ledger: 101,
          txHash: "abc123",
          topic: ["AAAA"], // registered topic symbol XDR
          value: "AAAB", // (player, pool_after) XDR
        },
      ],
    };
    const decoded = decodeEventsResponse(raw);
    expect(decoded.latestLedger).toBe(105);
    expect(decoded.events[0]?.txHash).toBe("abc123");
    expect(decoded.events[0]?.ledger).toBe(101);
  });

  it("rejects a malformed response", () => {
    expect(() => decodeEventsResponse({ events: "nope" })).toThrow();
  });

  it("rejects an event without a stable RPC event id", () => {
    expect(() =>
      decodeEventsResponse({
        latestLedger: 105,
        events: [{ type: "contract", ledger: 101, txHash: "abc123", topic: [], value: "AAAB" }],
      }),
    ).toThrow();
  });
});
