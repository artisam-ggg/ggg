import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSessionValid } from "@/lib/session-store";
import type { AppRole } from "../../types/next-auth";

export interface SessionUser {
  id: string;
  username: string;
  role: AppRole;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// Rank-based role hierarchy. Higher numbers grant more access.
export const ROLE_RANK: Record<AppRole, number> = {
  ADMIN: 2,
  ORGANIZER: 1,
};

// Returns true when `userRole` is at least `requiredRole`.
// ADMIN satisfies ORGANIZER; ORGANIZER does not satisfy ADMIN.
export function hasRole(userRole: AppRole, requiredRole: AppRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}

// Source of truth for "who is logged in" in handlers/server components.
// Verifies the cookie session AND that the sessionId is still in Redis.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = (await auth()) as { user?: SessionUser; sid?: string } | null;
  if (!session?.user || !session.sid) return null;
  if (!(await isSessionValid(session.user.id, session.sid))) return null;
  return session.user;
}

// Defense-in-depth authz (do NOT rely on proxy.ts alone). Redirects to /login
// when unauthenticated; throws AuthError(403) when the role is insufficient.
// Admins satisfy ORGANIZER requirements because of ROLE_RANK.
export async function requireUser(
  role?: AppRole,
  redirectOnUnauthenticated = true,
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    if (redirectOnUnauthenticated) redirect("/login");
    throw new AuthError("Authentication required", 401);
  }
  if (role && !hasRole(user.role, role)) {
    throw new AuthError("Forbidden", 403);
  }
  return user;
}
