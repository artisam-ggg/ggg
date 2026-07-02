"use client";

import { useRouter } from "next/navigation";
import { useAdminAction, parseAdminResponse } from "./use-admin-action";

interface DeleteUserButtonProps {
  userId: string;
  username: string;
  disabled?: boolean;
}

export function DeleteUserButton({ userId, username, disabled }: DeleteUserButtonProps) {
  const router = useRouter();
  const { status, error, execute } = useAdminAction<void>();

  async function handleDelete() {
    if (!confirm(`Delete user ${username}? This cannot be undone.`)) return;

    await execute(async () => {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      await parseAdminResponse(res);
      router.push("/admin/users");
    });
  }

  if (disabled) {
    return <p className="text-sm text-on-surface-variant">You cannot delete your own account.</p>;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={status === "loading"}
        className="label-caps rounded-lg bg-error px-4 py-2 text-on-error transition hover:bg-error/90 disabled:opacity-60"
      >
        {status === "loading" ? "Deleting…" : "Delete User"}
      </button>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
