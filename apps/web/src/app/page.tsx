import Link from "next/link";

export default function Page() {
  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-24 md:px-(--spacing-margin-desktop)">
      <p className="label-caps text-acid-yellow">Trustless · On-chain · Live</p>
      <h1 className="mt-4 max-w-3xl text-[48px] font-extrabold leading-[1.1] -tracking-[0.04em] text-on-surface">
        Prize pools the contract holds — not a custodian.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-on-surface-variant">
        Create an on-chain escrow for any game. Players join by paying a crypto entry fee, a referee
        submits the final ranking, and a Soroban contract settles the split automatically.
      </p>
      <div className="mt-10">
        <Link
          href="/tournaments/new"
          prefetch={false}
          className="brutalist-border label-caps inline-block bg-electric-violet-strong px-8 py-4 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-yellow"
        >
          Create Tournament
        </Link>
      </div>
      <section className="brutalist-border mt-16 flex flex-col gap-4 bg-surface-container p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="label-caps text-acid-yellow">For developers</p>
          <h2 className="mt-2 text-2xl font-bold text-on-surface">Build with the GGG escrow SDK</h2>
          <p className="mt-2 max-w-2xl text-on-surface-variant">
            Use the reusable Stellar escrow client in your own application.
          </p>
        </div>
        <a
          href="https://www.npmjs.com/package/@goodgameguild/escrow-sdk"
          target="_blank"
          rel="noreferrer"
          aria-label="View the reusable GGG Stellar escrow SDK on npm"
          className="brutalist-border shrink-0 px-6 py-3 text-center text-on-surface transition-transform hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-yellow"
        >
          View on npm
        </a>
      </section>
    </main>
  );
}
