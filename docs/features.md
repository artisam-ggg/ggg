# Features Log

Running log of shipped features (append one entry per change), per the auto-dev workflow.

## Phase 0 — Foundation

Stood up the GGG pnpm 10 monorepo skeleton with zero business logic, so every later phase has a proven foundation:

- pnpm 10 workspace (`apps/web`, `apps/subscriber`, `contracts/escrow`); Node 22+ pinned via `engines`/`.nvmrc`; corepack.
- Shared strict TypeScript base config (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`) + Prettier.
- Next.js 16 web app (App Router, Turbopack, React 19.2, strict TS, ESLint+Prettier, Tailwind v4 wired).
- Subscriber + escrow contract workspace placeholders (no logic).
- `docker-compose.yml` dev stack: Postgres 17, Redis 7, MinIO + bucket bootstrap.
- Zod-validated, fail-closed env loader (`apps/web/src/lib/env.ts`) mirroring SPEC §14 plus `USDC_ISSUER` / `USDC_SAC_ADDRESS`; committed `.env.example`.
- `{ ok, data?, error? }` API envelope helpers (`ok`/`err`) + shared validation dir.
- Full Prisma 7 schema (SPEC §10), initial migration, singleton `prisma` client, idempotent admin seed.
- Tailwind v4 `@theme` with the complete BRAND §2 token table, signature classes, keyframes, Sora + Space Mono + Material Symbols; dark-only.
- shadcn/ui initialized and themed to GGG tokens (Button primitive).
- Base CI (install + prisma generate + typecheck + lint + format check); README quickstart.

## Phase 1 — Soroban Escrow Contract

Implemented the trustless tournament prize-escrow contract (`contracts/escrow`) and published it to Stellar Testnet:

- Crate scaffold, storage model (`DataKey`), and contract error enum (`Error`).
- `initialize` (organizer-only) with validation of distribution bps, entry fee, and organizer≠referee.
- `join_tournament` (player-auth) pulls entry fee, dedupes players, emits `registered` event.
- `finalize_results` (referee-only) pays 60/30/10 with deterministic dust to 1st place; emits `finalized` event.
- `cancel_tournament` (organizer-only) records cancellation; registered players claim refunds individually.
- Read-only `get_pool`, `get_reward`, `is_finished`.
- Exhaustive `#[cfg(test)]` suite (28 tests) covering happy paths and all reverts.
- Built, optimized, and uploaded WASM to Testnet; recorded `ESCROW_WASM_HASH` in `apps/web/.env.example`.
- Generated TypeScript bindings under `apps/web/src/contract-client` for Phase 2/4 consumption.

## Phase 2 — Stellar Integration Layer

Built the server-side Stellar integration module (`apps/web/src/lib/stellar/`) that validates inputs, resolves assets, builds unsigned Soroban XDR, submits signed XDR, and polls for results — without ever holding a private key:

- Typed `StellarError` and Zod validators for Stellar public keys (`G…`), contract IDs (`C…`), positive `i128` amounts, base64 XDR, and 10 000-bps distributions.
- Memoized RPC (`rpc.Server`) + Horizon (`Horizon.Server`) client factory from Zod-validated env.
- `resolveSacAddress("XLM" | "USDC")` returning the native SAC from env and deriving the USDC SAC from a network-keyed issuer.
- Network-aware Stellar.Expert URL builders for transactions and contracts.
- Shared Vitest fakes for RPC/Horizon plus canned simulation/transaction responses.
- `simulateAndAssemble` pipeline that always simulates before returning XDR, and `submitSignedXdr` that submits a Freighter-signed XDR and polls `getTransaction` with bounded retries/timeouts.
- Unsigned-XDR builders for `join_tournament`, `claim_refund`, `finalize_results`, `cancel_tournament`, and `deploy` (the generated Phase 1 binding deploys the contract; initialize is a known follow-up once the contract/binding supports constructor-style deploy or a manual multi-op transaction).
- Public barrel (`index.ts`) exporting the exact Phase-4 contract surface.
- Gated Testnet integration test (`RUN_STELLAR_IT=1`) proving a deploy XDR simulates successfully against Testnet.
- Added `@stellar/stellar-sdk` 15 to `apps/web` and adjusted the generated contract-client package for strict TypeScript/ESLint compatibility.


## Phase 5 — Event Subscriber & Live Feed

Stood up the standalone `apps/subscriber` worker that ingests on-chain activity into Postgres and publishes it to Redis, and wired the Phase 4 detail page to a live SSE feed so joins/finalisations/cancellations propagate without a refresh:

- `SubscriberCursor` model + migration (per-contract ledger cursor) and a `ContractEvent @@unique([txHash, type])` migration backing idempotent dedupe.
- `apps/subscriber` package: Zod-validated `getEvents` wrapper, fail-closed env loader, Prisma singleton reusing the web-generated client through the `web` workspace dependency.
- Per-contract ledger cursor with restart recovery (`getCursor`/`setCursor`), advanced only after a successful ingest+publish pass (at-least-once).
- Idempotent reconciliation of `registered`/`finalized`/`cancelled`/`refund_claimed` events into `ContractEvent`/`Participant`/`Payout`/`Tournament` inside one transaction, deduped on `txHash` (replays are no-ops); money handled as `BigInt`.
- Redis publish to `tournament:<id>` + `pollTournament` orchestration; service loop polls every `ACTIVE` tournament with a `contractId`, isolates per-tournament failures, and shuts down gracefully on SIGTERM/SIGINT.
- `GET /api/tournaments/[id]/events` SSE route: replays recent confirmed `ContractEvent` rows from Postgres (source of truth) then streams the Redis channel, with heartbeats and a `?fallback=poll` mode.
- `useTournamentEvents` EventSource hook with auto-reconnect; `<PrizePoolCounter>` ticks up off the stream (key-driven `pool-pop` keyframe, reduced-motion aware) and `<LiveFeed>` renders a human-readable gloss ticker (reduced-motion aware).

End-to-end live-propagation verification (P5.12) is documented as manual steps in the plan/PR — it requires the docker-compose Postgres+Redis stack plus Testnet RPC/Horizon and on-chain transactions, which the CI/sandbox environment does not provide.

- **Live-propagation verification harness (P5.12 / #81):** added `scripts/verify-live-propagation.sh` (boots an isolated `ggg-verify` docker-compose Postgres 17 + Redis 7 stack on dedicated ports so it never collides with a dev stack, applies migrations, optionally boots `next dev`, tears down on exit) + `apps/subscriber/scripts/verify-propagation.ts`, which drives the real Phase 5 wiring and asserts propagation across four legs: **A** idempotent persistence (`reconcile.applyEvent` — replay is a no-op), **B** Redis pub/sub (`publish.publishChange` → `tournament:<id>`), **C** the real `GET /api/tournaments/[id]/events` SSE endpoint (Postgres replay on connect + a live `data:` frame; reconnects on a fresh connection like the `useTournamentEvents` hook to absorb ioredis's first-connection ready-check race), and **D** an opt-in Testnet poll (Friendbot funding + `poller.pollTournament` against a real contract). Verified locally: **legs A–C PASS (11/11)** against Docker + the live SSE route; leg D is operator-gated on a deployed contract id. Full manual create→join→finalize/cancel runbook in `docs/verification/live-propagation.md`.


## Phase 6 — Hardening & Ship

Wrapping the Phase 0–5 app in test, CI, security, and deployment layers (no new product features).

- **Playwright harness + Freighter wallet fixture (P6.1):** added `apps/web/playwright.config.ts` (Testnet baseURL, 120s timeout matching the §15 criterion, single Chromium project, web-server boot, global-setup hook), `e2e/global-setup.ts` (funds organizer/referee/3-player keypairs via Friendbot once, persists to `.e2e/keys.json`), `e2e/fixtures/wallet.ts` (injects a `window.freighterApi`-shaped shim via `addInitScript`, signing delegated to a Node `exposeFunction` over a real Testnet `Keypair` — the documented headless-extension seam; the signer is bound once per context so multi-role tests don't double-register), and `e2e/fixtures/auth.ts` (register+login through the real API). Added the `@playwright/test` dev dep + `e2e` script; excluded `e2e/` from the web typecheck/lint (Playwright has its own transform) and gitignored Playwright artifacts + the funded keypairs.
- **Security headers (P6.4):** hardened the shared `buildSecurityHeaders()` source of truth (consumed by both `next.config.ts` `headers()` and the auth middleware) — CSP now allows the Stellar.Expert explorer origin (a distinct domain from the `*.stellar.org` RPC/Horizon wildcard) and the S3/MinIO image origin (`S3_PUBLIC_ORIGIN`), and adds `object-src 'none'` and `upgrade-insecure-requests`. Strengthened the unit test to assert the exact HSTS/Referrer/X-Frame/X-Content-Type/Permissions-Policy values and every locked-down CSP directive.
- **pnpm audit clean (P6.5):** all 11 `high` advisories were transitive `axios` (`<1.16.0`, pulled via `@stellar/stellar-sdk`). Added a root `pnpm.overrides` entry (`axios@<1.16.0` → `^1.16.0`, resolves to 1.18.1), bringing `pnpm audit --audit-level high` to a clean exit (0 high; 3 moderate remain, below the gate).
- **CI gates (P6.6):** expanded `.github/workflows/ci.yml` from the Phase 0 typecheck/lint/prettier job into two gating jobs. `app` runs against Postgres 17 + Redis 7 service containers with the full fail-closed env set, applies migrations (`prisma migrate deploy`), seeds the DB, then runs typecheck, lint, prettier, unit tests (`pnpm -r test`), integration tests (`pnpm --filter web test:integration`), and `pnpm audit --audit-level high`. `contract` installs the Stellar CLI via `cargo-binstall` (prebuilt), builds the Soroban WASM (`stellar contract build`), and runs `cargo test`. Branch protection (requiring both checks) is documented as a one-time maintainer step; Playwright E2E runs out-of-band against Testnet, not on the PR gate. Also reformatted three pre-existing files the stricter prettier gate flagged (`middleware.ts` + two tests; formatting only).
- **Railway deploy config (P6.7):** added Railway service configs for the three monorepo services. `apps/web/railway.json` (NIXPACKS) builds with `db:generate && next build`, starts `next start`, and runs `prisma migrate deploy && prisma db seed` as the `preDeployCommand` release hook with a `/api/auth/me` healthcheck. `apps/subscriber/railway.json` builds only `db:generate` (the worker runs via `tsx`, no compile step) and runs `pnpm --filter subscriber start` with `restartPolicyType: ALWAYS`. `infra/file-storage/{Dockerfile,railway.json}` ship a MinIO image (DOCKERFILE builder) for the S3-compatible store backed by a Railway Volume at `/data`. Provisioning + per-env variables are documented in RUNBOOK (#90); the configs are committed but the actual Railway provisioning/`railway up` requires a Railway account and is not run from the sandbox.
- **RUNBOOK.md (P6.9):** added the deploy + acceptance runbook — prerequisites, data-plugin provisioning (Postgres 17 + Redis), the three-service deploy table (web release hook = `prisma migrate deploy && db seed`; subscriber `tsx`; file-storage MinIO + Volume), the Testnet-vs-Public per-env variable matrix, admin-password rotation, the CI gate description + the one-time branch-protection command, the Freighter-stub E2E fixture rationale, the six §15 acceptance criteria table (command + expected + outcome slot), and the forward-only rollback procedure. Contains only env-var references, no secret values.
- **E2E acceptance specs + verification (P6.2/P6.3, #83/#84):** fixed the auth fixture to the real NextAuth credentials flow (`/api/auth/csrf` → `/api/auth/callback/credentials` → `ggg.session`; there is no `/api/auth/login`) — verified end-to-end against a local dev server. Wired the `data-testid` hooks the specs query into the real components (`join-qr`, `participant-row`, `payout-row`, `explorer-link`, `status-chip`, `cancel-button`, `confirm-cancel`) and added a `RefundList` that derives one `refund-row` per refunded player at the entry-fee amount (the `cancelled` event only carries a count); all verified to render via `wired-selectors.test.tsx`. Added `e2e/demo-path.spec.ts` (create → join ×3 → finalize → 3 payouts) and `e2e/cancel-refund.spec.ts` (create → join ×2 → cancel → 2 refunds) plus PASS/FAIL runner wrappers (`scripts/verify-demo-path.ts`, `scripts/verify-cancel-refund.ts`) and a manual guide (`docs/verification/e2e-acceptance.md`). The on-chain run itself is operator-gated on a live Testnet deploy (#88).
- **Acceptance + DoD docs (P6.8/P6.10, #89/#91):** `docs/acceptance-spec-15.md` (the six §15 criteria with commands/expected/where-to-check/status) and `docs/definition-of-done.md` (full ship-gate audit). Updated RUNBOOK §8 outcomes. Local gates verified green (typecheck, lint, `pnpm -r test`, `pnpm audit --audit-level high`, `cargo test`, no-secrets grep, docker compose); the sweep surfaced that production `next build` fails (uncaught because CI does not build) → filed #126. Verdict: **BLOCKED** on the build fix + live deploy.
- **Production build fix (#126):** `pnpm --filter web build` was failing (Turbopack) — uncaught because CI ran tests but never a production build, which would have failed the Railway deploy. Fixed three root causes: (1) `apps/web/src/contract-client/package.json` had only an `exports` field with no `main`, so the `@/contract-client` path alias didn't resolve under Turbopack — added `"main": "./src/index.ts"`; (2) `argon2` (native, pulls `fs`) leaked into the browser bundle because the client `register/page.tsx` → `auth-schemas.ts` → `password.ts` import chain dragged in the hasher — split the client-safe `passwordSchema` into `lib/password-schema.ts` (no argon2) and pointed `auth-schemas.ts` at it (`password.ts` re-exports it for back-compat); (3) `globals.css` placed the Google-Fonts `@import url(...)` after `@import "tailwindcss"`, which the Tailwind plugin inlines into ~1300 rules, so the font imports landed after rules and CSS rejected them — moved them to the top. Added a **`Production build`** step to the CI `app` job so this stays caught. Build now passes and emits all routes; typecheck/lint/tests/format unchanged.

## Issue #179 — Add MIT LICENSE file to repo root

Added a root `LICENSE` file containing the full MIT license text, with the copyright line `Copyright © 2026 Artisam Labs` matching the README attribution. No functional changes.

## Audit fix — resolve high-severity transitive advisories

Added `pnpm.overrides` in root `package.json` to force patched versions of transitive dependencies flagged by `pnpm audit --audit-level high`: `brace-expansion`, `js-yaml`, `fast-uri`, and `sharp`. Audit now exits clean at the high level (4 moderate remain below the gate), matching the precedent set in Phase 6.5 for `axios`.

## CI — run workflow on develop pushes

Added `develop` to the CI `push` trigger in `.github/workflows/ci.yml` so merge commits into `develop` display CI status checkmarks on the GitHub repo page. No functional or deployment changes.

## Issue #181 — Public deployment health endpoint

Added a dedicated `/api/health` route that returns a 200 JSON payload with service status and timestamp, and updated `apps/web/railway.json` to use `/health` as the Railway healthcheck path. Includes a unit test. Note: resolving the reported HTTP 403 / stale-deployment behavior for `https://ggg.quest` requires a Railway redeploy by someone with project access.

## Issue #208 — Pin remaining Prisma transitive audit fixes

Added narrowly scoped, temporary pnpm overrides for the final Prisma-transitive audit findings. They are retained only until Prisma releases compatible dependency versions; the dependency-only change is covered by the full quality gate suite.

## Issue #191 — Fix unused middleware parameter

Removed the unused request parameter from the authenticated middleware callback. Authentication remains enforced by the `withAuth` authorization callback and security headers are applied unchanged.

## Issue #229 — Contract-backed tournament join QR

Changed active-tournament QR codes from raw SEP-7 payment URIs to the public tournament URL. Scanning now opens the existing wallet-backed `join_tournament` flow, ensuring the contract records every player and that displayed pool, eligibility, and payouts remain aligned.

## Fix — avoid stale login redirects on tournament creation links

Disabled client prefetching for `/tournaments/new` CTAs. This prevents a prefetch made before authentication has settled from caching the protected route's login redirect and replaying it when the organiser clicks to create a tournament.

## Issue #198 — Clean up SSE subscribers on disconnect and setup failure

The tournament SSE endpoint now uses one idempotent cleanup path for request aborts, stream cancellation, failed setup, and failed writes. Redis subscribers and heartbeat intervals are released in every path; focused tests cover cancellation and replay/subscription failures.

## Issue #233 — Restore settlement deadline integration and TTL safety

Threaded the organiser-selected UTC settlement deadline through tournament creation, persistence, the Stellar transaction builder, and regenerated contract bindings. The conservative 90-day maximum settlement horizon is Testnet-safe and deliberately enforced uniformly on every supported network, so client and contract validation cannot diverge. Contract mutations are responsible for keeping instance and code TTL at 120 days, covering that horizon plus a 30-day margin; if either entry is nevertheless archived, the transaction submitter must restore it before invoking the contract. A CI regenerate-and-diff check guards against future contract/binding ABI drift; legacy tournament rows retain a nullable deadline for forward-migration compatibility and cannot generate a new initialize transaction without one.

Deploy confirmation now keeps a tournament in `DRAFT` until its separate `initialize` transaction confirms. A missing or expired settlement deadline fails closed before activation; a regression test covers expiry during deploy confirmation, ensuring no initialization XDR is returned for an unusable escrow.

## Issue #216 — Permissionless claimant refunds

`claim_refund(player)` is permissionless: after the inclusive settlement deadline, or immediately after cancellation, any caller can submit a claim but the entry fee is always transferred only to that registered player. Each player can claim once; unknown players and finalized escrows are rejected. Cancellation now only records its terminal state, so no transaction loops over participants; individual refund claims are O(1) and preserve transfer atomicity. The contract enforces a Testnet-simulated `MAX_PLAYERS` ceiling of 100 registrations, with tests at the limit and one-over-limit, while refund tests cover deadline/state boundaries, arbitrary callers, exact events, failed transfers, and conservation.
