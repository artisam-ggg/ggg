# #218 Testnet evidence for #266

Status: **prepared, not run**. This covers only #218's single-transaction claim for #266; the N-winner, TTL, and read-helper evidence belongs to their own issues. No Testnet upload, deployment, or live join has been performed for this change. Obtain operator approval before running the transaction-bearing test.

The operator should build the branch's `contracts/escrow` WASM, upload that exact binary to Testnet, and set the local `ESCROW_WASM_HASH` to the returned hash. The previously published hash in `.env.example` is for older code and cannot prove this constructor path. Do not commit a private key or the test's funded keypairs.

Local `stellar contract build` produced `contracts/escrow/target/wasm32v1-none/release/ggg_escrow.wasm` with hash `7b9cfb9120ff5fad534c0173990b09b408581f83739aad6b313599c4d0f8735e`. This is a build result, not an uploaded or deployed Testnet hash.

After approval, run `RUN_STELLAR_IT=1 pnpm --filter web test:integration -- src/lib/stellar/builders.integration.test.ts` in an environment with Testnet RPC, `ESCROW_WASM_HASH`, and a funded organizer/player (the opt-in test uses Friendbot for its temporary accounts). The test asserts one `createContractV2` operation with six constructor arguments, a positive simulated resource fee, one organizer signature, confirmed deployment, the stored deadline, and a successful first join without an initialize transaction.

Record the following only after the live run:

| Evidence | Value |
| --- | --- |
| Network / passphrase | Testnet / `Test SDF Network ; September 2015` |
| Git commit | Pending |
| Uploaded WASM hash | Pending |
| Deploy transaction hash and Stellar Explorer link | Pending |
| Contract ID | Pending |
| Confirmed deadline | Pending |
| First join transaction hash and Stellar Explorer link | Pending |
| Test output / timestamp | Pending |

For a failed-constructor proof, submit an invalid constructor deployment only in an explicitly approved Testnet session and record its failed hash and absent contract state. The local contract test `failed_constructor_rolls_back_deployment` checks state rollback, while the Testnet result will establish the network-level deployment outcome.
