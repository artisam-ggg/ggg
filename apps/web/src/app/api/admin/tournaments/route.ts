import { type NextRequest } from "next/server";
import { requireAdminApi, ok, err } from "../lib/guard";
import { adminListQuerySchema } from "@/lib/validation/admin";
import { listAllTournaments } from "@/server/services/admin";

export async function GET(req: NextRequest): Promise<Response> {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const q = adminListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) {
    return err("INVALID_REQUEST", q.error.issues[0]?.message ?? "Invalid query", 400);
  }

  return ok(await listAllTournaments(q.data));
}
