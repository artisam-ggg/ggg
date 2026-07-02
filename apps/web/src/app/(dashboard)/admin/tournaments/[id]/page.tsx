import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-guards";
import { getTournamentAdminDetail } from "@/server/services/admin";
import { TournamentEditForm } from "@/components/admin/TournamentEditForm";
import { TournamentCancelButton } from "@/components/admin/TournamentCancelButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTournamentDetailPage({ params }: PageProps) {
  await requireUser("ADMIN");
  const { id } = await params;
  const tournament = await getTournamentAdminDetail(id);

  if (!tournament) notFound();

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">
          {tournament.name}
        </h1>
        <Link
          href="/admin/tournaments"
          className="label-caps text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
        >
          ← Back to tournaments
        </Link>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section className="glass-panel rounded-xl p-6">
          <h2 className="label-caps mb-4 text-on-surface-variant">Details</h2>
          <dl className="space-y-3">
            <div>
              <dt className="label-caps text-on-surface-variant">ID</dt>
              <dd className="data-mono text-on-surface">{tournament.id}</dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Game</dt>
              <dd className="text-on-surface">{tournament.gameTitle}</dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Status</dt>
              <dd className="text-on-surface">{tournament.status}</dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Organizer</dt>
              <dd className="text-on-surface">
                {tournament.organizerUsername} (
                <span className="data-mono">{tournament.organizerAddr}</span>)
              </dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Referee</dt>
              <dd className="data-mono text-on-surface">{tournament.refereeAddr}</dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Pool</dt>
              <dd className="data-mono text-on-surface">
                {tournament.pool} {tournament.asset}
              </dd>
            </div>
          </dl>
        </section>

        <section className="glass-panel rounded-xl p-6">
          <h2 className="label-caps mb-4 text-on-surface-variant">Actions</h2>
          <div className="space-y-4">
            <TournamentEditForm
              tournamentId={tournament.id}
              currentName={tournament.name}
              currentGameTitle={tournament.gameTitle}
            />
            <TournamentCancelButton
              tournamentId={tournament.id}
              currentStatus={tournament.status}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
