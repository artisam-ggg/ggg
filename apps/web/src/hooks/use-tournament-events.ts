"use client";
import { useEffect, useState } from "react";
import { z } from "zod";

const amountSchema = z.string().regex(/^\d+$/);
const playerSchema = z.string().min(1);
const liveEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("REGISTERED"),
    txHash: z.string().nullable(),
    data: z.object({ player: playerSchema, poolAfter: amountSchema.optional() }),
  }),
  z.object({
    type: z.literal("FINALIZED"),
    txHash: z.string().nullable(),
    data: z.object({
      first: playerSchema,
      second: playerSchema,
      third: playerSchema,
      amounts: z.array(amountSchema).length(3),
    }),
  }),
  z.object({
    type: z.literal("CANCELLED"),
    txHash: z.string().nullable(),
    data: z.object({ claimableCount: z.number().int().nonnegative() }),
  }),
  z.object({
    type: z.literal("REFUND_CLAIMED"),
    txHash: z.string().nullable(),
    data: z.object({ player: playerSchema, amount: amountSchema }),
  }),
]);

export type LiveEvent = z.infer<typeof liveEventSchema>;

/**
 * Subscribe to the tournament SSE stream (GET /api/tournaments/[id]/events).
 * Surfaces every parsed event (replayed history first, then live) and
 * transparently reconnects with a fixed backoff on error. The stream emits only
 * confirmed, ContractEvent-backed payloads — never optimistic UI state.
 */
export function useTournamentEvents(
  tournamentId: string,
  onReconnect?: () => void,
): { events: LiveEvent[] } {
  const [events, setEvents] = useState<LiveEvent[]>([]);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let connected = false;

    function connect(): void {
      es = new EventSource(`/api/tournaments/${tournamentId}/events`);
      es.onopen = () => {
        if (connected) onReconnect?.();
        connected = true;
      };
      es.onmessage = (e: MessageEvent) => {
        try {
          const event = liveEventSchema.safeParse(JSON.parse(e.data));
          if (event.success) setEvents((prev) => [...prev, event.data]);
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
  }, [tournamentId, onReconnect]);

  return { events };
}
