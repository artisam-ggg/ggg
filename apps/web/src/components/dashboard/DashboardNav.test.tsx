import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const { mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth-guards", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/components/ui/LogoutButton", () => ({
  LogoutButton: () => <button data-testid="logout-button">Logout</button>,
}));

import { DashboardNav } from "./DashboardNav";

describe("DashboardNav", () => {
  it("renders Admin and Tournaments links for ADMIN", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", username: "admin", role: "ADMIN" });

    render(await DashboardNav());

    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tournaments" })).toBeInTheDocument();
    expect(screen.getByTestId("logout-button")).toBeInTheDocument();
  });

  it("renders only Tournaments link for ORGANIZER", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u2", username: "org", role: "ORGANIZER" });

    render(await DashboardNav());

    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tournaments" })).toBeInTheDocument();
  });

  it("renders nothing when user is null", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const { container } = render(await DashboardNav());
    expect(container.firstChild).toBeNull();
  });
});
