# #218 Testnet evidence for #266

Status: **constructor WASM uploaded and verified; deployment test not run**. This covers only #218's single-transaction claim for #266; the N-winner, TTL, and read-helper evidence belongs to their own issues. No Testnet constructor deployment or live join has been performed for this change. Obtain operator approval before running the transaction-bearing test.

The constructor WASM from source commit `98b8619` was built in Docker with Rust 1.98.1 (`rust:1.98.1-bookworm`, image digest `sha256:9a73a5088750b4c95158ab26629c854c3d6fc4b173cb7bc8079ad252d8ed7bfa`) and the CI-pinned Stellar CLI 27.0.0. The exact optimized 9,547-byte artifact at `contracts/escrow/target/wasm32v1-none/release/ggg_escrow.wasm` exported `__constructor` and was uploaded to Testnet without further optimization (`--optimize=false`). The returned hash is recorded in `apps/web/.env.example` and README.md. No private key or test keypair is committed.

The upload transaction [ff16ac0b5996b09033383457657508b3057b14eb0575c7ea29e93b3a7908e181](https://stellar.expert/explorer/testnet/tx/ff16ac0b5996b09033383457657508b3057b14eb0575c7ea29e93b3a7908e181) returned `6cd5beaee7382d6033b09b19f741d41e2f499651a3804ad81be0a4ede39c5b72`. A direct Testnet RPC `getLedgerEntries` lookup at ledger 4670965 returned its `contractCode` entry; the entry's 9,547 WASM bytes and a separately fetched copy both hashed to that full value. The deployed application's environment is not updated yet because this PR has not merged.

After separate approval, run `RUN_STELLAR_IT=1 pnpm --filter web test:integration -- src/lib/stellar/builders.integration.test.ts` in an environment with Testnet RPC, `ESCROW_WASM_HASH`, and a funded organizer/player (the opt-in test uses Friendbot for its temporary accounts). The test asserts one `createContractV2` operation with six constructor arguments, a positive simulated resource fee, one organizer signature, confirmed deployment, the stored deadline, and a successful first join without an initialize transaction.

The upload evidence is recorded below. Fill in deployment and join fields only after the separately approved live run:

| Evidence | Value |
| --- | --- |
| Network / passphrase | Testnet / `Test SDF Network ; September 2015` |
| Contract source commit | `98b8619` |
| Uploaded WASM hash | `6cd5beaee7382d6033b09b19f741d41e2f499651a3804ad81be0a4ede39c5b72` |
| Upload transaction hash and [Stellar Explorer link](https://stellar.expert/explorer/testnet/tx/ff16ac0b5996b09033383457657508b3057b14eb0575c7ea29e93b3a7908e181) | `ff16ac0b5996b09033383457657508b3057b14eb0575c7ea29e93b3a7908e181` |
| ContractCode verification | `getLedgerEntries` at ledger 4670965; 9,547 bytes; SHA-256 matched |
| Deploy transaction hash and Stellar Explorer link | Pending |
| Contract ID | Pending |
| Confirmed deadline | Pending |
| First join transaction hash and Stellar Explorer link | Pending |
| Test output / timestamp | Pending |

For a failed-constructor proof, submit an invalid constructor deployment only in an explicitly approved Testnet session and record its failed hash and absent contract state. The local contract test `failed_constructor_rolls_back_deployment` checks state rollback, while the Testnet result will establish the network-level deployment outcome.
