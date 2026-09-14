"use client";
import { useEffect, useState } from "react";

export interface LiveEvent {
  type: "REGISTERED" | "FINALIZED" | "CANCELLED" | "REFUND_CLAIMED";
  txHash: string | null;
  data: Record<string, unknown>;
}

/**
 * Subscribe to the tournament SSE stream (GET /api/tournaments/[id]/events).
 * Surfaces every parsed event (replayed history first, then live) and
 * transparently reconnects with a fixed backoff on error. The stream emits only
 * confirmed, ContractEvent-backed payloads — never optimistic UI state.
 */
export function useTournamentEvents(tournamentId: string): { events: LiveEvent[] } {
  const [events, setEvents] = useState<LiveEvent[]>([]);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect(): void {
      es = new EventSource(`/api/tournaments/${tournamentId}/events`);
      es.onmessage = (e: MessageEvent) => {
        try {
          setEvents((prev) => [...prev, JSON.parse(e.data) as LiveEvent]);
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        es?.close();
        if (!closed) retry = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      closed = true;
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [tournamentId]);

  return { events };
}
