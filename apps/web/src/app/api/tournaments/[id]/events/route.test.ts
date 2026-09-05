import { describe, it, expect, vi, beforeEach } from "vitest";

const { duplicate, subscribe, on, quit, unsubscribe, findMany } = vi.hoisted(() => {
  const subscribe = vi.fn(async () => {});
  const on = vi.fn();
  const quit = vi.fn(async () => {});
  const unsubscribe = vi.fn(async () => {});
  const findMany = vi.fn(async () => [
    { type: "REGISTERED", txHash: "tx-old", payload: { player: "GA", poolAfter: "10000000" } },
  ]);
  const duplicate = vi.fn(() => ({ subscribe, on, quit, unsubscribe }));
  return { duplicate, subscribe, on, quit, unsubscribe, findMany };
});

let messageHandler: ((channel: string, msg: string) => void) | undefined;
on.mockImplementation((evt: string, cb: (channel: string, msg: string) => void) => {
  if (evt === "message") messageHandler = cb;
});

vi.mock("@/lib/redis", () => ({ redis: { duplicate } }));
vi.mock("@/lib/db", () => ({
  prisma: {
    contractEvent: {
      findMany,
    },
  },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  messageHandler = undefined;
});

describe("GET /api/tournaments/[id]/events (SSE)", () => {
  it("streams replayed rows then live published messages as data frames", async () => {
    const req = new Request("http://x/api/tournaments/t1/events");
    const res = await GET(req, { params: Promise.resolve({ id: "t1" }) });
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // Drive the stream until the replay frame lands (start() runs on first read),
    // by which point the message handler is registered and subscribe() called.
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let frames = "";
    while (!frames.includes("tx-old")) {
      const { value, done } = await reader.read();
      if (done) break;
      frames += dec.decode(value);
    }
    expect(subscribe).toHaveBeenCalledWith("tournament:t1");

    // Live message → new data frame.
    messageHandler?.(
      "tournament:t1",
      JSON.stringify({ type: "FINALIZED", txHash: "tx-new", data: { first: "GA" } }),
    );
    while (!frames.includes("tx-new")) {
      const { value, done } = await reader.read();
      if (done) break;
      frames += dec.decode(value);
    }
    await reader.cancel();

    expect(frames).toContain("tx-old"); // replay
    expect(frames).toContain("tx-new"); // live
    expect(unsubscribe).toHaveBeenCalledWith("tournament:t1");
    expect(quit).toHaveBeenCalledOnce();
  });

  it("releases Redis when the request aborts", async () => {
    const abort = new AbortController();
    const res = await GET(
      new Request("http://x/api/tournaments/t1/events", { signal: abort.signal }),
      {
        params: Promise.resolve({ id: "t1" }),
      },
    );

    await res.body!.getReader().read();
    abort.abort();

    expect(unsubscribe).toHaveBeenCalledWith("tournament:t1");
    expect(quit).toHaveBeenCalledOnce();
  });

  it.each([
    ["replay", () => findMany.mockRejectedValueOnce(new Error("db unavailable"))],
    ["subscription", () => subscribe.mockRejectedValueOnce(new Error("redis unavailable"))],
  ])("releases Redis when %s setup fails", async (_step, fail) => {
    fail();
    const res = await GET(new Request("http://x/api/tournaments/t1/events"), {
      params: Promise.resolve({ id: "t1" }),
    });

    const reader = res.body!.getReader();
    await expect(
      (async () => {
        while (true) await reader.read();
      })(),
    ).rejects.toThrow();
    expect(unsubscribe).toHaveBeenCalledWith("tournament:t1");
    expect(quit).toHaveBeenCalledOnce();
  });
});
