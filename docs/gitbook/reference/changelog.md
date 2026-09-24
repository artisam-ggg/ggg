# Documentation Changelog

## 24 September 2026 — Epic 3 SDK and live-reference closeout

- Added the developer-facing SDK integration guide using the published
  `@goodgameguild/escrow-sdk@0.1.0` package and current public API.
- Marked D2, D3, Week 3, and Week 4 with their final evidence status while
  retaining the separate D1 pre-deadline proof boundary.
- Added public npm, immutable source, Node example, exact CI, app health, demo,
  contract, deployment, join, settlement, deadline-refund, cancellation, and
  refund links.
- Updated the reviewer path, flow diagram, timeline, metrics, and landing page
  to distinguish implemented code, public release, deployment availability, and
  independently verified transactions.
- Checked `gitbook-docs.yaml` and retained the `milestone-reports` mapping to
  `./docs/gitbook`; no publishing-layout change was required.

## 18 September 2026 — D1 Testnet refund evidence

- Added the public D1 Testnet contract and two successful `refund_claimed` transaction links.
- Distinguished the supported deadline-route inference from the still-unproven public pre-deadline rejection path.
- Marked D2 implementation complete while retaining its separate public-Testnet evidence checklist.

## 18 September 2026 — Initial structure

- Added the GitBook navigation and evidence-first reporting conventions.
- Added SOW, weekly-report, deliverable, and reference pages.
- Recorded the existing Testnet WASM-upload artifact without representing it as a complete deployed-instance or payout proof.
- Marked D3 as planned pending public package and live-redeploy evidence.

## 18 September 2026 — Detailed evidence expansion

- Switched public source links to [artisam-ggg/ggg](https://github.com/artisam-ggg/ggg).
- Added primary and beta application links, while keeping endpoint availability distinct from a proven live milestone flow.
- Added implementation and evidence detail for deadline refunds, atomic construction, N-winner payout behavior, TTL, read helpers, and the recorded regression snapshot.
- Documented the D1 SOW-to-ABI naming difference: the source exposes `claim_refund(player)` while the SOW describes the deadline-refund outcome as `claim_refund_after_deadline()`.

## 18 September 2026 — Reviewer experience and evidence index

- Added a top-level deliverable-status dashboard and links to the reviewer path.
- Expanded the Evidence Index to include all currently recorded Testnet WASM uploads, source revisions, transaction links, and proof boundaries.
- Added dated pending-evidence tables for Weeks 3 and 4.
- Renamed Metrics to Verification Metrics and clarified the absence of product/adoption metrics in this Testnet record.
- Added a reviewer quick-verification page and a source-backed escrow/evidence flow diagram.
