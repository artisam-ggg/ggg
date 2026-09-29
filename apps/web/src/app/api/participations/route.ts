import { type NextRequest } from "next/server";
import { err, ok } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { participationQuerySchema } from "@/lib/validation/tournament";
import { listPlayerParticipations } from "@/server/services/tournaments";

function methodNotAllowed(): Response {
  return err("METHOD_NOT_ALLOWED", "Method not allowed", 405);
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

function clientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const parsed = participationQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query", 400);
  }

  try {
    const [ipLimit, walletLimit] = await Promise.all([
      rateLimit(`participations:ip:${clientIp(req)}`, {
        limit: 30,
        windowSec: 60,
      }),
      rateLimit(`participations:wallet:${parsed.data.playerAddress}`, {
        limit: 30,
        windowSec: 60,
      }),
    ]);
    if (!ipLimit.ok || !walletLimit.ok) {
      return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);
    }

    return ok({ items: await listPlayerParticipations(parsed.data.playerAddress) });
  } catch {
    return err("INTERNAL_ERROR", "Participation status is temporarily unavailable", 503);
  }
}
