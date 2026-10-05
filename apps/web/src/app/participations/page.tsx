import Link from "next/link";
import { PlayerParticipations } from "@/components/tournament/PlayerParticipations";
import { env } from "@/lib/env";

export default function ParticipationsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      <Link
        href="/"
        className="label-caps text-sm text-on-surface-variant underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        Back home
      </Link>
      <div className="mt-6">
        <PlayerParticipations expectedPassphrase={env.NETWORK_PASSPHRASE} />
      </div>
    </main>
  );
}
