# Referee guide

## Prerequisites

- The public tournament link.
- The exact Stellar Testnet wallet configured by the organizer as the referee.
- A completed ranking of distinct registered players.

Referees do not need a GGG app login for settlement. Settlement authority comes from the configured wallet, and the app checks that wallet before opening the console.

## Finalize ranked payouts

1. Open the public tournament page and review the active tournament, deadline, participants, and configured prize breakdown.
2. In the **Referee** panel, select **Verify Referee Wallet** and approve access in the configured wallet.
3. When the address matches, select **Open Settlement Console**.
4. Assign a distinct registered player to every payout rank. The finalization action remains unavailable until all required ranks are filled without duplicates.
5. Select **Finalize Payouts**, review the wallet request, and approve it.
6. Wait for confirmation, then verify the finished status, payouts, and remaining pool on the public page.

**Expected result:** one on-chain finalization settles the configured ranked payout amounts. It cannot be reversed by the referee or organizer.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Wallet mismatch | Switch to the exact configured Testnet wallet. Wallet addresses are case-sensitive. |
| Settlement console does not open | Re-verify the referee wallet from the public tournament page. An app login does not grant referee authority. |
| Finalize button is disabled | Fill every rank with a different registered participant. |
| Deadline passed | Do not attempt settlement; the tournament may instead be refundable. |
| Submission is pending | Wait for on-chain confirmation and avoid submitting another finalization. |
