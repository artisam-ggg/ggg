# GGG — Instawards Milestone Reports

GGG (Good Game Guild) is a trustless tournament prize-escrow and match-settlement project built on Stellar Soroban. This book records the 30-day Instawards sprint against its approved Statement of Work (SOW), with links to the repository evidence used to support each status.

| | |
| --- | --- |
| Project | GGG (Good Game Guild) |
| Builder | Neil John Rivera / Artisam Labs |
| Ambassador chapter | Philippines |
| Target network | Stellar Testnet |
| Live application | [ggg.quest](https://ggg.quest/) |
| Source repository | [webnxt-2030/ggg](https://github.com/webnxt-2030/ggg) |
| Scope baseline | [Approved Instawards SOW](https://github.com/webnxt-2030/ggg/blob/675986512bda71c01218e05993ac8ea252a51dee/docs/Instawards_SOW.md) |

## How to read this book

Start with the [Statement of Work](sow.md), which defines the sprint commitments and must not be rewritten to make later work appear in scope. The weekly pages record the planned sequence and current evidence status. The deliverable pages provide the reviewer path from a SOW commitment to implementation and proof.

Status labels are deliberately conservative:

- **Completed** — all applicable SOW acceptance evidence is recorded and independently verifiable at the stated environment.
- **Testnet verified** — public Testnet evidence is linked.
- **Locally verified** — repository tests or reproducible local checks are recorded, but the required public/live proof is absent.
- **Planned** — work scheduled in the SOW that has not reached Completed status.
- **Blocked** — acceptance proof needs an approved deployment, credential, publication, or other external action.
- **Not started** — SOW-committed work whose implementation has not begun.

The [Evidence index](reference/evidence.md) is the single reference for the key Testnet artifact currently recorded in the repository. It is not a claim that every SOW acceptance criterion is complete.

## Sprint deliverables

| Deliverable | Planned outcome | Current documentary status |
| --- | --- | --- |
| [D1 — Deadline-enforced escrow](deliverables/d1.md) | Permissionless refund after an unfinalized tournament reaches its settlement deadline | Test evidence is recorded; public refund-transaction proof must be checked against the deliverable acceptance criteria. |
| [D2 — Single-sig, N-winner, and TTL](deliverables/d2.md) | Atomic deployment, configurable winner payouts, TTL lifecycle handling, and read helpers | Local verification and a Testnet WASM upload are recorded; a deployed instance and live payout proof are not asserted here. |
| [D3 — SDK extraction, npm, and live redeploy](deliverables/d3.md) | Standalone SDK, npm publication, example, and live Testnet reference consumer | Planned in the SOW; this book does not claim publication or redeployment without public proof. |

## Boundaries

This is a Testnet milestone record, not a Mainnet readiness statement or a substitute for an independent security audit. Both Mainnet deployment and a third-party audit are explicitly out of scope in the SOW.
