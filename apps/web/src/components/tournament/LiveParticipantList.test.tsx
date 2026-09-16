import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LiveParticipantList } from "./LiveParticipantList";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {}

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
});

describe("LiveParticipantList", () => {
  it("adds confirmed registrations and deduplicates the server roster", () => {
    const existing = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const joined = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

    render(
      <LiveParticipantList
        tournamentId="t_1"
        participants={[{ playerAddr: existing, joinedAt: "2026-09-16T00:00:00.000Z" }]}
      />,
    );

    act(() => {
      FakeEventSource.instances[0]!.emit({
        type: "REGISTERED",
        txHash: "tx-existing",
        data: { player: existing, poolAfter: "10000000" },
      });
      FakeEventSource.instances[0]!.emit({
        type: "REGISTERED",
        txHash: "tx-new",
        data: { player: joined, poolAfter: "20000000" },
      });
    });

    expect(screen.getAllByTestId("participant-row")).toHaveLength(2);
    expect(screen.getByText("GBBBBB…BBBBBB")).toBeInTheDocument();
  });
});
