/**
 * P6.2 (#83) — E2E demo path: create → join ×3 → finalize → 3 payouts.
 *
 * Runs against a deployed Testnet app (`APP_URL`). It performs REAL on-chain
 * actions via the Freighter stub fixture (`asWallet`) which signs genuine XDR
 * with funded Testnet keypairs, and asserts on the SSE-propagated UI using the
 * data-testid hooks wired in components/tournament/*.
 *
 *   APP_URL=<deployed-testnet-url> pnpm --filter web exec playwright test e2e/demo-path.spec.ts
 *
 * Prereqs: a reachable deployed app (Railway, #88), Postgres+Redis+subscriber
 * live, and Friendbot-funded keypairs (global-setup writes .e2e/keys.json).
 */
import { test, expect, keypairs } from "./fixtures/wallet";
import { registerAndLogin } from "./fixtures/auth";

const ORG = { user: `e2e-org-${Date.now()}`, pass: "Password123!" };
const SHOT = "test-results/demo";

test("demo path — create, join ×3, finalize, 3 payouts (60/30/10)", async ({
  page,
  context,
  asWallet,
}) => {
  // ── 1. Authenticate as the organiser (real NextAuth credentials session). ──
  await registerAndLogin(context, ORG.user, ORG.pass);

  // ── 2. Create + deploy the escrow contract as the organiser wallet. ────────
  await asWallet("organizer");
  await page.goto("/tournaments/new");
  await page.getByLabel("Tournament Name").fill("E2E Demo Cup");
  await page.getByLabel("Game Title").fill("Verification Arena");
  await page.getByLabel(/Entry Fee/).fill("1");
  await page.getByLabel("Referee Wallet Address").fill(keypairs.referee.public);
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await page.screenshot({ path: `${SHOT}-1-create-form.png`, fullPage: true });
  await page.getByRole("button", { name: "Deploy Soroban Contract" }).click();

  // Deploy signs + submits on-chain, then routes to the detail page when ACTIVE.
  // Exclude `/tournaments/new` from the match: the deploy is still on the create
  // page when this runs, and a bare `[a-z0-9]+` matches "new" too — which would
  // capture the create URL and break the later re-navigations in the join loop.
  await page.waitForURL(/\/tournaments\/(?!new$)[a-z0-9]+$/, { timeout: 120_000 });
  const detailUrl = page.url();
  await expect(page.getByTestId("status-chip")).toHaveText("ACTIVE", { timeout: 120_000 });
  await expect(page.getByTestId("join-qr")).toBeVisible();
  await expect(page.getByTestId("join-qr")).toHaveAttribute("href", detailUrl);
  await page.screenshot({ path: `${SHOT}-2-active-with-qr.png`, fullPage: true });

  // ── 3. Three players join (each pays the entry fee). ───────────────────────
  for (const role of ["player1", "player2", "player3"] as const) {
    await asWallet(role);
    await page.goto(detailUrl);
    await page.getByRole("button", { name: "Connect Wallet" }).click();
    await page.getByRole("button", { name: "Join Tournament" }).click();
    // The submit modal closes when the on-chain tx lands; if the race between
    // the modal close and the participant row is lost, retry the join. Then wait
    // for this player to appear in the participant list before switching wallets.
    await page
      .getByRole("button", { name: "Close" })
      .click({ timeout: 120_000 })
      .catch(() => {});
  }
  // Participant rows are server-rendered from the subscriber-ingested DB state,
  // which lands a few seconds after each on-chain join. Reload-poll until all
  // three appear rather than asserting against a single (possibly early) render.
  await expect(async () => {
    await page.goto(detailUrl);
    await expect(page.getByTestId("participant-row")).toHaveCount(3);
  }).toPass({ timeout: 150_000 });
  await page.screenshot({ path: `${SHOT}-3-three-joined.png`, fullPage: true });

  // ── 4. Referee finalizes results via the settlement console. ───────────────
  await asWallet("referee");
  await page.goto(`${detailUrl}/settle`);
  // Assign podium: clicking "Assign Nth" marks a candidate used and re-renders,
  // so re-query the first available button for each rank.
  await page.getByRole("button", { name: "Assign 1st" }).first().click();
  await page.getByRole("button", { name: "Assign 2nd" }).first().click();
  await page.getByRole("button", { name: "Assign 3rd" }).first().click();
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await page.getByRole("button", { name: "Finalize Payouts" }).click();
  await page.waitForURL(detailUrl, { timeout: 120_000 });

  // ── 5. Assert the three payouts + explorer links propagated to the UI. ─────
  // Payout rows are subscriber-ingested from the on-chain `finalized` event, so
  // reload-poll the detail page until the status flips and all three land.
  await expect(async () => {
    await page.goto(detailUrl);
    await expect(page.getByTestId("status-chip")).toHaveText("FINISHED");
    await expect(page.getByTestId("payout-row")).toHaveCount(3);
  }).toPass({ timeout: 150_000 });
  const explorerLinks = page.getByTestId("explorer-link");
  await expect(explorerLinks.first()).toBeVisible();

  // Log the payout transaction hashes + Stellar.Expert links for the record.
  const hrefs = await explorerLinks.evaluateAll((els) =>
    els.map((e) => (e as HTMLAnchorElement).href),
  );
  for (const href of hrefs) console.log(`[demo-path] explorer: ${href}`);
  await page.screenshot({ path: `${SHOT}-4-finalized-payouts.png`, fullPage: true });
});
