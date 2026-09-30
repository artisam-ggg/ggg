# Week 4 — Validation package

## Planned work

Prepare a public demo video, integration guide, and a Testnet transaction-hash list. See the [Week 4 plan in the SOW](https://github.com/artisam-ggg/ggg/blob/675986512bda71c01218e05993ac8ea252a51dee/docs/Instawards_SOW.md).

## Final status

**Completed on 24 September 2026.** The public validation package connects the released SDK and runnable example to the exact deployed revision and three distinct funded Testnet terminal paths.

| Required validation artifact | Final evidence |
| --- | --- |
| Public demo video | [Edited full-flow recording](https://drive.google.com/file/d/1NvTigSXywA8Uk5PpIhEwdjDpWx_DfKmd/view?usp=sharing) · [Focused 3–5 minute backup recording](https://drive.google.com/file/d/1JZzdBZbKMkwqt4xU2s-6N3WKPCHwFAge/view?usp=sharing) ([#347](https://github.com/webnxt-2030/ggg/issues/347)) |
| Public integration guide | [Escrow SDK integration guide](../guides/sdk-integration.md) |
| Package and source | [npm `0.1.0`](https://www.npmjs.com/package/@goodgameguild/escrow-sdk/v/0.1.0) · [immutable source tag](https://github.com/artisam-ggg/ggg/tree/goodgameguild-escrow-sdk-v0.1.0/packages/escrow-sdk) |
| Contract IDs and transaction list | [Focused backup recording trail](../reference/evidence.md#focused-backup-recording) · [final release evidence index](../reference/evidence.md#final-sdk-backed-release-run) |
| Create, join, settle, and payout | [Ranked settlement evidence](../deliverables/d3.md#ranked-settlement) |
| Delegated deadline refund | [Deadline-refund evidence](../deliverables/d3.md#delegated-post-deadline-refund) |
| Cancellation and refund | [Cancellation evidence](../deliverables/d3.md#cancellation-and-refund) |
| Public application health | [`https://app.ggg.quest/api/health`](https://app.ggg.quest/api/health) returned HTTP 200 after the matching deployment |

The demo and transaction trail are Testnet evidence. They do not assert Mainnet deployment or an independent external security audit.

The backup recording's Google Drive share page returned HTTP 200 without authentication on 30 September 2026. The recording author reviewed the finished video and confirmed it follows the final #347 script: create → three joins → referee settlement → payout. The author also identified the tournament's [public Testnet contract and five-transaction trail](../reference/evidence.md#focused-backup-recording), confirmed that the Drive file is the retained MP4 archival copy, and confirmed that wallets and authenticated sessions were prepared before recording so sensitive setup material was not shown. The recording used the public `staging` deployment at revision [`1021738`](https://github.com/webnxt-2030/ggg/commit/10217383f84acda7ef0084b05fc63890da05cf7a); later UI/UX additions were outside the SOW demo scope.
