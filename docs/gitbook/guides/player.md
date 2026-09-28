# Player guide

## Prerequisites

- The organizer's public tournament link.
- A Freighter wallet on Stellar Testnet with the tournament's selected entry asset (XLM or USDC) and enough test XLM for transaction fees.

You do **not** need a GGG app account to view or join a public tournament. You do need the wallet that will pay the entry fee and later receive any payout or refund.

## Join a tournament

1. Open the shared public tournament page and confirm the game, entry fee, asset, prize breakdown, and deadline.
2. Select **Connect Wallet** in the join area and verify that the wallet is on Stellar Testnet.
3. Select the join action and inspect the wallet request before approving it.
4. Wait for the transaction and participant list to confirm your registration.

**Expected result:** your wallet appears in the confirmed participant list and the escrow pool increases by the entry fee.

## Understand the outcome

- If the referee finalizes results, the contract pays the configured ranks to the selected participant wallets.
- If the organizer cancels, or the settlement deadline passes without finalization, eligible registered players can claim an individual refund.
- A public page can update shortly after the wallet reports submission. Wait for confirmation before treating a result as final.

## Claim a refund

1. Open the same public tournament page after it shows a refundable state.
2. Connect the wallet that joined the tournament.
3. Select **Claim Refund** and approve the wallet transaction.
4. Wait for the status to become **Refund confirmed**. If it is still processing, do not submit again; use **Refresh refund status** only after the automatic refresh window ends.

**Expected result:** the contract returns the entry fee to the registered player wallet once, and the confirmed refund list updates.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| I cannot join | Confirm the deadline has not passed and use a funded Testnet wallet. |
| I connected the wrong wallet | Disconnect/switch in the wallet, then reconnect before signing. A different wallet cannot claim another player's refund. |
| My join/refund is pending | Wait for on-chain confirmation. Do not sign the same action twice. |
| Refund status looks stale | Allow the automatic refresh to finish; then use the status-only refresh control. |
