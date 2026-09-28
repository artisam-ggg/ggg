# Organizer guide

## Prerequisites

- A GGG organizer account and access to the **Tournaments** dashboard.
- A Freighter wallet on Stellar Testnet with enough test XLM for transaction fees.
- The exact public wallet address for the referee.

## Create and deploy a tournament

1. Sign in, open **Tournaments**, then select **Create Tournament**.
2. Enter the tournament name, game title, entry fee and asset. The entry fee is paid by each player, not by the organizer.
3. Enter the **Referee Wallet Address**. Only this exact wallet can finalize results.
4. Choose a **Settlement Deadline (your local time)**. It is stored on-chain as UTC and must be 1 hour to 90 days ahead.
5. Set the prize ranks. **Equal remainder** and **Descending ranked** calculate lower ranks; changing a lower rank switches to **Custom**. Confirm the configured prize breakdown totals 100%.
6. Optionally upload a cover image, then connect the organizer wallet.
7. Select **Deploy Soroban Contract** and approve the wallet request. Wait for confirmation; do not approve a second deployment while the first is pending.

**Expected result:** the tournament becomes **Active**, has a public link, and can accept participants.

## During the tournament

- Share the public tournament link with players. They do not need a GGG app account to view or join.
- Monitor confirmed participants and the remaining prize pool from the tournament page. Event updates can take a short time to arrive; refresh only to re-read state, never to repeat a signed action.
- Before the deadline, the configured referee verifies their wallet and opens the settlement console to submit distinct ranked winners.

## Cancel a tournament

1. Open the tournament from your dashboard and choose **Cancel & Refund**.
2. Read the irreversible-action warning, then choose **Confirm Cancel**.
3. Approve the cancellation in the organizer wallet and wait for confirmation.

**Expected result:** the tournament is cancelled. Each registered player claims their own refund with their wallet; the organizer does not receive or distribute refund funds.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Wallet is wrong or on the wrong network | Switch to the intended Testnet account/network, then reconnect. Never change the configured referee after deployment. |
| Deployment or cancellation is pending | Wait for the result and check the transaction in the wallet/explorer. Do not submit a duplicate transaction. |
| Deadline has passed | New players cannot join. If results were not finalized, refunds can become available to registered players. |
| Status looks delayed | Wait for the confirmed on-chain event, then refresh the page. |
