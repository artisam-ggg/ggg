"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Journey = "organizer" | "player" | "referee" | "refund";

type GuideContent = {
  title: string;
  steps: string[];
  guideUrl: string;
};

const guides: Record<Journey, GuideContent> = {
  organizer: {
    title: "Create a tournament",
    steps: [
      "Set the entry fee, referee wallet, deadline, and payout ranks.",
      "Connect Freighter and approve one deployment transaction.",
    ],
    guideUrl: "https://goodgameguild.gitbook.io/ggg/role-guides/organizer-guide",
  },
  player: {
    title: "Join a tournament",
    steps: [
      "Review the entry fee and deadline on the public tournament page.",
      "Connect Freighter, then approve the join transaction.",
    ],
    guideUrl: "https://goodgameguild.gitbook.io/ggg/role-guides/player-guide",
  },
  referee: {
    title: "Finalize payouts",
    steps: [
      "Verify the exact referee wallet selected by the organizer.",
      "Assign a distinct participant to each rank, then approve finalization.",
    ],
    guideUrl: "https://goodgameguild.gitbook.io/ggg/role-guides/referee-guide",
  },
  refund: {
    title: "Claim a refund",
    steps: [
      "Connect the wallet that joined the tournament.",
      "Submit once, then wait for the confirmed refund status.",
    ],
    guideUrl: "https://goodgameguild.gitbook.io/ggg/role-guides/player-guide",
  },
};

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function Guidelines({ journey }: { journey: Journey }) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const guide = guides[journey];

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;

    const elements = focusableElements(dialogRef.current);
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`Open ${journey} guidelines`}
        className="label-caps rounded-lg border-2 border-outline px-4 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
      >
        Guidelines
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={trapFocus}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-md"
          >
            <section
              data-testid="guidelines-panel"
              className="w-full max-w-[32rem] rounded-2xl bg-surface-container p-6 shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="label-caps text-electric-violet">Guidelines</p>
                  <h2 id={titleId} className="mt-2 text-2xl font-bold text-on-surface">
                    {guide.title}
                  </h2>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={close}
                  className="label-caps rounded-lg border-2 border-outline px-3 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
                >
                  Close
                </button>
              </div>

              <ol className="mt-5 list-decimal space-y-3 pl-5 text-on-surface-variant">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              <a
                href={guide.guideUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="label-caps mt-6 inline-block text-acid-yellow underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
              >
                Read the full guide
              </a>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
