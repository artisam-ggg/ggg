import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError, type SessionUser } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Lightweight admin auth check for GET handlers. Returns a Response on failure
 * (403/401) or undefined on success. Throws NEXT_REDIRECT for unauthenticated
 * callers so Next.js can handle the redirect.
 */
export async function requireAdminApi(): Promise<Response | undefined> {
  try {
    await requireUser("ADMIN");
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e;
  }
}

/**
 * Wrapper for admin mutation handlers. Enforces CSRF, admin auth, and rate
 * limiting, then calls the handler with the authenticated admin user.
 */
export async function withAdminMutation(
  req: NextRequest,
  rateLimitKey: string,
  handler: (user: SessionUser) => Promise<Response>,
): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  let user: SessionUser;
  try {
    user = await requireUser("ADMIN");
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e;
  }

  const rl = await rateLimit(`${rateLimitKey}:${user.id}`, { limit: 20, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  return handler(user);
}

// Re-export ok/err so admin routes can import everything from one place.
export { ok, err };
export { AuthError };
export type { SessionUser };
