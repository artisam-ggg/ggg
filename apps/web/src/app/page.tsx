import Link from "next/link";

export default function Page() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden py-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-center bg-cover bg-no-repeat"
        style={{
          backgroundImage:
            "linear-gradient(105deg, rgba(10, 10, 10, 0.35) 0%, rgba(19, 19, 19, 0.83) 62%, rgba(19, 19, 19, 0.91) 100%), url('/ggg-cover.png')",
        }}
      />
      <div className="mx-auto max-w-(--spacing-container-max) px-4 md:px-(--spacing-margin-desktop)">
        <p className="label-caps text-acid-yellow">Trustless · On-chain · Live</p>
        <h1 className="mt-4 max-w-3xl text-[48px] font-extrabold leading-[1.1] -tracking-[0.04em] text-on-surface">
          Prize pools the contract holds — not a custodian.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-on-surface-variant">
          Create an on-chain escrow for any game. Players join by paying a crypto entry fee, a
          referee submits the final ranking, and a Soroban contract settles the split automatically.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/tournaments/new"
            prefetch={false}
            className="brutalist-border label-caps inline-block bg-electric-violet-strong px-8 py-4 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-yellow"
          >
            Create Tournament
          </Link>
          <Link
            href="/participations"
            className="brutalist-border label-caps inline-block border border-outline bg-surface-container px-8 py-4 text-on-surface transition-transform hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            My Tournaments
          </Link>
        </div>
      </div>
    </main>
  );
}
