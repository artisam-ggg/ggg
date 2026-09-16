"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import posthog from "posthog-js";

const CONSENT_KEY = "ggg_cookie_consent";

export function AnalyticsConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent === "accepted") {
      if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
      return;
    }

    if (consent === "declined") {
      if (!posthog.has_opted_out_capturing()) posthog.opt_out_capturing();
      return;
    }

    const timer = window.setTimeout(() => setShow(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function choose(consented: boolean) {
    localStorage.setItem(CONSENT_KEY, consented ? "accepted" : "declined");
    if (consented) posthog.opt_in_capturing();
    else posthog.opt_out_capturing();
    setShow(false);
  }

  if (!show) return null;

  return (
    <aside
      aria-label="Analytics consent"
      className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[576px] -translate-x-1/2 rounded-xl border border-surface-variant bg-surface-container p-5 shadow-2xl"
    >
      <p className="font-semibold text-on-surface">Help us improve GGG</p>
      <p className="mt-1 text-sm text-on-surface-variant">
        We use optional product analytics and session replay to understand how GGG is used.
        Sensitive form text is masked, and nothing is collected unless you accept. Read our{" "}
        <Link href="/privacy" className="text-primary underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => choose(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
        >
          Accept analytics
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          className="rounded-lg border border-surface-variant px-4 py-2 text-sm font-semibold text-on-surface"
        >
          Decline
        </button>
      </div>
    </aside>
  );
}
