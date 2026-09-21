# @ggg/escrow-sdk

Typed Stellar Soroban bindings and keyless transaction APIs for the GGG escrow contract. This package is MIT licensed and works in Node.js 22+ and browser projects. It does not hold keys, read app environment variables, or depend on Next.js or Prisma.

Version `0.1.0` distributes the finalized contract ABI from issues #215–#220 and the keyless transaction APIs from #223. npm publication is tracked in #226.

## Build, sign, submit, reconcile

```ts
import { EscrowSdk } from "@ggg/escrow-sdk";

const networkPassphrase = "Test SDF Network ; September 2015";
const sdk = new EscrowSdk({
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase,
  contractId: "C...", // existing escrow; use wasmHash instead for deployment
});

const built = await sdk.buildJoin(playerAddress); // simulates and assembles
// Use your own wallet. It must report its actual network passphrase and sign built.xdr.
const signedXdr = await wallet.signTransaction(built.xdr, networkPassphrase);
const result = await sdk.submit(signedXdr, built, walletNetworkPassphrase);
// If submit throws TX_TIMEOUT or CONFIRMATION_FAILED, retain error.hash and
// call sdk.lookup(error.hash) before deciding whether to retry.
const poolStroops = await sdk.readPool(playerAddress);
```

`buildDeploy(organizer, { referee, token, entryFee, distributionBps, settlementDeadline, salt })` requires a configured `wasmHash`, a 32-byte salt, and an installed WASM blob. `entryFee` and `settlementDeadline` are `bigint` stroops and UTC Unix seconds. The 1–10 positive basis-point entries must total 10000. `buildJoin(player)`, `buildFinalize(referee, winners)`, `buildCancel(organizer)`, and `buildClaimRefund(source, player)` require an existing `contractId`; the refund source pays fees, while the contract pays the named registered player. The source address must belong to the transaction submitter. Reads (`readTournament`, `readPool`, `readReward`, `readPlayers`, `readFinished`, `readSettlementDeadline`) require a source address for simulation but no signer. `resolveSacAddress("XLM" | "USDC", networkPassphrase, { nativeSacAddress?, usdcIssuer? })` needs an explicit native SAC ID or USDC issuer.

Keep the `BuiltEscrowTransaction` returned by the SDK alongside the user request. `validateSignedXdr` and `submit` compare the signed transaction's entire body and hash with that simulated build, including its constructor or join terms, source, contract, and operation. They require the wallet-reported passphrase; transaction XDR itself carries no network identifier. RPC still verifies the signatures. Never accept a client-supplied replacement for the stored build. The SDK takes no private key and does not log XDR or RPC bodies.

`submit` returns `{ hash, status: "SUCCESS" | "FAILED", contractId? }` after confirmation. `lookup(hash, "deploy"?)` additionally returns `PENDING` for an unresolved transaction and extracts a deployed contract ID when available. Preserve the hash on `TX_TIMEOUT` or `CONFIRMATION_FAILED`; an uncertain broadcast can have reached the network. `EscrowSdkError` exposes only stable codes `INVALID_INPUT`, `NETWORK_MISMATCH`, `SIMULATION_FAILED`, `SUBMIT_REJECTED`, `TX_TIMEOUT`, and `CONFIRMATION_FAILED`, plus a safe message and optional hash. A `FAILED` confirmed result means the ledger rejected execution. The SDK does not decide whether an app user is authorized or update an app database.

## Imports

```ts
import { EscrowClient, type TournamentInfo } from "@ggg/escrow-sdk";
import { Client, Errors } from "@ggg/escrow-sdk/contract";
```

The package root exposes stable GGG names (`EscrowClient`, `EscrowErrors`, `EscrowDataKey`, `TournamentInfo`). The `/contract` export exposes the generated Stellar binding, including `Client`, its complete method types, contract errors, and the Stellar SDK types re-exported by the generator. Use the root for normal applications and `/contract` when you need the generated interface directly.

```ts
const escrow = new EscrowClient({
  contractId: "C...", // a contract deployed with the finalized ABI
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
});

const transaction = await escrow.get_tournament();
const tournament: TournamentInfo = transaction.result;
console.log(tournament.winners);
```

The generated binding accepts an ordered `winners: string[]` vector for `finalize_results` (1–10 winners, matching the contract's distribution). `EscrowClient.deploy` takes `organizer`, `referee`, `token`, `entry_fee: bigint`, `distribution_bps: number[]`, and `settlement_deadline: bigint` as constructor terms. `get_players`, `get_tournament`, `get_settlement_deadline`, and `claim_refund({ player })` reflect the current ABI. A refund always pays the registered player named in the call. The low-level binding leaves signing and confirmation to its caller; the higher-level `EscrowSdk` above handles submission and confirmation after an external wallet signs. Older deployed contracts may have a different ABI and should be identified before using these bindings.

The new WASM also exposes `claim_refund_after_deadline({ player })` through `EscrowClient`. It is permissionless for the caller, pays only that registered player, and works only at or after the inclusive deadline while the tournament is neither cancelled nor finalized. `claim_refund({ player })` remains available for the app's cancellation and deadline claims; both entrypoints share the same one-claim record and `refund_claimed` event. Existing instances keep the ABI of the WASM they were deployed with, so call the new method only on instances deployed with this version.

## Build and regenerate

From the repository root, use Node 22, pnpm 10.6.4, Rust, and Stellar CLI 27.0.0:

```sh
pnpm install --frozen-lockfile
pnpm --filter @ggg/escrow-sdk build
cd contracts/escrow
stellar contract build
cd ../..
stellar contract bindings typescript \
  --wasm contracts/escrow/target/wasm32v1-none/release/ggg_escrow.wasm \
  --output-dir /tmp/ggg-escrow-bindings --overwrite
```

Copy `/tmp/ggg-escrow-bindings/src/index.ts` to `packages/escrow-sdk/src/contract/index.ts` and prepend the existing `// @ts-nocheck` generator note. Do not copy the generated package metadata: the SDK package has its own exports and build settings. The CI contract job builds the current WASM and diffs the regenerated binding against the checked-in file. A changed contract interface requires regenerating the binding and updating the ABI smoke test.

`pnpm --filter @ggg/escrow-sdk pack` builds a publication tarball containing only `dist/`, this README, the license, and package metadata. The package has no runtime dependency on any GGG workspace package.
