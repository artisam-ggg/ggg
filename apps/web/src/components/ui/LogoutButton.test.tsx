import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogoutButton } from "./LogoutButton";

const { mockSignOut, mockReset, mockReplace, mockRefresh } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue(undefined),
  mockReset: vi.fn(),
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ signOut: mockSignOut }));
vi.mock("posthog-js", () => ({ default: { reset: mockReset } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

describe("LogoutButton", () => {
  it("clears the analytics identity after signing out", async () => {
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => expect(mockReset).toHaveBeenCalledOnce());
    expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
    expect(mockReplace).toHaveBeenCalledWith("/login");
    expect(mockRefresh).toHaveBeenCalledOnce();
  });
});
