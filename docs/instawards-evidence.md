# Instawards release and evidence record

Status: **SDK published; staging deployed; live Testnet paths verified**. The
corrected package is public on npm from the reviewed immutable source tag. The
staging database migrations, matching WASM configuration, Railway deployment,
and final funded settlement, deadline-refund, and cancellation-refund paths are
complete. The edited [full-flow demo recording](https://drive.google.com/file/d/1NvTigSXywA8Uk5PpIhEwdjDpWx_DfKmd/view?usp=sharing)
is published at a durable public URL and is accessible without authentication.

## SDK release

| Field | Prepared value |
| --- | --- |
| Public repository | [`artisam-ggg/ggg`](https://github.com/artisam-ggg/ggg) |
| SDK source revision | `26f41f059994b33ab09085f4de09e4431069c391` |
| Immutable SDK tag | [`goodgameguild-escrow-sdk-v0.1.0`](https://github.com/artisam-ggg/ggg/tree/goodgameguild-escrow-sdk-v0.1.0); the superseded private candidate tag was not published to the public mirror |
| Public release CI | Exact public [`develop` run 35977199117](https://github.com/artisam-ggg/ggg/actions/runs/35977199117) and [`staging` run 35977199084](https://github.com/artisam-ggg/ggg/actions/runs/35977199084) passed, including SDK package verification |
| SDK package | `@goodgameguild/escrow-sdk@0.1.0` |
| npm state | [Published publicly](https://www.npmjs.com/package/@goodgameguild/escrow-sdk/v/0.1.0) on 2026-09-23 by `0xhakua`, a verified owner of the `goodgameguild` organization |
| Network | Stellar Testnet / `Test SDF Network ; September 2015` |
| Escrow WASM | `b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9` |
| Public app health URL | `https://app.ggg.quest/api/health` |
| Final application evidence revision | `15902cfdd626d0d5e6629f10b01990dc9dc5cd4c`, synchronized across private/public `develop` and `staging`; the application tree matches the funded run because later changes were evidence documentation only |
| Pre-migration backup | `issue-226-pre-migration-20260923` (`8c12d727-0f52-4118-846b-2dc160c3cf6d`) |
| Evidence deployments | Web `f5e76302-57bf-45b1-a569-f54cb4a4b6bb`; subscriber `465c460d-c91e-4cf0-9b98-78b63963a2a7`, both `SUCCESS` on `15902cf` |
| Post-deploy health | HTTP 200 from `https://app.ggg.quest/api/health`, rechecked after the final promotion and again before the live run |
| Demo video | [Edited full-flow Testnet recording](https://drive.google.com/file/d/1NvTigSXywA8Uk5PpIhEwdjDpWx_DfKmd/view?usp=sharing); anonymous direct access returned HTTP 200, `video/mp4`, and `Content-Length: 52969934` on 2026-09-24 |

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
2026-09-23. The funded run used the reviewed application tree at `673269f` via
staging promotion `2f95987`. Final evidence revision `15902cf` retains that
application tree and adds the subscriber configuration/evidence record. Any
later change from #324 is outside this evidence record and requires its own
review before a subsequent staging promotion.

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
| Public CI on the final published repository revision | [`develop` run 35977199117](https://github.com/artisam-ggg/ggg/actions/runs/35977199117) and [`staging` run 35977199084](https://github.com/artisam-ggg/ggg/actions/runs/35977199084) passed |

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

PR #329 then persisted that live subscriber build correction in the repository
at reviewed `develop` revision `673269f`. Promotion PR #330 was merged through
GitHub, producing staging-only merge commit `2f95987`; a direct tree comparison
confirmed it is byte-for-byte identical to `673269f`. Web deployment
`3c910613-65f1-44ef-91b9-87f50c0a0ae6` and subscriber deployment
`f7ae4591-aa06-4ba1-b45d-0d96e17420fd` both reached `SUCCESS` on `2f95987`.
History-only PR #331 reconciled that promotion commit back into `develop` at
`08524a9`; post-merge CI passed, `staging` is an ancestor of `develop`, and the
two branch tips still have identical trees. The reconciliation did not trigger
another Railway deployment.

Final evidence PR #332 merged at `15902cf`. Private `staging` was then
fast-forwarded without a merge commit, producing successful web deployment
`f5e76302-57bf-45b1-a569-f54cb4a4b6bb` and subscriber deployment
`465c460d-c91e-4cf0-9b98-78b63963a2a7`; the public health endpoint returned
HTTP 200. The same exact revision and immutable SDK tag were fast-forwarded to
the public [`artisam-ggg/ggg`](https://github.com/artisam-ggg/ggg) mirror, where
both public branch CI runs passed.

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

1. [x] Identify and record the reviewed application revisions: initial release
   `b50ff27`, followed by the subscriber configuration/evidence tree at `673269f`.
2. [x] Take and verify the staging database backup.
3. [x] Apply the two #224 migrations from that exact revision.
4. [x] Configure the matching `b704...a46dd9` WASM hash without an early deploy.
5. [x] Promote the reviewed tree to `staging` and deploy web and subscriber.
6. [x] Verify both deployment IDs/revisions and public
   `GET https://app.ggg.quest/api/health` HTTP 200.
7. [x] On one new instance, run create -> funded join -> referee settlement ->
   payout and confirm state, events, balances, and Explorer transactions.
8. [x] On a second new instance, run delegated deadline refund at/after the
   inclusive deadline. On a third, run cancellation then refund claim.
9. [x] Record public npm, source/CI, health, deployment revision, contract IDs,
   transaction, payout/refund, and Stellar Explorer evidence.

The promoted deployment returned HTTP 200 at `app.ggg.quest/api/health` after
both services reached their healthy replacement states. `ggg.quest/api/health`
is not the application endpoint; that host is the landing site.

## Final live Testnet verification

The final run completed at `2026-09-24T07:42:04.392Z` on Stellar Testnet with
network passphrase `Test SDF Network ; September 2015`. It used the public
SDK-backed app after both Railway deployments reached `SUCCESS`. Six new
Friendbot-funded identities were generated and held only in process memory; no
secret key, signed XDR, or signer error was printed or written to disk.

All three instances used native XLM and a 10,000,000-stroop (1 XLM) entry fee.
The app created each contract with the reviewed WASM hash, submitted the signed
transactions, and displayed subscriber-confirmed terminal state. Independent
Stellar RPC queries reported `SUCCESS` for every hash and returned the contract
events below. SDK reads separately confirmed the stored terminal states,
rewards, and zero remaining pools.

### Roles and balances

| Role | Public Testnet address | Start XLM | End XLM |
| --- | --- | ---: | ---: |
| Organizer | `GAG3AHKA3CP442LBZERMEPSMFCPQPBSJ64Y3AXQYN5QVLONBCCQYCPVB` | 10000.0000000 | 9999.1309790 |
| Referee | `GANKD4SYH3MAZEMCOGHS3SU3Q5KH3BLB3NGUD6MNXCHUZBDLLDWHFZIT` | 10000.0000000 | 9999.8628350 |
| Player / rank 1 | `GCRENDDQCW5LJW7N2J5MI6OEDAFYOAMZOZUAGK5B6X42QA7WSLWAI6TJ` | 10000.0000000 | 10000.4856721 |
| Player / rank 2 | `GB7NE5BYCCGF6KKVPLWMZ4RER7LWHNR675AXXVFWWF5XN6Z4HN3KZ5HE` | 10000.0000000 | 9999.8369022 |
| Player / rank 3 | `GBO67LPTKQUZ7YBCL3PKZ442LQXWVUJK5FLON7FYTAJEHH777IBP3OWY` | 10000.0000000 | 9999.2368896 |
| Deadline-refund delegate | `GC5GQQVFQVBSDRUJK7OVGHFN3P27NEMAFVL4XXFRK2IV4L26O4JDNC7K` | 10000.0000000 | 9999.9560085 |

The balance changes combine all three independent paths and network/resource
fees, so exact contract transfers are established by the decoded events and
contract reads rather than by subtracting these aggregate account balances.

### Ranked settlement

Application instance:
[`cmuf5wvup000615umdhi6qvg1`](https://app.ggg.quest/tournaments/cmuf5wvup000615umdhi6qvg1).
Contract:
[`CBY7HPZHB3LNCZOB6LP6HAL5YF6DI3VZCACLI6H5K72ETI6ZFKDKOK3B`](https://stellar.expert/explorer/testnet/contract/CBY7HPZHB3LNCZOB6LP6HAL5YF6DI3VZCACLI6H5K72ETI6ZFKDKOK3B).

- Constructor deployment: [`22762e0b…5f84`](https://stellar.expert/explorer/testnet/tx/22762e0b0bdc585d2b66ab1846a50e1875f49556be3666330eab3b06d6795f84).
- Funded joins: [`2fb64da7…fa33`](https://stellar.expert/explorer/testnet/tx/2fb64da7396627d320391af23a37392a1bcad2fd72356c398f0d09846fc1fa33), [`bb7675d7…eca8`](https://stellar.expert/explorer/testnet/tx/bb7675d732cbe378ac9688352adb61f05564c6b7d9c2ac06b8c334c3dd24eca8), and [`7f6f0448…8ae5`](https://stellar.expert/explorer/testnet/tx/7f6f04488a2e347911200e33b93acd9e756f603b8c371c554b58757000918ae5).
- Referee finalization: [`90993d06…f2df`](https://stellar.expert/explorer/testnet/tx/90993d06843ab13368384105a51caba3fef4d48d3ebc1f134e5a19f4b72ef2df).
- Ordered distribution was `[6000, 3000, 1000]` BPS. The decoded `finalized`
  event records rewards `[18000000, 9000000, 3000000]` stroops for ranks 1–3.
  SDK and app reads confirmed `finished=true`, `cancelled=false`, the ordered
  winners, those exact rewards, and a zero pool.

### Delegated post-deadline refund

Application instance:
[`cmuf5wgo5000415umn7gn58wa`](https://app.ggg.quest/tournaments/cmuf5wgo5000415umn7gn58wa).
Contract:
[`CDMX6F5ORKJW4QC6XNIQUWKRNCVVXISDW3JPIMQHHCYCFCPV6ZX3XTMG`](https://stellar.expert/explorer/testnet/contract/CDMX6F5ORKJW4QC6XNIQUWKRNCVVXISDW3JPIMQHHCYCFCPV6ZX3XTMG).

- Constructor deployment: [`d5db990d…f1d6`](https://stellar.expert/explorer/testnet/tx/d5db990d9b63c2616491d93f2ee111c1265bf37b91fa98ccf421991d168cf1d6).
- Funded player join: [`12950cfa…208e`](https://stellar.expert/explorer/testnet/tx/12950cfa1d90a7e1be15f34867b2cc6d9a69c75ec6a313a81f277ad44fbd208e).
- The on-chain inclusive deadline was Unix `1790235660`
  (`2026-09-24T07:41:00Z`). The distinct delegate address above built, signed,
  and paid for the claim after that deadline; the contract still paid the
  registered player.
- Delegated refund: [`6dfba78c…fefc`](https://stellar.expert/explorer/testnet/tx/6dfba78cadd0d795da9732a6313a0f4563440d571a6930b89f4944c81ba8fefc),
  confirmed `SUCCESS` at ledger 4,842,426. Its decoded `refund_claimed` event
  names the registered player and amount `10000000` stroops. SDK and app reads
  confirmed `finished=false`, `cancelled=false`, one of one claimed, and a zero
  pool.

### Cancellation and refund claim

Application instance:
[`cmuf5xzyi000a15umxxi0iuxs`](https://app.ggg.quest/tournaments/cmuf5xzyi000a15umxxi0iuxs).
Contract:
[`CCGVI63KHBRG4CVKM7VPAGBPCER3EJKCN5LDI4NH5ONSR3FQU3ZQRMZM`](https://stellar.expert/explorer/testnet/contract/CCGVI63KHBRG4CVKM7VPAGBPCER3EJKCN5LDI4NH5ONSR3FQU3ZQRMZM).

- Constructor deployment: [`91f22c59…3aa1`](https://stellar.expert/explorer/testnet/tx/91f22c59e8afceb0ce38589672b5ae670172c587201333177f3c105bf7d03aa1).
- Funded player join: [`fb8d4930…830b`](https://stellar.expert/explorer/testnet/tx/fb8d4930063f7e1ec7c6554b01d9d17aae6129bbb7a8cfb0a2e8b15c3a05830b).
- Organizer cancellation: [`678402a0…68fc`](https://stellar.expert/explorer/testnet/tx/678402a0947dff30a4740091d4bf75ff249075d2feca4690709ee411c8a568fc).
- Player refund claim: [`36cf32d2…0c57`](https://stellar.expert/explorer/testnet/tx/36cf32d24698a5c83b6312ae1d5920349fea3587b1d810b699fe626091110c57).
- Decoded events record `cancelled` with one registered player, then
  `refund_claimed` for that player and `10000000` stroops. SDK and app reads
  confirmed `cancelled=true`, `finished=false`, one of one claimed, and a zero
  pool.

## Live Testnet evidence checklist

- [x] Exact run date/time, Testnet network, and passphrase.
- [x] Final reviewed source revision/tag, package version, registry integrity,
      WASM hash, and matching Railway web/subscriber revision.
- [x] Public health URL and an external HTTP 200 response captured after both
      deployments succeeded.
- [x] Settlement deployment, joins, finalization, ordered BPS, rewards, events,
      relevant balances, and zero pool.
- [x] Distinct deadline instance, on-chain deadline, delegated claimant, refund
      transaction/event, recipient amount, and zero pool.
- [x] Distinct cancellation instance, join, cancellation, refund claim/event,
      recipient amount, and zero pool.
- [x] Public Stellar Expert Testnet links for every transaction and contract.
- [x] Public [SDK README](https://github.com/artisam-ggg/ggg/tree/goodgameguild-escrow-sdk-v0.1.0/packages/escrow-sdk), [Node example](https://github.com/artisam-ggg/ggg/tree/goodgameguild-escrow-sdk-v0.1.0/examples/nodejs-escrow), and exact public CI links.
- [x] [Edited full-flow demo recording](https://drive.google.com/file/d/1NvTigSXywA8Uk5PpIhEwdjDpWx_DfKmd/view?usp=sharing)
      published at a durable public URL; anonymous viewer and direct MP4 access
      were verified without authentication.
- [x] Testnet-reset warning: hashes and IDs are historical evidence and may not
      remain usable configuration.
- [x] No Mainnet, multi-wallet, external-audit, or unaudited-security claim.

Historical #225 transactions remain supporting evidence for the standalone
published-package example. The records above are the distinct final
post-deployment run through the reviewed SDK-backed public app.

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

## Final reviewer-facing status

The npm release, staging backup and migrations, matching WASM configuration,
Railway deployments, branch-history reconciliation, external health check, and
all three funded Testnet terminal paths are complete. PR #324 remains excluded
from this release.

The live browser session produced a local archival WebM recording and the three
final-state screenshots without persisting wallet secrets. An edited MP4 is
published through the public demo-video link above, and anonymous viewer and
direct-download access have been verified. The evidence checklist is complete;
after this evidence update merges, issue #226 can be closed.
