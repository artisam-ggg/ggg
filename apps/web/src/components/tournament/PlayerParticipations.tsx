"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { apiResponseSchema } from "@/lib/api";
import { formatStroops } from "@/lib/format-stroops";
import { WalletButton } from "./WalletButton";
import { StatusChip } from "./StatusChip";
import { SettlementDeadline } from "./SettlementDeadline";

const participationSchema = z.object({
  tournamentId: z.string(),
  name: z.string(),
  gameTitle: z.string(),
  asset: z.enum(["XLM", "USDC"]),
  entryFee: z.string(),
  displayStatus: z.enum(["DRAFT", "ACTIVE", "REFUNDS_OPEN", "REFUNDED", "CANCELLED", "FINISHED"]),
  state: z.enum([
    "REGISTERED",
    "PAYOUT_READY",
    "PAYOUT_CONFIRMED",
    "REFUND_AVAILABLE",
    "REFUNDED",
    "SETTLED",
  ]),
  refundReason: z.enum(["CANCELLED", "DEADLINE"]).nullable(),
  joinedAt: z.string().datetime(),
  settlementDeadline: z.string().datetime().nullable(),
  joinExplorerUrl: z.string().url().nullable(),
  payout: z
    .object({
      rank: z.number().int().positive(),
      amount: z.string(),
      explorerUrl: z.string().url().nullable(),
    })
    .nullable(),
  refund: z.object({ amount: z.string(), explorerUrl: z.string().url().nullable() }).nullable(),
});

const responseSchema = apiResponseSchema(z.object({ items: z.array(participationSchema) }));
type Participation = z.infer<typeof participationSchema>;
type LoadState = "idle" | "loading" | "ready" | "error";

const stateTitle: Record<Participation["state"], string> = {
  REGISTERED: "Registration confirmed",
  PAYOUT_READY: "Payout confirmation pending",
  PAYOUT_CONFIRMED: "Payout confirmed",
  REFUND_AVAILABLE: "Refund available",
  REFUNDED: "Refund confirmed",
  SETTLED: "Tournament settled",
};

function participationCopy(item: Participation) {
  if (item.state === "PAYOUT_READY") {
    return "Results are final. Payout confirmation is still syncing; do not submit another transaction.";
  }
  if (item.state === "PAYOUT_CONFIRMED" && item.payout) {
    return `Rank ${item.payout.rank} received ${formatStroops(item.payout.amount)} ${item.asset} from the tournament escrow.`;
  }
  if (item.state === "REFUND_AVAILABLE") {
    return item.refundReason === "CANCELLED"
      ? "This tournament was cancelled. This wallet may now claim its entry fee from the escrow."
      : "The settlement deadline passed without finalization. This wallet may now claim its entry fee from the escrow.";
  }
  if (item.state === "REFUNDED" && item.refund) {
    return `${formatStroops(item.refund.amount)} ${item.asset} was returned from the tournament escrow to this wallet.`;
  }
  if (item.state === "SETTLED") {
    return "The tournament settled with no confirmed payout recorded for this wallet.";
  }
  return `${formatStroops(item.entryFee)} ${item.asset} is held by the tournament's Soroban escrow, not by GGG.`;
}

function receiptFor(item: Participation): { label: string; url: string } | null {
  if (item.state === "REGISTERED" && item.joinExplorerUrl) {
    return { label: "View join receipt", url: item.joinExplorerUrl };
  }
  if (item.state === "PAYOUT_CONFIRMED" && item.payout?.explorerUrl) {
    return { label: "View payout receipt", url: item.payout.explorerUrl };
  }
  if (item.state === "REFUNDED" && item.refund?.explorerUrl) {
    return { label: "View refund receipt", url: item.refund.explorerUrl };
  }
  return null;
}

export function PlayerParticipations({ expectedPassphrase }: { expectedPassphrase: string }) {
  const [state, setState] = useState<LoadState>("idle");
  const [items, setItems] = useState<Participation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  function handleConnected(player: string | null) {
    request.current?.abort();
    if (!player) {
      setState("idle");
      setItems([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setState("loading");
    setError(null);
    void fetch(`/api/participations?playerAddress=${encodeURIComponent(player)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success || !parsed.data.ok || !response.ok) {
          throw new Error(
            parsed.success && !parsed.data.ok
              ? parsed.data.error.message
              : "Could not load participation status",
          );
        }
        setItems(parsed.data.data.items);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Could not load participation status");
        setState("error");
      });
  }

  return (
    <section className="kinetic-glass rounded-xl p-6" aria-labelledby="participations-heading">
      <p className="label-caps text-primary">Confirmed wallet activity</p>
      <h1 id="participations-heading" className="mt-2 text-[32px] font-bold text-on-surface">
        My tournaments
      </h1>
      <p className="mt-3 max-w-3xl text-on-surface-variant">
        Connect the wallet used to join. GGG reads confirmed public tournament records only; no app
        login, private key, signature, or personal profile is required.
      </p>

      <div className="mt-6">
        <WalletButton expectedPassphrase={expectedPassphrase} onConnected={handleConnected} />
      </div>

      {state === "loading" && (
        <p role="status" className="mt-6 text-on-surface">
          Loading confirmed participation status...
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="mt-6 text-error">
          {error}
        </p>
      )}
      {state === "ready" && items.length === 0 && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-outline-variant p-4 text-on-surface"
        >
          No confirmed tournament participation was found for this wallet.
        </p>
      )}
      {state === "ready" && items.length > 0 && (
        <ul className="mt-6 grid gap-4">
          {items.map((item) => {
            const receipt = receiptFor(item);
            return (
              <li key={item.tournamentId} className="rounded-xl border border-outline-variant p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="label-caps text-primary">{stateTitle[item.state]}</p>
                    <h2 className="mt-1 text-xl font-semibold text-on-surface">{item.name}</h2>
                    <p className="text-sm text-on-surface-variant">{item.gameTitle}</p>
                  </div>
                  <StatusChip status={item.displayStatus} />
                </div>
                <p className="mt-4 text-on-surface">{participationCopy(item)}</p>
                {item.state === "REGISTERED" && item.settlementDeadline && (
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Next expected deadline:{" "}
                    <SettlementDeadline seconds={Date.parse(item.settlementDeadline) / 1000} />
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-4">
                  <Link
                    href={`/tournaments/${encodeURIComponent(item.tournamentId)}`}
                    className="label-caps text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    View tournament
                  </Link>
                  {receipt && (
                    <a
                      href={receipt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="label-caps text-on-surface underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {receipt.label}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
