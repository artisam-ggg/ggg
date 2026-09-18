# Statement of Work

The approved [GGG Instawards SOW](https://github.com/webnxt-2030/ggg/blob/develop/docs/Instawards_SOW.md) is the authoritative scope baseline. This page is a reader guide, not a replacement for that source.

## Objective

The sprint is intended to harden GGG's tournament escrow on Stellar Testnet, add a deadline-based refund path, reduce tournament deployment to a single signed transaction, support configurable winner counts, and extract reusable developer tooling. The SOW explicitly limits the work to a 30-day Testnet sprint.

## Deliverables

| ID | SOW commitment | Review page |
| --- | --- | --- |
| D1 | Deadline-enforced escrow, including a permissionless refund path after an unfinalized tournament's settlement deadline | [D1](deliverables/d1.md) |
| D2 | Atomic deploy-and-initialize, 1–10 winner distribution, TTL lifecycle handling, read helpers, and 30+ tests | [D2](deliverables/d2.md) |
| D3 | Standalone SDK, npm publication, Node.js example, and a redeployed Testnet reference consumer | [D3](deliverables/d3.md) |

## Review rule

The SOW describes the goal; it does not itself prove delivery. Each deliverable is therefore evaluated against its listed evidence requirement. A future scope change belongs in a dated weekly report or a new SOW—not as a silent edit to the baseline.
