import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { StellarError } from "@/lib/stellar";
import { buildCancel } from "@/server/services/tournaments";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  // 1. CSRF: same-origin only.
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  // 2. Auth: must be an authenticated ORGANIZER.
  // API routes return a JSON envelope instead of redirecting when unauthenticated.
  let user: { id: string; username: string; role: string };
  try {
    user = await requireUser("ORGANIZER", false);
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e;
  }

  const { id } = await ctx.params;

  // 3. Rate-limit per user.
  const rl = await rateLimit(`cancel:${user.id}`, { limit: 10, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  // 4. Delegate to service — builds the unsigned cancel XDR.
  try {
    const data = await buildCancel(id, user.id);
    return ok(data);
  } catch (e) {
    if (e instanceof StellarError) {
      return err("STELLAR_ERROR", e.message, 422);
    }
    const status = (e as { status?: number }).status;
    if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
    if (status === 403) return err("FORBIDDEN", (e as Error).message, 403);
    if (status === 409) return err("CONFLICT", (e as Error).message, 409);
    return err("INTERNAL_ERROR", "Could not build cancel transaction", 500);
  }
}
