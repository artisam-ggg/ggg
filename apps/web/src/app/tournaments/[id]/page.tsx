import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth-guards";
import { getTournamentDetail } from "@/server/services/tournaments";
import { StatusChip } from "@/components/tournament/StatusChip";
import { ContractAddress } from "@/components/tournament/ContractAddress";
import { PrizePoolCounter } from "@/components/tournament/PrizePoolCounter";
import { JoinCard } from "@/components/tournament/JoinCard";
import { ParticipantList } from "@/components/tournament/ParticipantList";
import { LiveFeed } from "@/components/tournament/LiveFeed";
import { RefereePanel } from "@/components/tournament/RefereePanel";
import { WinnersPanel } from "@/components/tournament/WinnersPanel";
import { RefundList } from "@/components/tournament/RefundList";
import { CancelButton } from "@/components/tournament/CancelButton";
import { ClaimRefundButton } from "@/components/tournament/ClaimRefundButton";
import { BackButton } from "@/components/ui/BackButton";

export const revalidate = 0;

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [t, currentUser] = await Promise.all([getTournamentDetail(id), getCurrentUser()]);

  if (!t) notFound();

  const passphrase = env.NETWORK_PASSPHRASE;
  const joinUrl = new URL(`/tournaments/${t.id}`, env.APP_URL).toString();

  const isOrganiser = currentUser?.id === t.organizerId;
  const canCancel = isOrganiser && t.status === "ACTIVE" && !t.refundsClaimable;

  // Extract participant wallet addresses for the counter
  const participantAddresses = t.participants.map((p) => p.playerAddr);

  return (
    <main
      aria-label={`${t.name} tournament detail`}
      className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)"
    >
      <div className="mb-6">
        <BackButton />
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-caps text-on-surface-variant">{t.gameTitle}</p>
          <h1 className="text-[48px] font-extrabold -tracking-[0.04em] text-on-surface">
            {t.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="data-mono text-xs text-on-surface-variant">ID {t.id}</span>
            {t.contractId && <ContractAddress value={t.contractId} />}
            {t.contractUrl && t.contractId && (
              <a
                href={t.contractUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="explorer-link"
                className="label-caps text-electric-violet underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
                aria-label="View contract on Stellar explorer"
              >
                Explorer ↗
              </a>
            )}
          </div>
        </div>
        <StatusChip status={t.status} />
      </header>

      {t.refundsClaimable && (
        <section
          aria-labelledby="cancelled-heading"
          className="mt-8 rounded-2xl border-2 border-error bg-error-container p-6"
        >
          <p id="cancelled-heading" className="label-caps text-error" role="alert">
            {t.status === "CANCELLED"
              ? "This tournament has been cancelled."
              : "The settlement deadline has passed."}{" "}
            Registered players may now claim their refund.
          </p>
          <RefundList participants={t.participants} entryFee={t.entryFee} asset={t.asset} />
          {t.contractId && <ClaimRefundButton tournamentId={t.id} passphrase={passphrase} />}
        </section>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-8">
          <PrizePoolCounter
            tournamentId={t.id}
            initialPool={t.pool}
            asset={t.asset}
            participantCount={t.participants.length}
            entryFee={t.entryFee}
            initialParticipants={participantAddresses}
          />

          {t.status === "ACTIVE" && !t.refundsClaimable && t.contractId && (
            <JoinCard
              tournamentId={t.id}
              contractId={t.contractId}
              entryFee={t.entryFee}
              joinUrl={joinUrl}
              passphrase={passphrase}
            />
          )}

          {t.status === "FINISHED" && t.winners.length > 0 && (
            <WinnersPanel winners={t.winners} asset={t.asset} />
          )}
          {t.status === "FINISHED" && t.winners.length === 0 && (
            <section
              aria-label="Winners"
              className="brutalist-border brutalist-border-active rounded-none p-6"
            >
              <p className="label-caps italic text-acid-yellow">Settlement Complete</p>
              <p className="mt-4 text-sm text-on-surface-variant">
                No winners recorded for this tournament.
              </p>
            </section>
          )}

          <section aria-label="Participants" className="kinetic-glass rounded-2xl p-6">
            <ParticipantList participants={t.participants} />
          </section>
        </div>

        <aside aria-label="Tournament tools" className="flex flex-col gap-8 lg:col-span-4">
          <LiveFeed tournamentId={t.id} />
          {t.status === "ACTIVE" && !t.refundsClaimable && (
            <RefereePanel tournamentId={t.id} refereeAddr={t.refereeAddr} passphrase={passphrase} />
          )}
          {canCancel && (
            <section aria-label="Organiser actions" className="rounded-xl bg-surface-container p-4">
              <p className="label-caps mb-3 text-error">Danger zone</p>
              <CancelButton tournamentId={t.id} passphrase={passphrase} />
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
