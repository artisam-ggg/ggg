# Issue #220 — TTL lifecycle evidence

## Reproducible contract build

Status: **The #220 WASM was reproduced with the CI-pinned toolchain, uploaded to Testnet, and its
`ContractCode` entry verified; no contract instance was deployed.**

The contract source at commit `d590b36` was built in Docker from
`rust:1.98.1-bookworm` (image ID `9a73a5088750`) with Rust 1.98.1 and Stellar CLI 27.0.0.
The optimized artifact is 10,595 bytes, exports the same 11 contract functions, and has SHA-256:

`2dcfb4c3ed77863269a347308156021de08427f5e6aa77ba15a08d9476c03f77`

This pinned hash is authoritative for the review fix. A build made with local Stellar CLI 27.1.0
produced `4f2d6f8450e8b24790481facf79269126af67a9cf4ab211c4a82e1634276f2c7`;
that unpinned artifact must not be uploaded or configured. No secret key or test keypair is
committed.

The approved upload used Stellar CLI 27.1.0 with `--optimize=false`, so the pinned artifact was not
optimized again. The confirmed [upload transaction](https://stellar.expert/explorer/testnet/tx/5498ee96135a2d485791c21a001771e9bedf572a790267461c99abea122f74bf)
returned the same hash. A direct Testnet RPC `getLedgerEntries` lookup at latest ledger 4,684,900
returned one `ContractCode` entry, last modified at ledger 4,684,888. Its 10,595 bytes hash to the
same value and match the pinned artifact byte-for-byte.

The app's immutable vector-finalization hash set includes both the uploaded #219 artifact and this
uploaded #220 artifact, so contracts created from either vector ABI use
`finalize_results(winners)`. The verified #220 hash is recorded in `apps/web/.env.example` and
README. Railway remains unchanged until the deployed application includes #224 subscriber support.

## Lifecycle verification

`cargo test` passes 67 contract tests. The #220 cases advance ledger sequence and timestamp
together and verify:

- successful constructor, join, finalization, cancellation, and refund calls cover instance and
  code TTL;
- exactly 90 days remaining is a no-op and one ledger below extends both entries to 120 days;
- a rejected state-changing call preserves TTL and state;
- read helpers work near archival without extending TTL;
- the maximum 90-day settlement deadline remains live and permits a refund at its inclusive
  boundary.

## Testnet upload evidence

| Evidence | Value |
| --- | --- |
| Network / passphrase | Testnet / `Test SDF Network ; September 2015` |
| Contract source commit | `d590b36` |
| Pinned toolchain | Rust 1.98.1 / Stellar CLI 27.0.0 |
| Reproducible WASM hash | `2dcfb4c3ed77863269a347308156021de08427f5e6aa77ba15a08d9476c03f77` |
| Artifact size | 10,595 bytes |
| Upload transaction and [Explorer link](https://stellar.expert/explorer/testnet/tx/5498ee96135a2d485791c21a001771e9bedf572a790267461c99abea122f74bf) | `5498ee96135a2d485791c21a001771e9bedf572a790267461c99abea122f74bf` |
| ContractCode verification | `getLedgerEntries` at latest ledger 4,684,900; last modified ledger 4,684,888; 10,595 bytes; SHA-256 and bytes matched |
| Contract instance deployment | Not required for this review fix; not performed |
