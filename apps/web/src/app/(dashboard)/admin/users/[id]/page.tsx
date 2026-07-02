import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-guards";
import { getUserAdminDetail } from "@/server/services/admin";
import { UserRoleForm } from "@/components/admin/UserRoleForm";
import { ResetPasswordButton } from "@/components/admin/ResetPasswordButton";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const admin = await requireUser("ADMIN");
  const { id } = await params;
  const user = await getUserAdminDetail(id);

  if (!user) notFound();

  const isSelf = user.id === admin.id;

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">
          {user.username}
        </h1>
        <Link
          href="/admin/users"
          className="label-caps text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
        >
          ← Back to users
        </Link>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section className="glass-panel rounded-xl p-6">
          <h2 className="label-caps mb-4 text-on-surface-variant">Details</h2>
          <dl className="space-y-3">
            <div>
              <dt className="label-caps text-on-surface-variant">ID</dt>
              <dd className="data-mono text-on-surface">{user.id}</dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Role</dt>
              <dd className="text-on-surface">{user.role}</dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Created</dt>
              <dd className="text-on-surface">{new Date(user.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="label-caps text-on-surface-variant">Updated</dt>
              <dd className="text-on-surface">{new Date(user.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        <section className="glass-panel rounded-xl p-6">
          <h2 className="label-caps mb-4 text-on-surface-variant">Actions</h2>
          <div className="space-y-4">
            <UserRoleForm userId={user.id} currentRole={user.role} disabled={isSelf} />
            <ResetPasswordButton userId={user.id} />
            <DeleteUserButton userId={user.id} username={user.username} disabled={isSelf} />
          </div>
        </section>
      </div>

      <section aria-label="User tournaments" className="mt-8">
        <h2 className="label-caps mb-4 text-on-surface-variant">Tournaments</h2>
        {user.tournaments.length === 0 ? (
          <p className="text-on-surface-variant">No tournaments.</p>
        ) : (
          <ul className="space-y-2">
            {user.tournaments.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg bg-surface-container-low p-4"
              >
                <div>
                  <p className="font-medium text-on-surface">{t.name}</p>
                  <p className="text-sm text-on-surface-variant">
                    {t.gameTitle} · {t.status}
                  </p>
                </div>
                <Link
                  href={`/admin/tournaments/${t.id}`}
                  className="label-caps text-primary hover:underline"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
