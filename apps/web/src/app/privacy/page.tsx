import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — GGG",
  description: "Privacy Policy for GGG — Good Game Guild.",
};

const heading = "mt-10 text-xl font-bold text-on-surface";
const list = "mt-3 list-disc space-y-2 pl-6 text-on-surface-variant";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-12">
      <article className="mx-auto w-full max-w-[800px] text-on-surface-variant">
        <Link href="/" className="text-sm font-semibold text-primary hover:underline">
          ← Back to GGG
        </Link>
        <p className="label-caps mt-10 text-primary">Legal</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-on-surface">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm">Last updated: September 15, 2026 · Operator: Artisam Labs</p>

        <h2 className={heading}>1. Introduction</h2>
        <p className="mt-3">
          Artisam Labs operates GGG — Good Game Guild, including this application. This policy
          explains what information we collect, why we use it, and the choices available to you.
        </p>

        <h2 className={heading}>2. Information we collect</h2>
        <ul className={list}>
          <li>
            Account information, including your username, password hash, role, and session data.
          </li>
          <li>
            Tournament information you submit, including tournament configuration, participant
            entries, rankings, and evidence.
          </li>
          <li>Public wallet addresses and transaction data submitted to the Stellar network.</li>
          <li>
            With your consent, pages visited, interactions, browser information, referral source,
            connected public wallet addresses, and masked session replays. Sensitive form text and
            element attributes are masked.
          </li>
          <li>Security and reliability data collected through application and server logs.</li>
        </ul>

        <h2 className={heading}>3. How we use information</h2>
        <ul className={list}>
          <li>To create and authenticate your account.</li>
          <li>To operate tournaments and submit transactions you authorize.</li>
          <li>To display prize pools, registrations, rankings, and payout results.</li>
          <li>To prevent fraud and abuse and protect the Service.</li>
          <li>To understand usage and improve onboarding, reliability, and usability.</li>
          <li>To respond to support and partnership inquiries.</li>
        </ul>

        <h2 className={heading}>4. Sharing</h2>
        <p className="mt-3">
          We do not sell or rent personal information. We share information with infrastructure and
          service providers only as needed to operate GGG, when required by law, or with your
          consent. Optional analytics and masked session replay are processed by PostHog Cloud in
          the United States.
        </p>

        <h2 className={heading}>5. On-chain data</h2>
        <p className="mt-3">
          Stellar transactions and wallet addresses are public and may be permanent. We cannot
          modify or delete information recorded on the Stellar network.
        </p>

        <h2 className={heading}>6. Retention</h2>
        <p className="mt-3">
          We retain account, tournament, security, and analytics information only as long as needed
          to provide the Service, meet legal obligations, resolve disputes, and enforce agreements.
          On-chain records follow the Stellar network&apos;s retention characteristics.
        </p>

        <h2 className={heading}>7. Security</h2>
        <p className="mt-3">
          We use reasonable technical and organizational safeguards, including password hashing,
          protected sessions, access controls, and encrypted transport. No system can guarantee
          absolute security.
        </p>

        <h2 className={heading}>8. Cookies, analytics, and session replay</h2>
        <p className="mt-3">
          Essential session and security storage is required for the application to function. If you
          accept optional analytics, PostHog records product events and masked session replays to
          help us understand how GGG is used. When you connect a wallet, its public address may be
          included as an event property but is not used as your analytics identity. Analytics
          remains disabled if you decline. We do not use third-party advertising cookies.
        </p>

        <h2 className={heading}>9. Your choices and rights</h2>
        <ul className={list}>
          <li>Decline optional analytics without losing access to GGG.</li>
          <li>Withdraw analytics consent by clearing the site&apos;s browser storage.</li>
          <li>Request access to, correction of, or deletion of eligible account information.</li>
          <li>Opt out of non-essential communications.</li>
        </ul>

        <h2 className={heading}>10. Third-party services</h2>
        <p className="mt-3">
          GGG interacts with services such as Stellar, wallet providers, infrastructure providers,
          and PostHog. Their own privacy policies govern information they process independently.
        </p>

        <h2 className={heading}>11. Changes</h2>
        <p className="mt-3">
          We may update this policy as the Service changes. The revised policy and its effective
          date will be published on this page.
        </p>

        <h2 className={heading}>12. Contact</h2>
        <p className="mt-3 pb-10">
          Questions or privacy requests can be sent to{" "}
          <a className="text-primary hover:underline" href="mailto:hello@artisam.xyz">
            hello@artisam.xyz
          </a>
          .
        </p>
      </article>
    </main>
  );
}
