# GGG — Good Game Guild · Hackathon Pitch Deck

> One markdown file, one slide per section. Slides are separated by `---`.
> Technical claims are grounded in `SPEC.md`, the code in `apps/`, `contracts/`, and `docs/features.md`.
> `[inferred]` marks anything reasoned from the repo rather than stated outright.

---

## Slide 1: GGG — Good Game Guild

**Trustless tournament prize-escrow on Stellar Soroban.**

*Create a prize pool. Players pay in. The contract pays out. No one holds the money but the code.*

![Placeholder: GGG "Titanium Carbon" logo on dark hero background, tagline underneath](placeholder-image.png)

**Team:** _WebNXT / Team GGG_ (placeholder) — Julyza Peña · Mark Hugh Neri

**Speaker notes:** Open with the hook: every esports tournament has a pot of money, and today someone you have to trust is holding it. GGG replaces that person with a Soroban smart contract. Keep this slide to five seconds — say the name, say the one-liner, and move. The point of the deck is to prove it actually works on-chain, not just as a mockup. Set expectation now: "I'll show you three real payout transactions on the Stellar explorer in under two minutes."

---

## Slide 2: The Problem

- **Prize money needs a custodian** — organiser or platform holds entry fees until payout
- **Custody = risk** — funds can be skimmed, delayed, frozen, or disappear
- **Players must trust a stranger** to pay out correctly, in full, on time
- Grassroots & community tournaments have **no neutral escrow** they can afford

![Placeholder: split image — a pile of cash behind a "?" custodian vs. a locked smart contract](placeholder-image.png)

**Speaker notes:** Ground this in SPEC.md §1: the core actors are an organiser, players, and a referee, and today the money flows through whoever runs the event. That custodian is a single point of failure and a single point of trust. For big leagues there are lawyers and escrow agents; for the millions of community and in-house tournaments there's nothing — just "send me your entry fee and trust me." That trust gap is exactly what a public blockchain is good at closing. Say it plainly: we remove the human who holds the money.

---

## Slide 3: The Solution

**GGG is a trustless prize-escrow protocol: a Soroban smart contract holds every entry fee and automatically pays the winners the moment a referee submits final rankings — no custodian ever touches the funds.**

- **Non-custodial by construction** — funds leave the contract *only* via payout or refund; there is no withdraw function
- **Signed client-side** — every on-chain action is signed in the player's own Freighter wallet; the server never holds a private key
- **Asset-agnostic** — entry fees in XLM or USDC, with a configurable 1st/2nd/3rd split (default 60/30/10)

![Placeholder: three-step diagram — Organiser creates → Players fund via QR → Contract auto-pays winners](placeholder-image.png)

**Speaker notes:** This is the thesis slide — say the one sentence slowly and let it land. Emphasise "no custodian ever touches the funds": the escrow contract has `initialize`, `join`, `finalize`, and `cancel`, but deliberately *no* withdraw — money can only go out as a winner payout or a refund. The server's job is only to build and submit transactions; signing always happens in the user's Freighter wallet, so we never hold keys. The 60/30/10 split is enforced in the contract as basis points that must sum to 10000, with rounding dust deterministically assigned to first place.

---

## Slide 4: Demo — The Under-Two-Minutes Flow

Live create → fund → settle, all on Stellar Testnet:

1. **Organiser** logs in, creates an XLM tournament → contract deploys, **QR appears**
2. **Players** scan the QR / click Join → sign in Freighter → entry fee locks in escrow
3. **Live pool counter & participant list** tick up in real time (SSE, no refresh)
4. **Referee** opens the settlement console, assigns 1st/2nd/3rd → signs `finalize`
5. Contract pays **60/30/10 in a single transaction** → three payout links on the explorer

![Placeholder: screenshot of tournament detail page — live pool counter, QR tile, participant list, winners panel with explorer links](placeholder-image.png)

[PLACEHOLDER: Demo video — screen recording of the full create → 3 joins → finalize flow ending on Stellar.Expert showing the three payout transactions; target length 60–90 seconds]

**Speaker notes:** This is the heart of the pitch — spend the most time here. Walk the real flow: the create step builds a deploy+initialize transaction the organiser signs; joins pull the entry fee into the contract via `token.transfer`; the detail page streams `registered` and `finalized` events over Server-Sent Events so the pool updates without a refresh. The finish is the money shot: one `finalize_results` call fans out three payouts, and we open Stellar.Expert to show all three on-chain. Per the acceptance runs in `docs/acceptance-spec-15.md`, the happy path clocked ~90 seconds and cancel-refund ~82 seconds — both under the two-minute bar. Note honestly: these runs were verified locally against Testnet; the video shows exactly that path.

---

## Slide 5: How It Works

- **Contract** — Rust + `soroban-sdk` 26, one WASM deployed per tournament; 7 functions, 3 events, 28 unit tests
- **Web** — Next.js 16 (App Router) + React 19 + Prisma 7 / PostgreSQL 17; builds & submits XDR, never signs
- **Wallet** — Freighter signs client-side; `@stellar/stellar-sdk` 15 talks to Soroban RPC + Horizon
- **Subscriber** — standalone worker polls contract events + reconciles Horizon payments → Postgres → Redis → SSE
- **Data flow:** Browser signs → RPC submits → contract emits event → subscriber ingests → Redis pub/sub → live UI

![Placeholder: architecture diagram — Browser/Freighter ↔ Next.js (routes, tx-builder) ↔ Postgres/Redis, with Event Subscriber polling Stellar and pushing SSE](placeholder-image.png)

**Speaker notes:** Keep this tight — it's a credibility slide, not a lecture. Four planes (SPEC.md §3): an edge layer (Next.js route handlers that build transactions and enforce auth/CSRF/rate-limits), the Soroban contract layer, a data layer (Postgres for metadata, Redis for pub/sub and rate-limiting), and a background subscriber that turns on-chain events into a live feed. The key architectural discipline: the server is stateless about keys — it builds an unsigned XDR, the client signs it in Freighter, the server submits and polls. The subscriber also reconciles raw SEP-7 QR deposits by matching the memo to the tournament ID, so a plain wallet scan still credits the right player. Auth is argon2id + NextAuth session cookies backed by a revocable Redis store.

---

## Slide 6: Impact & Market

- **Who:** tournament organisers, esports communities, gaming guilds, arcades/LAN events — anyone running a paid bracket
- **Why:** neutral, provable escrow with **zero custodial trust** and public payout receipts
- **Any game title** — the contract is game-agnostic; GGG only handles money + rankings
- **For Stellar:** a consumer-facing use case that drives real on-chain volume (joins, payouts, refunds) and showcases USDC-on-Stellar

![Placeholder: market map — grassroots/community tournaments (large) → esports orgs → guilds, with "trustless escrow" in the center](placeholder-image.png)

**Speaker notes:** Frame the audience straight from SPEC.md's actors — organiser, player, referee — and note that no player app account is even required to join, which lowers the funnel dramatically. The wedge is the long tail: community and in-house tournaments that can't afford or don't trust a custodial platform. Every tournament is a burst of on-chain activity, so this is genuinely ecosystem-positive for Stellar rather than a closed app. [inferred] The natural early market is regions with high crypto-gaming and USDC familiarity — but nothing in the code ties GGG to any single country; the design is jurisdiction-neutral and globally deployable. Close by connecting back to trust: the payouts are public transactions anyone can verify.

---

## Slide 7: What's Next

- **Ship to live Railway + Testnet URL** — all code complete and locally verified; final operator deploy + on-chain acceptance run remains (`#88`, `#89`) [inferred priority]
- **Automated match verification** — today the referee is a trusted human; SPEC frames GGG as a "match-verification protocol," so pulling results from game APIs / multi-referee dispute resolution is the biggest open gap
- **Flexible payout tables** — contract currently fixes a 3-winner split; support N-place brackets & custom distributions
- **Mainnet + full USDC path** — promote from Testnet; polish the USDC entry-fee flow alongside XLM
- **Enable branch protection** on `develop` — one-time maintainer step noted in the runbook

![Placeholder: roadmap timeline — Deploy → Match-verification → N-place payouts → Mainnet](placeholder-image.png)

**Speaker notes:** Be candid about the gap between spec and reality — it reads as maturity, not weakness. The single biggest honest gap: the name says "match-verification protocol," but verification is currently a trusted referee submitting rankings by hand — automating that (game-API result ingestion, multi-sig or multi-referee settlement, dispute windows) is the most valuable next step. Second, the escrow hard-codes exactly three winners; real tournaments want configurable N-place tables. Third, everything is proven locally against Testnet with 498 automated tests passing and all six §15 acceptance criteria green — the remaining work is the live Railway deploy and the on-chain operator run, not new feature code. Frame it as "the protocol is done; productionising is next."

---

## Slide 8: Team & Thanks

**Team GGG** *(team name placeholder)*

| Name | Role (placeholder) | Contact |
|---|---|---|
| Julyza Peña | _[role — e.g. contract / backend]_ | jbpena101@gmail.com |
| Mark Hugh Neri | _[role — e.g. full-stack / product]_ | mh.neri@gmail.com |

Built on **Stellar Soroban**. Thanks to the Stellar Development Foundation, Freighter, and the hackathon organisers.

![Placeholder: team photo or avatars + GGG logo + "Thank you / Questions?"](placeholder-image.png)

**Speaker notes:** Land the plane in one breath: thank the judges, restate the one-liner ("trustless tournament escrow on Stellar — the contract holds the money, not us"), and invite questions. Fill in real roles before presenting — the git history shows Julyza Peña and Mark Hugh Neri as the contributors, so credit accordingly. Have the explorer tab from the demo still open in case a judge wants to click into a payout transaction live. If asked "what's the business model," be honest: the current contract takes no fee (splits sum to 100%), so monetisation — a small platform rake or premium organiser tooling — is a deliberate next step, not something shipped. End on the ask.

---

### Appendix — Build status at a glance (for Q&A, not a slide)

*Grounded in `docs/features.md`, `docs/definition-of-done.md`, and code review across `apps/` + `contracts/`.*

| Area | Status | Evidence |
|---|---|---|
| Soroban escrow contract (7 fns, 3 events, invariants) | **Built** | `contracts/escrow/src/lib.rs`; 28 `cargo` tests |
| Stellar integration (XDR build/simulate/submit, SAC resolve) | **Built** | `apps/web/src/lib/stellar/` |
| Auth (argon2id, NextAuth session, Redis revoke, CSRF, rate-limit) | **Built** | `apps/web/src/lib/{password,auth,session-store,csrf,rate-limit}.ts` |
| Tournament API + pages (`/`, login, register, list, new, detail, settle, admin) | **Built** | `apps/web/src/app/**` |
| Event subscriber (RPC poll + Horizon SEP-7 reconcile + Redis→SSE) | **Built** | `apps/subscriber/src/**` |
| SEP-7 QR-to-fund | **Built** | `apps/web/src/components/tournament/QrTile.tsx` |
| Tests | **498 passing** | 454 web + 16 subscriber + 28 contract |
| §15 acceptance (6 criteria + <2 min) | **PASS (local Testnet)** | `docs/acceptance-spec-15.md` |
| Live Railway/Mainnet deploy | **Pending** | operator task `#88`/`#89` |
| Automated match verification | **Not built (planned)** | referee is a trusted human today |
| N-place / custom payout tables | **Not built** | contract fixes 3-winner split |

*No major SPEC §1–14 component was found missing; the gaps above are deployment and forward-looking scope, per `docs/definition-of-done.md` (verdict: code-complete, blocked only on live deploy).*
