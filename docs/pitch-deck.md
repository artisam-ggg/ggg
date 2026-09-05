# GGG — Good Game Guild · Hackathon Pitch Deck

> One markdown file, one slide per section. Slides are separated by `---`.
> Technical claims are grounded in [`SPEC.md`](../SPEC.md), the code in `apps/` + `contracts/`, and [`docs/features.md`](./features.md).
> Ecosystem/business claims (slides 6–8) are grounded in the research issue [#159](https://github.com/webnxt-2030/ggg/issues/159), sourced there.
> `[inferred]` marks anything reasoned from the repo/research rather than stated outright.
> This guide mirrors **`docs/pitch-deck-v3.pptx`** (10 slides). A read-aloud **Recording Script** and a **Judge/Investor Q&A guide** follow the slides.

---

## Slide 1: GGG — Good Game Guild

**Trustless tournament prize-escrow on Stellar Soroban.**

*Create a prize pool. Players pay in. The contract pays out. No one holds the money but the code.*

![Placeholder: GGG "Titanium Carbon" logo on dark hero background, tagline underneath](placeholder-image.png)

**Team:** _WebNXT / Team GGG_ (placeholder) — Julyza Peña · Mark Hugh Neri · Project Lead: [NAME]

**Speaker notes:** Open with the hook: every esports tournament has a pot of money, and today someone you have to trust is holding it. GGG replaces that person with a Soroban smart contract. Keep this slide to five seconds — say the name, the one-liner, and move. Flag that this pitch goes beyond the demo: you'll also cover impact on Stellar, the ecosystem-integration roadmap, and the go-to-market plan. Set the expectation: "I'll show you three real payout transactions on the Stellar explorer in under two minutes."

---

## Slide 2: The Problem

- **Prize money needs a custodian** — organiser or platform holds entry fees until payout
- **Custody = risk** — funds can be skimmed, delayed, frozen, or disappear
- **Players must trust a stranger** to pay out correctly, in full, on time
- Grassroots & community tournaments have **no neutral escrow** they can afford

![Placeholder: split image — cash behind a "?" custodian vs. a locked smart contract](placeholder-image.png)

**Speaker notes:** Ground this in SPEC.md §1: the actors are an organiser, players, and a referee, and today the money flows through whoever runs the event. That custodian is a single point of failure and of trust. Big leagues have lawyers and escrow agents; the millions of community and in-house tournaments have nothing — just "send me your entry fee and trust me." That trust gap — and specifically the long tail of grassroots events, which is exactly where our go-to-market starts — is what a public blockchain closes.

---

## Slide 3: The Solution

**GGG is a trustless prize-escrow protocol: a Soroban smart contract holds every entry fee and automatically pays the winners the moment a referee submits final rankings — no custodian ever touches the funds.**

- **Non-custodial by construction** — funds leave the contract *only* via payout or refund; there is no withdraw function
- **Signed client-side** — every on-chain action is signed in the player's own Freighter wallet; the server never holds a private key
- **Asset-agnostic** — entry fees in XLM or USDC, with a configurable 1st/2nd/3rd split (default 60/30/10)

![Placeholder: three-step diagram — Organiser creates → Players fund via QR → Contract auto-pays winners](placeholder-image.png)

**Speaker notes:** This is the thesis slide — say the one sentence slowly and let it land. Emphasise "no custodian ever touches the funds": the escrow has `initialize`, `join`, `finalize`, and `cancel`, but deliberately *no* withdraw — money only leaves as a winner payout or a refund. Signing always happens in the user's Freighter wallet, so we never hold keys. The 60/30/10 split is enforced in the contract as basis points that must sum to 10000, with rounding dust deterministically assigned to first place.

---

## Slide 4: Demo — The Under-Two-Minutes Flow

Live create → fund → settle, on Stellar Testnet:

1. **Organiser** logs in, creates an XLM tournament → contract deploys, **QR appears**
2. **Players** scan the QR / click Join → sign in Freighter → entry fee locks in escrow
3. **Live pool counter & participant list** tick up in real time (SSE, no refresh)
4. **Referee** opens the settlement console, assigns 1st/2nd/3rd → signs `finalize`
5. Contract pays **60/30/10 in a single transaction** → three payout links on the explorer

![Placeholder: screenshot of tournament detail page — live pool counter, QR tile, participant list, winners panel with explorer links](placeholder-image.png)

[PLACEHOLDER: Demo video — screen recording of the full create → 3 joins → finalize flow, ending on Stellar.Expert showing the three payout transactions; target length 60–90 seconds]

**Speaker notes:** This is the heart of the pitch — spend the most time here. The create step is actually two organiser signatures (`deploy`, then `initialize` — see the Q&A); joins pull the entry fee into the contract via `token.transfer`; the detail page streams `registered` and `finalized` events over Server-Sent Events so the pool updates without a refresh. The finish is the money shot: one `finalize_results` call fans out three payouts, and we open Stellar.Expert to show all three on-chain. Per `docs/acceptance-spec-15.md`, the happy path clocked ~90 seconds and cancel-refund ~82 seconds — both under the two-minute bar. Be honest: those runs were verified locally against Testnet.

---

## Slide 5: How It Works

- **Contract** — Rust + `soroban-sdk` 26, one WASM deployed per tournament; 7 functions, 3 events, 28 unit tests
- **Web** — Next.js 16 (App Router) + React 19 + Prisma 7 / PostgreSQL 17; builds & submits XDR, never signs
- **Wallet** — Freighter signs client-side; `@stellar/stellar-sdk` 15 talks to Soroban RPC + Horizon
- **Subscriber** — standalone worker polls contract events → Postgres → Redis → SSE
- **Data flow:** Browser signs → RPC submits → contract emits event → subscriber ingests → Redis pub/sub → live UI

![Placeholder: architecture diagram — Browser/Freighter ↔ Next.js (routes, tx-builder) ↔ Postgres/Redis, with Event Subscriber polling Stellar and pushing SSE](placeholder-image.png)

**Speaker notes:** Keep this tight — it's a credibility slide, not a lecture. Four planes (SPEC.md §3): an edge layer (Next.js route handlers that build transactions and enforce auth/CSRF/rate-limits), the Soroban contract layer, a data layer (Postgres for metadata, Redis for pub/sub and rate-limiting), and a background subscriber that turns on-chain events into a live feed. The key discipline: the server is stateless about keys — it builds an unsigned XDR, the client signs it in Freighter, the server submits and polls. That same discipline is what lets us plug into the ecosystem integrations on the next slides without becoming a custodian.

---

## Slide 6: Impact to the Stellar Ecosystem

- **Real on-chain volume** — every tournament = a deploy + N joins + a multi-payout settlement (+ refunds)
- **Taps USDC-on-Stellar's rail** — $83M+ supply, **$4.2B+** cumulative payment volume, 500k+ trustlines
- **Untapped vertical** — web3 gaming market **$33.4B in 2026**; esports prize pools up and to the right
- **Reference pattern** — a clean "client-signs, server-never-holds-keys" Soroban app others can copy

![Placeholder: bar/flow graphic — one tournament expanding into on-chain txns (deploy, joins, payouts) feeding Stellar network volume](placeholder-image.png)

**Speaker notes:** Beyond the product, GGG matters to Stellar itself. Every tournament generates a burst of *genuine* on-chain activity — a contract deployment, several entry-fee payments, and a multi-payout settlement — not synthetic volume. We also give USDC-on-Stellar (already $4.2B+ in cumulative payment volume) a recurring consumer use case outside pure payments/DeFi. The web3 gaming market alone is ~$33.4B in 2026 — esports is a real, largely untapped vertical for Stellar. And GGG is a clean reference implementation of the non-custodial signing pattern other Soroban consumer apps can copy. Sources are in issue #159.

---

## Slide 7: Ecosystem Integration Roadmap

**Plug into Stellar's rails — don't rebuild them.**

- **SEP-24 / SEP-31** — fiat on-ramp to fund entry fees + compliant cross-border payout
- **SEP-45 passkeys** (CAP-0051 secp256r1) — wallet-less player onboarding, no browser extension
- **SEP-50 NFTs** — on-chain tournament trophies / a portable competitive résumé
- **Soroswap + Reflector** — join with any Stellar asset (auto-routed); USD-pegged entry pricing
- **MoneyGram Ramps / MGUSD** — cash-to-crypto in 170+ countries for non-crypto players

![Placeholder: hub-and-spoke diagram — GGG core in center, SEP-24/31/45/50, Soroswap, Reflector, MoneyGram as spokes](placeholder-image.png)

**Speaker notes:** We're not planning to reinvent Stellar's rails — we plug into them. SEP-24/31 give us fiat on-ramp and cross-border payout without building banking integrations. Stellar's passkey smart-wallet work (live since Protocol 21) lets a player join with a device fingerprint, no extension — our biggest onboarding unlock for non-crypto-native players. SEP-50 lets us mint real trophy/participation NFTs. Soroswap + the Reflector oracle let a player fund with whatever asset they hold and let us price fees in stable USD. MoneyGram's ramp network — cash-to-crypto in 170+ countries, plus their new MGUSD stablecoin — reaches players with no wallet at all. Full detail and sources are in issue #159; note Reflector should be used with TWAP, per the Feb-2026 Blend oracle incident.

---

## Slide 8: Go-to-Market — Philippines → APAC → Global

- **Philippines (beachhead)** — massive grassroots esports + mobile gaming; high remittance/USDC fluency lowers ramp-education cost
- **APAC (expand)** — same guild & LAN-tournament culture; fast-growing blockchain-gaming adoption (Vietnam, Indonesia, Korea)
- **Global (scale)** — nothing is region-locked: any game, any Stellar wallet; expansion is partnerships, not re-engineering
- **Non-dilutive fuel** — Stellar Community Fund (SCF 7.0) grants to underwrite each stage

![Placeholder: three-tier expanding map — PH highlighted → APAC region → world, with a widening funnel](placeholder-image.png)

**Speaker notes:** Our rollout is deliberately staged. We start in the Philippines: enormous grassroots esports, high mobile-gaming penetration, and — thanks to remittances — unusually high everyday familiarity with USDC and cash-out apps, which lowers the education cost for our fiat-ramp integrations. Then we expand across APAC — Vietnam, Indonesia, Korea — same guild/LAN culture and some of the fastest-growing blockchain-gaming adoption anywhere. Globally, nothing in GGG is region-locked — any game, any Stellar wallet — so global growth is marketing and partnerships, not re-engineering. We're also pursuing SCF grants to fund each stage non-dilutively. [inferred: PH/APAC market characterization is directional, not from primary GGG data.]

---

## Slide 9: What's Next

- **Ship to live Railway + Testnet URL** — code complete and locally verified; final operator deploy remains [inferred priority]
- **Turn on the business model** — add a protocol-fee split recipient (contract currently pays 100% to players)
- **Passkey onboarding + fiat ramps** — the highest-leverage GTM unlocks (issue #159, A6/A3)
- **Automated match verification** — replace the trusted-referee step with game-API results / multi-referee dispute flow
- **Flexible payout tables + Mainnet** — N-place brackets; promote from Testnet with full USDC path

![Placeholder: roadmap timeline — Deploy → Protocol fee → Passkeys/Ramps → Auto-verification → Mainnet](placeholder-image.png)

**Speaker notes:** Be candid — it reads as maturity. Everything shown is proven locally against Testnet (498 tests, all six §15 criteria green), so the next step is the live deploy, not new feature code. The single most important product change is turning on a protocol fee — today the split sums to 100% to players, so there's literally no revenue mechanism yet. Then passkeys and fiat ramps, because those unlock the GTM plan. The biggest spec-vs-reality gap: the name says "match-verification protocol," but verification is currently a trusted human referee — automating that is the most valuable longer-term step. All prioritized and sourced in issue #159.

---

## Slide 10: Team & Thanks

**Team GGG** *(team name placeholder)*

| Name | Role (placeholder) | Contact |
|---|---|---|
| Julyza Peña | _[role — e.g. contract / backend]_ | _[contact]_ |
| Mark Hugh Neri | _[role — e.g. full-stack / product]_ | _[contact]_ |

Built on **Stellar Soroban**. Thanks to the Stellar Development Foundation, Freighter, and the hackathon organisers.

![Placeholder: team photo or avatars + GGG logo + "Thank you / Questions?"](placeholder-image.png)

**Speaker notes:** Land the plane in one breath: "GGG — trustless tournament escrow on Stellar; the contract holds the money, not us — built to plug into Stellar's existing rails and to grow deliberately from the Philippines outward." Thank the judges and invite questions. Fill in real roles before presenting. Keep the explorer tab from the demo open in case a judge wants to click into a payout live. Have the Q&A guide below in front of you.

---

## Recording Script (read-aloud, ~4–5 minutes)

> Continuous narration for a screen-recorded pitch. Timings are approximate; the demo section assumes you're screen-sharing the app. Bracketed cues are stage directions, not spoken.

**[Slide 1 — Title · ~15s]**
Hi, we're Team GGG, and this is Good Game Guild — trustless tournament prize-escrow, built on Stellar Soroban. Here's the one idea to hold onto: in GGG, no one holds the prize money but the code. Today I'll create a real tournament, fund it, settle it, show you three payout transactions on the Stellar explorer — and then cover why this matters for Stellar, how we plug into the ecosystem, and how we go to market.

**[Slide 2 — Problem · ~30s]**
Every paid tournament has a pot of entry fees, and today somebody has to hold that pot — the organiser, or some platform. That's custody, and custody is risk: the money can be skimmed, delayed, frozen, or just disappear. Big leagues can afford escrow agents and lawyers. But the millions of grassroots and community tournaments — which is exactly where we start — have nothing. Just "send me your entry fee and trust me." That trust gap is the problem we set out to close.

**[Slide 3 — Solution · ~30s]**
GGG is a trustless prize-escrow protocol. A Soroban smart contract holds every entry fee, and the moment a referee submits the final rankings, the contract itself pays the winners — no custodian ever touches the funds. Three things make that real. One: it's non-custodial by construction — the contract has no withdraw function, so money only ever leaves as a winner payout or a refund. Two: every on-chain action is signed in the player's own Freighter wallet — our server never holds a private key. And three: it's asset-agnostic — XLM or USDC, with a configurable split that defaults to 60/30/10.

**[Slide 4 — Demo · ~70s, screen-share the app]**
Let me show you. I'm logged in as an organiser. I create a tournament — name, game, an XLM entry fee, the referee's wallet, and the 60/30/10 split — and sign in Freighter. The contract goes live and a QR code appears. Now I'm a player: I scan that QR, sign the join, and my entry fee locks into the escrow. Watch the prize-pool counter and participant list — they tick up live, no refresh. I add two more players the same way. Now I switch to the referee's settlement console, drag players into first, second, and third, and sign finalize. That single transaction fans out the whole pool — sixty, thirty, ten. And here on Stellar.Expert are the three payout transactions, on-chain, verifiable by anyone. Start to finish, under two minutes.

**[Slide 5 — How it works · ~25s]**
Under the hood, four pieces. The escrow contract is Rust on soroban-sdk 26 — seven functions, three events, twenty-eight tests. The web app is Next.js with Prisma and Postgres; its job is to build and submit transactions, never to sign them. Signing is Freighter, client-side. And a standalone subscriber polls the chain, reconciles events into Postgres, and pushes them to the UI through Redis — that's the live feed you just saw. The throughline: the server is stateless about keys.

**[Slide 6 — Impact on Stellar · ~25s]**
Why does this matter to Stellar? Every tournament is a burst of genuine on-chain activity — a deploy, several entry-fee payments, a multi-payout settlement — real volume, not synthetic. It gives USDC-on-Stellar, already over four billion dollars in cumulative payment volume, a recurring consumer use case. And it opens esports — part of a thirty-three-billion-dollar web3 gaming market in 2026 — as a vertical for the network.

**[Slide 7 — Ecosystem integration · ~30s]**
We don't rebuild Stellar's rails — we plug into them. SEP-24 and 31 for fiat on-ramp and cross-border payout. Passkey smart wallets, live since Protocol 21, so a player joins with a fingerprint, no extension. SEP-50 for on-chain trophy NFTs. Soroswap and the Reflector oracle so a player can pay with any asset and we price in stable USD. And MoneyGram's ramps — cash-to-crypto in over a hundred seventy countries — for players with no wallet at all.

**[Slide 8 — Go-to-market · ~25s]**
Our rollout is staged. We start in the Philippines: huge grassroots esports and, thanks to remittances, unusually high familiarity with USDC and cash-out apps. Then across APAC — Vietnam, Indonesia, Korea — same guild and LAN culture, fast-growing adoption. Then global: nothing is region-locked, so scaling is partnerships, not re-engineering. And we're pursuing Stellar Community Fund grants to fund each step.

**[Slide 9 — What's next · ~20s]**
We're honest about what's left. Everything you saw is proven locally on Testnet — 498 tests green — so the next step is the live deploy. The most important product change is turning on a protocol fee; today the split is one hundred percent to players, so there's no revenue yet. Then passkeys and fiat ramps, then automated match verification.

**[Slide 10 — Thanks · ~15s]**
That's GGG: trustless tournament escrow on Stellar — the contract holds the money, not us. Thanks to the Stellar Development Foundation, the Freighter team, and the organisers. We're Julyza and Mark — happy to take your questions.

---

## Judge / Investor Q&A Guide

> Anticipated questions with tight, honest answers. Grounded in the codebase, `SPEC.md`, and research issue [#159](https://github.com/webnxt-2030/ggg/issues/159). Where the honest answer is "not yet," say so — candor reads as credibility.

### Product & technical

**Q1. How is this actually trustless if a human referee decides who won?**
The *custody* of funds is trustless — no person or platform can move the pool; the contract pays out or refunds, full stop. What is *not* yet trustless is *result determination*: today a designated referee submits the standings, so you trust that one party's honesty on the outcome (not on the money). Closing that gap — automated match verification from game APIs, and multi-referee/dispute flows — is our top post-MVP feature (issue #159, A7). We're upfront that "match-verification protocol" is aspirational today.

**Q2. What stops a malicious or colluding referee from paying their friends?**
Nothing at the protocol level today — the referee is trusted to enter correct standings. Mitigations on the roadmap: pulling results directly from a game's API/backend, requiring multiple referees to agree (multisig finalisation), and a dispute window before payout. For the current target market (community/organiser-run brackets where the referee is already the trusted tournament admin), this is an acceptable v1; for higher-stakes events it's a must-fix.

**Q3. Why does tournament creation need two wallet signatures?**
An implementation reality: the generated Soroban binding's `deploy()` can't pass constructor arguments, and our contract exposes `initialize` as a regular function, not a Soroban constructor. So the organiser signs `deploy`, then a second `initialize` that sets the fee, referee, and split. It's functionally complete — the wallet just prompts twice. Collapsing it to one transaction (a multi-op transaction or constructor-style bindings) is a known cleanup (`builders.ts` TODO).

**Q4. Why Stellar/Soroban instead of Ethereum, Solana, or an L2?**
Three reasons: (1) fees under ~$0.01 and 3–5s finality make micro-entry-fee tournaments economically viable where gas would eat the pool; (2) native USDC and a mature anchor/fiat-ramp ecosystem (MoneyGram, SEP-24/31) give us a real cash on/off-ramp story; (3) Soroban's authorization model lets us keep signing fully client-side. The whole GTM (grassroots, small fees, cash ramps in emerging markets) is a natural fit for Stellar specifically.

**Q5. Where are the funds actually held, and can you rug them?**
In the per-tournament escrow contract instance — not in any account we control. The contract has **no withdraw function**; funds can only leave as (a) the 60/30/10 payout on `finalize`, or (b) equal refunds on `cancel`. Our server never holds a private key, so there is no key we could use to drain a pool.

**Q6. What are the security invariants, and is the contract audited?**
Enforced in-contract: only the organiser can `initialize`/`cancel`; only the referee can `finalize`; winners must be distinct and registered; the split must sum to 10000 bps; `finalize`/`cancel` can't run twice; no double-join; rounding dust goes deterministically to 1st. Covered by 28 Rust unit tests. It is **not** yet independently audited — a third-party audit is required before Mainnet with real money, and it's on the roadmap/SCF-grant scope.

**Q7. What happens if a tournament is cancelled or nobody shows up?**
`cancel_tournament` (organiser-only, pre-finalisation) refunds every registered player their entry fee from escrow and marks the tournament cancelled. This path is built and covered by the §15 acceptance run (~82s end-to-end on Testnet).

**Q8. Is it live? What's the current status?**
Code-complete against SPEC.md — all 7 build phases shipped, zero open issues, 498 automated tests passing, and all six §15 acceptance criteria verified **locally against Testnet**. What's *not* done: a live public deployment (Railway configs are committed but not yet running) and a Mainnet launch. So: demo-ready and verifiable, not yet in production.

**Q9. How does the live "pool ticks up" feed work — is that trusted?**
A standalone subscriber polls Soroban RPC for the contract's own emitted events (`registered`/`finalized`/`cancelled`), writes them to Postgres, and pushes over Redis→SSE to the browser. The UI is a *view* of on-chain truth; the money movement itself is the contract's, and every event is independently verifiable on the explorer.

### Business & market

**Q10. How do you make money? What's the business model?**
Honestly: **there is no revenue mechanism yet** — the contract's split sums to 100% to players. The near-term unlock (issue #159, A1) is a protocol-fee recipient in the split (e.g. a 5% platform cut), which is the smallest contract change that turns GGG into a business. Secondary lines: premium organiser tooling (branding, analytics, sponsor slots), fiat-ramp revenue share, DEX routing fees, and an NFT-trophy secondary-market fee.

**Q11. How big is the market?**
Web3 gaming is ~$33.4B in 2026 (Straits Research); the broader esports market is $5.3B+ with 640M+ viewers. Headline prize pools are large and growing (Esports World Cup 2026: $75M across 24 games). Our wedge isn't those mega-events — it's the long tail of grassroots/community brackets that have no affordable neutral escrow. Even a small fee on many mid-size events compounds. (Sources in issue #159, Part C.)

**Q12. Who's the customer — organiser or player? Who pays?**
The organiser is the buyer/initiator (they create and configure the tournament); players are the volume (no app account required to join, which lowers the funnel). Revenue would come from a protocol fee on the pool and/or organiser subscriptions — so the organiser effectively "pays," but it's extracted from tournament flow, not an upfront SaaS bill.

**Q13. Who are your competitors, and what's the moat?**
Traditional custodial tournament platforms (Challonge/Toornament-style) and manual Discord/organiser escrow are the status quo we replace. On the same stack, **Trustless Work** is a general-purpose Soroban+USDC escrow-as-a-service — a real comparable, but not gaming-specific. Our defensibility is vertical focus (tournament-native UX: QR-to-fund, live settlement console, referee flow), the emerging-market GTM + fiat-ramp integrations, and network effects from a player's on-chain competitive résumé (NFT trophies). We're not claiming a deep technical moat on escrow itself — it's the vertical + distribution.

**Q14. What traction do you have?**
None commercial yet — this is a hackathon-stage build. The honest "traction" is engineering maturity: full spec implemented, 498 tests, six acceptance criteria green on Testnet. Next milestones are a live deployment and first pilot tournaments in the Philippines beachhead.

**Q15. Why start in the Philippines?**
Three tailwinds: a very large grassroots/mobile esports scene; unusually high everyday familiarity with USDC and cash-out apps (remittance culture), which lowers the education cost for our fiat-ramp integrations; and it's a natural APAC launchpad with shared guild/LAN-tournament culture. [inferred — directional market reasoning, not primary GGG data.]

**Q16. Is this Philippines-only or globally viable?**
Globally viable. Nothing in the code is region-locked — any game title, any Stellar-compatible wallet, jurisdiction-neutral assets (XLM/USDC). The Philippines is a *go-to-market beachhead*, not a product constraint; global expansion is a marketing/partnerships motion, not re-engineering.

### Stellar ecosystem

**Q17. What do you contribute back to the Stellar ecosystem?**
Real, non-synthetic on-chain volume per tournament (deploy + joins + multi-payout + refunds), a recurring consumer use case for USDC-on-Stellar outside payments/DeFi, and a clean open reference implementation of the "client-signs, server-never-holds-keys" pattern other Soroban consumer apps can reuse. It brings a new vertical — esports — onto Stellar.

**Q18. Which Stellar standards/protocols will you integrate, and why not build your own?**
Building on rails beats reinventing them: SEP-24/31 for fiat on-ramp and cross-border payout; SEP-45 passkey smart wallets (CAP-0051) for wallet-less onboarding; SEP-50 for trophy NFTs; Soroswap + Reflector for any-asset, USD-priced entry; MoneyGram Ramps/MGUSD for cash-to-crypto in 170+ countries. Each is already live/mature (see issue #159, Part B). This shrinks our build surface and inherits the ecosystem's compliance and liquidity.

**Q19. You mentioned an oracle — didn't Blend get exploited via one?**
Yes, and we cite it deliberately. Reflector fed Blend a latest-trade price without TWAP filtering, enabling a ~$10.8M manipulation in Feb 2026. Our takeaway: if/when we use Reflector for USD-pegged pricing, use time-weighted averages, not spot — and keep oracle exposure out of the core escrow path. It's also why we flag idle-pool yield (Blend integration, A8) as *research, not build* until a risk review.

**Q20. Have you applied for Stellar Community Fund grants?**
It's in the plan as non-dilutive fuel for each GTM stage — SCF 7.0 (active since Jan 2026) has three build tracks and a milestone-based payout structure that fits our roadmap. The ecosystem-integration and audit work are natural grant scopes. [inferred: intent, not yet an awarded grant.]

### Adoption, risk & team

**Q21. Players need a wallet — isn't that a huge adoption barrier?**
Today, yes — a player needs the Freighter extension, which is a real funnel killer for mainstream users. That's why **passkey smart wallets** (Stellar Protocol 21 / secp256r1) are our #2 priority: join with a device biometric, no seed phrase, no extension. Combined with MoneyGram cash ramps, the target experience is "scan, fingerprint, you're in" for a non-crypto-native player.

**Q22. What are the regulatory / KYC implications of holding prize money?**
For small community entry fees, exposure is limited, but payout size can trigger KYC/AML at the fiat-ramp boundary. We inherit compliance from the anchors we integrate — SEP-12 (KYC), SEP-24/31 anchors, and MoneyGram already handle regulated fiat. We deliberately stay non-custodial (the contract holds funds, not us), which changes our regulatory posture versus a custodial platform, but this needs jurisdiction-specific legal review before Mainnet — we're not claiming it's solved.

**Q23. Can this scale? One contract per tournament sounds heavy.**
One WASM is uploaded once; each tournament is a cheap contract *instance* from that hash — this is a standard Soroban pattern, and Stellar's sub-cent fees make per-tournament instances economical. Off-chain, the subscriber uses per-contract ledger cursors with idempotent, at-least-once processing, so it scales horizontally by tournament. We haven't load-tested at thousands of concurrent tournaments — that's a pre-scale validation, not a known blocker.

**Q24. What do you need right now (ask), and who's the team?**
Team: Julyza Peña and Mark Hugh Neri (roles to be finalised on the slide). The concrete asks: (1) a security audit before Mainnet, (2) intros to Stellar anchors/MoneyGram for the fiat-ramp integration, and (3) SCF grant support to fund passkey onboarding + the protocol-fee/business-model work. The product is built and verifiable today; what we're raising/asking for buys the path from Testnet-proven to a live, monetised, audited Mainnet product.

---

### Appendix — Build status at a glance (for Q&A, not a slide)

*Grounded in [`docs/features.md`](./features.md), [`docs/definition-of-done.md`](./definition-of-done.md), and code review across `apps/` + `contracts/`.*

| Area | Status | Evidence |
|---|---|---|
| Soroban escrow contract (7 fns, 3 events, invariants) | **Built** | `contracts/escrow/src/lib.rs`; 28 `cargo` tests |
| Stellar integration (XDR build/simulate/submit, SAC resolve) | **Built** | `apps/web/src/lib/stellar/` |
| Auth (argon2, session, Redis revoke, CSRF, rate-limit) | **Built** | `apps/web/src/lib/{password,auth,session-store,csrf,rate-limit}.ts` |
| Tournament API + pages (landing, login, register, list, new, detail, settle, admin) | **Built** | `apps/web/src/app/**` |
| Admin management (users, tournaments, role hierarchy) | **Built** | `apps/web/src/app/(dashboard)/admin/**`, `apps/web/src/server/services/admin.ts` |
| Event subscriber (RPC poll + Redis→SSE) | **Built** | `apps/subscriber/src/**` |
| Contract-backed tournament join QR | **Built** | `apps/web/src/components/tournament/QrTile.tsx` |
| Tests | **498 passing** | 454 web + 16 subscriber + 28 contract [inferred from `docs/`] |
| §15 acceptance (6 criteria + <2 min) | **PASS (local Testnet)** | `docs/acceptance-spec-15.md` |
| Revenue mechanism (protocol fee) | **Not built (planned)** | split sums to 100% to players; issue #159 A1 |
| Live Railway / Mainnet deploy | **Pending** | operator task |
| Automated match verification | **Not built (planned)** | referee is a trusted human today; issue #159 A7 |
| N-place / custom payout tables | **Not built** | contract fixes a 3-winner split |
| Ecosystem integrations (ramps, passkeys, NFTs, DEX) | **Researched, not built** | issue #159 Parts A/B |

*No major SPEC §1–14 component was found missing; the gaps above are deployment, monetisation, and forward-looking scope, per `docs/definition-of-done.md` (verdict: code-complete, blocked only on live deploy).*
