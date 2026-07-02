import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-guards";
import { LogoutButton } from "@/components/ui/LogoutButton";

export async function DashboardNav() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <header className="border-b border-outline-variant bg-background">
      <div className="mx-auto flex max-w-(--spacing-container-max) items-center justify-between px-4 py-4 md:px-(--spacing-margin-desktop)">
        <nav aria-label="Dashboard" className="flex items-center gap-6">
          {user.role === "ADMIN" && (
            <Link
              href="/admin"
              className="label-caps text-on-surface transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
            >
              Admin
            </Link>
          )}
          <Link
            href="/tournaments"
            className="label-caps text-on-surface transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            Tournaments
          </Link>
        </nav>
        <LogoutButton />
      </div>
    </header>
  );
}
