import Link from "next/link";
import { requireUser } from "@/lib/auth-guards";
import { listUsers } from "@/server/services/admin";
import { adminListQuerySchema } from "@/lib/validation/admin";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireUser("ADMIN");

  const rawParams = await searchParams;
  const parsed = adminListQuerySchema.safeParse({
    cursor: rawParams.cursor,
    take: rawParams.take,
  });
  const q = parsed.success ? parsed.data : { take: 20 };

  const { items, nextCursor } = await listUsers(q);

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">Users</h1>
        <Link
          href="/admin"
          className="label-caps text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
        >
          ← Back to admin
        </Link>
      </div>

      <section aria-label="User list" className="mt-8">
        <table className="w-full">
          <thead>
            <tr className="label-caps text-left text-on-surface-variant">
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {items.map((u) => (
              <tr key={u.id} className="text-on-surface">
                <td className="data-mono py-3 pr-4">{u.username}</td>
                <td className="py-3 pr-4">{u.role}</td>
                <td className="py-3 pr-4 text-on-surface-variant">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3">
                  <Link
                    href={`/admin/users/${u.id}`}
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
            href={`/admin/users?cursor=${encodeURIComponent(nextCursor)}`}
            className="label-caps inline-block rounded-lg border border-primary px-6 py-3 text-primary transition hover:bg-primary hover:text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            Load more
          </Link>
        </div>
      )}
    </main>
  );
}
