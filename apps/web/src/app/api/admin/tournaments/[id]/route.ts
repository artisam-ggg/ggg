import { type NextRequest } from "next/server";
import { requireAdminApi, withAdminMutation, ok, err } from "../../lib/guard";
import { adminUpdateTournamentSchema } from "@/lib/validation/admin";
import { getTournamentAdminDetail, updateTournament } from "@/server/services/admin";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext): Promise<Response> {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const { id } = await params;
  const tournament = await getTournamentAdminDetail(id);
  if (!tournament) return err("NOT_FOUND", "Tournament not found", 404);
  return ok(tournament);
}

export async function PATCH(req: NextRequest, { params }: RouteContext): Promise<Response> {
  return withAdminMutation(req, "admin:update_tournament", async (user) => {
    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return err("INVALID_REQUEST", "Invalid request body", 400);
    }

    const parsed = adminUpdateTournamentSchema.safeParse(body);
    if (!parsed.success) {
      return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    try {
      await updateTournament(id, parsed.data, user.id);
      return ok({ updated: true });
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
      if (status === 409) return err("CONFLICT", (e as Error).message, 409);
      return err("INTERNAL_ERROR", "Could not update tournament", 500);
    }
  });
}
