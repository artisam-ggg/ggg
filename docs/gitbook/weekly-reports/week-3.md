# Week 3 — SDK extraction and Testnet redeploy

## Planned work

Extract the SDK, publish `@goodgameguild/escrow-sdk@0.1.0`, provide a Node.js example, and redeploy the Testnet application. See the [Week 3 plan in the SOW](https://github.com/artisam-ggg/ggg/blob/675986512bda71c01218e05993ac8ea252a51dee/docs/Instawards_SOW.md).

## Final status

**Completed on 24 September 2026.** The package is public, the standalone example and integration guide are available, the web app and subscriber run the reviewed SDK-backed release, and funded Testnet settlement/refund paths are independently linked.

| Required proof | Final evidence |
| --- | --- |
| Published SDK | [`@goodgameguild/escrow-sdk@0.1.0`](https://www.npmjs.com/package/@goodgameguild/escrow-sdk/v/0.1.0) |
| Public SDK source and usage | [Immutable tagged SDK README](https://github.com/artisam-ggg/ggg/tree/goodgameguild-escrow-sdk-v0.1.0/packages/escrow-sdk) · [integration guide](../guides/sdk-integration.md) |
| Successful Node.js consumer | [Standalone example](https://github.com/artisam-ggg/ggg/tree/goodgameguild-escrow-sdk-v0.1.0/examples/nodejs-escrow) · [recorded live run](https://github.com/artisam-ggg/ggg/blob/staging/docs/verification/issue-225-node-example-testnet.md) |
| SDK-backed Testnet app | [Public app](https://app.ggg.quest/) · [health](https://app.ggg.quest/api/health) · revision `15902cf` |
| Matching contract artifact | WASM `b704f577f1715d965f9ba24f2cebf49df52735d42c9a4cd2a93781d612a46dd9` |
| Ranked settlement and refunds | [D3 live evidence](../deliverables/d3.md#live-testnet-paths) |
| Exact public CI | [`develop`](https://github.com/artisam-ggg/ggg/actions/runs/35977199117) · [`staging`](https://github.com/artisam-ggg/ggg/actions/runs/35977199084) |

The release uses the project-owned `@goodgameguild` scope. The earlier `@ggg` name in planning text is not the published package.

## Reviewer path

Continue to [D3 — SDK extraction, npm, and live redeploy](../deliverables/d3.md) and the [Evidence index](../reference/evidence.md).
