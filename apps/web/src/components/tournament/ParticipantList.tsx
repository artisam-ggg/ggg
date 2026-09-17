"use client";

import { useSyncExternalStore } from "react";

export type Participant = { playerAddr: string; joinedAt: string | null };

function trunc(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ParticipantList({ participants }: { participants: Participant[] }) {
  const isBrowser = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (participants.length === 0) {
    return <p className="text-on-surface-variant">No players have joined yet.</p>;
  }

  return (
    <section>
      <h2 className="label-caps text-on-surface-variant">Participants</h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        {isBrowser
          ? "App join times shown in your local timezone."
          : "App join times shown in UTC until your local timezone loads."}
      </p>
      <ul className="mt-4 divide-y divide-outline-variant">
        {participants.map((p) => {
          const joinedAt = p.joinedAt ? new Date(p.joinedAt) : null;
          const validTimestamp = joinedAt !== null && !Number.isNaN(joinedAt.getTime());
          return (
            <li
              key={p.playerAddr}
              data-testid="participant-row"
              className="flex items-center justify-between py-3"
            >
              <span className="data-mono text-acid-yellow">{trunc(p.playerAddr)}</span>
              <time
                className="data-mono text-xs text-on-surface-variant"
                dateTime={validTimestamp ? joinedAt.toISOString() : undefined}
                aria-label={
                  validTimestamp
                    ? `App join time ${joinedAt.toISOString()}`
                    : "Registration time unavailable"
                }
              >
                {validTimestamp
                  ? new Intl.DateTimeFormat("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      ...(isBrowser ? {} : { timeZone: "UTC" }),
                      timeZoneName: "short",
                    }).format(joinedAt)
                  : "Time unavailable"}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
