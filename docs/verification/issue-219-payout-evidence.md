# Issue #219 — Deliverable 2 payout evidence

## Contract-test result

Status: **#219 WASM uploaded and its Testnet `ContractCode` entry verified; no contract instance deployed or live payout run.**

The #219 source tree at commit `d22509f` was built in Docker with Rust 1.98.1 and CI-pinned Stellar CLI 27.0.0. The exact optimized 10,594-byte constructor and N-winner artifact had local SHA-256 `1356f43a70552178836e1028aab105c113f863a51a51dd72a094a6bf643d3e2d`. It was uploaded to Testnet with Stellar CLI 27.1.0 using `--optimize=false`, so the submitted bytes were not changed by a second optimization. The returned hash matched the local artifact.

The confirmed [upload transaction](https://stellar.expert/explorer/testnet/tx/a58f34a3aad7ff7d6d065c194e308a243bde0ba95c947ded6f26e87ca52a8e7d) is `a58f34a3aad7ff7d6d065c194e308a243bde0ba95c947ded6f26e87ca52a8e7d` at ledger 4,673,319. A direct Testnet RPC `getLedgerEntries` lookup at latest ledger 4,673,331 returned one `contractCode` entry, last modified at ledger 4,673,319. The entry's hash and the SHA-256 of its 10,594 WASM bytes both equal `1356f43a70552178836e1028aab105c113f863a51a51dd72a094a6bf643d3e2d`; its bytes match the local artifact byte-for-byte. This full hash is now recorded in `apps/web/.env.example` and README. No private key or keypair is committed.

The `five_winner_payout_distributes_pool_and_dust` contract test specifies:

| Rank | Basis points | Payout, token base units |
| --- | ---: | ---: |
| 1 | 4,000 | 2,000,008 |
| 2 | 2,500 | 1,250,003 |
| 3 | 1,500 | 750,002 |
| 4 | 1,000 | 500,001 |
| 5 | 1,000 | 500,001 |

Five registrations at an entry fee of 1,000,003 produce a pool of 5,000,015. Flooring each proportional amount leaves 2 base units of dust, both assigned to rank one. The test checks each winner's token balance and `get_reward`, total payouts of 5,000,015, a zero escrow balance, and `get_tournament`'s final winner order and player count. Additional tests cover every count from one through ten, small and extreme pools, invalid vectors, and the 100-player read-helper boundary.

## Deferred Testnet evidence

No #219 contract instance deployment, live payout, or Railway change has been performed. The opt-in Testnet deployment/join/read-helper test and a live N-winner payout remain pending separate approval and matching deployed application code. In particular, `staging` has not yet received #268 or #219; do not change its Railway hash to this #219 artifact until its code uses the matching binding. The contract-test results above and verified code upload are not live contract-behavior verification for related change #266; the #218 constructor-deployment evidence is documented separately.
