# GGG — Instawards Milestone Reports

GGG (Good Game Guild) is a trustless tournament prize-escrow and match-settlement project built on Stellar Soroban. This book records the 30-day Instawards sprint against its approved Statement of Work (SOW), with links to the repository evidence used to support each status.

| | |
| --- | --- |
| Project | GGG (Good Game Guild) |
| Builder | Neil John Rivera / Artisam Labs |
| Ambassador chapter | Philippines |
| Target network | Stellar Testnet |
| Public application endpoints | Landing: [ggg.quest](https://ggg.quest/) · SDK-backed app: [app.ggg.quest](https://app.ggg.quest/) · [health](https://app.ggg.quest/api/health) |
| Public source repository | [artisam-ggg/ggg](https://github.com/artisam-ggg/ggg) |
| Scope baseline | [Approved Instawards SOW](https://github.com/artisam-ggg/ggg/blob/675986512bda71c01218e05993ac8ea252a51dee/docs/Instawards_SOW.md) |

## How to read this book

Start with the [Statement of Work](sow.md), which defines the sprint commitments and must not be rewritten to make later work appear in scope. The weekly pages record the planned sequence and current evidence status. The deliverable pages provide the reviewer path from a SOW commitment to implementation and proof.

Status labels are deliberately conservative:

- **Completed** — all applicable SOW acceptance evidence is recorded and independently verifiable at the stated environment.
- **Implementation complete** — the team has delivered the source and recorded test scope; independently verifiable public acceptance evidence may still be pending.
- **Testnet verified** — public Testnet evidence is linked.
- **Locally verified** — repository tests or reproducible local checks are recorded, but the required public/live proof is absent.
- **Planned** — work scheduled in the SOW that has not reached Completed status.
- **Blocked** — acceptance proof needs an approved deployment, credential, publication, or other external action.
- **Not started** — SOW-committed work whose implementation has not begun.

## Current milestone status

| Deliverable | Status | What is currently evidenced | What still needs public proof |
| --- | --- | --- | --- |
| [D1 — Deadline-enforced escrow](deliverables/d1.md) | Testnet refund evidenced; pre-deadline boundary locally verified | Public contract and successful refund-claim transactions; contract behavior and boundary tests | Public pre-deadline rejection evidence |
| [D2 — Single-sig, N-winner, and TTL](deliverables/d2.md) | Completed and Testnet verified | Constructor/payout/TTL/read-helper records, exact release CI, live constructor deployment, contract ID, three joins, and N-winner payout | No remaining D2 proof gap; live TTL boundaries remain test-backed rather than directly measured |
| [D3 — SDK extraction, npm, and live redeploy](deliverables/d3.md) | Completed and Testnet verified | Published npm package and immutable source, SDK guide and Node example, matching app/subscriber redeploy, public health result, demo, and three funded terminal paths | No remaining D3 proof gap; Testnet-reset caveat remains |

The [Evidence index](reference/evidence.md) is the single reference for every Testnet artifact currently recorded in the repository. It is not a claim that every SOW acceptance criterion is complete.

## Project model

GGG uses a per-tournament Soroban escrow. An organizer supplies the tournament configuration at contract construction, players register by paying the entry fee into escrow, and a referee finalizes the winner ordering. The contract supports cancellation and refunds, including a deadline-based route for an active tournament that was not finalized. The current public source exposes the configuration and status through `get_tournament()` and returns registration-ordered players through `get_players()`.

The project design keeps signing in the user's wallet. This documentation does not represent the website, a WASM upload, or repository source as proof that a particular tournament instance has completed the full live flow; that proof requires the relevant Testnet transaction trail.

## Sprint deliverables

| Deliverable | Planned outcome | Current documentary status |
| --- | --- | --- |
| [D1 — Deadline-enforced escrow](deliverables/d1.md) | Permissionless refund after an unfinalized tournament reaches its settlement deadline | Public successful refund claims and local boundary-test evidence are recorded; public proof of the rejected pre-deadline path is still needed. |
| [D2 — Single-sig, N-winner, and TTL](deliverables/d2.md) | Atomic deployment, configurable winner payouts, TTL lifecycle handling, and read helpers | Completed with the earlier implementation/test record plus the 24 September constructor deployment and live three-winner payout. |
| [D3 — SDK extraction, npm, and live redeploy](deliverables/d3.md) | Standalone SDK, npm publication, example, and live Testnet reference consumer | Completed on 24 September 2026 with public package/source, matching deployments, health, demo, and settlement/refund transaction evidence. |

## Boundaries

This is a Testnet milestone record, not a Mainnet readiness statement or a substitute for an independent security audit. Both Mainnet deployment and a third-party audit are explicitly out of scope in the SOW.

## Reviewer path

For a short, repeatable review sequence, see [Reviewer quick verification](reference/reviewer-quick-verification.md). The [Escrow flow and evidence map](reference/escrow-flow.md) provides a visual overview of the on-chain paths and the proof still needed for each one.
