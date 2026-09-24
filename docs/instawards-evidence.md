# Instawards release and evidence record

Status: **SDK published; staging deployed**. The corrected package is public
on npm from the reviewed immutable source tag. The staging database migrations,
exact-revision promotion, matching WASM configuration, and Railway deployment
are complete. The final funded Testnet runs remain pending explicit approval.
Historical Testnet links below are supporting evidence; they do not prove the
final deployed release.

## SDK release

| Field | Prepared value |
| --- | --- |
| Repository | `webnxt-2030/ggg` |
| SDK source revision | `26f41f059994b33ab09085f4de09e4431069c391` |
| Immutable SDK tag | [`goodgameguild-escrow-sdk-v0.1.0`](https://github.com/webnxt-2030/ggg/tree/goodgameguild-escrow-sdk-v0.1.0); the earlier [`escrow-sdk-v0.1.0`](https://github.com/webnxt-2030/ggg/tree/escrow-sdk-v0.1.0) candidate is superseded and was not moved |
| Source CI | Exact post-merge [run 35843403207](https://github.com/webnxt-2030/ggg/actions/runs/35843403207) passed |
| SDK package | `@goodgameguild/escrow-sdk@0.1.0` |
| npm state | [Published publicly](https://www.npmjs.com/package/@goodgameguild/escrow-sdk/v/0.1.0) on 2026-09-23 by `0xhakua`, a verified owner of the `goodgameguild` organization |
| Network | Stellar Testnet / `Test SDF Network ; September 2015` |
| Escrow WASM | `b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9` |
| Public app health URL | `https://app.ggg.quest/api/health` |
| Current staging revision | `b50ff27d7836cfec662097f3ad5eff084d57c097` (web and subscriber) |
| Pre-migration backup | `issue-226-pre-migration-20260923` (`8c12d727-0f52-4118-846b-2dc160c3cf6d`) |
| Railway deployments | Web `1a2af8c2-4b7d-4251-99c7-6f6cc684038e`; subscriber `77dadfbc-6452-413f-895d-943b0ca4e3ab` |
| Post-deploy health | HTTP 200 from `https://app.ggg.quest/api/health` at `2026-09-24T05:26:14.414Z` |

`313bc0e` is the superseded reviewed candidate and remains the target of the
immutable `escrow-sdk-v0.1.0` tag. That tag will not be rewritten. The corrected
package kept version `0.1.0` because the rejected attempts created no npm
version. The corrected merge revision `26f41f0` is the target of the immutable
scope-specific tag `goodgameguild-escrow-sdk-v0.1.0`. The base candidate
upgrades the package and its direct workspace consumers to
`@stellar/stellar-sdk@16.3.0`; a clean external npm install and production audit
report zero vulnerabilities. The later staging promotion revision may add
release evidence only, but must not change the tagged package or application
source without repeating the package and deployment review.

PR #324 is an active, unrelated feature PR against `develop` that changes SDK
distribution behavior. It was explicitly excluded from this release on
2026-09-23. The staged #226 release is frozen at `b50ff27`; any later change
from #324 is outside this evidence record and requires its own review before a
subsequent staging promotion.

## Package and tarball verification

The package metadata declares the public MIT-licensed scope and version,
Node.js 22+, the public repository and package directory, public npm access,
and two ESM exports:

- `@goodgameguild/escrow-sdk` -> `dist/index.js` with `dist/index.d.ts`;
- `@goodgameguild/escrow-sdk/contract` -> `dist/contract/index.js` with
  `dist/contract/index.d.ts`.

The package README documents keyless build/sign/submit/reconcile behavior,
bigint/stroop and BPS rules, deadlines, current-WASM compatibility, error
codes, binding regeneration, and the standalone Node example. `LICENSE` is the
MIT license with the same 2026 Artisam Labs attribution as the repository.

`pnpm pack` produced `goodgameguild-escrow-sdk-0.1.0.tgz` with these verified unpublished values.
The packer removes the `prepack` lifecycle hook from the published manifest but
preserves the package's runtime metadata, dependencies, exports, license,
repository, and engine requirements:

| Field | Value |
| --- | --- |
| Packed size | 14,604 bytes |
| Unpacked size | 51,266 bytes |
| Entries | 11 |
| SHA-1 | `1372c6d4a04d4fd7293ec813405cc14a72173c33` |
| Integrity | `sha512-Mx1unWUJTXEH1ONVvkcsE0dIgm+5IFBlZJtLFEUizn7DQa8iRVWRDyQoTAUAJPuonGC05xTNcUzRi0hbuycqfA==` |

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
| `pnpm --filter @goodgameguild/escrow-sdk build` | Passed |
| `pnpm --filter @goodgameguild/escrow-sdk test` | Passed: 25 tests |
| `node examples/nodejs-escrow/smoke.mjs` | Passed in a disposable non-workspace consumer |
| `npm publish goodgameguild-escrow-sdk-0.1.0.tgz --access public --dry-run --json` | Passed; reproduced the 11-file manifest and integrity above |
| Clean `npm install` of the tarball | Passed: 45 production packages added, 46 audited |
| Clean `npm audit --omit=dev --audit-level=high` | Passed: zero vulnerabilities |
| `npm org ls goodgameguild 0xhakua --json` | Passed: `0xhakua` is an organization owner |
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

## npm publication evidence

Publication completed from the detached immutable tag after exact-revision CI.
These commands describe the reviewed release path; do not rerun `npm publish`
for version `0.1.0`, which is now immutable in the registry.

```sh
git fetch origin tag goodgameguild-escrow-sdk-v0.1.0
git checkout --detach goodgameguild-escrow-sdk-v0.1.0
pnpm install --frozen-lockfile
pnpm --filter @goodgameguild/escrow-sdk build
pnpm --filter @goodgameguild/escrow-sdk test
pnpm --dir packages/escrow-sdk pack
npm publish packages/escrow-sdk/goodgameguild-escrow-sdk-0.1.0.tgz --access public
npm view @goodgameguild/escrow-sdk@0.1.0 version dist repository license engines exports --json
```

After publication, a fresh external directory installed from the registry—not
the local tarball—and reran the example smoke with these results:

| Publication evidence field | Status |
| --- | --- |
| Public npm version URL | [`@goodgameguild/escrow-sdk@0.1.0`](https://www.npmjs.com/package/@goodgameguild/escrow-sdk/v/0.1.0) |
| Registry tarball URL | `https://registry.npmjs.org/@goodgameguild/escrow-sdk/-/escrow-sdk-0.1.0.tgz` |
| Registry SHA-1 and integrity | `1372c6d4a04d4fd7293ec813405cc14a72173c33`; `sha512-Mx1unWUJTXEH1ONVvkcsE0dIgm+5IFBlZJtLFEUizn7DQa8iRVWRDyQoTAUAJPuonGC05xTNcUzRi0hbuycqfA==` (matches reviewed tarball) |
| Reviewed source commit and immutable tag | `26f41f059994b33ab09085f4de09e4431069c391`; `goodgameguild-escrow-sdk-v0.1.0` |
| Publish date and publisher account name | `2026-09-23T09:56:09.569Z`; `0xhakua` |
| Fresh `npm install @goodgameguild/escrow-sdk@0.1.0` result | Passed: 45 packages added, 46 audited, zero vulnerabilities |
| Registry-installed Node example result | Passed: public API, configuration, simulated join construction, and signed-XDR validation |
| Public CI run for the exact revision | [Run 35843403207](https://github.com/webnxt-2030/ggg/actions/runs/35843403207) passed |

Required npm access: an account authorized to publish the public
`@goodgameguild` scope,
an npm authentication method with publish permission, and any required 2FA/OTP
or trusted-publishing configuration. Never place the token or OTP in a command,
log, screenshot, shell history, or repository file.

## Staging database, migration, and rollback record

The two #224 migrations are:

1. `20260922000000_sdk_vectors_and_prepared_transactions`;
2. `20260922010000_prepared_escrow_created_at_idx`.

The first converts the fixed three-rank columns to the ordered
`distributionBps` array and adds prepared transaction storage. Old web code
cannot read the new schema, and new code cannot read the old schema. Use a
coordinated maintenance window; do not allow writes between migration and the
new web/subscriber deployment.

On 2026-09-23 Railway backup `issue-226-pre-migration-20260923`
(`8c12d727-0f52-4118-846b-2dc160c3cf6d`) was created for the staging Postgres
service. Railway reports it present with no expiry; a destructive restore test
was not performed.

On 2026-09-24 both application services were stopped before migration. The two
migrations above were then applied from exact reviewed revision `b50ff27` using
Railway-injected variables. Prisma reports all 11 migrations applied and the
schema up to date. A post-migration check found 74 tournaments and zero invalid
payout vectors: every vector has 1–10 positive ranks totaling 10,000 BPS.
`ESCROW_WASM_HASH` was set to the reviewed `b704...a46dd9` value without an
early deployment, immediately before the coordinated promotion.

Rollback after migration is a database recovery, not merely a code redeploy.
Stop writes, restore the named pre-migration backup, verify the old fixed-rank
schema and row counts, then redeploy both web and subscriber at the recorded
pre-release revision. Restoring the backup discards writes made after it. A
reverse migration is unsafe once any 1-, 2-, or 4–10-rank tournament exists.

## Exact develop-to-staging promotion

The staging-only release history was reconciled into `develop` before review,
making the branches fast-forward compatible. On 2026-09-24 `staging` was
fast-forwarded without force from `8647e5fa...` directly to reviewed, green
revision `b50ff27d7836cfec662097f3ad5eff084d57c097`. A final remote check
confirmed `refs/heads/staging` at that exact revision.

Railway web deployment `1a2af8c2-4b7d-4251-99c7-6f6cc684038e` reached
`SUCCESS` and is running the exact revision. The first subscriber deployment,
`cff09ae7-b52e-4834-85f9-88c831de9d4f`, crashed because the Railway build
command did not build the workspace SDK's `dist` output. The build command was
corrected to build `@goodgameguild/escrow-sdk`, and replacement deployment
`77dadfbc-6452-413f-895d-943b0ca4e3ab` reached `SUCCESS` and is running the
same exact revision. Subscriber polling continues normally; legacy contracts
with older WASM are isolated as unsupported rather than crashing the process.

The active Railway web configuration differs from the committed
`apps/web/railway.json`: the live deployment currently has no Railway health
check and runs a dashboard-configured Railpack build/predeploy command. Verify
the effective commands before promotion and use the public health request as a
mandatory post-deploy gate. The subscriber's effective build command was also
corrected during this release; `apps/subscriber/railway.json` now preserves the
SDK build step for future deployments. The subscriber and web deploy the same
commit.

## Coordinated staging and Testnet sequence

These are separate approval gates and run in this order:

1. [x] Identify and record exact reviewed `develop` revision `b50ff27`.
2. [x] Take and verify the staging database backup.
3. [x] Apply the two #224 migrations from that exact revision.
4. [x] Configure the matching `b704...a46dd9` WASM hash without an early deploy.
5. [x] Fast-forward `staging` and deploy web and subscriber from it.
6. [x] Verify both deployment IDs/revisions and public
   `GET https://app.ggg.quest/api/health` HTTP 200.
7. [ ] On one new instance, run create -> funded join -> referee settlement ->
   payout and confirm state, events, balances, and Explorer transactions.
8. [ ] On a second new instance, run delegated deadline refund at/after the
   inclusive deadline. On a third, run cancellation then refund claim.
9. [ ] Record public npm, source/CI, health, deployment revision, contract IDs,
   transaction, payout/refund, and Stellar Explorer evidence.

The promoted deployment returned HTTP 200 at `app.ggg.quest/api/health` after
both services reached their healthy replacement states. `ggg.quest/api/health`
is not the application endpoint; that host is the landing site.

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

- **npm:** authorized `@goodgameguild` publisher, secure publish authentication, and
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

1. The former external npm audit and scope blockers are resolved. The reviewed
   package is public under the project-owned `@goodgameguild` scope, and its
   registry integrity and clean-consumer audit match the release evidence.
2. PR #324 is excluded; keep it unmerged while `develop` is frozen and the
   exact artifact is published and promoted.
3. `staging` history is reconciled into `develop`; reverify ancestry immediately
   before the approved fast-forward promotion.
4. The staging backup method and current migration state remain environment
   gates; no staging database operation was performed during preparation.
5. Staging promotion, Railway changes/deployment, and funded Testnet
   transactions remain unperformed and require explicit approval.

The immutable corrected SDK tag and npm publication are complete. The
superseded tag remains unchanged. No approval has been given for staging
migration/promotion, Railway changes/deployment, or funded Testnet activity.
