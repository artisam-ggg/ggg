// SERVER COMPONENT — no "use client" directive.
// Pure server render from props; no polling, no client hooks.

type Participant = { playerAddr: string; joinedAt: string };

function trunc(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

export function ParticipantList({ participants }: { participants: Participant[] }) {
  if (participants.length === 0) {
    return <p className="text-on-surface-variant">No players have joined yet.</p>;
  }

  return (
    <section>
      <h2 className="label-caps text-on-surface-variant">Participants</h2>
      <ul className="mt-4 divide-y divide-outline-variant">
        {participants.map((p) => {
          const joinedAt = new Date(p.joinedAt);
          const validTimestamp = !Number.isNaN(joinedAt.getTime());
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
                    ? `Joined at ${joinedAt.toISOString()} UTC`
                    : "Registration time unavailable"
                }
              >
                {validTimestamp
                  ? joinedAt.toLocaleTimeString("en-US", {
                      timeZone: "UTC",
                      timeZoneName: "short",
                    })
                  : "Time unavailable"}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
