import dotenv from "dotenv";
import { expect, afterEach } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

dotenv.config({ path: ".env" });

expect.extend(matchers);

// jsdom has no EventSource. Provide a no-op default so client components that
// open an SSE connection (e.g. via useTournamentEvents) render without crashing.
// Tests that exercise streaming behaviour override globalThis.EventSource with
// their own controllable fake.
if (typeof (globalThis as { EventSource?: unknown }).EventSource === "undefined") {
  class NoopEventSource {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    constructor(public url: string) {}
    close(): void {}
  }
  (globalThis as { EventSource?: unknown }).EventSource = NoopEventSource;
}

// Ensure DOM cleanup between tests
afterEach(() => {
  cleanup();
});
