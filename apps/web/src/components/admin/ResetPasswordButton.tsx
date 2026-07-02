"use client";

import { useAdminAction, parseAdminResponse } from "./use-admin-action";

interface ResetPasswordButtonProps {
  userId: string;
}

export function ResetPasswordButton({ userId }: ResetPasswordButtonProps) {
  const { status, error, data, execute, reset } = useAdminAction<{ tempPassword?: string }>();

  async function handleReset() {
    if (!confirm("Generate a new temporary password?")) return;

    reset();
    await execute(async () => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetPassword: true }),
      });
      return parseAdminResponse<{ tempPassword?: string }>(res);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleReset}
        disabled={status === "loading"}
        className="label-caps rounded-lg border border-primary px-4 py-2 text-primary transition hover:bg-primary hover:text-on-primary disabled:opacity-60"
      >
        {status === "loading" ? "Resetting…" : "Reset Password"}
      </button>
      {data?.tempPassword && (
        <div className="rounded-lg bg-surface-container-low p-3">
          <p className="label-caps text-on-surface-variant">Temporary password</p>
          <p className="data-mono mt-1 break-all text-on-surface">{data.tempPassword}</p>
        </div>
      )}
      {status === "success" && (
        <p className="text-sm text-success">Temporary password generated.</p>
      )}
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
