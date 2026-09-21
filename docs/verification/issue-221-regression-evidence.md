# Issue #221 regression evidence

This document maps Deliverable 2's final regression gate to deterministic tests. Results recorded
here are local unless a linked verification document explicitly identifies a confirmed Testnet
transaction.

## Contract regression matrix

| Area | Evidence in `contracts/escrow/src/test.rs` |
| --- | --- |
| Atomic constructor | `constructor_stores_state`, `constructor_records_exact_organizer_auth_tree`, `constructor_requires_organizer_auth`, `failed_constructor_rolls_back_deployment`, `legacy_initialize_entrypoint_is_absent` |
| Deadline and refund boundaries | `constructor_accepts_deadline_at_max_horizon`, constructor rejection cases, `deadline_boundary_is_inclusive`, join/finalize/cancel rejection at the deadline, refund rejection before and success at/after the deadline |
| Authorization and refund recipient | Exact authorization-tree tests for constructor, join including its nested token transfer, finalization, and cancellation; `arbitrary_caller_claims_cancelled_player_refund` proves a refund requires no caller authorization and always pays the registered player |
| Cancellation and terminal races | Cancellation transition, join-after-finish/cancel, cancel-after-finalize/double-cancel, finalize-after-cancel/double-finalize, and refund-after-finalize cases |
| TTL lifecycle | Constructor, threshold no-op and one-ledger-below extension, failed-call rollback, finalize/cancel/refund extension, maximum-deadline ledger progression, and read-only near-archive cases cover instance and code TTL |
| Winner validation | Constructor and finalization cover the supported 1–10 range, empty and oversized vectors, invalid BPS entries/sums, count mismatch, duplicate winners, and unregistered winners |
| Payout conservation | `payout_arithmetic_conserves_extreme_and_small_pools_for_every_winner_count` checks every supported winner count over varied pools; finalization tests cover 1, 3, 5, and 10 winners and first-rank dust |
| Events | Exact registration, finalization, cancellation, and refund event assertions |
| Transfer rollback | `failed_join_transfer_rolls_back_registration` proves a failed entry-fee transfer leaves no player, registration key, pool, or token balance; `failed_refund_transfer_does_not_mark_claimed` proves a failed refund remains claimable |
| Read helpers | Constructor, live-state, maximum-player, finalized-state, and near-archive assertions cover `get_players()` and `get_tournament()` |

## App and transaction coverage

- `apps/web/src/lib/stellar/builders.test.ts` verifies atomic constructor arguments, one-operation
  deployment, vector winner routing for the #219 and #220 artifacts, legacy compatibility, and
  winner validation.
- `apps/web/src/lib/stellar/builders.integration.test.ts` is the opt-in Testnet check for a signed
  one-transaction deployment followed by immediate join and both read helpers.
- The PR CI workflow builds the contract, compares generated bindings, runs all contract tests,
  and runs the app's typecheck, lint, formatting, unit, integration, production-build, and audit
  gates. The network-dependent Testnet test remains intentionally out of band.

## Local results recorded 2026-09-15

| Check | Result |
| --- | --- |
| `cargo test` | 72 passed |
| `cargo fmt --check` | Passed |
| `cargo clippy --all-targets` | Passed with 23 existing warnings and no errors |
| `stellar contract build` | Passed; unchanged 11-function ABI and 10,595-byte artifact |
| Focused builder unit suite | 14 passed |
| Full web unit suite | 635 passed across 78 files |
| App integration suite | 6 passed; one live Testnet test intentionally skipped |
| Web typecheck, lint, and production build | Passed |
| Prettier and `git diff --check` | Passed |

## Evidence status for #266

The contract and app results above are reproducible local/CI proof. Existing Testnet artifact
uploads are recorded in `issue-218-testnet-evidence.md`, `issue-219-payout-evidence.md`, and
`issue-220-ttl-evidence.md`.

Live Testnet proof for #266 still requires running the opt-in integration flow against the deployed
#220 artifact and recording the resulting contract ID and confirmed create, join, settle, payout,
and refund transaction hashes. No deployment or live transaction was performed for #221.
