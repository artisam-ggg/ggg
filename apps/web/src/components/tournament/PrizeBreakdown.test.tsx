import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PrizeBreakdown } from "./PrizeBreakdown";

describe("PrizeBreakdown", () => {
  it("shows a one-winner distribution as exactly 100% and 10,000 BPS", () => {
    render(<PrizeBreakdown distributionBps={[10000]} asset="XLM" />);

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("10,000 BPS total (100%)")).toBeInTheDocument();
    expect(screen.getByText(/amounts appear when a prize pool is available/i)).toBeInTheDocument();
  });

  it("shows every rank and exact estimated amount for a 60/30/10 split", () => {
    render(<PrizeBreakdown distributionBps={[6000, 3000, 1000]} pool="30000000" asset="XLM" />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("60%")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("1.8000000 XLM")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("30%")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("0.9000000 XLM")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("10%")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("0.3000000 XLM")).toBeInTheDocument();
    expect(screen.getByText("Estimated from the current confirmed prize pool")).toBeInTheDocument();
  });

  it("supports all ten payout ranks", () => {
    render(
      <PrizeBreakdown
        distributionBps={[1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]}
        pool="100000000"
        asset="USDC"
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("Rank 10")).toBeInTheDocument();
    expect(screen.getAllByText("10%")).toHaveLength(10);
  });

  it("assigns integer division dust to rank one like the contract", () => {
    render(<PrizeBreakdown distributionBps={[3334, 3333, 3333]} pool="10" asset="XLM" />);

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("33.34%")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("33.33%")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("33.33%")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("0.0000004 XLM")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("0.0000003 XLM")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("0.0000003 XLM")).toBeInTheDocument();
  });

  it("uses confirmed payout amounts instead of client estimates", () => {
    render(
      <PrizeBreakdown
        distributionBps={[6000, 4000]}
        pool="999999999"
        asset="XLM"
        confirmedPayouts={[
          { rank: 1, amount: "7" },
          { rank: 2, amount: "3" },
        ]}
      />,
    );

    expect(screen.getByText("Confirmed on-chain payouts")).toBeInTheDocument();
    expect(screen.getByText("0.0000007 XLM")).toBeInTheDocument();
    expect(screen.getByText("0.0000003 XLM")).toBeInTheDocument();
    expect(screen.queryByText("59.9999999 XLM")).not.toBeInTheDocument();
  });

  it("labels an empty persisted payout list as syncing without showing estimates", () => {
    render(
      <PrizeBreakdown
        distributionBps={[6000, 3000, 1000]}
        pool="30000000"
        asset="XLM"
        confirmedPayouts={[]}
      />,
    );

    expect(screen.getByText("Payout confirmation is syncing")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting confirmation")).toHaveLength(3);
    expect(
      screen.queryByText("Estimated from the current confirmed prize pool"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("1.8000000 XLM")).not.toBeInTheDocument();
  });
});
