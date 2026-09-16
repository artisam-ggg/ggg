"use client";

import { useMemo } from "react";
import { useTournamentEvents } from "@/hooks/use-tournament-events";
import { ParticipantList, type Participant } from "./ParticipantList";

export function LiveParticipantList({
  tournamentId,
  participants,
}: {
  tournamentId: string;
  participants: Participant[];
}) {
  const { events } = useTournamentEvents(tournamentId);

  const roster = useMemo(() => {
    const next = [...participants];
    const seen = new Set(next.map((participant) => participant.playerAddr));

    for (const event of events) {
      const playerAddr = event.data.player;
      const poolAfter = event.data.poolAfter;
      if (
        event.type !== "REGISTERED" ||
        typeof playerAddr !== "string" ||
        typeof poolAfter !== "string" ||
        !/^\d+$/.test(poolAfter) ||
        seen.has(playerAddr)
      ) {
        continue;
      }

      seen.add(playerAddr);
      next.push({ playerAddr, joinedAt: "" });
    }

    return next;
  }, [events, participants]);

  return <ParticipantList participants={roster} />;
}
