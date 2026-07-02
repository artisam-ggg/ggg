import { type NextRequest } from "next/server";
import { requireAdminApi, withAdminMutation, ok, err } from "../../lib/guard";
import { adminUpdateUserSchema } from "@/lib/validation/admin";
import { getUserAdminDetail, updateUser, deleteUser } from "@/server/services/admin";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext): Promise<Response> {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const { id } = await params;
  const user = await getUserAdminDetail(id);
  if (!user) return err("NOT_FOUND", "User not found", 404);
  return ok(user);
}

export async function PATCH(req: NextRequest, { params }: RouteContext): Promise<Response> {
  return withAdminMutation(req, "admin:update_user", async (user) => {
    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return err("INVALID_REQUEST", "Invalid request body", 400);
    }

    const parsed = adminUpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      return err("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    try {
      const result = await updateUser(id, parsed.data, user);
      return ok(result);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
      if (status === 409) return err("CONFLICT", (e as Error).message, 409);
      return err("INTERNAL_ERROR", "Could not update user", 500);
    }
  });
}

export async function DELETE(req: NextRequest, { params }: RouteContext): Promise<Response> {
  return withAdminMutation(req, "admin:delete_user", async (user) => {
    const { id } = await params;

    try {
      await deleteUser(id, user.id);
      return ok({ deleted: true });
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return err("NOT_FOUND", (e as Error).message, 404);
      if (status === 409) return err("CONFLICT", (e as Error).message, 409);
      return err("INTERNAL_ERROR", "Could not delete user", 500);
    }
  });
}
