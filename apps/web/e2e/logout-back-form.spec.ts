import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures/auth";

const ORG = { user: `e2e-logout-back-${Date.now()}`, pass: "Password123!" };

test("logout then browser Back cannot submit the stale tournament form", async ({
  page,
  context,
}) => {
  await registerAndLogin(context, ORG.user, ORG.pass);

  await page.goto("/tournaments");
  await page.goto("/tournaments/new");
  await expect(page.getByRole("button", { name: "Deploy Soroban Contract" })).toBeVisible();

  await page.getByRole("button", { name: "Logout" }).click();
  await page.waitForURL(/\/login/);

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Deploy Soroban Contract" })).not.toBeVisible();

  const responses = await page.evaluate(async () => {
    const body = {
      name: "Stale form test",
      gameTitle: "SF6",
      entryFee: "10000000",
      asset: "XLM",
      refereeAddress: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
      organizerAddress: "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB",
      settlementDeadline: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      distributionBps: [6000, 3000, 1000],
    };
    const create = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const submit = await fetch("/api/tournaments/t_1/submit", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ signedXdr: "AAAAAgAAAAA=", intent: "deploy" }),
    });
    return {
      create: { status: create.status, body: await create.json() },
      submit: { status: submit.status, body: await submit.json() },
    };
  });

  expect(responses.create.status).toBe(401);
  expect(responses.create.body).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
  expect(responses.submit.status).toBe(401);
  expect(responses.submit.body).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
});
