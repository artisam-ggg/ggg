# Documentation Changelog

## Initial structure

- Added the GitBook navigation and evidence-first reporting conventions.
- Added SOW, weekly-report, deliverable, and reference pages.
- Recorded the existing Testnet WASM-upload artifact without representing it as a complete deployed-instance or payout proof.
- Marked D3 as planned pending public package and live-redeploy evidence.

Future entries should be dated and link to the repository change, GitHub issue, or Testnet proof that caused the documentation update.

## Detailed evidence expansion

- Switched public source links to [artisam-ggg/ggg](https://github.com/artisam-ggg/ggg).
- Added primary and beta application links, while keeping endpoint availability distinct from a proven live milestone flow.
- Added implementation and evidence detail for deadline refunds, atomic construction, N-winner payout behavior, TTL, read helpers, and the recorded regression snapshot.
- Documented the D1 SOW-to-ABI naming difference: the source exposes `claim_refund(player)` while the SOW describes the deadline-refund outcome as `claim_refund_after_deadline()`.
