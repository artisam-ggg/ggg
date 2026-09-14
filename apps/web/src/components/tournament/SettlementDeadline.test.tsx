import { render, screen } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SettlementDeadline } from "./SettlementDeadline";

afterEach(() => vi.unstubAllEnvs());

it("keeps exact UTC in server HTML and converts across a local date boundary", () => {
  const seconds = Date.parse("2026-01-01T00:30:00.000Z") / 1000;
  const html = renderToString(<SettlementDeadline seconds={seconds} />);
  expect(html).toContain("2026-01-01T00:30:00.000Z");
  expect(html).not.toContain("Your local time");

  vi.stubEnv("TZ", "America/Los_Angeles");
  render(<SettlementDeadline seconds={seconds} />);
  expect(screen.getByText(/Your local time:/).parentElement).toHaveTextContent(
    "Dec 31, 2025, 4:30 PM PST",
  );
});

it("uses the viewer's daylight-saving offset", () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  const seconds = Date.parse("2026-07-01T00:30:00.000Z") / 1000;
  render(<SettlementDeadline seconds={seconds} />);
  expect(screen.getByText(/Your local time:/).parentElement).toHaveTextContent(
    "Jun 30, 2026, 5:30 PM PDT",
  );
});

it("hydrates UTC-only server HTML without a timezone mismatch", async () => {
  const seconds = Date.parse("2026-01-01T00:30:00.000Z") / 1000;
  const container = document.createElement("div");
  vi.stubEnv("TZ", "UTC");
  container.innerHTML = renderToString(<SettlementDeadline seconds={seconds} />);
  document.body.appendChild(container);
  vi.stubEnv("TZ", "America/Los_Angeles");
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  let root: ReturnType<typeof hydrateRoot> | undefined;

  try {
    await act(async () => {
      root = hydrateRoot(container, <SettlementDeadline seconds={seconds} />);
    });
    expect(container).toHaveTextContent("2026-01-01T00:30:00.000Z");
    expect(container).toHaveTextContent("Dec 31, 2025, 4:30 PM PST");
    expect(errors).not.toHaveBeenCalled();
  } finally {
    await act(async () => root?.unmount());
    errors.mockRestore();
    container.remove();
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", false);
  }
});
