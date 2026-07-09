import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/api";
import { credentialsSchema } from "@/lib/auth-schemas";
import { hashPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: Request): Promise<Response> {
  // 1. CSRF: same-origin only.
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  // 2. Parse + validate (generic field-agnostic failure).
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_REQUEST", "Invalid request", 400);
  }
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) return err("INVALID_REQUEST", "Invalid username or password format", 400);
  const { username, password } = parsed.data;

  // 3. Rate-limit per-IP AND per-username.
  const ip = clientIp(req);
  let byIp: { ok: boolean; remaining: number } | undefined;
  let byUser: { ok: boolean; remaining: number } | undefined;

  try {
    byIp = await rateLimit(`register:ip:${ip}`, { limit: 5, windowSec: 3600 });
    byUser = await rateLimit(`register:user:${username}`, { limit: 3, windowSec: 3600 });
  } catch (error) {
    console.error("register rate-limit failed", error);
  }

  if (byIp && byUser && (!byIp.ok || !byUser.ok)) {
    return err("TOO_MANY_REQUESTS", "Too many attempts. Try again later.", 429);
  }

  // 4. Create the ORGANIZER. Rely on the unique constraint for dedupe → generic error.
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { username, passwordHash, role: "ORGANIZER" },
      select: { id: true, username: true },
    });
    return ok({ id: user.id, username: user.username }, 201);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return err("CONFLICT", "Could not create account", 409); // no enumeration
    }
    return err("INTERNAL_ERROR", "Could not create account", 500);
  }
}
