# @ggg/escrow-sdk

Typed Stellar Soroban bindings for the GGG escrow contract. This package is MIT licensed and works in Node.js 22+ and browser projects. It does not hold keys, read app environment variables, or depend on Next.js or Prisma.

Version `0.1.0` distributes the finalized contract ABI from issues #215–#220. Transaction builders, signed transaction validation, submission helpers, and higher-level reads are planned for #223. npm publication is tracked in #226.

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

The generated binding accepts an ordered `winners: string[]` vector for `finalize_results` (1–10 winners, matching the contract's distribution). `EscrowClient.deploy` takes `organizer`, `referee`, `token`, `entry_fee: bigint`, `distribution_bps: number[]`, and `settlement_deadline: bigint` as constructor terms. `get_players`, `get_tournament`, `get_settlement_deadline`, and `claim_refund({ player })` reflect the current ABI. A refund always pays the registered player named in the call. Signing and network confirmation are the caller's responsibility; use a wallet to sign, never a server-held key. Older deployed contracts may have a different ABI and should be identified before using these bindings.

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
