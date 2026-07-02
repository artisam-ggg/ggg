"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/generated/prisma/enums";
import { useAdminAction, parseAdminResponse } from "./use-admin-action";

interface UserRoleFormProps {
  userId: string;
  currentRole: Role;
  disabled?: boolean;
}

export function UserRoleForm({ userId, currentRole, disabled }: UserRoleFormProps) {
  const [role, setRole] = useState<Role>(currentRole);
  const router = useRouter();
  const { status, error, execute } = useAdminAction<void>();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (role === currentRole) return;

    await execute(async () => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await parseAdminResponse(res);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="role" className="label-caps text-on-surface-variant">
        Role
      </label>
      <div className="flex items-center gap-3">
        <select
          id="role"
          value={role}
          disabled={disabled || status === "loading"}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-lg border border-surface-variant bg-surface-container px-3 py-2 text-on-surface disabled:opacity-60"
        >
          <option value="ORGANIZER">Organizer</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button
          type="submit"
          disabled={disabled || role === currentRole || status === "loading"}
          className="label-caps rounded-lg bg-primary px-4 py-2 text-on-primary disabled:opacity-60"
        >
          {status === "loading" ? "Saving…" : "Update"}
        </button>
      </div>
      {disabled && (
        <p className="text-sm text-on-surface-variant">You cannot change your own role.</p>
      )}
      {error && <p className="text-sm text-error">{error}</p>}
      {status === "success" && <p className="text-sm text-success">Role updated.</p>}
    </form>
  );
}
