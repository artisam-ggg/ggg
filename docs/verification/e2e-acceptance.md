# Phase 6 E2E acceptance — demo path (#83) & cancel→refund (#84)

Two Playwright specs exercise the full on-chain flows end-to-end against a
**deployed Testnet app**, driving real Freighter-signed transactions and
asserting on the SSE-propagated UI:

| Spec | Issue | Flow |
|------|-------|------|
| `apps/web/e2e/demo-path.spec.ts` | #83 | create → join ×3 → finalize → 3 payouts (60/30/10) |
| `apps/web/e2e/cancel-refund.spec.ts` | #84 | create → join ×2 → cancel → 2 refunds |

> **Why this needs a live environment.** The specs deploy a Soroban escrow
> contract and submit real `join`/`finalize`/`cancel` transactions on Testnet,
> then assert on participant/pool/payout/refund rows that the subscriber
> propagates over SSE. That requires Friendbot-funded accounts, a deployed app,
> and live RPC/Horizon — none of which exist in CI/sandbox. They are an
> **operator acceptance** task, not a CI gate.

---

## Prerequisites

1. **Deployed Testnet app** (Railway, #88/#122): web + subscriber + Postgres +
   Redis, all on `STELLAR_NETWORK=testnet`. The subscriber **must** be running —
   the specs assert on SSE-propagated rows it produces.
2. **Node 22+, pnpm 10**, and Playwright's Chromium: `pnpm --filter web exec playwright install chromium`.
3. **Funded keypairs**: `global-setup.ts` funds organizer/referee/3 players via
   Friendbot once and writes `apps/web/.e2e/keys.json` (gitignored).
4. Env: `APP_URL=<deployed url>` and `NETWORK_PASSPHRASE` (defaults to Testnet).

## Commands

```bash
# From repo root, against the deployed app:
APP_URL=<deployed-testnet-url> pnpm --filter web exec playwright test e2e/demo-path.spec.ts
APP_URL=<deployed-testnet-url> pnpm --filter web exec playwright test e2e/cancel-refund.spec.ts

# Or via the PASS/FAIL runner wrappers (harvest explorer links into the summary):
cd apps/web && APP_URL=<deployed-testnet-url> pnpm exec tsx ../../scripts/verify-demo-path.ts
cd apps/web && APP_URL=<deployed-testnet-url> pnpm exec tsx ../../scripts/verify-cancel-refund.ts
```

## Expected outcomes

**Demo path (#83):**
- After deploy: detail page shows `status-chip` = **ACTIVE** and a visible `join-qr`.
- After 3 joins: `participant-row` count = **3**; `pool-amount` reflects 3× entry fee.
- After finalize: `status-chip` = **FINISHED**, `payout-row` count = **3** with a
  60/30/10 split, and `explorer-link`s to each payout transaction.
- Happy path completes in **< 2 minutes** (SPEC §15; the Playwright `timeout` is 120s).

**Cancel → refund (#84):**
- After 2 joins: `participant-row` count = **2**.
- After organiser clicks `cancel-button` → `confirm-cancel` and signs:
  `status-chip` = **CANCELLED**, `refund-row` count = **2**, each refund equal to
  the entry fee.

## Selector mapping (wired in this PR)

These `data-testid`s were added to the real Phase 4/5 components and verified to
render via `apps/web/src/components/tournament/wired-selectors.test.tsx`:

| `data-testid` | Element | File |
|---------------|---------|------|
| `join-qr` | Tournament join QR tile | `components/tournament/QrTile.tsx` |
| `participant-row` | one per joined player | `components/tournament/ParticipantList.tsx` |
| `pool-amount` | live prize pool (pre-existing) | `components/tournament/PrizePoolCounter.tsx` |
| `payout-row` | one per winner | `components/tournament/WinnersPanel.tsx` |
| `explorer-link` | Stellar.Expert tx/contract links | `WinnersPanel.tsx`, `tournaments/[id]/page.tsx` |
| `status-chip` | tournament status | `components/tournament/StatusChip.tsx` |
| `cancel-button` | "Cancel & Refund" | `components/tournament/CancelButton.tsx` |
| `confirm-cancel` | confirm-dialog button | `components/tournament/CancelButton.tsx` |
| `refund-row` | one per refunded player (derived) | `components/tournament/RefundList.tsx` |

> **Note on `refund-row`.** The `cancel_tournament` contract event emits only a
> refund *count*, and the subscriber sets `status=CANCELLED` without per-player
> refund records. `RefundList` therefore **derives** one row per known
> participant at the entry-fee amount (the contract refunds every player their
> entry fee). The exact refund tx hashes are visible in the `LiveFeed` and on
> Stellar.Expert under the contract's operation history.

## Screenshots to capture (auto-saved by the specs)

The specs write full-page screenshots to `apps/web/test-results/`:
- `demo-1-create-form.png`, `demo-2-active-with-qr.png`, `demo-3-three-joined.png`, `demo-4-finalized-payouts.png`
- `cancel-1-two-joined.png`, `cancel-2-confirm-dialog.png`, `cancel-3-cancelled-refunds.png`

For a manual run, capture the same states: the ACTIVE detail page with QR, the
three participant rows, the FINISHED page with three payout rows, the cancel
confirm dialog, and the CANCELLED page with refund rows.

## Verifying on Stellar.Expert

For each payout/refund, open the `explorer-link` (or build it from the tx hash):
`https://stellar.expert/explorer/testnet/tx/<hash>`. Confirm:
- The **deploy+initialize** op created the contract (`stellar.expert/.../contract/<C…>`).
- Each **join** is an `invoke_host_function` paying the entry fee into the contract.
- **finalize** shows three payments out at the 60/30/10 split.
- **cancel** shows one payment back to each player equal to the entry fee.

## Where to find results

- **Playwright report**: `apps/web/playwright-report/index.html` (HTML reporter).
- **Console evidence**: the runner scripts print captured `explorer:` links and a
  PASS/FAIL line; raw `console.log` markers (`[demo-path]`, `[cancel-refund]`)
  appear in the Playwright `list` reporter output.
- **Traces/video on failure**: `apps/web/test-results/` (`trace: on-first-retry`,
  `video: retain-on-failure`).

## Known local blocker (operator note)

`playwright.config.ts`'s `webServer` runs `pnpm --filter web start` (a production
`next build`). On `develop` that build currently fails (Turbopack: `@/contract-client`
resolution, a `globals.css` `@import` ordering error, and `argon2` pulled into a
client bundle). When running against a **deployed** `APP_URL` the local webServer
is bypassed, so the specs run normally; for a *local* run, point `APP_URL` at a
working build or run the app with `next dev`. These build issues are tracked for
the ship gate (#91).
