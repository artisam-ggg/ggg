import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Hoist mocks so they're available before module imports
const { mockRequireUser, mockGetAdminOverview } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockGetAdminOverview: vi.fn(),
}));

vi.mock("@/lib/auth-guards", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("@/server/services/admin", () => ({
  getAdminOverview: mockGetAdminOverview,
}));

import AdminPage from "./page";

const ADMIN_USER = { id: "u_admin", username: "superadmin", role: "ADMIN" as const };

const SAMPLE_OVERVIEW = {
  userCount: 3,
  tournamentCount: 5,
  byStatus: { DRAFT: 1, ACTIVE: 2, FINISHED: 0, CANCELLED: 0 },
  users: [
    { id: "u1", username: "superadmin", role: "ADMIN", createdAt: new Date(0).toISOString() },
    { id: "u2", username: "alice", role: "ORGANIZER", createdAt: new Date(1000).toISOString() },
  ],
};

describe("/admin page", () => {
  it("calls requireUser with ADMIN role (gate check)", async () => {
    mockRequireUser.mockResolvedValue(ADMIN_USER);
    mockGetAdminOverview.mockResolvedValue(SAMPLE_OVERVIEW);

    render(await AdminPage());

    expect(mockRequireUser).toHaveBeenCalledWith("ADMIN");
  });

  it("propagates error thrown by requireUser for non-ADMIN", async () => {
    // requireUser throws AuthError(403) for non-ADMIN; simulate with a plain error
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    mockRequireUser.mockRejectedValue(err);

    await expect(AdminPage()).rejects.toThrow("Forbidden");
  });

  it("renders admin page heading", async () => {
    mockRequireUser.mockResolvedValue(ADMIN_USER);
    mockGetAdminOverview.mockResolvedValue(SAMPLE_OVERVIEW);

    render(await AdminPage());

    expect(screen.getByRole("heading", { level: 1, name: "Admin" })).toBeInTheDocument();
  });

  it("renders userCount stat", async () => {
    mockRequireUser.mockResolvedValue(ADMIN_USER);
    mockGetAdminOverview.mockResolvedValue(SAMPLE_OVERVIEW);

    render(await AdminPage());

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders tournament status counts", async () => {
    mockRequireUser.mockResolvedValue(ADMIN_USER);
    mockGetAdminOverview.mockResolvedValue(SAMPLE_OVERVIEW);

    render(await AdminPage());

    // Status labels
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("FINISHED")).toBeInTheDocument();
    expect(screen.getByText("CANCELLED")).toBeInTheDocument();
  });

  it("renders each user's username and role", async () => {
    mockRequireUser.mockResolvedValue(ADMIN_USER);
    mockGetAdminOverview.mockResolvedValue(SAMPLE_OVERVIEW);

    render(await AdminPage());

    expect(screen.getByText("superadmin")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    // Roles — ADMIN appears twice (header label + user row); just check presence
    expect(screen.getAllByText("ADMIN").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ORGANIZER")).toBeInTheDocument();
  });

  it("does NOT expose passwordHash anywhere in the rendered output", async () => {
    mockRequireUser.mockResolvedValue(ADMIN_USER);
    mockGetAdminOverview.mockResolvedValue(SAMPLE_OVERVIEW);

    render(await AdminPage());

    expect(screen.queryByText(/passwordHash/i)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("passwordHash");
  });

  it("has exactly one h1 heading (a11y)", async () => {
    mockRequireUser.mockResolvedValue(ADMIN_USER);
    mockGetAdminOverview.mockResolvedValue(SAMPLE_OVERVIEW);

    render(await AdminPage());

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
