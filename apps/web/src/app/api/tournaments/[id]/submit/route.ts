import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { StellarError } from "@/lib/stellar";
import { submitSchema } from "@/lib/validation/tournament";
import { submitTournamentTx } from "@/server/services/tournaments";
import { withIdempotency } from "@/server/services/idempotency";

type Ctx = { params: Promise<{ id: string }> };

function methodNotAllowed(): Response {
  return err("METHOD_NOT_ALLOWED", "Method not allowed", 405);
}
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const GET = methodNotAllowed;

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  // 1. CSRF: same-origin only.
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  // 2. Auth: must be an authenticated user. requireUser redirects (NEXT_REDIRECT)
  // when unauthenticated and throws AuthError(403) when wrong role.
  let user: { id: string; username: string; role: string };
  try {
    user = await requireUser(undefined, false);
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e; // re-throw NEXT_REDIRECT and any other non-auth errors
  }

  // 3. Idempotency key is required for all submit mutations.
  const idemKey = req.headers.get("idempotency-key");
  if (!idemKey) {
    return err("MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required", 400);
  }

  // 4. Rate-limit per user.
  const rl = await rateLimit(`submit:${user.id}`, { limit: 20, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  // 5. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_REQUEST", "Invalid request body", 400);
  }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // 6. Resolve route param (Next 16: params is a Promise).
  const { id } = await ctx.params;

  // 7. Submit with idempotency guarantee.
  try {
    const data = await withIdempotency(`${id}:${idemKey}`, () =>
      submitTournamentTx(id, parsed.data, user.id),
    );
    return ok(data);
  } catch (e) {
    if (e instanceof StellarError) {
      const stellarStatus =
        e.code === "TX_TIMEOUT"
          ? 504
          : e.code === "SUBMIT_FAILED"
            ? 503
            : e.code === "INVALID_INPUT" || e.code === "NETWORK_MISMATCH"
              ? 400
              : 422;
      const retryable = e.retryable ?? (e.code === "TX_TIMEOUT" || e.code === "SUBMIT_FAILED");
      return err(e.code, e.message, stellarStatus, {
        ...(e.txHash ? { txHash: e.txHash } : {}),
        retryable,
      });
    }
    if (e instanceof Error && "status" in e) {
      const status = (e as Error & { status: number }).status;
      const code =
        status === 404
          ? "NOT_FOUND"
          : status === 403
            ? "FORBIDDEN"
            : status === 409
              ? "CONFLICT"
              : status === 502
                ? "TX_FAILED"
                : "INTERNAL_ERROR";
      return err(code, e.message, status);
    }
    return err("INTERNAL_ERROR", "Submit failed", 500);
  }
}
