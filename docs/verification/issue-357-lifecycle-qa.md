# Issue #357 - Public lifecycle manual QA

## Purpose

Verify that confirmed tournament state and unavailable-action guidance remain clear on public
tournament pages at representative desktop and mobile widths. This pass does not require a funded
transaction; use existing local fixtures or already-confirmed public tournament records.

## Viewports

- Desktop: 1440 x 900
- Mobile: 375 x 812

## Matrix

| State | Expected lifecycle summary | Expected action boundary |
| --- | --- | --- |
| Draft | **Preparing** | Joining and settlement are unavailable until deployment confirms. |
| Active/current escrow | **Open for joining** | Join explains that Freighter is required; referee verification explains the configured-wallet requirement. |
| Active/unavailable escrow | **Actions temporarily paused** | Wallet actions remain hidden and the summary asks the user to refresh later. |
| Deadline reached | **Refunds available** | Joining and settlement are closed; registered players can connect the joining wallet and claim once. |
| Cancelled with participants | **Refunds available** | The summary identifies cancellation and confirmed refund progress remains visible. |
| Cancelled with all refunds confirmed | **Refunds complete** | No further refund transaction is offered. |
| Finished while records sync | **Payout confirmation pending** | No join or settlement action appears; retryable payout-sync guidance remains available. |
| Finished with payouts | **Completed** | Confirmed winners and payouts are visible; joining and settlement are closed. |

## Interaction checks

At both viewports:

1. Confirm the status chip and lifecycle summary use compatible plain-language wording.
2. Confirm lifecycle text wraps without horizontal scrolling or covering header actions.
3. On an active tournament, verify Join starts disabled and explains how to enable it.
4. Verify the referee panel explains that only the configured wallet reveals Settlement Console.
5. On a refundable tournament, verify Claim Refund explains the required wallet and distinguishes
   submitted, still processing, confirmed, and failed states.
6. Navigate with a keyboard and confirm status/help text does not interrupt access to the action
   controls.

Record browser, route or fixture, viewport, result, and screenshot for any failure before merge.
