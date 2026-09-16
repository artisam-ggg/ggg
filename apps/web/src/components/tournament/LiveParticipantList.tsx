"use client";

import { useMemo } from "react";
import { useTournamentEventContext } from "./TournamentEventsProvider";
import { ParticipantList, type Participant } from "./ParticipantList";

export function LiveParticipantList({ participants }: { participants: Participant[] }) {
  const { events } = useTournamentEventContext();

  const roster = useMemo(() => {
    const next = [...participants];
    const seen = new Set(next.map((participant) => participant.playerAddr));

    for (const event of events) {
      if (event.type !== "REGISTERED") continue;
      const playerAddr = event.data.player;
      if (seen.has(playerAddr)) {
        continue;
      }

      seen.add(playerAddr);
      next.push({ playerAddr, joinedAt: null });
    }

    return next;
  }, [events, participants]);

  return <ParticipantList participants={roster} />;
}
