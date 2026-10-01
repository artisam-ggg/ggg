# Post-Instawards UX, onboarding, and developer-discovery release

**Release date:** 1 October 2026  
**Released revision:** [`1e58426`](https://github.com/webnxt-2030/ggg/commit/1e58426c0711188398670f8314f2820db7860a64) on `staging`  
**Validated source revision:** [`d82a1e9`](https://github.com/webnxt-2030/ggg/commit/d82a1e92cbc53bb1c2bfe19695e923956da53c35) on `develop`  
**Promotion:** [#379](https://github.com/webnxt-2030/ggg/pull/379)

## Reviewer overview

This is the dated release record for the post-Instawards usability work. It is
for reviewers, new contributors, and non-technical tournament operators who
need one place to find the release, its public artifacts, and its validation
boundaries. It makes the SDK easier for developers to discover, makes the
creation and public-tournament journeys easier to follow, and gives organizers,
players, and referees concise in-app help linked to fuller role manuals.

This report does **not** rename, replace, or reinterpret the completed
[Week 4 validation package](week-4.md). That package remains the canonical
historical Testnet record; this report records the later UX, onboarding, and
developer-discovery release window.

## What changed

| Work | Delivery | User-visible outcome | Audience | Evidence and status |
| --- | --- | --- | --- | --- |
| [#345](https://github.com/webnxt-2030/ggg/issues/345) | [#352](https://github.com/webnxt-2030/ggg/pull/352) | Homepage **Get the SDK** CTA points to the canonical npm package. | Developers | Included in the successful CI run and public homepage check. |
| [#346](https://github.com/webnxt-2030/ggg/issues/346) | [#353](https://github.com/webnxt-2030/ggg/pull/353) | Create Tournament wording is shorter while retaining deadline, payout, signing, and validation boundaries. | Organizers | Included in CI; see the organizer smoke record below. |
| [#347](https://github.com/webnxt-2030/ggg/issues/347) | [#378](https://github.com/webnxt-2030/ggg/pull/378) | Added a public backup demo record and transaction provenance; no product behavior changed. | Reviewers | Historical Testnet evidence, independently linked below. |
| [#348](https://github.com/webnxt-2030/ggg/issues/348) | [#355](https://github.com/webnxt-2030/ggg/pull/355) | Contextual, keyboard-accessible Guidelines dialogs link to the appropriate full guide. | Organizers, players, referees | Component tests and role-journey smoke coverage passed in CI. |
| [#349](https://github.com/webnxt-2030/ggg/issues/349) | [#354](https://github.com/webnxt-2030/ggg/pull/354) | Public Testnet operating manuals explain each role's prerequisites, actions, expected result, and recovery steps. | Organizers, players, referees | Public GitBook guides returned HTTP 200 on 1 October 2026. |
| [#350](https://github.com/webnxt-2030/ggg/issues/350) | [#356](https://github.com/webnxt-2030/ggg/pull/356) | Focused automated coverage protects developer, organizer, player, referee, refund, and keyboard guidance entry points. | Maintainers and reviewers | [Role-journey smoke record](../../verification/issue-350-role-journey-smoke.md); included in CI. |

### Related refinements, kept separate from the core scope

The same promotion also includes focused follow-through work: lifecycle clarity
([#357](https://github.com/webnxt-2030/ggg/issues/357),
[#366](https://github.com/webnxt-2030/ggg/pull/366)), wallet recovery guidance
([#360](https://github.com/webnxt-2030/ggg/issues/360),
[#368](https://github.com/webnxt-2030/ggg/pull/368)), organizer preparation
([#362](https://github.com/webnxt-2030/ggg/issues/362),
[#369](https://github.com/webnxt-2030/ggg/pull/369)), player follow-through
([#363](https://github.com/webnxt-2030/ggg/issues/363),
[#370](https://github.com/webnxt-2030/ggg/pull/370)), and tournament-page
layout/copy fixes ([#374](https://github.com/webnxt-2030/ggg/pull/374) and
[#376](https://github.com/webnxt-2030/ggg/pull/376)). These refinements improve
presentation and recovery messaging; they are not evidence of a new contract
or payout policy.

## Public artifact index

| Artifact | Verified destination | What it is |
| --- | --- | --- |
| Source and release | [`1e58426`](https://github.com/webnxt-2030/ggg/commit/1e58426c0711188398670f8314f2820db7860a64) · [promotion #379](https://github.com/webnxt-2030/ggg/pull/379) | The promoted `staging` revision and reviewer-oriented promotion record. |
| Public services | [Homepage](https://ggg.quest/) · [application health](https://app.ggg.quest/api/health) | Both returned HTTP 200 on 1 October 2026; the homepage carried the released explainer-video CSP. |
| SDK discovery | [npm package](https://www.npmjs.com/package/@goodgameguild/escrow-sdk/v/0.1.0) · [SDK integration guide](../guides/sdk-integration.md) | The CTA's canonical package destination and the complete integration guide. The npm registry metadata endpoint returned HTTP 200 on 1 October 2026. |
| Role manuals | [Organizer](../guides/organizer.md) · [Player](../guides/player.md) · [Referee](../guides/referee.md) | Testnet-only operating manuals. An administrator manual is intentionally not published: the admin surface is role-gated internal oversight, not an external operator journey. |
| Guidelines implementation | [Guidelines component](https://github.com/webnxt-2030/ggg/blob/d82a1e92cbc53bb1c2bfe19695e923956da53c35/apps/web/src/components/ui/Guidelines.tsx) · [component tests](https://github.com/webnxt-2030/ggg/blob/d82a1e92cbc53bb1c2bfe19695e923956da53c35/apps/web/src/components/ui/Guidelines.test.tsx) | The organizer, player, referee, and refund entry points use the shared dialog; the tests are the retained public interaction evidence. |
| Testnet demo record | [Backup video](https://drive.google.com/file/d/1JZzdBZbKMkwqt4xU2s-6N3WKPCHwFAge/view?usp=sharing) · [transaction trail](../reference/evidence.md#focused-backup-recording) | Retained MP4 archival copy and independently inspectable public Testnet transactions. |
| GitBook navigation | [Evidence index](../reference/evidence.md) · [changelog](../reference/changelog.md) · [reviewer quick verification](../reference/reviewer-quick-verification.md) | The supporting index, release note, and short reviewer path. |

## Verification evidence

The exact `develop` source revision `d82a1e9` passed
[CI run 517](https://github.com/webnxt-2030/ggg/actions/runs/36722769876) on
30 September 2026. Its `app` and `contract` jobs both succeeded. The promotion
also showed a successful GitBook status check. The CI definition covers:

- SDK build and package-install/import verification, including a high-severity
  production audit;
- Prisma generation, migrations, seed data, recursive typecheck, lint,
  Prettier formatting, unit tests, integration tests, and the web production
  build;
- the focused role-journey smoke coverage; and
- homepage container/security-header checks, contract build, generated-binding
  comparison, and contract tests.

The smoke tests are deterministic local/CI checks: authentication, wallet
extension, network actions, npm, and GitBook interactions are mocked or
asserted as links. They do not submit transactions. The historical demo is
separate **Testnet** evidence recorded against [`1021738`](https://github.com/webnxt-2030/ggg/commit/10217383f84acda7ef0084b05fc63890da05cf7a), before this UX release; a
Testnet reset can make it unsuitable as a current configuration while leaving
it valid as dated recording evidence. The public homepage, health endpoint,
GitBook role pages, npm registry endpoint, and archived video share page were
rechecked on 1 October 2026. The npm web page itself may challenge automated
requests; registry metadata was used for its availability check.

## Ten-minute reviewer walkthrough

1. Open [the homepage](https://ggg.quest/) and the
   [application health endpoint](https://app.ggg.quest/api/health). Confirm
   that both respond and that the homepage has a **Get the SDK** action.
2. Follow **Get the SDK** to the [canonical npm package](https://www.npmjs.com/package/@goodgameguild/escrow-sdk/v/0.1.0), then compare it with the
   [SDK integration guide](../guides/sdk-integration.md).
3. Read one role manual—[Organizer](../guides/organizer.md),
   [Player](../guides/player.md), or [Referee](../guides/referee.md)—and check
   its wallet, login, and Testnet boundaries.
4. From the public app, open the matching **Guidelines** control. Confirm the
   dialog has concise role-specific steps, closes with Escape/Close, and its
   **Read the full guide** link opens the same role's guide. Do not sign a
   wallet request for this review.
5. Inspect [CI run 517](https://github.com/webnxt-2030/ggg/actions/runs/36722769876) and the
   [role-journey smoke record](../../verification/issue-350-role-journey-smoke.md).
6. For the historical end-to-end proof, open the [backup recording](https://drive.google.com/file/d/1JZzdBZbKMkwqt4xU2s-6N3WKPCHwFAge/view?usp=sharing) and its
   [five Testnet transactions](../reference/evidence.md#focused-backup-recording).

## Compatibility, security, and deferred work

This release changes no Soroban contract source, WASM/ABI, deployed contract,
SDK version, wallet-authorization rule, payout policy, authentication policy,
or database schema. It does not change the web-application or subscriber
Railway configuration or deployment behavior. It does include homepage-only
Docker/Caddy/Railway configuration and security-header hardening for the
explainer video; the container-header check verifies that isolated static-site
scope.

The scope is Testnet-only. It makes no Mainnet-readiness or independent
third-party-audit claim. Public documents, the demo record, and the linked
tests intentionally omit private keys, recovery phrases, credentials, signed
XDR, and other secret material.

Deferred work remains outside this release: ongoing product enhancements,
fresh funded Testnet runs, Mainnet work, and an independent audit require
separate approval. GitBook desktop/mobile rendering and the new report's
published external URL must be rechecked after this documentation pull request
is merged and synced; until then, this source report is the review artifact and
the existing public guides have been independently checked.
