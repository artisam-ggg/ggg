# Evidence Index

## Recorded Testnet artifacts

| Evidence | Source revision | Testnet artifact | What it proves | What it does not prove |
| --- | --- | --- | --- | --- |
| [#218 constructor upload](https://github.com/artisam-ggg/ggg/blob/ee1cb8e53624c31465cae20124f3790e9083a886/docs/verification/issue-218-testnet-evidence.md) | `98b8619` | [Upload transaction](https://stellar.expert/explorer/testnet/tx/ff16ac0b5996b09033383457657508b3057b14eb0575c7ea29e93b3a7908e181) · WASM `6cd5beaee7382d6033b09b19f741d41e2f499651a3804ad81be0a4ede39c5b72` | Constructor WASM upload and matching `ContractCode` record | Contract deployment, join, or refund |
| [#219 N-winner upload](https://github.com/artisam-ggg/ggg/blob/eb1281808c63126a2ce6b243c6ba2cd753f41292/docs/verification/issue-219-payout-evidence.md) | `d22509f` | [Upload transaction](https://stellar.expert/explorer/testnet/tx/a58f34a3aad7ff7d6d065c194e308a243bde0ba95c947ded6f26e87ca52a8e7d) · WASM `1356f43a70552178836e1028aab105c113f863a51a51dd72a094a6bf643d3e2d` | N-winner WASM upload and matching `ContractCode` record | Deployed instance or live payout |
| [#220 TTL upload](https://github.com/artisam-ggg/ggg/blob/118864cb36b668afb2bd00a7944715176fae9f99/docs/verification/issue-220-ttl-evidence.md) | `d590b36` | [Upload transaction](https://stellar.expert/explorer/testnet/tx/5498ee96135a2d485791c21a001771e9bedf572a790267461c99abea122f74bf) · WASM `2dcfb4c3ed77863269a347308156021de08427f5e6aa77ba15a08d9476c03f77` | TTL WASM upload and matching `ContractCode` record | Deployed instance, live payout, or full end-to-end flow |

## Public endpoint observation

The book lists [ggg.quest](https://ggg.quest/) and [beta.ggg.quest](https://beta.ggg.quest/) as public endpoints. An unauthenticated check of the beta endpoint returned HTTP 200 on 18 September 2026. This is an availability observation only; it does not establish which contract artifact is configured or that an SOW acceptance flow has completed.

## Evidence sources

- [Constructor WASM-upload evidence — #218](https://github.com/artisam-ggg/ggg/blob/ee1cb8e53624c31465cae20124f3790e9083a886/docs/verification/issue-218-testnet-evidence.md) — does not prove a refund.
- [N-winner payout evidence — #219](https://github.com/artisam-ggg/ggg/blob/eb1281808c63126a2ce6b243c6ba2cd753f41292/docs/verification/issue-219-payout-evidence.md)
- [TTL evidence — #220](https://github.com/artisam-ggg/ggg/blob/118864cb36b668afb2bd00a7944715176fae9f99/docs/verification/issue-220-ttl-evidence.md)
- [Regression evidence — #221](https://github.com/artisam-ggg/ggg/blob/33c8d68ed28f1a4cdce17d2a513c136106f27347/docs/verification/issue-221-regression-evidence.md)
- [End-to-end acceptance record](https://github.com/artisam-ggg/ggg/blob/89f831993f9a4a75eb7b30fbf1c481666bbb3c73/docs/verification/e2e-acceptance.md)

## Add before marking final completion

- Atomic deploy-and-initialize transaction and resulting contract ID
- A post-deadline refund transaction and the associated tournament instance
- A live N-winner payout transaction
- SDK package URL, version, and successful example output
- Redeployed app health check and end-to-end Testnet flow
- Public demo and integration guide, if submitted as the Week 4 package
