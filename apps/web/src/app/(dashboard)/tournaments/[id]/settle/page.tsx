import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/auth-guards";
import { getTournamentDetail } from "@/server/services/tournaments";
import { SettlementConsole } from "@/components/settlement/SettlementConsole";

interface SettlePageProps {
  params: Promise<{ id: string }>;
}

export default async function SettlePage({ params }: SettlePageProps) {
  // Require an authenticated session (dashboard group guard).
  // The authoritative referee gate is wallet-based (x-wallet-address header) + on-chain.
  await requireUser();

  const { id } = await params;
  const t = await getTournamentDetail(id);

  if (!t || t.status !== "ACTIVE") notFound();

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <SettlementConsole
        tournamentId={t.id}
        refereeAddr={t.refereeAddr}
        participants={t.participants}
        passphrase={env.NETWORK_PASSPHRASE}
      />
    </main>
  );
}
