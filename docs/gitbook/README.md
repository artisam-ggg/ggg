# GGG — Instawards Milestone Reports

GGG (Good Game Guild) is a trustless tournament prize-escrow and match-settlement project built on Stellar Soroban. This book records the 30-day Instawards sprint against its approved Statement of Work (SOW), with links to the repository evidence used to support each status.

| | |
| --- | --- |
| Project | GGG (Good Game Guild) |
| Builder | Neil John Rivera / Artisam Labs |
| Ambassador chapter | Philippines |
| Target network | Stellar Testnet |
| Public application endpoints | Primary: [ggg.quest](https://ggg.quest/) · Beta: [beta.ggg.quest](https://beta.ggg.quest/) |
| Public source repository | [artisam-ggg/ggg](https://github.com/artisam-ggg/ggg) |
| Scope baseline | [Approved Instawards SOW](https://github.com/artisam-ggg/ggg/blob/675986512bda71c01218e05993ac8ea252a51dee/docs/Instawards_SOW.md) |

## How to read this book

Start with the [Statement of Work](sow.md), which defines the sprint commitments and must not be rewritten to make later work appear in scope. The weekly pages record the planned sequence and current evidence status. The deliverable pages provide the reviewer path from a SOW commitment to implementation and proof.

Status labels are deliberately conservative:

- **Completed** — all applicable SOW acceptance evidence is recorded and independently verifiable at the stated environment.
- **Testnet verified** — public Testnet evidence is linked.
- **Locally verified** — repository tests or reproducible local checks are recorded, but the required public/live proof is absent.
- **Planned** — work scheduled in the SOW that has not reached Completed status.
- **Blocked** — acceptance proof needs an approved deployment, credential, publication, or other external action.
- **Not started** — SOW-committed work whose implementation has not begun.

## Current milestone status

| Deliverable | Status | What is currently evidenced | What still needs public proof |
| --- | --- | --- | --- |
| [D1 — Deadline-enforced escrow](deliverables/d1.md) | Locally verified | Contract behavior and boundary tests are recorded | Deployed contract ID, pre-deadline failure, and post-deadline refund transaction |
| [D2 — Single-sig, N-winner, and TTL](deliverables/d2.md) | Locally verified; Testnet code upload verified | Constructor/payout/TTL/read-helper records, regression snapshot, and WASM upload | Deploy-and-initialize transaction, contract ID, and live N-winner payout |
| [D3 — SDK extraction, npm, and live redeploy](deliverables/d3.md) | Planned | Approved SOW and required evidence checklist | Published package, example, matching redeploy, demo, health check, and E2E transactions |

The [Evidence index](reference/evidence.md) is the single reference for every Testnet artifact currently recorded in the repository. It is not a claim that every SOW acceptance criterion is complete.

## Project model

GGG uses a per-tournament Soroban escrow. An organizer supplies the tournament configuration at contract construction, players register by paying the entry fee into escrow, and a referee finalizes the winner ordering. The contract supports cancellation and refunds, including a deadline-based route for an active tournament that was not finalized. The current public source exposes the configuration and status through `get_tournament()` and returns registration-ordered players through `get_players()`.

The project design keeps signing in the user's wallet. This documentation does not represent the website, a WASM upload, or repository source as proof that a particular tournament instance has completed the full live flow; that proof requires the relevant Testnet transaction trail.

## Sprint deliverables

| Deliverable | Planned outcome | Current documentary status |
| --- | --- | --- |
| [D1 — Deadline-enforced escrow](deliverables/d1.md) | Permissionless refund after an unfinalized tournament reaches its settlement deadline | Test evidence is recorded; public refund-transaction proof must be checked against the deliverable acceptance criteria. |
| [D2 — Single-sig, N-winner, and TTL](deliverables/d2.md) | Atomic deployment, configurable winner payouts, TTL lifecycle handling, and read helpers | Local verification and a Testnet WASM upload are recorded; a deployed instance and live payout proof are not asserted here. |
| [D3 — SDK extraction, npm, and live redeploy](deliverables/d3.md) | Standalone SDK, npm publication, example, and live Testnet reference consumer | Planned in the SOW; this book does not claim publication or redeployment without public proof. |

## Boundaries

This is a Testnet milestone record, not a Mainnet readiness statement or a substitute for an independent security audit. Both Mainnet deployment and a third-party audit are explicitly out of scope in the SOW.

## Reviewer path

For a short, repeatable review sequence, see [Reviewer quick verification](reference/reviewer-quick-verification.md). The [Escrow flow and evidence map](reference/escrow-flow.md) provides a visual overview of the on-chain paths and the proof still needed for each one.
