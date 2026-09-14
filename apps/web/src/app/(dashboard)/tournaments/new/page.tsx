import { requireUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { CreateTournamentForm } from "@/components/tournament/CreateTournamentForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewTournamentPage() {
  await requireUser("ORGANIZER");
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:px-(--spacing-margin-desktop)">
      <CreateTournamentForm expectedPassphrase={env.NETWORK_PASSPHRASE} />
    </main>
  );
}
