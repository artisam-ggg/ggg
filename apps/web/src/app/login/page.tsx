"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { credentialsSchema } from "@/lib/auth-schemas";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError(null);
    setFieldErrors({});

    // Client-side validation via shared schema
    const parsed = credentialsSchema.safeParse({ username, password });
    if (!parsed.success) {
      const errs: { username?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as "username" | "password";
        if (!errs[field]) errs[field] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setPending(true);
    try {
      const res = await signIn("credentials", {
        username: parsed.data.username,
        password: parsed.data.password,
        redirect: false,
      });

      if (res?.error || !res?.ok) {
        setAuthError("Invalid username or password.");
        return;
      }

      try {
        const meRes = await fetch("/api/auth/me");
        const me = (await meRes.json()) as { ok: boolean; data?: { role: string } };
        const destination = me.ok && me.data?.role === "ADMIN" ? "/admin" : "/tournaments";
        router.push(destination);
      } catch {
        setAuthError("Could not determine your role. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      {/* FIX: Swapped 'max-w-sm' to 'max-w-[384px]' to avoid the Tailwind v4 token clash.
        You can also safely use your beautiful custom '.kinetic-glass' class here again!
      */}
      <div className="kinetic-glass block w-full max-w-[384px] rounded-xl p-8 shadow-2xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Sign in</h1>
        <p className="label-caps mt-1 text-on-surface-variant">Good Game Guild</p>

        <form noValidate onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6 w-full">
          {authError && (
            <p
              id="auth-error"
              role="alert"
              className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container w-full"
            >
              {authError}
            </p>
          )}

          <div className="flex flex-col gap-1.5 w-full">
            <label htmlFor="username" className="label-caps text-on-surface-variant">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-describedby={fieldErrors.username ? "username-error" : undefined}
              aria-invalid={!!fieldErrors.username}
              className="data-mono w-full rounded-lg border border-surface-variant bg-surface-container px-4 py-2.5 text-on-surface placeholder-on-surface-variant outline-none transition focus:border-primary focus:ring-2 focus:ring-primary focus:scale-[1.01]"
              placeholder="your_handle"
            />
            {fieldErrors.username && (
              <p id="username-error" role="alert" className="text-xs text-error">
                {fieldErrors.username}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <label htmlFor="password" className="label-caps text-on-surface-variant">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              aria-invalid={!!fieldErrors.password}
              className="data-mono w-full rounded-lg border border-surface-variant bg-surface-container px-4 py-2.5 text-on-surface placeholder-on-surface-variant outline-none transition focus:border-primary focus:ring-2 focus:ring-primary focus:scale-[1.01]"
              placeholder="••••••••••"
            />
            {fieldErrors.password && (
              <p id="password-error" role="alert" className="text-xs text-error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="label-caps w-full mt-2 rounded-lg bg-primary px-6 py-3 text-on-primary font-bold transition hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-on-surface-variant w-full">
          No account?{" "}
          <Link
            href="/register"
            className="text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
