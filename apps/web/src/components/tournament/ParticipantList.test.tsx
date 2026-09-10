import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ParticipantList } from "./ParticipantList";

const participants = [
  {
    playerAddr: "GABCDE123456ABCDE123456ABCDE123456ABCDE123456ABCDE123456A",
    joinedAt: "2025-01-01T10:00:00.000Z",
  },
  {
    playerAddr: "GXYZ789XYZXYZ789XYZXYZ789XYZXYZ789XYZXYZ789XYZXYZ789XYZ7",
    joinedAt: "2025-01-01T11:30:00.000Z",
  },
];

describe("ParticipantList", () => {
  it("renders each participant's truncated address", () => {
    render(<ParticipantList participants={participants} />);
    // First address: slice(0,6)="GABCDE", slice(-6)="56A" → but address must be ≥12 chars
    expect(screen.getByText(/GABCDE/)).toBeInTheDocument();
    expect(screen.getByText(/GXYZ78/)).toBeInTheDocument();
  });

  it("renders participant addresses truncated with ellipsis", () => {
    render(<ParticipantList participants={participants} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    // Each item should contain truncated address with ellipsis
    expect(items[0]).toHaveTextContent("…");
  });

  it("renders join timestamps as <time> elements", () => {
    render(<ParticipantList participants={participants} />);
    const times = document.querySelectorAll("time");
    expect(times).toHaveLength(2);
    expect(times[0]).toHaveAttribute("dateTime", "2025-01-01T10:00:00.000Z");
    expect(times[1]).toHaveAttribute("dateTime", "2025-01-01T11:30:00.000Z");
  });

  it("shows timezone information and an exact UTC accessible timestamp", () => {
    render(<ParticipantList participants={participants} />);
    const time = document.querySelector("time");

    expect(time).toHaveAccessibleName("Joined at 2025-01-01T10:00:00.000Z UTC");
    expect(time).toHaveTextContent(
      new Date("2025-01-01T10:00:00.000Z").toLocaleTimeString(undefined, { timeZoneName: "short" }),
    );
  });

  it("shows a safe fallback for an invalid timestamp", () => {
    render(<ParticipantList participants={[{ ...participants[0]!, joinedAt: "not-a-date" }]} />);

    expect(screen.getByText("Time unavailable")).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAccessibleName("Registration time unavailable");
  });

  it("shows empty state message when no participants", () => {
    render(<ParticipantList participants={[]} />);
    expect(screen.getByText(/no players have joined yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("renders a semantic list", () => {
    render(<ParticipantList participants={participants} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });
});
