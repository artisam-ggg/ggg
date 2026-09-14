import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { StellarError } from "@/lib/stellar";
import { createTournamentSchema, listQuerySchema } from "@/lib/validation/tournament";
import { createTournament, listTournaments } from "@/server/services/tournaments";

function methodNotAllowed(): Response {
  return err("METHOD_NOT_ALLOWED", "Method not allowed", 405);
}
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;

export async function GET(req: NextRequest): Promise<Response> {
  // Auth: owner-scoped — must be an authenticated ORGANIZER.
  let user: { id: string; username: string; role: string };
  try {
    user = await requireUser("ORGANIZER", false);
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e; // re-throw NEXT_REDIRECT and any other non-auth errors
  }

  // Parse + validate query params.
  const q = listQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) {
    return err("INVALID_REQUEST", q.error.issues[0]?.message ?? "Invalid query", 400);
  }

  return ok(await listTournaments(user.id, q.data));
}

export async function POST(req: NextRequest): Promise<Response> {
  // 1. CSRF: same-origin only.
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  // 2. Auth: must be an authenticated ORGANIZER.
  // requireUser redirects (NEXT_REDIRECT) when unauthenticated, throws AuthError(403) when wrong role.
  let user: { id: string; username: string; role: string };
  try {
    user = await requireUser("ORGANIZER", false);
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e; // re-throw NEXT_REDIRECT and any other non-auth errors
  }

  // 3. Rate-limit per user.
  const rl = await rateLimit(`create_tournament:${user.id}`, { limit: 10, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  // 4. Parse + validate.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_REQUEST", "Invalid request body", 400);
  }
  const parsed = createTournamentSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // 5. Delegate to service.
  let data: { tournamentId: string; unsignedXdr: string; network: string };
  try {
    data = await createTournament(parsed.data, user.id);
  } catch (e) {
    if (e instanceof StellarError) {
      return err("STELLAR_ERROR", e.message, 422);
    }
    return err("INTERNAL_ERROR", "Could not create tournament", 500);
  }

  // 6. Return the created tournament envelope.
  return ok(
    {
      tournamentId: data.tournamentId,
      unsignedXdr: data.unsignedXdr,
      network: data.network,
    },
    201,
  );
}
