import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getTournamentDetail } from "@/server/services/tournaments";
import { SettlementConsole } from "@/components/settlement/SettlementConsole";

interface SettlePageProps {
  params: Promise<{ id: string }>;
}

export default async function SettlePage({ params }: SettlePageProps) {
  const { id } = await params;
  const t = await getTournamentDetail(id);

  if (!t || t.status !== "ACTIVE" || t.contractVersion !== "CURRENT") notFound();

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <SettlementConsole
        tournamentId={t.id}
        refereeAddr={t.refereeAddr}
        participants={t.participants}
        distributionBps={t.distributionBps}
        pool={t.pool}
        asset={t.asset}
        passphrase={env.NETWORK_PASSPHRASE}
      />
    </main>
  );
}
