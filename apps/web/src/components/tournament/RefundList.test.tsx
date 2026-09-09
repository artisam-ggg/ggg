import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RefundList } from "./RefundList";

describe("RefundList", () => {
  it("shows a confirmed claim instead of offering the player another refund", () => {
    render(
      <RefundList
        participants={[
          { playerAddr: "GPLAYER000001", joinedAt: "2026-09-09T00:00:00.000Z" },
          { playerAddr: "GPLAYER000002", joinedAt: "2026-09-09T00:00:00.000Z" },
        ]}
        entryFee="10000000"
        asset="XLM"
        claimedPlayers={["GPLAYER000001"]}
      />,
    );

    expect(screen.getByText("Claimed")).toBeInTheDocument();
    expect(screen.getByText("1.0000000 XLM")).toBeInTheDocument();
  });
});
