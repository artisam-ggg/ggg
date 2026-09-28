# SOW deadline-refund entrypoint verification

Date: 2026-09-21

## Scope

This record verifies the additive `claim_refund_after_deadline(player)` escrow ABI. The existing `claim_refund(player)` method remains available to existing app code and shares its one-claim storage record and `refund_claimed` event with the new method.

## Contract verification

- `cargo fmt --check`: passed.
- `cargo test`: passed, 76 tests.
- `stellar contract build` with the repository-pinned Stellar CLI 27.0.0: passed.
- Optimized WASM SHA-256: `b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9`.
- The generated TypeScript binding matches the pinned CLI output byte-for-byte after the repository's generated-file lint header.

The deadline tests verify:

- rejection with `DeadlineNotReached` before the deadline;
- success at the inclusive deadline boundary;
- no caller authorization requirement and payment only to the registered player;
- rejection for cancelled and finalized tournaments;
- the shared `refund_claimed` event and one-claim state; and
- double-claim prevention in both old-to-new and new-to-old method order.

## SDK verification

- Typecheck: passed.
- Lint: passed.
- Unit tests: passed, 13 tests.
- Build and package: passed; the tarball contains the new method in its JavaScript and declaration outputs.
- Existing web escrow builder tests: passed, 14 tests.
- Workspace typecheck and lint: passed.

## Testnet evidence

| Artifact | Public evidence |
| --- | --- |
| WASM upload | [`8b52fd38360771b477ed0c11aa9eaa9b941f0f2e00eded8e3a534862923876f8`](https://stellar.expert/explorer/testnet/tx/8b52fd38360771b477ed0c11aa9eaa9b941f0f2e00eded8e3a534862923876f8) |
| Contract deployment | [`de7f900b4c3b37fd56da351b5670f4f0cf9b719807b73be3018c2f055a807259`](https://stellar.expert/explorer/testnet/tx/de7f900b4c3b37fd56da351b5670f4f0cf9b719807b73be3018c2f055a807259) |
| Contract | [`CCTEMMRQRQJTN3ZHVV3AE2YH2UPNJ4IPDHWIPONMUAGXARD33N344V6P`](https://stellar.expert/explorer/testnet/contract/CCTEMMRQRQJTN3ZHVV3AE2YH2UPNJ4IPDHWIPONMUAGXARD33N344V6P) |
| Player join | [`ce683f71698197fa93e3f01d6311fc956ae5906d775685d48161cb5c1155ea27`](https://stellar.expert/explorer/testnet/tx/ce683f71698197fa93e3f01d6311fc956ae5906d775685d48161cb5c1155ea27) |
| Named deadline refund | [`813ec5f5703a6e0504cae3d19fa602ba24e89420fab6c4f675eb49bb127325a6`](https://stellar.expert/explorer/testnet/tx/813ec5f5703a6e0504cae3d19fa602ba24e89420fab6c4f675eb49bb127325a6) |

The contract was deployed with settlement deadline `1789961338`. Before that deadline, a no-send simulation of `claim_refund_after_deadline` rejected with contract error 14 (`DeadlineNotReached`). After the deadline, the public transaction above invoked the same named method, returned the 1 XLM entry fee, and emitted `refund_claimed`.

## Known verification limits

The web production build compiles and completes TypeScript checking, then page-data collection requires the app environment and services that are intentionally absent from this isolated worktree. Contract Clippy with all warnings denied reaches existing warnings in unchanged code. Neither limitation affects the contract build, contract tests, SDK checks, or live Testnet proof above.
