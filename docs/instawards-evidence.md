# Instawards release and evidence record

Status: **release preparation only**. npm publication is approved but blocked
on publisher 2FA. The staging migration and promotion, Railway deployment, and
the final funded Testnet runs remain pending explicit approval. Historical
Testnet links below are supporting evidence; they do not prove the final public
release.

## Release candidate

| Field | Prepared value |
| --- | --- |
| Repository | `webnxt-2030/ggg` |
| SDK source revision | `313bc0ee2cb0d6d7117c10a18ad78c477d8a6297` |
| Immutable SDK tag | [`escrow-sdk-v0.1.0`](https://github.com/webnxt-2030/ggg/tree/escrow-sdk-v0.1.0) |
| Source CI | [Successful run 35827482104](https://github.com/webnxt-2030/ggg/actions/runs/35827482104) |
| SDK package | `@ggg/escrow-sdk@0.1.0` |
| npm state | Unpublished as of 2026-09-23; publish returned `E403` because interactive 2FA or a granular token allowed to bypass 2FA is required |
| Network | Stellar Testnet / `Test SDF Network ; September 2015` |
| Escrow WASM | `b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9` |
| Public app health URL | `https://app.ggg.quest/api/health` |
| Current staging revision | `8647e5fa6fb6d5ba94cff7d8dd7974b3a2abc28d` (web and subscriber) |

`313bc0e` is the reviewed SDK source revision and the target of the immutable
SDK tag. It upgrades the package and its direct workspace consumers to
`@stellar/stellar-sdk@16.3.0`; a clean external npm install and production audit
report zero vulnerabilities. The later staging promotion revision may add
release evidence only, but must not change the tagged package or application
source without repeating the package and deployment review.

PR #324 is an active, unrelated feature PR against `develop` that changes SDK
distribution behavior. It was explicitly excluded from this release on
2026-09-23 and must not merge until the #226 release revision is frozen. If it
does merge first, the final revision, tarball, tests, and evidence must be
regenerated.

## Package and tarball verification

The package metadata declares the public MIT-licensed scope and version,
Node.js 22+, the public repository and package directory, public npm access,
and two ESM exports:

- `@ggg/escrow-sdk` -> `dist/index.js` with `dist/index.d.ts`;
- `@ggg/escrow-sdk/contract` -> `dist/contract/index.js` with
  `dist/contract/index.d.ts`.

The package README documents keyless build/sign/submit/reconcile behavior,
bigint/stroop and BPS rules, deadlines, current-WASM compatibility, error
codes, binding regeneration, and the standalone Node example. `LICENSE` is the
MIT license with the same 2026 Artisam Labs attribution as the repository.

`pnpm pack` produced `ggg-escrow-sdk-0.1.0.tgz` with these verified unpublished values.
The packer removes the `prepack` lifecycle hook from the published manifest but
preserves the package's runtime metadata, dependencies, exports, license,
repository, and engine requirements:

| Field | Value |
| --- | --- |
| Packed size | 14,595 bytes |
| Unpacked size | 51,196 bytes |
| Entries | 11 |
| SHA-1 | `ef724b70ee3b692bde017c3f0f41c48438db6c51` |
| Integrity | `sha512-0NNdR6kwdVY9x/ysssyDdsN5501E2XqPGokE9ZnhGo/s1P9/dFxLU9/31xqKjTXFvnVsgoRbwuG2I5+XFli1JA==` |

The tarball contains only:

```text
LICENSE
README.md
package.json
dist/contract/index.d.ts
dist/contract/index.js
dist/distribution.d.ts
dist/distribution.js
dist/index.d.ts
dist/index.js
dist/sdk.d.ts
dist/sdk.js
```

It contains no source maps, tests, fixtures, app code, environment files,
credentials, workspace aliases, or unrelated repository files. A disposable
external project installed the tarball, imported both public exports, built a
simulated join transaction, and validated externally signed XDR successfully.

### Commands and results recorded on 2026-09-23

| Command/check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed after allowing the pinned packages and Prisma engine to download |
| `pnpm --filter @ggg/escrow-sdk build` | Passed |
| `pnpm --filter @ggg/escrow-sdk test` | Passed: 25 tests |
| `node examples/nodejs-escrow/smoke.mjs` | Passed in a disposable non-workspace consumer |
| `npm publish ggg-escrow-sdk-0.1.0.tgz --access public --dry-run --json` | Passed twice; reproduced the 11-file manifest and integrity above |
| Clean `npm install` of the tarball | Passed: 45 production packages added, 46 audited |
| Clean `npm audit --omit=dev --audit-level=high` | Passed: zero vulnerabilities |
| Workspace `pnpm audit --audit-level high` | Passed: no high or critical findings; 13 moderate and 1 low remain |
| Exact Stellar CLI 27.0.0 contract build | Passed; 10,946-byte WASM with hash `b704f577...a46dd9` |
| Generated binding comparison | Passed; generated binding matches the checked-in SDK binding |
| `cargo test` | Passed: 76 tests |
| Local Prisma generate/migrate/seed | Passed; 11 migrations applied, none pending, idempotent seed passed in `ggg_integration` |
| Subscriber tests | Passed: 27 tests |
| Web tests | Passed: 604 tests |
| Web API integration tests | Passed: 18 tests using `ggg_integration` and Redis database 15 |
| Workspace typecheck and lint | Passed |
| Web production build | Passed |
| Local production `GET /api/health` | HTTP 200 |
| Repository-wide Prettier check | Not a release signal on this Windows checkout; it reports 249 pre-existing files. Format-check only changed files. |

The former clean-consumer blocker is resolved in the release-readiness branch.
All direct workspace consumers use Stellar SDK 16.3.0, whose package tree uses
`axios@1.18.0` and `smol-toml` instead of the vulnerable SDK 15 tree. CI now
runs `npm audit --omit=dev --audit-level=high` inside its clean tarball consumer,
so workspace-only pnpm overrides cannot mask future package advisories.

## ABI and WASM relationship

The official Windows Stellar CLI 27.0.0 release archive was verified against
its published SHA-256
`4b52649dbad0288e91d73228cb134096a4e9f5fc5b3a480c685873a45f0ad863`.
With Rust 1.98.1 and the committed contract lockfile, it reproduced the current
10,946-byte WASM and hash
`b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9`.
The artifact exports:

```text
__constructor
cancel_tournament
claim_refund
claim_refund_after_deadline
finalize_results
get_players
get_pool
get_reward
get_settlement_deadline
get_tournament
is_finished
join_tournament
```

The regenerated TypeScript binding matches the checked-in package binding.
Stellar CLI 27.1.0 produced different optimized bytes and hash from the same
source, so release reproduction must use the CI-pinned 27.0.0 toolchain. Before
deployment, verify the `b704...a46dd9` ContractCode entry still exists on
Testnet. Re-uploading identical bytes is unnecessary if that content-addressed
entry remains available; a Testnet reset requires a new verified upload.

Supporting public history: [WASM upload and named deadline refund](verification/sow-deadline-refund-entrypoint.md)
and [standalone Node Testnet paths](verification/issue-225-node-example-testnet.md).

## npm publication gate

The source review, exact-revision CI, immutable tag, and publication approval
are complete. Do not retry the publish command until this integrity correction
is reviewed and the publisher can complete npm 2FA.

```sh
git fetch origin tag escrow-sdk-v0.1.0
git checkout --detach escrow-sdk-v0.1.0
pnpm install --frozen-lockfile
pnpm --filter @ggg/escrow-sdk build
pnpm --filter @ggg/escrow-sdk test
pnpm --dir packages/escrow-sdk pack
npm publish packages/escrow-sdk/ggg-escrow-sdk-0.1.0.tgz --access public
npm view @ggg/escrow-sdk@0.1.0 version dist repository license engines exports --json
```

After publication, install from the registry—not the local tarball—in a fresh
external directory and rerun the example smoke. Record:

| Publication evidence field | Status |
| --- | --- |
| Public npm version URL | Pending publisher 2FA |
| Registry tarball URL | Pending publication |
| Registry SHA-1 and integrity | Pending publication; must match the approved tarball |
| Reviewed source commit and immutable tag | `313bc0e`; `escrow-sdk-v0.1.0` |
| Publish date and publisher account name | Pending publication |
| Fresh `npm install @ggg/escrow-sdk@0.1.0` result | Pending publication |
| Registry-installed Node example result | Pending publication |
| Public CI run for the exact revision | [Run 35827482104](https://github.com/webnxt-2030/ggg/actions/runs/35827482104) passed |

Required npm access: an account authorized to publish the public `@ggg` scope,
an npm authentication method with publish permission, and any required 2FA/OTP
or trusted-publishing configuration. Never place the token or OTP in a command,
log, screenshot, shell history, or repository file.

## Staging database, migration, and rollback plan

The two #224 migrations are:

1. `20260922000000_sdk_vectors_and_prepared_transactions`;
2. `20260922010000_prepared_escrow_created_at_idx`.

The first converts the fixed three-rank columns to the ordered
`distributionBps` array and adds prepared transaction storage. Old web code
cannot read the new schema, and new code cannot read the old schema. Use a
coordinated maintenance window; do not allow writes between migration and the
new web/subscriber deployment.

Before approval:

- upgrade the local Railway CLI from 5.23.2 to a version supporting native
  Postgres backup commands (5.47.1+ is preferred by the current Railway
  guidance), or select and document an equivalent dashboard backup path;
- confirm backup/PITR eligibility for the staging Postgres service, currently a
  Postgres 18 `postgres-ssl` image;
- record the current database revision and confirm both #224 migrations are
  absent before the release;
- agree on a release window and stop or prevent writes.

After explicit migration approval:

1. Create a named pre-migration backup, record its ID/time/coverage, lock it if
   supported, and verify it is restorable.
2. From the exact reviewed worktree, run only `prisma migrate deploy` using
   variables injected by Railway; never print `DATABASE_URL`.
3. Verify both migrations are applied and inspect representative legacy rows
   for ordered `[first, second, third]` conversion.
4. Configure `ESCROW_WASM_HASH=b704...a46dd9` on `ggg-app` with Railway's
   `--stdin --skip-deploys` path so the variable change does not create an
   uncoordinated deployment.
5. Immediately perform the exact staging promotion below.

Rollback after migration is a database recovery, not merely a code redeploy.
Stop writes, restore the named pre-migration backup, verify the old fixed-rank
schema and row counts, then redeploy both web and subscriber at the recorded
pre-release revision. Restoring the backup discards writes made after it. A
reverse migration is unsafe once any 1-, 2-, or 4–10-rank tournament exists.

## Exact develop-to-staging promotion

Both Railway services are confirmed to track `staging`. They currently run
`8647e5fa...` successfully. The Git branches are not presently fast-forward
compatible: `origin/staging` is at `8647e5fa...`, with five staging-only release
merge commits, while candidate `origin/develop` is 35 commits ahead of their
merge base.

To deploy the exact reviewed commit without force-pushing or creating a new,
unreviewed staging merge commit:

1. Before final review, merge the staging-only history back into `develop` via
   a normal reviewed PR. Those five commits are release merge commits; confirm
   this reconciliation produces no content changes.
2. Merge the dependency fix and these evidence docs into `develop`; call the
   resulting reviewed, green commit `RELEASE_REVISION`.
3. Freshly fetch both branches and require
   `git merge-base --is-ancestor origin/staging RELEASE_REVISION` and
   `git rev-parse origin/develop == RELEASE_REVISION`.
4. Record the `RELEASE_REVISION` commit and tree IDs, CI links, tarball
   integrity, pre-release staging revision, and database backup ID.
5. After the migration and deferred WASM-variable configuration, request the
   explicit promotion approval and fast-forward `staging` directly to
   `RELEASE_REVISION`. Do not use a merge commit, cherry-pick, or force push.
6. Capture the web and subscriber deployment IDs created by that branch update
   and require both exact commit hashes and terminal `SUCCESS` states.

The active Railway web configuration differs from the committed
`apps/web/railway.json`: the live deployment currently has no Railway health
check and runs a dashboard-configured Railpack build/predeploy command. Verify
the effective commands before promotion and use the public health request as a
mandatory post-deploy gate. The subscriber and web must deploy the same commit.

## Coordinated staging and Testnet sequence

These are separate approval gates and must run in this order:

1. Identify and record the exact reviewed `develop` revision.
2. Take and verify the staging database backup.
3. Apply the two #224 migrations from that exact revision.
4. Configure the matching `b704...a46dd9` WASM hash without an early deploy.
5. Fast-forward `staging` and deploy web and subscriber together from it.
6. Verify both deployment IDs/revisions and public
   `GET https://app.ggg.quest/api/health` HTTP 200.
7. On one new instance, run create -> funded join -> referee settlement ->
   payout and confirm state, events, balances, and Explorer transactions.
8. On a second new instance, run delegated deadline refund at/after the
   inclusive deadline. On a third, run cancellation then refund claim.
9. Record public npm, source/CI, health, deployment revision, contract IDs,
   transaction, payout/refund, and Stellar Explorer evidence.

The current stale deployment returned HTTP 200 at `app.ggg.quest/api/health`
on 2026-09-23; `ggg.quest/api/health` returned 404 because that host is the
landing site. This is a baseline only and must not be reused as final evidence.

## Live Testnet evidence checklist

- [ ] Exact run date/time, Testnet network, and passphrase.
- [ ] Final reviewed source revision/tag, package version, registry integrity,
      WASM hash, and matching Railway web/subscriber revision.
- [ ] Public health URL and an external HTTP 200 response captured after both
      deployments succeed.
- [ ] Settlement instance: constructor deployment transaction/contract ID,
      every join transaction, finalize transaction, configured ordered BPS,
      confirmed rewards/payout amounts, events, relevant balance deltas, and
      zero remaining pool.
- [ ] Deadline instance: distinct contract ID, join transaction, on-chain
      deadline, delegated claimant/source address, post-deadline refund
      transaction/event, recipient amount, and pool result.
- [ ] Cancellation instance: distinct contract ID, join, cancellation, refund
      claim/event, recipient amount, and pool result.
- [ ] Public Stellar Expert Testnet links for every transaction and contract.
- [ ] Public SDK README, Node example, CI run, and demo video links.
- [ ] Testnet-reset warning: hashes and IDs are historical evidence and may not
      remain usable configuration.
- [ ] No Mainnet, multi-wallet, external-audit, or unaudited-security claim.

Historical #225 transactions demonstrate that the example worked before this
release. They do not replace a final post-deployment run through the reviewed
SDK-backed public app.

## Credentials and environment prerequisites

- **npm:** authorized `@ggg` publisher, secure publish authentication, and
  required 2FA/OTP or trusted publishing.
- **GitHub:** permission to review/merge the dependency and history-reconcile
  changes, then fast-forward the protected `staging` branch.
- **Railway:** access to the `ggg` project/staging environment, Postgres backup
  and restore capability, migration execution, deferred variable changes, and
  web/subscriber deployment/status/log access. Upgrade the CLI before backup.
- **Stellar:** reachable Testnet RPC and Horizon, verified native SAC (or funded
  token SAC), the current ContractCode entry, and a synchronized UTC clock.
- **Wallets/signing:** funded organizer, distinct referee, 1–10 unique players,
  and a delegate. All need XLM for fees/reserves; each player needs the entry
  asset for every planned independent instance. Keep seed phrases and secret
  keys exclusively in Freighter or the external signer.
- **Application:** organizer/admin account access for the public app and a
  running subscriber connected to the same Postgres, Redis, network, and
  revision as the web service.
- **Evidence:** public GitHub/CI/npm/health/Explorer links and a public demo-video
  destination accessible while logged out.

Never print or persist npm tokens, Railway tokens/variables, database URLs,
wallet secrets, signed XDR, or signer errors. Public wallet addresses,
transaction hashes, contract IDs, the network passphrase, and WASM hash may be
recorded.

## Blockers and smallest next approval

1. The former external npm audit blocker is fixed and fully retested. npm
   publication now requires the publisher to complete interactive 2FA or use a
   granular token explicitly allowed to bypass 2FA; no package version was
   created by the rejected attempt.
2. PR #324 is excluded; keep it unmerged while `develop` is frozen and the
   exact artifact is published and promoted.
3. `staging` history is reconciled into `develop`; reverify ancestry immediately
   before the approved fast-forward promotion.
4. The staging backup method and current migration state remain environment
   gates; no staging database operation was performed during preparation.
5. npm publication, staging promotion, Railway changes/deployment, and funded
   Testnet transactions remain unperformed. Only npm publication is currently
   approved.

The current approval covers the immutable SDK tag and npm publication. The tag
was pushed; publication was rejected before package creation because npm needs
interactive 2FA or an eligible granular token. It does **not** cover staging
migration/promotion, Railway changes/deployment, or funded Testnet activity.
