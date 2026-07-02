import Link from "next/link";
import { requireUser } from "@/lib/auth-guards";
import { listAllTournaments } from "@/server/services/admin";
import { adminListQuerySchema } from "@/lib/validation/admin";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminTournamentsPage({ searchParams }: PageProps) {
  await requireUser("ADMIN");

  const rawParams = await searchParams;
  const parsed = adminListQuerySchema.safeParse({
    cursor: rawParams.cursor,
    take: rawParams.take,
  });
  const q = parsed.success ? parsed.data : { take: 20 };

  const { items, nextCursor } = await listAllTournaments(q);

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">Tournaments</h1>
        <Link
          href="/admin"
          className="label-caps text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
        >
          ← Back to admin
        </Link>
      </div>

      <section aria-label="Tournament list" className="mt-8">
        <table className="w-full">
          <thead>
            <tr className="label-caps text-left text-on-surface-variant">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Game</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Organizer</th>
              <th className="py-2 pr-4">Players</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {items.map((t) => (
              <tr key={t.id} className="text-on-surface">
                <td className="py-3 pr-4">{t.name}</td>
                <td className="py-3 pr-4">{t.gameTitle}</td>
                <td className="py-3 pr-4">{t.status}</td>
                <td className="data-mono py-3 pr-4">{t.organizerUsername}</td>
                <td className="py-3 pr-4">{t.participantCount}</td>
                <td className="py-3">
                  <Link
                    href={`/admin/tournaments/${t.id}`}
                    className="label-caps text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {nextCursor && (
        <div className="mt-8 text-center">
          <Link
            href={`/admin/tournaments?cursor=${encodeURIComponent(nextCursor)}`}
            className="label-caps inline-block rounded-lg border border-primary px-6 py-3 text-primary transition hover:bg-primary hover:text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            Load more
          </Link>
        </div>
      )}
    </main>
  );
}
