import Link from "next/link";
import { requireUser } from "@/lib/auth-guards";
import { listTournaments } from "@/server/services/tournaments";
import { listQuerySchema } from "@/lib/validation/tournament";
import { TournamentListRow } from "@/components/tournament/TournamentListRow";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TournamentsPage({ searchParams }: PageProps) {
  const user = await requireUser("ORGANIZER");

  const rawParams = await searchParams;
  const parsed = listQuerySchema.safeParse({
    status: rawParams.status,
    cursor: rawParams.cursor,
    take: rawParams.take,
  });
  const q = parsed.success ? parsed.data : { take: 20 };

  const { items, nextCursor } = await listTournaments(user.id, q);

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      {/* Header Panel with Navigation Actions */}
      <div className="flex items-center justify-between border-b border-outline-variant pb-6">
        <div>
          <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">Tournaments</h1>
          <p className="label-caps mt-1 text-xs text-on-surface-variant">Organizer Dashboard</p>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/tournaments/new"
            className="label-caps rounded-lg bg-primary px-5 py-2.5 font-bold text-on-primary transition hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            New Tournament
          </Link>
        </div>
      </div>

      {/* Main Tournament List State */}
      {items.length === 0 ? (
        <div className="kinetic-glass mt-10 rounded-2xl p-12 text-center shadow-lg">
          <p className="text-lg text-on-surface-variant">No tournaments yet.</p>
          <Link
            href="/tournaments/new"
            className="label-caps mt-4 inline-block text-primary hover:underline"
          >
            Create your first tournament →
          </Link>
        </div>
      ) : (
        <ol className="mt-8 flex flex-col gap-4" aria-label="Tournament list">
          {items.map((t) => (
            <li
              key={t.id}
              className="industrial-border rounded-xl bg-surface-container-low p-1 shadow-sm transition hover:border-primary/30"
            >
              <TournamentListRow t={t} />
            </li>
          ))}
        </ol>
      )}

      {/* Pagination View Wrapper */}
      {nextCursor && (
        <div className="mt-10 text-center">
          <Link
            href={`/tournaments?cursor=${encodeURIComponent(nextCursor)}`}
            className="label-caps inline-block rounded-lg border border-primary px-6 py-3 text-primary transition hover:bg-primary hover:text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            Load more
          </Link>
        </div>
      )}
    </main>
  );
}
