import { describe, it, expect, vi } from "vitest";

const { getEventsMock, wasmHashMock } = vi.hoisted(() => ({
  getEventsMock: vi.fn(),
  wasmHashMock: vi.fn(),
}));
vi.mock("@goodgameguild/escrow-sdk", () => ({
  CURRENT_ESCROW_WASM_HASH: "b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9",
  getEscrowWasmHash: wasmHashMock,
}));
vi.mock("./env", () => ({ env: { SOROBAN_RPC_URL: "https://rpc.example.org" } }));
vi.mock("@stellar/stellar-sdk", () => ({
  rpc: { Server: vi.fn(() => ({ getEvents: getEventsMock })) },
  scValToNative: vi.fn(),
  xdr: { ScVal: { fromXDR: vi.fn() } },
}));

import { decodeEventsResponse, getEscrowAbi } from "./stellar";

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

describe("getEscrowAbi", () => {
  it("selects decoders by pinned executable hash", async () => {
    wasmHashMock.mockResolvedValueOnce(
      "b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9",
    );
    await expect(getEscrowAbi("CCURRENT")).resolves.toBe("CURRENT");
    wasmHashMock.mockResolvedValueOnce(
      "2dcfb4c3ed77863269a347308156021de08427f5e6aa77ba15a08d9476c03f77",
    );
    await expect(getEscrowAbi("CVECTOR")).resolves.toBe("VECTOR");
    wasmHashMock.mockResolvedValueOnce(
      "56faadf3395536f14b10c263c6369dda77dd2bc3ec9c24c6ce39fada518986ac",
    );
    await expect(getEscrowAbi("CLEGACY")).resolves.toBe("LEGACY");
  });

  it("refuses an unknown ABI before event decoding", async () => {
    wasmHashMock.mockResolvedValueOnce("f".repeat(64));
    await expect(getEscrowAbi("CUNKNOWN")).rejects.toThrow(/unsupported escrow WASM/i);
  });
});
