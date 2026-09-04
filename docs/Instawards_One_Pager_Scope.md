# GGG Instawards — One-Page Scope

**Project:** GGG (Good Game Guild)  
**Builder:** Neil John Rivera / Artisam Labs  
**Contact:** ggg@artisam.xyz  
**Chapter:** Philippines  
**Duration:** 30 calendar days  
**Requested budget:** $5,000  
**Target environment:** Stellar Testnet

## Purpose

Harden GGG's working Soroban tournament escrow and package it as a reusable, open-source toolkit for Stellar developers. This sprint closes three key gaps in the current prototype: funds can remain locked if an organizer or referee becomes inactive, tournament creation requires two transactions, and the escrow integration is embedded in the web application rather than available as a standalone SDK.

At completion, a third-party developer should be able to install the SDK, deploy and initialize the escrow contract on Stellar Testnet, and execute the complete create → join → settle → payout workflow using only the published documentation and examples.

## In-Scope Deliverables

| Deliverable | Scope | Acceptance criteria |
|---|---|---|
| **1. Deadline-enforced escrow** | Add a settlement deadline and a permissionless `claim_refund_after_deadline()` path when a tournament has not been finalized or cancelled. Expand edge-case and failure-path testing. | Refund succeeds after the deadline, fails before it, and both paths are covered by passing contract tests. |
| **2. Contract and transaction hardening** | Implement single-transaction deploy and initialize, configurable N-winner payouts, TTL bumping and storage lifecycle validation, plus `get_players()` and `get_tournament()` read helpers. | Deploy and initialize succeeds in one Testnet transaction; a tested N-winner payout distributes correctly; 30+ contract tests pass, including TTL and read-helper coverage. |
| **3. Reusable SDK and live reference deployment** | Extract contract client, transaction builders, and validation helpers into `@ggg/escrow-sdk@0.1.0`; publish it to npm; provide a public MIT-licensed GitHub repository, usage README, and `examples/nodejs-escrow/`; redeploy the Testnet app with the updated WASM. | The npm package installs, the Node.js example runs, the live `/health` endpoint returns HTTP 200, and the app completes the full create-join-settle flow through the SDK. |

## Execution Plan

| Week | Focus | Expected output |
|---|---|---|
| **1** | Deadline-enforced escrow | Contract builds; refund-after-deadline behavior and failure paths pass tests. |
| **2** | Single transaction, N-winner payouts, TTL | Updated WASM and SDK bindings; one-transaction Testnet deployment; payout and lifecycle behavior validated. |
| **3** | SDK extraction and live redeploy | npm package, public docs and Node.js example; updated Testnet application online. |
| **4** | End-to-end validation | Demo video, integration guide, passing test evidence, and Stellar Expert Testnet transaction links. |

## Completion Evidence

Completion will be demonstrated through the public source repository, CI/test output, npm package link, Testnet contract ID and WASM hash, Stellar Explorer transaction links, public application URL and health check, integration guide, and a demo video showing the complete live workflow. The end-to-end create → join → settle → payout flow must execute on Testnet without manual contract intervention.

## Budget

The **$5,000** request covers approximately **200 engineering hours at $25/hour**: contract development and testing (~95 hours), SDK extraction and npm publishing (~80 hours), and documentation, examples, and Testnet redeployment (~25 hours). No funds are allocated to marketing, operations, airdrops, subscriptions, or business development.

## Explicitly Out of Scope

- Mainnet deployment and Mainnet USDC integration.
- Multi-wallet support beyond Freighter, including StellarWalletsKit integration.
- A third-party security audit; Mainnet use remains contingent on future audit and validation work.
- Expansion of GGG into a broader gaming platform beyond this Testnet hardening and SDK-extraction sprint.

## Key Risk Controls

The settlement deadline prevents indefinite fund lock when organizers or referees go inactive. Transparent on-chain results make referee decisions auditable, with admin force-cancel retained as a last resort. Contract risk is reduced through 30+ automated tests, invariant and failure-path checks, integration testing, and documented known risks. Existing API protections—including rate limiting, CSRF protection, session management, and submission idempotency—remain enforced.
