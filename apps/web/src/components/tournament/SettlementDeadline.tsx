"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

export function SettlementDeadline({
  seconds,
  stacked = false,
}: {
  seconds: number;
  stacked?: boolean;
}) {
  const date = new Date(seconds * 1000);
  const iso = date.toISOString();
  const utc = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
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

  if (stacked) {
    return (
      <span className="flex flex-col gap-3">
        {local && (
          <span>
            <span className="label-caps block text-on-surface-variant">Your time</span>
            <time className="mt-1 block text-base text-on-surface" dateTime={iso}>
              {local}
            </time>
          </span>
        )}
        <span>
          <span className="label-caps block text-on-surface-variant">UTC</span>
          <time className="mt-1 block text-sm text-on-surface-variant" dateTime={iso}>
            {utc}
          </time>
        </span>
      </span>
    );
  }

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
