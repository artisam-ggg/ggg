# Standalone Node escrow example (#225)

This consumer uses `@ggg/escrow-sdk` through its package root. It does not import the GGG web app or SDK source. The live runner creates three distinct Testnet escrows: one pays 1–10 ranked winners, one allows a delegated refund at the deadline, and one is cancelled before its deadline and refunded. Settlement and refund are alternative terminal outcomes for the same tournament; the runner never tries both on one instance. Each mutating transaction is simulated by the SDK, signed by your external signer, submitted, and checked against confirmed on-chain reads. It prints public contract IDs, hashes, and Testnet explorer links, never signed XDR or keys.

An approved live Testnet run of the one-winner path and both refund branches is recorded in [`docs/verification/issue-225-node-example-testnet.md`](../../docs/verification/issue-225-node-example-testnet.md).

## Install and offline check

Use Node 22+ and pnpm 10.6.4 from a fresh checkout. The smoke command uses temporary directories and mocked RPC. It needs package registry access for dependencies on a cold machine, but no Testnet access, funded accounts, signer, or credentials.

```sh
pnpm install --frozen-lockfile
node examples/nodejs-escrow/smoke.mjs
```

For a development install of the actual tarball, from the repository root:

```sh
pnpm --filter @ggg/escrow-sdk build
pnpm --dir packages/escrow-sdk pack --pack-destination ../../examples/nodejs-escrow
cd examples/nodejs-escrow
npm install --no-save --package-lock=false ./ggg-escrow-sdk-0.1.0.tgz
```

The tarball is ignored by Git. `npm install --no-save --package-lock=false` keeps the example manifest unchanged. After issue #226 publishes the package, replace that final install command with `npm install --no-save --package-lock=false @ggg/escrow-sdk@0.1.0`. Do not use a workspace link for this consumer check. The package contains its runtime dependencies and public exports; the smoke check additionally installs `@stellar/stellar-sdk` in its disposable directory solely to generate mocked RPC fixtures.

## Live Testnet prerequisites and command

Use an RPC URL for Stellar Testnet, such as `https://soroban-testnet.stellar.org`, and the exact network passphrase `Test SDF Network ; September 2015`. The current uploaded WASM hash recorded in `docs/verification/sow-deadline-refund-entrypoint.md` is `b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9`; verify its code still exists before use, especially after any Testnet reset. `TOKEN_SAC_ID` is a Testnet token contract address (`C…`), not an issuer or an account. For XLM, supply the Testnet native SAC ID; for another token, provide its SAC and fund each participant with that token. Do not use an old instance or a WASM hash with a different ABI.

Make separate funded Testnet `G…` identities for `ORGANIZER`, `REFEREE`, each `PLAYERS` entry, and `DELEGATE` (addresses may be reused across the three new tournament instances, but the organizer and referee must differ). They need XLM for network fees and account reserves. Each player needs at least three entry fees of the selected asset, plus room for transaction fees when the asset is XLM; the refund branches return two of those fees. The organizer pays three constructor fees and one cancellation fee, the referee pays finalization, and the delegate pays two claim fees. Testnet Friendbot can fund newly generated Testnet XLM addresses. Choose `PLAYERS` in payout rank order, with 1–10 unique entries. `DISTRIBUTION_BPS` must have the same count, positive integer entries, and sum to 10000. Example: `6000,3000,1000` for three players. All amounts are decimal integer stroops (`10000000` = 1 XLM); do not use decimal XLM or floating point.

Copy `.env.example` to `.env` with `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`) and replace every placeholder. `.env` is ignored by Git. Set `SIGNER_MODULE` to an absolute path outside this repository to your own Node ESM signer adapter. The runner never creates, loads, or logs secret keys. The adapter must export:

```js
export async function getNetworkPassphrase(source) {
  // Return the network actually selected in the wallet for this G-address.
}
export async function signTransaction({ source, xdr, networkPassphrase }) {
  // Ask the wallet or external signing service for its approval; return signed XDR.
  // Sign exactly this simulated XDR as source; preserve its transaction body.
}
```

The adapter must handle all configured source addresses and return its actual wallet network, not echo the requested one. Keep funded account secrets out of the repository, `.env`, shell commands, and logs. The SDK has no signing or key storage. It checks the wallet-reported passphrase and compares the signed transaction body with the simulated build; Stellar verifies signatures on submission. Use a recent funded account sequence for each build.

From `examples/nodejs-escrow` after the tarball install and `.env` setup:

```sh
npm run live
```

This runs `node --env-file=.env live.mjs`. It performs funded live transactions, so run it only with operator approval. `SETTLEMENT_WINDOW_SECONDS` is the settlement deadline offset in seconds; allow enough time for all joins and finalization. Optional `REFUND_WINDOW_SECONDS` sets the separate deadline-refund instance's window (default 90 seconds); increase it for an interactive signer. Both windows must be 90–7,776,000 seconds. The deadline-refund path waits for its deadline plus a 20-second ledger-close buffer. Keep the local clock synchronized with UTC. Deadlines are UTC Unix seconds, inclusive for refund claims: join/finalize/cancel must occur strictly before the deadline; an active tournament can refund at or after it. The contract's maximum future horizon is 90 days. If slow RPC or approval makes the settlement instance expire, start again with fresh instances and a longer window; do not reuse a salt or assume a partial run can be replayed.

## Results and failure handling

`buildDeploy`, `buildJoin`, `buildFinalize`, `buildCancel`, and `buildClaimRefund(source, player)` return a `BuiltEscrowTransaction` with `{ xdr, hash, intent, source, networkPassphrase, contractId? }`. Keep this object unchanged until submission. Deployment uses a random 32-byte salt; the confirmed `submit` result has `{ hash, status: "SUCCESS" | "FAILED", contractId? }`. The contract ID is present for a successful constructor. `lookup(hash, intent?)` can also return `{ hash, status: "PENDING" }`. Pending, a broadcast timeout, and a confirmation lookup error are uncertain states, not success; look up the recorded hash before deciding whether to resubmit. A confirmed `FAILED` is a failed ledger execution. The example stops if a transaction fails, verifies each join in `readPlayers`, checks settlement `readTournament`/`readFinished`/`readReward` and zero remaining `readPool`, and checks each claim leaves a zero pool. Contract execution and token transfers are atomic, so confirmed state plus the recorded reward vector and empty pool establish the payout path. It prints payout amounts in stroops.

`EscrowSdkError` carries a safe `code`, `message`, and sometimes `hash`. Codes are `INVALID_INPUT`, `NETWORK_MISMATCH`, `SIMULATION_FAILED`, `SUBMIT_REJECTED`, `TX_TIMEOUT`, and `CONFIRMATION_FAILED`. The runner prints only these safe fields; arbitrary signer errors are suppressed. Configuration and signing problems should be diagnosed privately. Reads require a source address for RPC simulation but no signature; `readTournament` returns `TournamentInfo`, `readPlayers` an address array, `readPool`/`readReward` bigint stroops, `readFinished` a boolean, and `readSettlementDeadline` a bigint or `undefined`.

Payouts use the contract policy unchanged: for each BPS entry, floor `pool * bps / 10000`; any remaining dust is added to first rank. Winners must be registered, distinct, and match the distribution length. Refunds pay the named registered player exactly one entry fee, even when `DELEGATE` pays the transaction fee. The contract prevents duplicate claims, settlement after cancellation, and refunds after settlement. Cancellation opens claims immediately; the active deadline branch waits for the inclusive deadline. This example claims one registered player in each refund branch, so it uses one-player instances and confirms the pool is empty.

Successful state-changing calls extend contract instance and code TTL toward the contract's bounded 120-day target when remaining TTL is below its 90-day threshold. Reads do not extend TTL. Archived entries may need restoration before simulation/invocation; a missing or archived WASM/instance is an environment state issue, and the SDK does not perform a separate restore transaction for you. After a Testnet reset, re-fund fresh accounts, re-upload the current WASM, verify its hash and token SAC, update `.env`, install the current package, and create fresh instances. Old contract IDs and hashes cannot be assumed to survive. Keep public hashes/IDs from each run for reconciliation, and clean up only local `.env`/tarball artifacts when finished; the on-chain instance has no manual deletion step.
