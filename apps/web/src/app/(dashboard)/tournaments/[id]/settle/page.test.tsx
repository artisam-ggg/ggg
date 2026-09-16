import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { requireUser, getTournamentDetail, notFound } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getTournamentDetail: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/auth-guards", () => ({ requireUser }));
vi.mock("@/server/services/tournaments", () => ({ getTournamentDetail }));
vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({ back: vi.fn() }),
}));
vi.mock("@/lib/env", () => ({ env: { NETWORK_PASSPHRASE: "P" } }));
vi.mock("@/components/settlement/SettlementConsole", () => ({
  SettlementConsole: () => <div>Settlement console</div>,
}));

import SettlePage from "./page";

describe("SettlePage", () => {
  it("links Back to the tournament detail page", async () => {
    getTournamentDetail.mockResolvedValue({
      id: "t_1",
      status: "ACTIVE",
      refereeAddr: "GREF",
      participants: [],
    });

    render(await SettlePage({ params: Promise.resolve({ id: "t_1" }) }));

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/tournaments/t_1");
  });
});
