import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TournamentListRow } from "./TournamentListRow";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("TournamentListRow", () => {
  it("shows name, status chip, mono pool and participant count, linking to detail", () => {
    render(
      <TournamentListRow
        t={{
          id: "t_1",
          name: "Cup",
          gameTitle: "SF6",
          status: "ACTIVE",
          displayStatus: "ACTIVE",
          asset: "XLM",
          entryFee: "10000000",
          pool: "30000000",
          participantCount: 3,
          refundClaimedCount: 0,
        }}
      />,
    );

    expect(screen.getByText("Cup")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    const pool = screen.getByText(/3\.0000000 XLM/);
    expect(pool).toHaveClass("data-mono");

    expect(screen.getByRole("link")).toHaveAttribute("href", "/tournaments/t_1");
  });

  it("does not contain a heading element inside the link", () => {
    render(
      <TournamentListRow
        t={{
          id: "t_1",
          name: "Cup",
          gameTitle: "SF6",
          status: "ACTIVE",
          displayStatus: "ACTIVE",
          asset: "XLM",
          entryFee: "10000000",
          pool: "30000000",
          participantCount: 3,
          refundClaimedCount: 0,
        }}
      />,
    );

    const link = screen.getByRole("link");
    expect(link.querySelector("h3")).toBeNull();
  });

  it("formats pool correctly for zero amount", () => {
    render(
      <TournamentListRow
        t={{
          id: "t_2",
          name: "Empty Cup",
          gameTitle: "SF6",
          status: "DRAFT",
          displayStatus: "DRAFT",
          asset: "USDC",
          entryFee: "0",
          pool: "0",
          participantCount: 0,
          refundClaimedCount: 0,
        }}
      />,
    );

    expect(screen.getByText(/0\.0000000 USDC/)).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
  });

  it("shows the game title with label-caps", () => {
    render(
      <TournamentListRow
        t={{
          id: "t_3",
          name: "Pro League",
          gameTitle: "Tekken 8",
          status: "FINISHED",
          displayStatus: "FINISHED",
          asset: "XLM",
          entryFee: "5000000",
          pool: "50000000",
          participantCount: 10,
          refundClaimedCount: 0,
        }}
      />,
    );

    const gameTitle = screen.getByText("Tekken 8");
    expect(gameTitle).toHaveClass("label-caps");
  });

  it("shows confirmed refund progress with the derived lifecycle label", () => {
    render(
      <TournamentListRow
        t={{
          id: "t_4",
          name: "Refund Cup",
          gameTitle: "SF6",
          status: "ACTIVE",
          displayStatus: "REFUNDS_OPEN",
          asset: "XLM",
          entryFee: "10000000",
          pool: "10000000",
          participantCount: 2,
          refundClaimedCount: 1,
        }}
      />,
    );

    expect(screen.getByText("REFUNDS OPEN")).toBeInTheDocument();
    expect(screen.getByLabelText("1 of 2 refunds claimed")).toHaveTextContent("1/2 refunds");
  });
});
