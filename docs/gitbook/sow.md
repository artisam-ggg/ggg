# Statement of Work

The approved [GGG Instawards SOW](https://github.com/artisam-ggg/ggg/blob/675986512bda71c01218e05993ac8ea252a51dee/docs/Instawards_SOW.md) is the authoritative scope baseline. This page is a reader guide, not a replacement for that source.

## Objective

The sprint is intended to harden GGG's tournament escrow on Stellar Testnet, add a deadline-based refund path, reduce tournament deployment to a single signed transaction, support configurable winner counts, and extract reusable developer tooling. The SOW explicitly limits the work to a 30-day Testnet sprint.

## Deliverables

| ID | SOW commitment | Review page |
| --- | --- | --- |
| D1 | Deadline-enforced escrow, including a permissionless refund path after an unfinalized tournament's settlement deadline | [D1](deliverables/d1.md) |
| D2 | Atomic deploy-and-initialize, 1–10 winner distribution, TTL lifecycle handling, read helpers, and 30+ tests | [D2](deliverables/d2.md) |
| D3 | Standalone SDK, npm publication, Node.js example, and a redeployed Testnet reference consumer | [D3](deliverables/d3.md) |

## Review rule

The SOW describes the goal; it does not itself prove delivery. Each deliverable is therefore evaluated against its listed evidence requirement. A future scope change belongs in a dated weekly report or a new SOW—not as a silent edit to the baseline.

## Explicit scope boundaries

The SOW makes this a Testnet hardening and SDK-extraction sprint. It does not include Mainnet deployment, multi-wallet support, USDC Mainnet integration, or an independent third-party security audit. A documented test result is useful evidence, but it is not a substitute for either an audit or the specific live Testnet artifact the acceptance criterion asks for.

## Evidence required at completion

| Deliverable | Evidence required by the SOW |
| --- | --- |
| D1 | Testnet Explorer evidence for an after-deadline refund, source/test evidence for the path, and tests for both sides of the deadline boundary |
| D2 | A one-transaction deploy-and-initialize proof, resulting contract ID and WASM hash, tested N-winner distribution, and 30+ contract tests covering TTL and read helpers |
| D3 | Public npm package, public SDK source and usage documentation, runnable Node.js example, redeployed app health check, and live create → join → settle flow |
