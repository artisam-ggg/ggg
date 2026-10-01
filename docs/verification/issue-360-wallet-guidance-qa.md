# Issue #360 - Wallet guidance manual QA

## Purpose

Verify that public wallet actions identify the active account boundary, required network, signing
effect, and safe recovery path without implying that GGG holds a private key. Use mocks or existing
unfunded pages; this pass does not require a funded Testnet transaction.

## Viewports

- Desktop: 1440 x 900
- Mobile: 375 x 812

## Journeys

Check Create Tournament, Join Tournament, Referee verification, Settlement Console, and Claim
Refund at both viewports.

1. Disconnected: the required network and public-address-only connection boundary are visible.
2. Connected: the compact address, expected network, Re-check Wallet, and Disconnect Wallet remain
   readable and keyboard reachable.
3. Account change: switching Freighter accounts and choosing Re-check Wallet updates the address
   and the parent action state.
4. Wrong network: re-checking clears the stale connected state, names the required network, and
   prevents the transaction action until reconnection succeeds.
5. Rejected connection: the page explains how to approve a new Freighter connection request.
6. Rejected signature: the page states that nothing was submitted and permits a deliberate retry.
7. Wrong wallet: participant/referee mismatch guidance appears before the protected action and the
   action stays disabled or hidden.
8. Pending confirmation: the action stays disabled and warns against submitting a duplicate.
9. Confirmed state: canonical participant, payout, or refund state replaces pending guidance.
10. Keyboard: focus remains visible for Connect, Re-check, Disconnect, transaction, retry, and
    refresh controls.

Record the browser, route or fixture, viewport, result, and a screenshot for any failure before
merge.
