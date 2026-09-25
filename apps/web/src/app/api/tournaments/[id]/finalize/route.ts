import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { StellarError } from "@/lib/stellar";
import { EscrowSdkError } from "@goodgameguild/escrow-sdk";
import { finalizeSchema, stellarPublicKey } from "@/lib/validation/tournament";
import { buildFinalize } from "@/server/services/tournaments";

// Referee-gated endpoint — no session auth required. The caller identifies
// their connected wallet via the x-wallet-address header; the service verifies
// it matches tournament.refereeAddr. The contract independently enforces
// require_auth(referee) when the signed XDR is submitted on-chain.
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

  // 2. Rate-limit by tournament id.
  const rl = await rateLimit(`finalize:${id}`, { limit: 10, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  // 3. Extract and validate caller's wallet address from header.
  const walletParsed = stellarPublicKey.safeParse(req.headers.get("x-wallet-address"));
  if (!walletParsed.success) {
    return err(
      "INVALID_REQUEST",
      "Valid connected wallet address required (x-wallet-address)",
      400,
    );
  }

  // 4. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_REQUEST", "Invalid request body", 400);
  }
  const parsed = finalizeSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // 5. Delegate to service — builds the unsigned XDR.
  try {
    const data = await buildFinalize(id, parsed.data, walletParsed.data);
    return ok(data);
  } catch (e) {
    if (e instanceof StellarError || e instanceof EscrowSdkError) {
      return err("STELLAR_ERROR", e.message, 422);
    }
    const status = (e as { status?: number }).status;
    if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
    if (status === 403) return err("FORBIDDEN", (e as Error).message, 403);
    if (status === 409) return err("CONFLICT", (e as Error).message, 409);
    if (status === 422) return err("UNREGISTERED_WINNER", (e as Error).message, 422);
    return err("INTERNAL_ERROR", "Could not build finalize transaction", 500);
  }
}
