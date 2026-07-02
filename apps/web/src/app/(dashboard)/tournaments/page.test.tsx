import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Hoist mocks so they're available before module imports
const { mockRequireUser, mockListTournaments } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockListTournaments: vi.fn(),
}));

vi.mock("@/lib/auth-guards", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("@/server/services/tournaments", () => ({
  listTournaments: mockListTournaments,
}));

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

vi.mock("@/components/ui/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-button">Logout</button>,
}));

import TournamentsPage from "./page";

const FAKE_USER = { id: "user_1", username: "alice", role: "ORGANIZER" as const };

const SAMPLE_ITEMS = [
  {
    id: "t_1",
    name: "Summer Cup",
    gameTitle: "SF6",
    status: "ACTIVE" as const,
    asset: "XLM" as const,
    entryFee: "10000000",
    pool: "30000000",
    participantCount: 3,
  },
  {
    id: "t_2",
    name: "Winter League",
    gameTitle: "Tekken 8",
    status: "DRAFT" as const,
    asset: "USDC" as const,
    entryFee: "5000000",
    pool: "0",
    participantCount: 0,
  },
];

describe("/tournaments page", () => {
  it("lists tournament names and renders a StatusChip per row", async () => {
    mockRequireUser.mockResolvedValue(FAKE_USER);
    mockListTournaments.mockResolvedValue({ items: SAMPLE_ITEMS, nextCursor: null });

    render(await TournamentsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Summer Cup")).toBeInTheDocument();
    expect(screen.getByText("Winter League")).toBeInTheDocument();

    // StatusChip renders the status text
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
  });

  it("shows pool amount and participant count for each row", async () => {
    mockRequireUser.mockResolvedValue(FAKE_USER);
    mockListTournaments.mockResolvedValue({ items: SAMPLE_ITEMS, nextCursor: null });

    render(await TournamentsPage({ searchParams: Promise.resolve({}) }));

    // pool formatted from stroops
    expect(screen.getByText(/3\.0000000 XLM/)).toBeInTheDocument();
    // participant counts
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders a link to the detail page for each tournament", async () => {
    mockRequireUser.mockResolvedValue(FAKE_USER);
    mockListTournaments.mockResolvedValue({ items: SAMPLE_ITEMS, nextCursor: null });

    render(await TournamentsPage({ searchParams: Promise.resolve({}) }));

    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/tournaments/t_1");
    expect(hrefs).toContain("/tournaments/t_2");
  });

  it("renders the Create Tournament CTA linking to /tournaments/new", async () => {
    mockRequireUser.mockResolvedValue(FAKE_USER);
    mockListTournaments.mockResolvedValue({ items: SAMPLE_ITEMS, nextCursor: null });

    render(await TournamentsPage({ searchParams: Promise.resolve({}) }));

    const cta = screen.getByRole("link", { name: /new tournament/i });
    expect(cta).toHaveAttribute("href", "/tournaments/new");
  });

  it("shows the empty state with Create CTA when items is empty", async () => {
    mockRequireUser.mockResolvedValue(FAKE_USER);
    mockListTournaments.mockResolvedValue({ items: [], nextCursor: null });

    render(await TournamentsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no tournaments yet/i)).toBeInTheDocument();

    const createLinks = screen.getAllByRole("link", { name: /create your first tournament/i });
    expect(createLinks.length).toBeGreaterThan(0);
    expect(createLinks[0]).toHaveAttribute("href", "/tournaments/new");
  });

  it("shows a pagination link when nextCursor is present", async () => {
    mockRequireUser.mockResolvedValue(FAKE_USER);
    mockListTournaments.mockResolvedValue({
      items: SAMPLE_ITEMS,
      nextCursor: "cursor_abc",
    });

    render(await TournamentsPage({ searchParams: Promise.resolve({}) }));

    const loadMore = screen.getByRole("link", { name: /load more/i });
    expect(loadMore).toHaveAttribute("href", expect.stringContaining("cursor=cursor_abc"));
  });

  it("does not show pagination when nextCursor is null", async () => {
    mockRequireUser.mockResolvedValue(FAKE_USER);
    mockListTournaments.mockResolvedValue({ items: SAMPLE_ITEMS, nextCursor: null });

    render(await TournamentsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByRole("link", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("has a single h1 heading", async () => {
    mockRequireUser.mockResolvedValue(FAKE_USER);
    mockListTournaments.mockResolvedValue({ items: SAMPLE_ITEMS, nextCursor: null });

    render(await TournamentsPage({ searchParams: Promise.resolve({}) }));

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Tournaments");
  });

  it("calls listTournaments with the session user id", async () => {
    mockRequireUser.mockResolvedValue(FAKE_USER);
    mockListTournaments.mockResolvedValue({ items: [], nextCursor: null });

    render(await TournamentsPage({ searchParams: Promise.resolve({}) }));

    expect(mockListTournaments).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ take: 20 }),
    );
  });
});
