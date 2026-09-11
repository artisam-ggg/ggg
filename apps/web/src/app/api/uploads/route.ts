import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { uploadSchema } from "@/lib/validation/tournament";
import { createPresignedUpload } from "@/server/services/uploads";

export async function POST(req: NextRequest): Promise<Response> {
  // 1. CSRF: same-origin only.
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  // 2. Auth: any authenticated user may request an upload URL.
  // API routes return a JSON envelope instead of redirecting when unauthenticated.
  let user: { id: string; username: string; role: string };
  try {
    user = await requireUser(undefined, false);
  } catch (e) {
    if (e instanceof AuthError) {
      const code = e.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
      return err(code, e.message, e.status);
    }
    throw e;
  }

  // 3. Rate-limit per user.
  const rl = await rateLimit(`upload:${user.id}`, { limit: 20, windowSec: 60 });
  if (!rl.ok) return err("TOO_MANY_REQUESTS", "Too many requests. Try again later.", 429);

  // 4. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("INVALID_REQUEST", "Invalid request body", 400);
  }
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // 5. Generate presigned URL via service.
  try {
    const data = await createPresignedUpload(parsed.data.contentType, parsed.data.contentLength);
    return ok(data);
  } catch (e: unknown) {
    const error = e as { message?: string; status?: number };
    return err("UPLOAD_ERROR", error.message ?? "Upload failed", error.status ?? 500);
  }
}
