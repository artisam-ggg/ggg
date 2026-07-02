import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";

const { mockSignIn, mockPush, mockFetch } = vi.hoisted(() => {
  return {
    mockSignIn: vi.fn(),
    mockPush: vi.fn(),
    mockFetch: vi.fn(),
  };
});

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.ComponentPropsWithoutRef<"a"> & { children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.stubGlobal("fetch", mockFetch);

import LoginPage from "./page";

describe("/login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading, username + password inputs, and submit button", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sign in");
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("password field is type=password", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
  });

  it("shows a link to /register", () => {
    render(<LoginPage />);
    const link = screen.getByRole("link", { name: /register/i });
    expect(link).toHaveAttribute("href", "/register");
  });

  it("shows field-level validation error for short username without calling signIn", async () => {
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/username/i), "ab");
    await userEvent.type(screen.getByLabelText(/password/i), "validpassword123");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at least 3/i);
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows field-level validation error for short password without calling signIn", async () => {
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/username/i), "validuser");
    await userEvent.type(screen.getByLabelText(/password/i), "short");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at least 10/i);
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows generic auth error when signIn returns error, without leaking field info", async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin" });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "validuser");
    await userEvent.type(screen.getByLabelText(/password/i), "validpassword123");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid username or password/i);
    });
    expect(mockPush).not.toHaveBeenCalled();

    const alertText = screen.getByRole("alert").textContent ?? "";
    expect(alertText).not.toMatch(/incorrect password/i);
  });

  it("shows generic auth error when signIn returns ok:false with null error (!res?.ok branch)", async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: null });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "validuser");
    await userEvent.type(screen.getByLabelText(/password/i), "validpassword123");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid username or password/i);
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("calls signIn with correct credentials on valid form submit", async () => {
    mockSignIn.mockResolvedValueOnce({ ok: true, error: null });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("credentials", {
        username: "alice",
        password: "securepassword",
        redirect: false,
      });
    });
  });

  it("redirects to /tournaments on successful sign-in", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { role: "player" } }),
    });

    mockSignIn.mockResolvedValueOnce({ ok: true, error: null });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/tournaments");
    });
  });

  it("disables the submit button while pending", async () => {
    mockSignIn.mockImplementationOnce(() => new Promise(() => {}));

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    });
  });

  it("submit button has label-caps class", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /sign in/i })).toHaveClass("label-caps");
  });

  it("submit button has bg-primary class", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /sign in/i })).toHaveClass("bg-primary");
  });
});
