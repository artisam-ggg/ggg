import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { StellarError } from "@/lib/stellar";
import { joinSchema } from "@/lib/validation/tournament";
import { buildRefundClaim } from "@/server/services/tournaments";

/** Build an unsigned claim for the named player; the contract always pays that player. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  const { id } = await ctx.params;
  const rl = await rateLimit(`refund:${id}`, { limit: 30, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_REQUEST", "Invalid request body", 400);
  }
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  try {
    return ok(await buildRefundClaim(id, parsed.data.playerAddress));
  } catch (e) {
    if (e instanceof StellarError) return err("STELLAR_ERROR", e.message, 422);
    const status = (e as { status?: number }).status;
    if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
    if (status === 409) return err("CONFLICT", (e as Error).message, 409);
    return err("INTERNAL_ERROR", "Could not build refund claim", 500);
  }
}
