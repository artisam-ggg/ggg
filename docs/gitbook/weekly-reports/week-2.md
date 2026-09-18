# Week 2 — Single-sig, N-winner, and TTL

## Planned work

Build a new WASM, perform single-transaction deploy-and-initialize on Testnet, update bindings, and verify configurable winner distribution. See the [Week 2 plan in the SOW](https://github.com/artisam-ggg/ggg/blob/675986512bda71c01218e05993ac8ea252a51dee/docs/Instawards_SOW.md).

## Evidence status

The repository records focused evidence for atomic construction, N-winner payouts, TTL lifecycle handling, and regression coverage in [#218](https://github.com/artisam-ggg/ggg/blob/develop/docs/verification/issue-218-testnet-evidence.md), [#219](https://github.com/artisam-ggg/ggg/blob/develop/docs/verification/issue-219-payout-evidence.md), [#220](https://github.com/artisam-ggg/ggg/blob/develop/docs/verification/issue-220-ttl-evidence.md), and [#221](https://github.com/artisam-ggg/ggg/blob/develop/docs/verification/issue-221-regression-evidence.md).

The evidence is layered. #219 records the deterministic five-winner distribution and boundary coverage from one through ten winners. #220 records reproducible TTL behavior, including its threshold behavior and read-only helpers near archival state. #221 records the 15 September local regression result: 72 contract tests passed, focused builder tests passed, 635 web-unit tests passed across 78 files, six app-integration tests passed with the live Testnet test intentionally skipped, and typecheck/lint/build/format checks passed.

The evidence index includes a Testnet WASM-upload transaction. That is distinct from proof of a deployed escrow instance or a live N-winner payout; those must be linked separately before they can be marked Testnet verified.

## Reviewer path

Continue to [D2 — Single-sig, N-winner, and TTL](../deliverables/d2.md).
