"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { credentialsSchema } from "@/lib/auth-schemas";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((data) => setCsrfToken(data.csrfToken))
      .catch(() => console.error("Failed to fetch CSRF token"));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
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
      // POST to register API (same-origin browser fetch — no extra headers needed)
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: parsed.data.username,
          password: parsed.data.password,
          csrfToken,
        }),
      });

      const json = res.ok
        ? ((await res.json()) as { ok: boolean; error?: string })
        : { ok: false as const };

      if (!json.ok) {
        setFormError("Could not create account. Please try a different username.");
        return;
      }

      // Auto-login after successful registration
      const signInRes = await signIn("credentials", {
        username: parsed.data.username,
        password: parsed.data.password,
        redirect: false,
      });

      if (signInRes?.error || !signInRes?.ok) {
        // Registration succeeded but auto-login failed — send to login page
        router.push("/login");
        return;
      }

      router.push("/tournaments");
    } catch (err) {
      console.error(err);
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="kinetic-glass block w-full max-w-[384px] rounded-xl p-8 shadow-2xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Create account</h1>
        <p className="label-caps mt-1 text-on-surface-variant">Good Game Guild</p>

        <form noValidate onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6 w-full">
          {formError && (
            <p
              id="form-error"
              role="alert"
              className="rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container w-full"
            >
              {formError}
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
              autoComplete="new-password"
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
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-on-surface-variant w-full">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
