# Issue #219 — Deliverable 2 payout evidence

## Contract-test result

The pinned Rust 1.98.1 / Stellar CLI 27.0.0 build produced the constructor and N-winner WASM with local SHA-256 `1356f43a70552178836e1028aab105c113f863a51a51dd72a094a6bf643d3e2d`. This hash identifies a **local artifact only**; it has not been uploaded or verified as a Testnet `ContractCode` entry and must not replace `ESCROW_WASM_HASH` yet.

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

No #219 WASM upload, contract deployment, live payout, or Railway change has been performed. The uploaded #218 hash in `apps/web/.env.example` is for the prior three-winner ABI and is incompatible with these generated bindings. Before #219 can be merged or used to create new tournaments, an operator must approve uploading this exact N-winner WASM to Testnet, verify the `ContractCode` entry with `getLedgerEntries`, record that uploaded hash in `apps/web/.env.example` and README, and run the opt-in Testnet deployment/join/read-helper test. A live N-winner payout can then be recorded here under #266; contract-test results above are not live verification.
