"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdminAction, parseAdminResponse } from "./use-admin-action";

interface TournamentEditFormProps {
  tournamentId: string;
  currentName: string;
  currentGameTitle: string;
}

export function TournamentEditForm({
  tournamentId,
  currentName,
  currentGameTitle,
}: TournamentEditFormProps) {
  const [name, setName] = useState(currentName);
  const [gameTitle, setGameTitle] = useState(currentGameTitle);
  const router = useRouter();
  const { status, error, execute } = useAdminAction<void>();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await execute(async () => {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, gameTitle }),
      });
      await parseAdminResponse(res);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="name" className="label-caps text-on-surface-variant">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-surface-variant bg-surface-container px-3 py-2 text-on-surface"
        />
      </div>
      <div>
        <label htmlFor="gameTitle" className="label-caps text-on-surface-variant">
          Game
        </label>
        <input
          id="gameTitle"
          type="text"
          value={gameTitle}
          onChange={(e) => setGameTitle(e.target.value)}
          className="w-full rounded-lg border border-surface-variant bg-surface-container px-3 py-2 text-on-surface"
        />
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="label-caps rounded-lg bg-primary px-4 py-2 text-on-primary disabled:opacity-60"
      >
        {status === "loading" ? "Saving…" : "Update Metadata"}
      </button>
      {error && <p className="text-sm text-error">{error}</p>}
      {status === "success" && <p className="text-sm text-success">Tournament updated.</p>}
    </form>
  );
}
