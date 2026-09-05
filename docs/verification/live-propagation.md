# P5.12 — End-to-end live-propagation verification

Verifies issue **#81**: an on-chain tournament event propagates
**subscriber → Postgres → Redis → SSE → UI** without a page refresh.

There are two ways to run it:

1. **Automated** — `scripts/verify-live-propagation.sh` boots an isolated
   Docker stack, applies migrations, drives the real Phase 5 wiring, and asserts
   propagation. This covers everything except a real on-chain transaction
   (which needs a deployed contract + Freighter).
2. **Manual** — the operator runs the full create → join → finalize/cancel flow
   against Testnet and watches the detail page update live. This is the §15
   acceptance path and the only way to exercise leg D below.

---

## Prerequisites

- **Docker** (Desktop or Engine) running.
- **Node 22+** and **pnpm 10** (`corepack enable`).
- Dependencies installed: `pnpm install`.
- Outbound network to Stellar Testnet (only for the on-chain leg / manual run):
  `https://soroban-testnet.stellar.org`, `https://horizon-testnet.stellar.org`,
  `https://friendbot.stellar.org`.

The scripts use **the same environment variable names as the app**
(`apps/web/.env.example`). If `apps/web/.env` exists it is used as-is; otherwise
the orchestrator writes a self-contained `.env.verify` (docker-local DB/cache +
Testnet RPC/Horizon + throwaway secrets). `DATABASE_URL`/`REDIS_URL` are always
forced to the run's **isolated** stack so the verification can never touch a dev
database.

---

## Automated verification

```bash
# Legs A + B (Postgres persistence + Redis pub/sub) — fast, no web build:
scripts/verify-live-propagation.sh

# + Leg C (real SSE over HTTP: Postgres replay + live stream) — boots `next dev`:
scripts/verify-live-propagation.sh --with-web

# + Leg D (real Testnet poll) — requires a deployed escrow contract id:
scripts/verify-live-propagation.sh --with-web --onchain --contract-id=C...

# Leave the Docker stack running afterwards (debugging):
scripts/verify-live-propagation.sh --with-web --keep
```

Knobs (env): `VERIFY_PG_PORT` (default `55432`), `VERIFY_REDIS_PORT`
(default `56379`) — the stack runs under the dedicated compose project
`ggg-verify` on these host ports, so it never collides with a dev stack on
`5432`/`6379`. `CONTRACT_ID` may be set instead of `--contract-id=`.

### What each leg proves

| Leg | Proves | Mechanism exercised (production code) |
|-----|--------|---------------------------------------|
| **A** | Idempotent persistence | `reconcile.applyEvent` writes `ContractEvent` + `Participant`; replay of the same `(txHash,type)` is a no-op |
| **B** | Confirmed change reaches Redis | `publish.publishChange` → `tournament:<id>`; a subscriber receives the exact frame the SSE route relays |
| **C** | The browser-facing path | real `GET /api/tournaments/<id>/events`: replays confirmed rows from Postgres on connect, then streams a live `data:` frame |
| **D** | Live Testnet read path | Friendbot funds a fresh account; `poller.pollTournament` reads Testnet RPC `getEvents` for a real contract and ingests idempotently |

### Expected output

```
═══ RESULT: PASS — 11 passed, 0 failed ═══
```

Exit code `0` = pass, non-zero = a leg failed. The stack is torn down on exit
unless `--keep` is passed.

### Note on the SSE live leg (leg C)

ioredis runs a per-connection ready-check (`INFO`) that can race the route's
`redis.duplicate()` subscriber on the **first** connection of a fresh server
process — that connection may fail to subscribe (`0` subscribers) and miss live
frames. This is the exact condition the client's `useTournamentEvents`
EventSource hook is built for: it **auto-reconnects**, and the next connection
subscribes cleanly. Leg C mirrors that — it reconnects on a fresh SSE connection
and uses the `redis.publish` subscriber-count as the signal that the server-side
subscribe is live. Replay (Postgres) is unaffected and always lands on the first
connection.

---

## Manual verification (full on-chain, SPEC §15)

Use this for the real create → join → finalize/cancel round-trip — the only way
to observe propagation from an actual Freighter-signed Testnet transaction.

### 1. Boot dependencies

```bash
docker compose up -d postgres redis
cp apps/web/.env.example apps/web/.env   # fill SESSION_SECRET, CSRF_SECRET, ADMIN_PASSWORD
pnpm --filter web db:migrate             # applies SubscriberCursor + ContractEvent unique
pnpm --filter web db:seed
```

Expected: containers healthy; all migrations applied.

### 2. Start subscriber + web (two shells)

```bash
pnpm --filter subscriber dev    # logs: [subscriber] started
pnpm --filter web dev           # http://localhost:3000
```

### 3. Verify join propagation

With an **ACTIVE** Testnet tournament (created via the UI, contract deployed),
open its detail page, then submit a `join_tournament` from another wallet via
Freighter.

**Expected:** the prize-pool counter ticks up and a new feed row appears
**without a refresh**; a `REGISTERED` `ContractEvent` row exists in Postgres.

### 4. Verify cursor recovery

Stop the subscriber (Ctrl-C / SIGTERM), submit another join, restart the
subscriber.

**Expected:** on restart it resumes from the stored `SubscriberCursor.ledger`,
ingests the missed join **exactly once** (no duplicate `Participant`), and
publishes it to the live feed.

### 5. Verify finalize + cancel

Finalize one tournament; cancel another.

**Expected:** finalize → 3 `Payout` rows + `status=FINISHED` + `finalizedAt`;
cancel → `status=CANCELLED` + `cancelledAt`. The detail page reflects each
change live (pool/feed/status chip) without a refresh.

### 6. Record evidence

Capture the relevant logs/DB rows (e.g. `select type, txHash from "ContractEvent"
where "tournamentId" = '...';`) and the Stellar.Expert links for the join /
finalize transactions.

---

## Cleanup

The automated script tears its isolated stack down on exit (unless `--keep`).
For the manual run:

```bash
docker compose down            # stop postgres/redis/minio
# add -v to also drop volumes (wipes the local DB)
```
