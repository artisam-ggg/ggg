**1. Project & Team Information**

| **Project Name:** | **GGG (Good Game Guild)** |
|---|---|
| **Builder / Team Name:** | **Neil John Rivera / Artisam Labs** |
| **Primary Contact (Name + Email):** | **Neil John Rivera / ggg@artisam.xyz** |
| **Ambassador Chapter:** | **Philippines** |
| **Ambassador Chapter Lead:** | **Nelson Lumbres** |
| **Date Submitted:** | **30-July-2026** |
| **Suggested Sprint Start Date:** | **14-August-2026** |

**2. Instawards Overview & Intent**

**2.1 Instawards Purpose (for Builder Context)**

The purpose of this Instaward is to take the next practical step with GGG's tournament escrow. We already have a working Soroban contract and a live Testnet app, but three gaps keep it from being a tool other developers can trust and reuse: funds have no deadline-based escape hatch if a referee or organizer goes silent, tournament creation still requires two separate transactions, and the escrow logic is buried inside the web app instead of being a standalone package. Beyond gaming, the same escrow primitive applies to any scenario where a neutral party needs to hold and release funds based on a verifiable outcome — hackathons, bounty platforms, and other competition organizers can adopt the same contract and SDK. Over 30 days, we want to close these gaps, add a settlement deadline after which any player can permissionlessly claim a refund if the tournament was never finalized or cancelled, collapse deploy and initialize into one transaction with configurable N-winner payouts, and extract a reusable SDK that we publish to npm and prove end-to-end on a live Testnet redeploy. The goal is to turn the escrow into a small, reliable, tested building block that other Stellar developers can drop into their own apps without rebuilding the wallet, contract, and transaction logic from scratch. In short, this is a 30-day Testnet hardening and SDK extraction sprint, not an expansion of GGG into a broader platform. All code produced under this sprint — the contract, SDK, and examples — will be MIT-licensed and open source, publicly available on GitHub.

**3. Problem Statement & Objective**

| | | |
|---|---|---|
| **Problem Being Addressed** | What specific problem, gap, or blocker is this Instaward intended to solve? | Paid tournaments need someone to hold the prize money until winners are announced, usually the organizer or a platform, which means players just have to trust them not to delay, freeze, or misuse it. Grassroots tournaments can't afford a neutral third party, so they either take that risk or skip paid events. GGG replaces that trust with code-enforced escrow, but it's still a working prototype, not yet the polished, reusable tool developers and organizers can rely on |
| **Objective of This Instaward** | In one or two sentences, what will be true at the end of 30 days if this Instaward is successful? | At the end of 30 days, GGG will ship a reusable, freely licensed escrow toolkit that Stellar developers can import into their own apps. This includes a hardened smart contract with a deadline-based refund path so funds can no longer remain permanently locked when an organizer or referee becomes inactive, single-transaction deploy and initialize, and configurable N-winner payouts, deployed live on Testnet, demonstrating the full create-join-settle flow. We will also provide documented example projects so other developers can build on the primitive without starting from scratch. |
| Example prompts for builders: What is currently preventing progress? What is unclear, missing, or unbuilt today? Why is this problem worth solving now? | | |

**4. Scope of Work (30-Day Deliverables)**

**Important guidance:** This scope must be achievable within **30 calendar days**. If the work feels larger, it should be reduced or split into more achievable phases.

**4.1 In-Scope Deliverables**

| **Deliverable** | **Description (What will be built or produced?)** | **Why this matters** |
|---|---|---|
| Deliverable 1 — Deadline-enforced escrow | Add a settlement deadline, after which any player can permissionlessly call claim_refund_after_deadline() if the tournament was never finalized or cancelled; enforce not-finalized/not-cancelled checks; harden the contract through expanded edge-case testing and failure-path verification covering the deadline and refund path. | Funds can no longer remain permanently locked when an organizer or referee becomes inactive. The deadline-based refund path is the strongest trust improvement in this sprint. |
| Deliverable 2 — Single-sig + N-winner + TTL | Perform single-transaction deploy and initialize; add configurable N-winner payout distribution; add TTL bumping with storage lifecycle validation; add get_players() / get_tournament() read helpers; harden the contract to 30+ tests covering edge cases and failure paths. | Removes the two-signature UX wart and supports more tournament formats |
| Deliverable 3 — SDK extraction + npm + live redeploy | Extract the contract client, transaction builders, and validation helpers into a standalone package; publish @ggg/escrow-sdk@0.1.0 to npm with a Node.js example (examples/nodejs-escrow/) and a public GitHub repo with a README covering installation and usage; redeploy the Testnet app with the updated WASM as the reference consumer. | Turns the in-app Stellar code into a reusable public good other developers can install directly, and proves it works live. |
| **Out-of-Scope (Explicitly Not Included)**<br>List anything that might be assumed but is not included in this Instaward scope. |||
| StellarWalletsKit multi-wallet support | A wallet abstraction layer that supports multiple Stellar wallets beyond Freighter (xBull, LOBSTR, etc.) through the StellarWalletsKit SDK. | Requires new signer abstraction, UI changes, and per-wallet testing; out of scope for this 30-day sprint |
| Mainnet deployment | Deploying the escrow contract and web app to Stellar Mainnet. | This sprint targets Testnet only; Mainnet deployment is planned as a future step once the hardened contract and SDK are validated. |
| USDC Mainnet integration | Coordinating with the USDC issuer for Mainnet-side token support. | Depends on Mainnet deployment happening first; not part of this Testnet-focused sprint. |
| Third-party security audit | An independent audit of the escrow contract by an external security firm. | Out of scope for this 30-day sprint; mitigated in the interim through 30+ unit/integration tests covering edge cases and failure paths. A full audit is planned before any Mainnet use. |

**4.2 Deliverable-Aligned Budget Request**

| **Requested Budget Amount** | **Rationale for Budget Request** |
|---|---|
| **$5,000** | $5,000 covers engineering work at $25/hour across 200 hours (approximately 6 to 7 hours per day over the 30-day sprint), dedicated exclusively to: Soroban contract development, including deadline-based refunds, single-transaction deploy and initialize, configurable N-winner payout distribution, TTL bumping, and automated testing and contract hardening (~95 hours); SDK extraction, packaging, and npm publishing (~80 hours); and documentation, Testnet redeployment, and developer examples (~25 hours). No budget is allocated to marketing, operations, airdrops, subscriptions, or business development. |

**4.3 Acceptance Criteria**

Success for this Instaward means a third-party developer can install the SDK, deploy the contract on Stellar Testnet, and execute the complete escrow workflow using only the provided documentation and examples — without support from the GGG team.

| **Deliverable** | **Pass Criteria** |
|---|---|
| Deliverable 1 — Deadline-enforced escrow | Refund via claim_refund_after_deadline() succeeds after the settlement deadline passes; refund attempt fails/reverts before the deadline; contract tests covering both paths pass. |
| Deliverable 2 — Single-sig + N-winner + TTL | Deploy and initialize complete via single-transaction deploy and initialize on Testnet; configurable N-winner payout distributes correctly for a tested winner count; 30+ contract tests passing, covering TTL bumping and the get_players() / get_tournament() read helpers. |
| Deliverable 3 — SDK extraction + npm + live redeploy | @ggg/escrow-sdk installs successfully from npm; Node.js example (examples/nodejs-escrow/) runs against it; redeployed Testnet app's public /health endpoint returns HTTP 200; full create-join-settle flow completes on the live app using the SDK. |
| End-to-End Validation | The complete create → join → settle → payout flow executes successfully on Stellar Testnet without any manual contract intervention. |

**4.4 Risk & Mitigation**

| **Risk** | **Mitigation** |
|---|---|
| Locked funds if referee and organizer both go silent | Settlement deadline is set at initialize; players can call claim_refund_after_deadline() permissionlessly once the deadline passes if the tournament was never finalized or cancelled. |
| Referee collusion or biased results | Results are published on-chain with transparent events, so any bad call is auditable. Admin force-cancel exists as a last resort. The protocol does not prevent a malicious referee from picking the "wrong" winners. |
| Smart contract bug locking or draining funds | Mitigated through 30+ unit tests, invariant checks, integration tests, and documented known risks. A full third-party security audit is explicitly out of scope for this 30-day sprint. |
| API abuse or denial-of-service | Rate limiting, CSRF protection, session management, and idempotency on submission endpoints are already in place and remain enforced. |

**5. 30-Day Execution Plan & Timeline**

**5.1 Weekly Breakdown**

| **Week** | **Planned Work** | **Expected Output** |
|---|---|---|
| Week 1 | Deadline-enforced escrow | Contract builds; new refund-after-deadline path tested; cargo test still passes. |
| Week 2 | Single-sig + N-winner + TTL | New WASM builds; single-transaction deploy and initialize creates the escrow contract on Testnet; SDK bindings updated; configurable N-winner payout distribution simulates correctly. |
| Week 3 | SDK extraction + npm + live redeploy | SDK packs and imports; npm install @ggg/escrow-sdk works; Node.js example runs successfully; public /health endpoint returns HTTP 200 on the redeployed app. |
| Week 4 | Validation Package | Public demo video URL + integration guide URL + tx hash list on Stellar Expert (Testnet) |

**6. Evidence of Completion (Required)**

**Important guidance:** Evidence should be clear, verifiable, and easy to review by the Ambassador Chapter Lead **with minimal technical expertise**.

**6.1 Planned Evidence to Be Submitted**

| **Deliverable** | **Evidence Type** (link, repo, demo, screenshot, doc, tx hash, etc.) | **Description** |
|---|---|---|
| Deliverable 1 — Deadline-enforced escrow | Repo / Tx hash / Test output | Stellar Explorer link showing a refund executed via claim_refund_after_deadline() after the deadline passes; contract repo showing the new function; CI/test output showing passing tests for the deadline-refund path. |
| Deliverable 2 — Single-sig + N-winner + TTL | Repo / Tx hash / Test output | Stellar Explorer link showing the single-transaction deploy and initialize; resulting Contract ID (Testnet) and deployed WASM hash; contract repo showing the configurable N-winner payout distribution and TTL bumping logic; CI/test output confirming 30+ total passing contract tests, covering TTL bumping and the get_players() / get_tournament() read helpers. |
| Deliverable 3 — SDK extraction + npm + live redeploy | Link / Demo Tx hash | npm package link for @ggg/escrow-sdk; public GitHub repo link with README (installation + usage instructions); public app URL; demo video showing the full flow live on the redeployed Testnet app. |

**6.2 Evidence Verification Checklist (For Ambassador Use)**

For each deliverable, the Ambassador Chapter Lead will assess whether evidence is present and sufficient.

| **Deliverable** | **Evidence Present** | **Evidence Partial** | **Evidence Missing** | **Comments** |
|---|---|---|---|---|
| Deliverable 1 | ☐ | ☐ | ☐ | |
| Deliverable 2 | ☐ | ☐ | ☐ | |
| Deliverable 3 | ☐ | ☐ | ☐ | |

**7. Next-Step Alignment**

**7.1 Anticipated Next Step After Completion**

After this Instaward, the most likely next step is:

> ☑ Apply to SCF Build Award
>
> ☑ Continue development independently
>
> ☑ Apply for a follow-on Instaward (if eligible)
>
> ☑ Seek other ecosystem support
>
> ☐ Other:

**8. Instawards Constraints Acknowledgement**

By submitting this SOW, the Builder acknowledges:

> ☑ This scope will be completed within **30 days or less**.
>
> ☑ Instawards support execution, not open-ended exploration.
>
> ☑ A project may receive **no more than two follow-on Instawards**.
>
> ☑ Each Instaward is capped at **$5,000**.
>
> ☑ Total Instawards funding may not exceed **$15,000**.

**9. Submission Confirmation**

Once finalized, this Statement of Work will be submitted by the Ambassador Chapter Lead via the Instawards Airtable submission form for review and approval.
