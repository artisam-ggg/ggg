# GGG — Technical Specification

**Good Game Guild** — a trustless tournament prize-escrow and match-verification protocol for competitive gaming, built on Stellar Soroban.

This document is the authoritative build spec for a code-expert AI agent. It describes every page, API endpoint, database model, smart-contract function, third-party service, and operational flow needed to bring GGG to life. Pair it with `AGENT.md` (engineering rules) and `BRAND.md` (design system).

---

## 1. Product summary

GGG lets a tournament **organiser** create a secure on-chain prize pool, lets **players** join by paying a crypto entry fee, and lets a **referee** submit final rankings — after which a Soroban smart contract automatically settles payouts to the winners' wallets. No custodian holds the funds; the contract does. Works for any game title.

The signature demo: open the dashboard → create a tournament with an XLM entry fee → a QR code appears → audience scans and sends XLM → the pool grows live → the referee submits the final 1st/2nd/3rd → the contract instantly sends a 60/30/10 split → three transactions appear on the Stellar explorer. Under two minutes.

### Actors

| Actor     | Auth                                                              | On-chain identity                                   |
| --------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| Admin     | Username + password (seeded)                                      | Optional Freighter                                  |
| Organiser | Username + password (self-register)                               | Freighter wallet (source of `initialize`, `cancel`) |
| Referee   | Username + password; identified by wallet address on a tournament | Freighter wallet (source of `finalize_results`)     |
| Player    | No app account required                                           | Freighter-compatible wallet (source of `join`)      |

Web-app authentication (admin/organiser/referee dashboards) is **basic username + password**, seeded with an admin account via a Prisma seed script. Blockchain actions are signed **client-side** with Freighter; the server never holds private keys.

---

## 2. Technology stack (pinned to current stable, June 2026)

> The agent MUST resolve exact patch versions at install time (`pnpm add <pkg>@latest`) and commit the lockfile. Versions below are the current majors/minors to target.

### Application

- **Runtime:** Node.js 22 LTS (≥ 20 required by Next.js 16; 24 LTS also acceptable)
- **Package manager:** pnpm 10
- **Framework:** Next.js 16 (App Router, Route Handlers, Server Actions, Turbopack default) — `next@16`
- **UI:** React 19.2 — `react@19`, `react-dom@19`
- **Language:** TypeScript 5.x (strict)
- **Styling:** Tailwind CSS v4 (CSS-first `@theme` config via `@import "tailwindcss"`; Next.js uses `@tailwindcss/postcss`) — `tailwindcss@4`
- **Components:** shadcn/ui (latest CLI), Radix primitives, `lucide-react`. Material Symbols Outlined web font for iconography to match the mock.
- **Validation:** Zod 4 (every API input and env var)
- **ORM:** Prisma ORM 7 (Rust-free client, `prisma.config.ts`, generator `prisma-client`) — `prisma@7`, `@prisma/client@7`
- **Database:** PostgreSQL 17 (Railway)
- **Cache / rate-limit / session store:** Redis 7 (`ioredis`)
- **Auth:** custom credential session — `argon2` for password hashing, `jose` for signed httpOnly session JWTs (see §7). NextAuth/Auth.js v5 credentials provider is an acceptable alternative if the team prefers it.
- **QR:** `qrcode.react`
- **File storage:** S3-compatible — `@aws-sdk/client-s3` against MinIO (local) and a Railway-hosted store (prod) (see §9)

### Blockchain

- **Smart contract:** Rust + `soroban-sdk` 26 (latest major), compiled to WASM
- **Tooling:** `stellar-cli` (a.k.a. `soroban` CLI) 26 for build/deploy/bindings
- **Client SDK (server + browser):** `@stellar/stellar-sdk` 15 (Horizon + Soroban RPC, Protocol 26 XDR)
- **Wallet:** `@stellar/freighter-api` 5 (browser signing; methods `isConnected`, `requestAccess`, `getAddress`, `getNetwork`, `signTransaction`)
- **Networks:** Stellar **Testnet** for dev/demo, **Mainnet (Public)** for production. Friendbot funds test accounts.

---

## 3. System architecture

Four logical planes, all running inside (or alongside) one Next.js deployment on Railway.

### Edge layer — Next.js App Router

Route Handlers and Server Actions handle authentication, tournament CRUD, and **transaction building**. All inputs validated with Zod. Rate limiting and session caching backed by Redis. Never touches private keys.

### Contract layer — Soroban

A single deployed WASM contract, instantiated per tournament. The server builds and simulates transactions via `@stellar/stellar-sdk` (Soroban RPC); signing happens **client-side** in Freighter; the server submits the signed XDR and polls for the result.

### Data layer — PostgreSQL + Prisma + Redis

Postgres stores tournament metadata (name, game, entry fee, referee, participants, payouts, status, contract ID) and user accounts. Redis stores rate-limit counters and an optional session cache.

### Event subscriber — background poller

Polls Soroban RPC `getEvents` for each active tournament's contract, persists registrations/payouts/cancellations into `ContractEvent`, updates derived state, and pushes updates to clients over SSE.

```
                         ┌──────────────────────────────────────────────┐
   Browser (Freighter)   │                Next.js (Railway)             │
  ┌───────────────────┐  │  ┌────────────┐   ┌───────────────────────┐  │
  │  React UI / QR     │◀─┼─▶│ Route       │  │ Server Actions /       │  │
  │  signs XDR locally  │  │  │ Handlers    │  │ tx-builder (stellar-sdk│  │
  └─────────┬─────────┘  │  └─────┬──────┘   └──────────┬────────────┘  │
            │ SSE / fetch │        │ Prisma             │ Soroban RPC      │
            ▼             │        ▼                    ▼                  │
  ┌───────────────────┐  │  ┌────────────┐   ┌───────────────────────┐  │
  │ Stellar Wallet     │  │  │ PostgreSQL │  │ Event subscriber       │  │
  │ submits via RPC ───┼──┼─▶│ + Redis    │◀─│ (poller → DB → SSE)    │  │
  └───────────────────┘  │  └────────────┘   └──────────┬────────────┘  │
                         └──────────────────────────────┼───────────────┘
                                                         ▼
                                           Stellar Network (Soroban RPC,
                                           Horizon, Stellar.Expert explorer)
```

---

## 4. Smart contract — Tournament Escrow (Soroban)

Written in Rust with `soroban-sdk` 26, compiled to WASM, deployed once, instantiated per tournament. Entry fees and payouts move a **token** — for native XLM this is the Stellar Asset Contract (SAC) address of native; USDC is the issuer's SAC. The token contract address is supplied at initialization so the escrow is asset-agnostic.

### Storage / state

- `organizer: Address`, `referee: Address`
- `token: Address` (SAC for XLM or USDC)
- `entry_fee: i128` (token's smallest unit; XLM = stroops, 1 XLM = 10⁷ stroops)
- `distribution_bps: Vec<u32>` length 3, summing to 10000
- `players: Vec<Address>` (registered, deduplicated)
- `finished: bool`, `cancelled: bool`
- `winners: Option<(Address, Address, Address)>`
- `settlement_deadline: u64` (UTC seconds; at and after it, claims are enabled and settlement mutations reject)
- `RefundClaimed(Address): bool` (one successful refund per registered player)
- `MAX_PLAYERS = 100` (Testnet-simulated registration ceiling)

### Functions

```rust
initialize(
    organizer: Address,
    referee: Address,
    token: Address,
    entry_fee: i128,
    distribution_bps: Vec<u32>, // e.g. [6000, 3000, 1000]
    settlement_deadline: u64,
)
```

Creates the tournament. **Requires `organizer.require_auth()`.** Validates: `distribution_bps.len() == 3`, sum == 10000, `entry_fee > 0`, `organizer != referee`, and a future deadline within the Testnet-safe horizon. Callable once; panics if already initialized.

```rust
join_tournament(player: Address)
```

`player.require_auth()`. Calls `token.transfer(player, current_contract_address, entry_fee)` to pull the entry fee into escrow, then records the player. Rejects at or after the settlement deadline, if `finished`/`cancelled`, if the player already joined, or if the fee transfer fails. Emits a `registered` event.

```rust
finalize_results(first: Address, second: Address, third: Address)
```

**`referee.require_auth()` only.** Before the settlement deadline, validates all three addresses are **distinct** and **registered**, and that the tournament is not already finished/cancelled. Computes each prize as `pool * bps[i] / 10000`, transfers from the contract to each winner, handles the rounding remainder deterministically (assign to 1st place), sets `finished = true` and `winners`. Emits a `finalized` event with the three transfers.

```rust
get_pool() -> i128
```

Returns the escrow contract's current token balance. It decreases as individual refunds are paid and reaches zero after all refunds or final payouts.

```rust
get_reward(player: Address) -> i128
```

Returns the player's winnings based on placement once finalised; `0` if not a winner or not finished.

```rust
is_finished() -> bool
```

True after payouts have been sent.

```rust
cancel_tournament()  // optional but specified
```

`organizer.require_auth()`. Before the settlement deadline and finalisation, sets `cancelled = true` without transferring funds. Emits `cancelled` with the number of now-claimable refunds.

```rust
claim_refund(player: Address)
```

Permissionless. After the inclusive settlement deadline, or immediately after cancellation, anyone may submit a claim for a registered player. The contract transfers one `entry_fee` only to that player, records the claim, and emits `refund_claimed(player, amount)`; duplicate and unknown-player claims reject.

### Events

- `registered` → `(player: Address, pool_after: i128)`
- `finalized` → `(first, second, third, amounts: Vec<i128>)`
- `cancelled` → `(claimable_count: u32)`
- `refund_claimed` → `(player: Address, amount: i128)`

### Security invariants

- Only `organizer` may `initialize` and `cancel`.
- Only `referee` may `finalize_results`.
- Funds leave the contract **only** via payout or refund logic — there is no withdraw function.
- Idempotency: `finalize`/`cancel` cannot run twice; `join` cannot double-register; each player can claim one refund.
- Every state-changing call emits an event for the off-chain subscriber.
- Reject finalisation if winners are not all registered or not all distinct.

### Build & deploy

- `stellar contract build` → `target/wasm32v1-none/release/ggg_escrow.wasm`
- Upload WASM once (`stellar contract upload`) → record the **WASM hash**.
- Per tournament: `stellar contract deploy --wasm-hash <hash>` then invoke `initialize`. The server orchestrates this via Soroban RPC and the organiser's Freighter signature.
- Generate TypeScript bindings for the frontend/server: `npx @stellar/stellar-sdk generate --wasm <wasm> --output-dir src/contract-client --contract-name ggg-escrow`.
- Ship a full unit/integration test suite using the SDK's test utils (`Env::default()`), covering each invariant above.

---

## 5. Application pages (Next.js App Router)

All authenticated pages live under a `(dashboard)` route group guarded by middleware (`proxy.ts` in Next 16). Wallet connection is required only at the moment of an on-chain action.

| Route                      | Auth                                          | Purpose                                                                                                               |
| -------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/`                        | Public                                        | Landing: hero thesis + **Create Tournament** CTA.                                                                     |
| `/login`                   | Public                                        | Username + password sign-in.                                                                                          |
| `/register`                | Public                                        | Organiser self-registration (username + password).                                                                    |
| `/tournaments`             | Organiser                                     | List of the user's tournaments with status chips (active / finished / cancelled), pool size, participant count.       |
| `/tournaments/new`         | Organiser                                     | Creation form (see fields below). Mirrors the "Tournament Creator" mock.                                              |
| `/tournaments/[id]`        | Public read; organiser/referee controls gated | Detail view: info, live participant list, join QR, referee panel, live tx feed, winners + payout links when finished. |
| `/tournaments/[id]/settle` | Referee only                                  | Drag-and-drop "Referee Settlement Console" (assign 1st/2nd/3rd, then finalize). Mirrors the settlement mock.          |
| `/admin`                   | Admin                                         | User management, platform overview.                                                                                   |

### `/tournaments/new` form fields

- **Tournament name** (text, required)
- **Game title** (free text, required)
- **Entry fee** + asset selector (XLM or USDC)
- **Referee wallet address** (Stellar `G...` address, validated)
- **Split percentages** — three numeric inputs, default 60 / 30 / 10, must sum to 100; stored as basis points (6000 / 3000 / 1000)
- Optional **cover image** upload (→ file storage, §9)

### `/tournaments/[id]` detail panels

- **Header:** name, game, tournament ID, contract address (copyable), status, escrow balance.
- **Prize pool:** live counter (current pool, goal, participant count, entry fee).
- **Join / QR card:** contract address + tournament join QR (§8). "Join" button for connected wallets.
- **Participants:** real-time list of wallet addresses + join timestamps.
- **Live transaction feed:** registrations ("Player X joined, pool now Y XLM") and finalisation ("Payouts sent: 1st → A, 2nd → B, 3rd → C") via SSE.
- **Referee panel:** visible only when the connected wallet matches the tournament's referee address — links to `/settle`.
- **Finished state:** winners, amounts, and explorer links to the three payout transactions.

---

## 6. API — Next.js Route Handlers

Base path `/api`. JSON in/out. All inputs validated with Zod; all responses use a consistent envelope `{ ok: boolean, data?, error? }`. Auth via the session cookie (§7); on-chain endpoints return an **unsigned transaction XDR** for the client to sign with Freighter, plus a separate submit step.

### Tournaments

**`POST /api/tournaments`** — _Organiser._ Create a tournament record and build the deploy + `initialize` transaction.

- Body: `{ name, gameTitle, entryFee, asset: "XLM"|"USDC", refereeAddress, distributionBps: [number,number,number], organizerAddress, settlementDeadline, coverImageKey? }`
- Validation: split sums to 10000; `refereeAddress`/`organizerAddress` valid `G...`; `entryFee > 0`; `organizer != referee`; deadline is future and within the supported horizon.
- Returns: `{ tournamentId, unsignedXdr, network }`. Status stored as `DRAFT` until the deploy tx is confirmed.

**`POST /api/tournaments/[id]/submit`** — _Authenticated user._ Accept a signed XDR, submit via Soroban RPC, and poll for result. On success, persist lifecycle state for deploy, finalize, and cancel; a refund claim leaves the cancelled tournament state unchanged.

- Body: `{ signedXdr, intent: "deploy"|"initialize"|"join"|"claim_refund"|"finalize"|"cancel" }`

**`GET /api/tournaments`** — _Organiser._ List tournaments for the authenticated user. Supports `?status=` filter and pagination.

**`GET /api/tournaments/[id]`** — _Public._ Tournament details incl. pool, participants, status, winners.

**`POST /api/tournaments/[id]/join`** — _Public._ Build and return an unsigned `join_tournament` transaction for a given `playerAddress`. (Submission via `/submit` with `intent: "join"`, or a dedicated `/join/submit`.)

- Body: `{ playerAddress }` → `{ unsignedXdr, network }`

**`POST /api/tournaments/[id]/refund`** — _Public._ After cancellation or the inclusive settlement deadline, build an unsigned `claim_refund` invocation for `playerAddress` using `submitterAddress` as the transaction source. The contract permits any submitter but transfers only to that registered player.

- Body: `{ playerAddress, submitterAddress }` → `{ unsignedXdr, network }`

**`POST /api/tournaments/[id]/finalize`** — _Referee only._ Build the unsigned `finalize_results` transaction from **manually entered** winner addresses.

- Body: `{ first, second, third }`. Validates all three are registered and distinct → `{ unsignedXdr }`.

**`POST /api/tournaments/[id]/cancel`** — _Organiser only, before the settlement deadline and finalisation._ Build the unsigned `cancel_tournament` state transition. → `{ unsignedXdr }`. On confirmation, status → `CANCELLED` and players can claim individually.

**`GET /api/tournaments/[id]/events`** — _Public._ Streams `registered`, `finalized`, `cancelled`, and `refund_claimed` contract events as **SSE** (`text/event-stream`); falls back to polling. Backed by the `ContractEvent` table populated by the subscriber.

### Auth

**`POST /api/auth/register`** `{ username, password }` → creates an `ORGANIZER`. Rejects duplicate usernames; enforces a password policy.
**`POST /api/auth/login`** `{ username, password }` → sets httpOnly session cookie. Generic error on failure (no user-enumeration).
**`POST /api/auth/logout`** → clears the session.
**`GET /api/auth/me`** → current user (or 401).

### Files

**`POST /api/uploads`** _Authenticated._ Returns a presigned S3 PUT URL (or accepts a multipart upload) for tournament cover images; validates content-type and size. Returns the stored object key.

### Cross-cutting

- **Rate limiting** (Redis) on auth and tx-building endpoints (per-IP and per-user).
- **CSRF** protection on cookie-authenticated mutations (double-submit token or same-site strict + origin check).
- **Idempotency keys** on `/submit` to avoid double submission.

---

## 7. Authentication & identity layer

Two independent layers:

**Web-app auth (basic username + password).**

- `argon2id` password hashing (per-user salt; never store plaintext).
- On login, issue a signed (`jose`, HS256/EdDSA) **httpOnly, Secure, SameSite=Lax** session cookie containing `{ userId, role, sessionId }`; optionally cache the session in Redis with TTL for revocation.
- Roles: `ADMIN`, `ORGANIZER`. Referee privileges on a given tournament are determined by matching the connected wallet to `Tournament.refereeAddress` (a referee need not have an account, but typically logs in to view the console).
- Seed an admin account via the Prisma seed script. Admin username/password supplied via env (`ADMIN_USERNAME`, `ADMIN_PASSWORD`); never commit real credentials.
- Middleware (`proxy.ts`) guards `(dashboard)` and `/admin`; redirects unauthenticated users to `/login`.

**Blockchain auth (Freighter).**

- Flow: `isConnected()` → `requestAccess()` → `getAddress()` → confirm `getNetwork()` matches the server's target network.
- For each on-chain action the backend returns an unsigned XDR; the client calls `freighterApi.signTransaction(xdr, { networkPassphrase })` and posts the signed XDR back for submission.
- **No private keys ever reach the server.** The server only builds, simulates, submits, and reads.

---

## 8. QR-to-join flow

For every active tournament, the detail page renders:

- The **contract address** (`C...`), copyable.
- A **QR code** (`qrcode.react`) encoding the public GGG tournament URL.
- The human-readable URL as text, so scanning opens the detail page and its wallet-backed **Join Tournament** action.

A raw SEP-7 payment must not be treated as a tournament join: it transfers tokens but cannot call `join_tournament` or register the player in the escrow. The QR path therefore always leads to the signed contract invocation.

---

## 9. File storage (Railway)

- Abstract behind an S3-compatible client (`@aws-sdk/client-s3`).
- **Local/dev:** MinIO via docker-compose.
- **Production:** a Railway-hosted S3-compatible store (a MinIO service deployed on Railway, or a persistent **Railway Volume** mounted to a small storage service). Configure endpoint/bucket/keys via env.
- Used for tournament cover images and organiser/player avatars. Validate MIME type and size server-side; serve via presigned GET URLs or a public bucket with a CDN-style cache header. Never trust client-provided filenames.

---

## 10. Data layer — Prisma schema (PostgreSQL)

Prisma 7 with `generator client { provider = "prisma-client" }` and a `prisma.config.ts`. Monetary values stored as `BigInt` (token smallest unit) to avoid float drift.

```prisma
// schema.prisma (representative — agent finalises)

enum Role { ADMIN ORGANIZER }
enum Asset { XLM USDC }
enum TournamentStatus { DRAFT ACTIVE FINISHED CANCELLED }
enum EventType { REGISTERED FINALIZED CANCELLED }

model User {
  id           String       @id @default(cuid())
  username     String       @unique
  passwordHash String
  role         Role         @default(ORGANIZER)
  tournaments  Tournament[] @relation("organizer")
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
}

model Tournament {
  id              String           @id @default(cuid())
  name            String
  gameTitle       String
  asset           Asset            @default(XLM)
  entryFee        BigInt           // smallest unit (XLM = stroops)
  firstBps        Int              // sums to 10000 with second+third
  secondBps       Int
  thirdBps        Int
  organizer       User             @relation("organizer", fields: [organizerId], references: [id])
  organizerId     String
  organizerAddr   String           // G...
  refereeAddr     String           // G...
  contractId      String?          @unique  // C..., set after deploy
  tokenAddr       String?          // SAC address for the asset
  status          TournamentStatus @default(DRAFT)
  coverImageKey   String?
  participants    Participant[]
  payouts         Payout[]
  events          ContractEvent[]
  deployTxHash    String?
  createdAt       DateTime         @default(now())
  finalizedAt     DateTime?
  cancelledAt     DateTime?
}

model Participant {
  id            String     @id @default(cuid())
  tournament    Tournament @relation(fields: [tournamentId], references: [id])
  tournamentId  String
  playerAddr    String     // G...
  joinTxHash    String?
  joinedAt      DateTime   @default(now())
  @@unique([tournamentId, playerAddr])
}

model Payout {
  id            String     @id @default(cuid())
  tournament    Tournament @relation(fields: [tournamentId], references: [id])
  tournamentId  String
  rank          Int        // 1, 2, 3
  playerAddr    String
  amount        BigInt
  txHash        String?
  createdAt     DateTime   @default(now())
}

model ContractEvent {
  id            String     @id @default(cuid())
  tournament    Tournament @relation(fields: [tournamentId], references: [id])
  tournamentId  String
  type          EventType
  ledger        Int?
  txHash        String?
  payload       Json
  createdAt     DateTime   @default(now())
  @@index([tournamentId, createdAt])
}
```

### Seed script

A `prisma/seed.ts` that creates the seeded **admin** user from `ADMIN_USERNAME`/`ADMIN_PASSWORD` (argon2-hashed), idempotently (`upsert`). Wired via `package.json` `prisma.seed` / `prisma db seed`.

---

## 11. Event subscriber

- A long-running task (a separate Railway service, or a guarded background loop) that, for each `ACTIVE` tournament, polls Soroban RPC `getEvents` filtered by the tournament's `contractId` from the last processed ledger cursor.
- Maps `registered`/`finalized`/`cancelled`/`refund_claimed` contract events into `ContractEvent`, updates `Participant`, `Payout`, and lifecycle state. Refund events are retained and streamed without changing `CANCELLED` status.
- Notifies connected clients (publishes to a Redis channel consumed by the SSE handler at `/api/tournaments/[id]/events`).
- Stores a per-contract cursor to guarantee at-least-once processing with idempotent upserts (dedupe on `txHash`).

---

## 12. Third-party services & integrations

| Service                               | Use                                                          | Notes                                       |
| ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| Stellar **Soroban RPC**               | Build/simulate/submit/read contract calls                    | Testnet + Mainnet endpoints via env         |
| **Friendbot**                         | Fund test accounts                                           | Testnet only                                |
| **Freighter** wallet                  | Client-side signing                                          | Browser extension; `@stellar/freighter-api` |
| **Stellar.Expert / Stellar Explorer** | Tx + contract links in the UI                                | Network-aware URL builder                   |
| **Railway**                           | Postgres 17, Redis, app hosting, file storage (MinIO/Volume) | Plugins + service deploys                   |
| **MinIO** (dev)                       | Local S3-compatible storage                                  | docker-compose                              |
| **Circle USDC (Stellar)**             | Optional USDC entry fees                                     | Use issuer's SAC address                    |

---

## 13. Operational flows

**Flow 01 — Tournament creation.** Organiser logs in → fills `/tournaments/new` → connects Freighter → `POST /api/tournaments` builds the deploy + `initialize` XDR (organiser as source) → Freighter signs → `POST /api/tournaments/[id]/submit` submits & polls → on confirmation, `contractId` stored, status `ACTIVE`, QR + URI generated.

**Flow 02 — Player joins.** Player scans QR / opens detail page → "Join" → `POST /api/tournaments/[id]/join` builds the `join_tournament` XDR (entry-fee transfer) → Freighter signs → submitted → contract records registration → subscriber updates pool → UI updates live over SSE.

**Flow 03 — Referee finalises.** Referee opens `/settle` → assigns 1st/2nd/3rd (drag-and-drop or manual entry of wallet addresses) → `POST /api/tournaments/[id]/finalize` validates + builds `finalize_results` XDR (referee as source) → Freighter signs → submitted → contract sends the split → UI shows payout txs with explorer links.

**Flow 04 — Cancellation and refund claims.** Organiser (before deadline/finalisation) clicks "Cancel" → `POST /api/tournaments/[id]/cancel` builds `cancel_tournament` → Freighter signs → submitted → status `CANCELLED`. Each registered player can then connect a wallet and submit `claim_refund`; any caller may relay the claim, but the entry fee always goes to the registered player.

---

## 14. Development configuration

### docker-compose (dev services)

- `postgres:17` — app database
- `redis:7` — rate limiting, session cache, SSE pub/sub
- `minio` + `createbuckets` init — S3-compatible file storage
- (Optional) a `stellar/quickstart` container for a local Soroban network, or use public Testnet.

### Environment files

Provide `.env.example` (committed) and `.env` (gitignored). Required keys:

```
# App
NODE_ENV=development
APP_URL=http://localhost:3000
SESSION_SECRET=            # long random string for jose
CSRF_SECRET=

# Database / cache
DATABASE_URL=postgresql://ggg:ggg@localhost:5432/ggg
REDIS_URL=redis://localhost:6379

# Seed admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=            # set locally; never commit a real value

# Stellar
STELLAR_NETWORK=testnet            # testnet | public
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
ESCROW_WASM_HASH=                  # set after upload
NATIVE_SAC_ADDRESS=                # native asset contract id for the network

# File storage (S3 / MinIO)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=ggg-uploads
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=true
```

### Railway deployment

- Provision **PostgreSQL** and **Redis** plugins; inject `DATABASE_URL`/`REDIS_URL`.
- Deploy the Next.js app as a service (`pnpm build` → `pnpm start`); run `prisma migrate deploy` and `prisma db seed` on release.
- Deploy file storage (MinIO service or a small storage service backed by a **Railway Volume**); inject S3 env.
- Deploy the **event subscriber** as a separate service if run out-of-process.
- Set all secrets via Railway variables; never commit them.

---

## 15. Acceptance criteria (demo path)

1. Organiser creates an XLM tournament; a contract is deployed and a QR appears.
2. Multiple wallets scan the join QR or open the detail page, then sign `join_tournament`; the live pool counter and participant list update in real time.
3. Referee submits 1st/2nd/3rd; the contract pays 60/30/10 in a single finalisation.
4. Three payout transactions are linkable on the Stellar explorer.
5. Cancellation before the deadline sets status `CANCELLED`; registered players claim their own entry-fee refund individually.
6. End-to-end happy path completes well under two minutes.
