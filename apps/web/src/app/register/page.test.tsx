import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";

// Hoist mocks so they're available before module imports
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
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.stubGlobal("fetch", mockFetch);

import RegisterPage from "./page";

describe("/register page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading, username + password inputs, and submit button", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Create account");
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("password field is type=password", () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
  });

  it("shows a link to /login", () => {
    render(<RegisterPage />);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows field-level validation error for short username without calling fetch", async () => {
    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/username/i), "ab");
    await userEvent.type(screen.getByLabelText(/password/i), "validpassword123");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at least 3/i);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows field-level validation error for short password without calling fetch", async () => {
    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/username/i), "validuser");
    await userEvent.type(screen.getByLabelText(/password/i), "short");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at least 10/i);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs to /api/auth/register with correct JSON on valid submit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { id: "1", username: "alice" } }),
    });
    mockSignIn.mockResolvedValueOnce({ ok: true, error: null });

    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice", password: "securepassword" }),
      });
    });
  });

  it("auto-logins via signIn after successful registration", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { id: "1", username: "alice" } }),
    });
    mockSignIn.mockResolvedValueOnce({ ok: true, error: null });

    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("credentials", {
        username: "alice",
        password: "securepassword",
        redirect: false,
      });
    });
    // signIn called exactly once — not leaking credentials elsewhere
    expect(mockSignIn).toHaveBeenCalledOnce();
  });

  it("shows error when register API returns ok:false", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: "CONFLICT" }),
    });

    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not create account/i);
    });
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows conflict error when register API returns HTTP 200 with body {ok:false, error:'CONFLICT'}", async () => {
    // This exercises the normal conflict path: HTTP 200 but body ok:false (username taken)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: "CONFLICT" }),
    });

    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not create account/i);
    });
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("redirects to /tournaments on successful register + auto-login", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { id: "1", username: "alice" } }),
    });
    mockSignIn.mockResolvedValueOnce({ ok: true, error: null });

    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/tournaments");
    });
  });

  it("redirects to /login when registration succeeds but auto-login fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, data: { id: "1", username: "alice" } }),
    });
    mockSignIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin" });

    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("disables the submit button while pending", async () => {
    // Never resolves — keeps the button disabled
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "securepassword");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /creating account/i })).toBeDisabled();
    });
  });

  it("submit button has label-caps class", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("button", { name: /create account/i })).toHaveClass("label-caps");
  });

  it("submit button has bg-primary class", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("button", { name: /create account/i })).toHaveClass("bg-primary");
  });
});
