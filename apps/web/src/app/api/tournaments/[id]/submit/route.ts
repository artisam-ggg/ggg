import { type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { StellarError } from "@/lib/stellar";
import { EscrowSdkError } from "@ggg/escrow-sdk";
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

  // 2. Idempotency key is required for all submit mutations.
  const idemKey = req.headers.get("idempotency-key");
  if (!idemKey) {
    return err("MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required", 400);
  }

  // 3. Parse + validate body before deciding whether this intent needs an app session.
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

  // 4. A player authorizes a join with their wallet, not a GGG account.
  let userId: string | null = null;
  if (parsed.data.intent !== "join") {
    try {
      userId = (await requireUser(undefined, false)).id;
    } catch (e) {
      if (e instanceof AuthError) {
        const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
        return err(code, e.message, e.status);
      }
      throw e;
    }
  }

  // 5. Resolve route param (Next 16: params is a Promise).
  const { id } = await ctx.params;

  // 6. Public joins are limited per tournament and caller IP; other intents per user.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const limitKey = userId === null ? `submit:join:${id}:${ip}` : `submit:${userId}`;
  const rl = await rateLimit(limitKey, { limit: 20, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  // 7. Submit with idempotency guarantee.
  try {
    const data = await withIdempotency(
      parsed.data.intent === "join"
        ? `${id}:join:${createHash("sha256").update(parsed.data.signedXdr).digest("hex")}`
        : parsed.data.intent === "deploy"
          ? `${id}:${userId}:deploy`
          : `${id}:${userId}:${parsed.data.intent}:${idemKey}`,
      () => submitTournamentTx(id, parsed.data, userId),
    );
    return ok(data);
  } catch (e) {
    if (e instanceof EscrowSdkError) {
      const status =
        e.code === "TX_TIMEOUT"
          ? 504
          : e.code === "CONFIRMATION_FAILED"
            ? 503
            : e.code === "INVALID_INPUT" || e.code === "NETWORK_MISMATCH"
              ? 400
              : 422;
      return err(e.code, e.message, status, {
        ...(e.hash ? { txHash: e.hash } : {}),
        retryable: e.code === "TX_TIMEOUT" || e.code === "CONFIRMATION_FAILED",
      });
    }
    if (e instanceof StellarError) {
      const stellarStatus =
        e.code === "TX_TIMEOUT"
          ? 504
          : e.code === "SUBMIT_FAILED"
            ? 503
            : e.code === "INVALID_INPUT" ||
                e.code === "NETWORK_MISMATCH" ||
                e.code === "TX_MALFORMED" ||
                e.code === "TX_BAD_AUTH"
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
