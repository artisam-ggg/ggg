import { beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("posthog-js", () => ({ default: posthog }));

describe("PostHog initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("masks text and element attributes in session replays", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");

    await import("../instrumentation-client");

    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        mask_all_text: true,
        mask_all_element_attributes: true,
        session_recording: {
          maskAllElementAttributes: true,
          maskTextSelector: "*",
        },
      }),
    );
  });

  it("does not initialize PostHog without a project token", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");

    await import("../instrumentation-client");

    expect(posthog.init).not.toHaveBeenCalled();
  });
});
