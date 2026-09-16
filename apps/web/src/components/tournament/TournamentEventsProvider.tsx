"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTournamentEvents, type LiveEvent } from "@/hooks/use-tournament-events";

const TournamentEventsContext = createContext<LiveEvent[] | null>(null);

export function TournamentEventsProvider({
  tournamentId,
  children,
}: {
  tournamentId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const refreshSnapshot = useCallback(() => router.refresh(), [router]);
  const { events } = useTournamentEvents(tournamentId, refreshSnapshot);

  return (
    <TournamentEventsContext.Provider value={events}>{children}</TournamentEventsContext.Provider>
  );
}

export function useTournamentEventContext(): { events: LiveEvent[] } {
  const events = useContext(TournamentEventsContext);
  if (events === null) throw new Error("Tournament event consumer is missing its provider");
  return { events };
}
