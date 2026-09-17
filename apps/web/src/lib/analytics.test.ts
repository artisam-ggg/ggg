import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  capture: vi.fn(),
  identify: vi.fn(),
  setPersonProperties: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: posthog }));

import { ANALYTICS_CONSENT_KEY, captureWalletConnected } from "./analytics";

describe("captureWalletConnected", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("captures the public address after accepted consent", () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");

    captureWalletConnected("GPLAYER");

    expect(posthog.capture).toHaveBeenCalledOnce();
    expect(posthog.capture).toHaveBeenCalledWith("wallet_connected", {
      wallet_address: "GPLAYER",
    });
    const properties = posthog.capture.mock.calls[0]?.[1];
    expect(properties).not.toHaveProperty("$set");
    expect(properties).not.toHaveProperty("$set_once");
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.setPersonProperties).not.toHaveBeenCalled();
  });

  it.each([null, "declined"])("does not capture with consent %s", (consent) => {
    if (consent) localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);

    captureWalletConnected("GPLAYER");

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("does not capture without a PostHog project token", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");

    captureWalletConnected("GPLAYER");

    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
