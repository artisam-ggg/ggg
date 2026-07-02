import { requireUser } from "@/lib/auth-guards";
import { getAdminOverview } from "@/server/services/admin";
import Link from "next/link";

export default async function AdminPage() {
  await requireUser("ADMIN");
  const o = await getAdminOverview();

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      {/* Header with title */}
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">Admin</h1>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-6">
        <Link
          href="/admin/users"
          className="glass-panel rounded-xl p-6 transition hover:border-primary/30"
        >
          <p className="label-caps text-on-surface-variant">Users</p>
          <p className="data-mono mt-2 text-3xl text-acid-yellow">{o.userCount}</p>
        </Link>
        <Link
          href="/admin/tournaments"
          className="glass-panel rounded-xl p-6 transition hover:border-primary/30"
        >
          <p className="label-caps text-on-surface-variant">Tournaments</p>
          <p className="data-mono mt-2 text-3xl text-acid-yellow">{o.tournamentCount}</p>
        </Link>
        {(["DRAFT", "ACTIVE", "FINISHED", "CANCELLED"] as const).map((s) => (
          <div key={s} className="glass-panel rounded-xl p-6">
            <p className="label-caps text-on-surface-variant">{s}</p>
            <p className="data-mono mt-2 text-3xl text-acid-yellow">{o.byStatus[s]}</p>
          </div>
        ))}
      </div>

      <section aria-label="Recent users" className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="label-caps text-on-surface-variant">Recent Users</h2>
          <Link
            href="/admin/users"
            className="label-caps text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            View all →
          </Link>
        </div>
        <table className="w-full">
          <thead>
            <tr className="label-caps text-left text-on-surface-variant">
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {o.users.map((u) => (
              <tr key={u.id} className="text-on-surface">
                <td className="data-mono py-3 pr-4">{u.username}</td>
                <td className="py-3 pr-4">{u.role}</td>
                <td className="py-3 text-on-surface-variant">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
