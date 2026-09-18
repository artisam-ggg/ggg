# Week 1 — Deadline-enforced escrow

## Planned work

Implement the deadline-based refund path, build the contract, and retain passing test evidence. See the [Week 1 plan in the SOW](https://github.com/artisam-ggg/ggg/blob/675986512bda71c01218e05993ac8ea252a51dee/docs/Instawards_SOW.md).

## Evidence status

Repository evidence for the deadline/refund work is recorded in [#218 constructor-upload evidence](https://github.com/artisam-ggg/ggg/blob/ee1cb8e53624c31465cae20124f3790e9083a886/docs/verification/issue-218-testnet-evidence.md) and the [#221 regression matrix](https://github.com/artisam-ggg/ggg/blob/33c8d68ed28f1a4cdce17d2a513c136106f27347/docs/verification/issue-221-regression-evidence.md). The regression record names tests for the inclusive deadline boundary, rejection before deadline, authorization, cancellation/finalization races, and failed transfer rollback.

The #218 report records a constructor-WASM upload at source commit `98b8619`, but it explicitly says no Testnet constructor deployment or live join was performed. Separate public evidence now identifies a [D1 Testnet contract](https://stellar.expert/explorer/testnet/contract/CCEZLQUWJXU7YRCGZWKKP4G352BLDAGE4EAEH7GGMNAC6H5XFE6CZFZA) and two successful refund claims: [transaction 1](https://stellar.expert/explorer/testnet/tx/f435162b1cc7f0ac137527f6340a4d1bede8d12a38ac3d8f18c2e3896b457da2) and [transaction 2](https://stellar.expert/explorer/testnet/tx/8082490e8962e1698764c2be5f5e6603e97309d153cf688da3f507c7a09df32d). The remaining public D1 gap is evidence of the rejected pre-deadline call.

## Reviewer path

Continue to [D1 — Deadline-enforced escrow](../deliverables/d1.md) for the traceability summary.
