"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

export function SettlementDeadline({ seconds }: { seconds: number }) {
  const date = new Date(seconds * 1000);
  const iso = date.toISOString();
  const isBrowser = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const local = isBrowser
    ? new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(date)
    : null;

  return (
    <>
      Settlement deadline (UTC): <time dateTime={iso}>{iso}</time>
      {local && (
        <>
          {" · "}Your local time: <time dateTime={iso}>{local}</time>
        </>
      )}
    </>
  );
}
