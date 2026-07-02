import { requireAdminApi, ok } from "../lib/guard";
import { getAdminOverview } from "@/server/services/admin";

export async function GET(): Promise<Response> {
  const authError = await requireAdminApi();
  if (authError) return authError;

  return ok(await getAdminOverview());
}
