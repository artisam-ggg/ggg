const TOURNAMENT_STATUSES = ["DRAFT", "ACTIVE", "CANCELLED", "FINISHED"] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export async function fetchTournamentStatus(
  tournamentId: string,
): Promise<TournamentStatus | null> {
  try {
    const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}`);
    if (!response.ok) return null;

    const body = (await response.json()) as {
      ok?: unknown;
      data?: { status?: unknown };
    };
    const status = body.ok === true ? body.data?.status : null;
    return TOURNAMENT_STATUSES.find((candidate) => candidate === status) ?? null;
  } catch {
    return null;
  }
}
