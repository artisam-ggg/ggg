import { type NextRequest } from "next/server";
import { ok, err } from "@/lib/api";
import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { uploadFileSchema } from "@/lib/validation/tournament";
import { CoverImageValidationError, uploadCoverImage } from "@/server/services/uploads";

export async function POST(req: NextRequest): Promise<Response> {
  // 1. CSRF: same-origin only.
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError) return err("CSRF_VIOLATION", "Cross-origin request rejected", 403);
    throw e;
  }

  // 2. Auth: any authenticated user may upload a cover image.
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

  // 4. Validate bytes before storage. Presigned direct uploads cannot enforce this.
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return err("INVALID_REQUEST", "Invalid upload request", 400);
  }
  const parsed = uploadFileSchema.safeParse(file);
  if (!parsed.success) return err("INVALID_REQUEST", "An image file is required", 400);

  try {
    const data = await uploadCoverImage(parsed.data);
    return ok(data);
  } catch (e: unknown) {
    if (e instanceof CoverImageValidationError) return err("INVALID_REQUEST", e.message, e.status);
    return err("UPLOAD_ERROR", "Cover image upload failed. Try again later.", 500);
  }
}
