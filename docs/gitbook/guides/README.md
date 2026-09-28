# Role guides

These Testnet-only guides explain the GGG tournament lifecycle from each role's point of view. They complement the short in-app guidance planned in issue #348; they do not replace on-screen validation or wallet confirmations.

## Before you begin

- Use the Stellar **Testnet** network in Freighter.
- Never share a seed phrase, recovery phrase, private key, session cookie, or signed XDR.
- App sign-in and wallet approval are different: sign-in controls dashboard access; the wallet signs on-chain actions.

## Lifecycle at a glance

`DRAFT` → `ACTIVE` → `FINISHED`, or `CANCELLED` / `REFUNDS OPEN` → `REFUNDED`.

| State | What it means |
| --- | --- |
| Draft | The organiser has not yet completed the on-chain deployment. |
| Active | Players can join before the settlement deadline. |
| Finished | The configured referee finalized ranked payouts. |
| Cancelled | The organiser cancelled the tournament; eligible players can claim refunds. |
| Refunds open | The deadline passed without finalization; eligible players can claim refunds. |
| Refunded | All confirmed registered players have claimed their refunds. |

Choose your guide: [Organizer](organizer.md), [Player](player.md), or [Referee](referee.md).
