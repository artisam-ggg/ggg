# Week 1 — Deadline-enforced escrow

## Planned work

Implement the deadline-based refund path, build the contract, and retain passing test evidence. See the [Week 1 plan in the SOW](https://github.com/artisam-ggg/ggg/blob/675986512bda71c01218e05993ac8ea252a51dee/docs/Instawards_SOW.md).

## Evidence status

Repository evidence for the deadline/refund work is recorded in [issue #218 Testnet evidence](https://github.com/artisam-ggg/ggg/blob/develop/docs/verification/issue-218-testnet-evidence.md) and the [#221 regression matrix](https://github.com/artisam-ggg/ggg/blob/develop/docs/verification/issue-221-regression-evidence.md). The regression record names tests for the inclusive deadline boundary, rejection before deadline, authorization, cancellation/finalization races, and failed transfer rollback.

The #218 report records a constructor-WASM upload at source commit `98b8619`, but it explicitly says no Testnet constructor deployment or live join was performed. The D1 acceptance criterion still requires a Testnet explorer link showing a post-deadline refund, pre-deadline failure evidence, and retained passing test evidence.

## Reviewer path

Continue to [D1 — Deadline-enforced escrow](../deliverables/d1.md) for the traceability summary.
