# Verification Metrics

This Testnet milestone report uses evidence quality rather than product or adoption metrics as its primary measure. Product metrics such as tournament count, active users, or payout volume are not recorded in this book.

| Measure | Meaning | Current reporting rule |
| --- | --- | --- |
| SOW traceability | Each SOW criterion has an implementation and proof path | Required for every deliverable page |
| Contract test coverage | Contract tests meet or exceed the SOW minimum | Cite exact test output or a public CI run; do not copy an old count without verification |
| Public Testnet proofs | Required live transactions and contract IDs are linked | Count only artifacts a reviewer can independently open |
| SDK usability | The published package installs and its example runs | Report only after package publication and repeatable execution |
| End-to-end flow | Create → join → settle → payout completes on Testnet | Report only with the corresponding transaction trail |

## Recorded verification snapshot

The #221 regression record dated 15 September 2026 reports 72 passing contract tests, 14 focused builder-unit tests, 635 web-unit tests across 78 files, and six app-integration tests. It also records successful contract build, typecheck, lint, production build, formatting, and diff checks. The network-dependent live Testnet test was intentionally skipped. These are repository-recorded local/CI results, not a substitute for the required live transaction evidence.
