# Issue #220 — TTL lifecycle evidence

## Reproducible contract build

Status: **The #220 WASM was reproduced with the CI-pinned toolchain; it has not been uploaded,
deployed, or verified on Testnet.**

The contract source at commit `d590b36` was built in Docker from
`rust:1.98.1-bookworm` (image ID `9a73a5088750`) with Rust 1.98.1 and Stellar CLI 27.0.0.
The optimized artifact is 10,595 bytes, exports the same 11 contract functions, and has SHA-256:

`2dcfb4c3ed77863269a347308156021de08427f5e6aa77ba15a08d9476c03f77`

This pinned hash is authoritative for the review fix. A build made with local Stellar CLI 27.1.0
produced `4f2d6f8450e8b24790481facf79269126af67a9cf4ab211c4a82e1634276f2c7`;
that unpinned artifact must not be uploaded or configured. No secret key or test keypair is
committed.

The app's immutable vector-finalization hash set includes both the uploaded #219 artifact and this
#220 build, so contracts created from either vector ABI use `finalize_results(winners)`. The
uploaded hash in `apps/web/.env.example` and README remains the verified #219 hash until an
operator approves uploading this exact #220 artifact and its Testnet `ContractCode` entry is
confirmed.

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

## Pending Testnet evidence

| Evidence | Value |
| --- | --- |
| Network / passphrase | Testnet / `Test SDF Network ; September 2015` |
| Contract source commit | `d590b36` |
| Pinned toolchain | Rust 1.98.1 / Stellar CLI 27.0.0 |
| Reproducible WASM hash | `2dcfb4c3ed77863269a347308156021de08427f5e6aa77ba15a08d9476c03f77` |
| Artifact size | 10,595 bytes |
| Upload transaction and Explorer link | Pending operator approval |
| ContractCode verification | Pending upload |
| Contract instance deployment | Not required for this review fix; not performed |

After approval, upload the exact pinned artifact with `stellar contract upload --optimize=false`,
confirm the returned hash, retrieve its `ContractCode` entry with Testnet RPC `getLedgerEntries`,
and verify the entry bytes hash to the same value before updating `.env.example` and README.
