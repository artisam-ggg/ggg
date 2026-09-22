import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { StellarError } from "@/lib/stellar";
import { EscrowSdkError } from "@ggg/escrow-sdk";
import { joinSchema } from "@/lib/validation/tournament";
import { buildJoin } from "@/server/services/tournaments";

// Public endpoint — no requireUser. The player authenticates by signing the
// returned XDR with their own wallet (Freighter). The signed XDR is later
// submitted to POST /api/tournaments/[id]/submit with intent "join".
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

  const { id } = await ctx.params;

  // 2. Rate-limit by tournament id (public endpoint, so key on resource not user).
  const rl = await rateLimit(`join:${id}`, { limit: 30, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  // 3. Parse + validate body.
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

  // 4. Delegate to service — builds the unsigned XDR.
  try {
    const data = await buildJoin(id, parsed.data.playerAddress);
    return ok(data);
  } catch (e) {
    if (e instanceof StellarError || e instanceof EscrowSdkError) {
      return err("STELLAR_ERROR", e.message, 422);
    }
    const status = (e as { status?: number }).status;
    if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
    if (status === 409) return err("CONFLICT", (e as Error).message, 409);
    return err("INTERNAL_ERROR", "Could not build join transaction", 500);
  }
}
