import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TournamentLifecycle } from "./TournamentLifecycle";

describe("TournamentLifecycle", () => {
  it.each([
    ["DRAFT", "DRAFT", "PENDING", false, "PREPARING", /deployment is not confirmed/i],
    [
      "ACTIVE",
      "ACTIVE",
      "CURRENT",
      false,
      "OPEN FOR JOINING",
      /configured referee wallet can finalize/i,
    ],
    [
      "ACTIVE",
      "REFUNDS_OPEN",
      "CURRENT",
      false,
      "REFUNDS AVAILABLE",
      /deadline passed without final results/i,
    ],
    [
      "CANCELLED",
      "REFUNDS_OPEN",
      "CURRENT",
      false,
      "REFUNDS AVAILABLE",
      /tournament was cancelled/i,
    ],
    [
      "CANCELLED",
      "REFUNDED",
      "CURRENT",
      false,
      "REFUNDS COMPLETE",
      /every registered player has a confirmed refund/i,
    ],
    ["FINISHED", "FINISHED", "CURRENT", true, "COMPLETED", /payouts are confirmed/i],
    [
      "FINISHED",
      "FINISHED",
      "CURRENT",
      false,
      "PAYOUT CONFIRMATION PENDING",
      /records are still syncing/i,
    ],
    ["ACTIVE", "ACTIVE", "UNAVAILABLE", false, "ACTIONS TEMPORARILY PAUSED", /refresh later/i],
    ["ACTIVE", "ACTIVE", "UNSUPPORTED", false, "READ-ONLY TOURNAMENT", /older contract version/i],
  ] as const)(
    "explains %s/%s as %s",
    (status, displayStatus, contractVersion, hasConfirmedPayouts, title, detail) => {
      render(
        <TournamentLifecycle
          status={status}
          displayStatus={displayStatus}
          contractVersion={contractVersion}
          hasConfirmedPayouts={hasConfirmedPayouts}
        />,
      );

      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByText(detail)).toHaveClass("text-xs", "text-on-surface-variant");
    },
  );
});
