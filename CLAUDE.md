# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The git root holds the product docs (`README.md`, `docs/project.md`); the NestJS
application lives in **`backend/`**. All commands below run from `backend/`.

## Commands

```bash
cd backend

npm run start:dev          # watch-mode dev server (needs Postgres up)
npm run build              # nest build → dist/
npm run lint               # eslint --fix over {src,apps,libs,test}
npm run format             # prettier --write

npm test                   # all three tiers: unit → integration → e2e (needs Docker up)
npm run test:unit          # unit tests only, no DB
npm run test:integration   # service + real Postgres (Testcontainers)
npm run test:e2e           # HTTP, full app over real Postgres
```

Postgres for `start:dev` comes from `docker compose up -d` (see
`docker-compose.yaml`); connection is read from `DB_HOST/PORT/USER/PASSWORD/NAME`
env vars with defaults matching the compose file.

Run a single test by file or name:

```bash
npx jest path/to/file.spec.ts
npx jest -t "name of the test"
npx jest --config ./test/jest-integration.json -t "..."   # integration/e2e need their config
```

## Test tiers

Three suites, distinguished by filename suffix and jest config:

- **Unit** — `*.spec.ts` under `src/` or `test/`; root jest config in `package.json`; run via `npm run test:unit`. No DB.
- **Integration** — `*.integration-spec.ts`; `test/jest-integration.json`; `--runInBand`.
- **E2E** — `*.e2e-spec.ts`; `test/jest-e2e.json`; `--runInBand`.

Integration and e2e spin up a throwaway `postgres:16-alpine` via Testcontainers
(Docker required) — no local DB setup needed. They share one container per
`describe` and `TRUNCATE ... RESTART IDENTITY CASCADE` between each `it`, so read
seeded context inside `it`, never in the `describe` body. They set
`DB_SYNCHRONIZE=true` to let TypeORM create the schema; production never
synchronizes. Shared harness: `test/wallet/setup.ts` (`useIntegrationApp`,
`seedWallet`).

## Architecture

Perkly is a mass-payout platform organized into bounded contexts (Funding,
Wallet, Ledger, Campaign, Payout, Claim, Settlement) around financial
invariants. **Currently implemented: `wallet` (with the ledger) and a stub
`settle/psp`.** Other contexts are documented in `docs/project.md` but not yet
coded.

### The ledger is the financial source of truth

`src/wallet/domain/ledger.ts` is the heart of the system — pure domain, no
framework. Double-entry over four accounts (`external`, `available`, `reserved`,
`revenue`) and four transaction types (`fund`, `reserve`, `settle`, `expire`).

- Every `Transaction` must sum to zero (`assertBalanced`) — enforced at
  construction. Money never appears or disappears.
- `available` can never go negative (`assertSufficientFunds` rejects overdrafts).
- The `Ledger` is rebuilt from a balance `Snapshot` via `Ledger.hydrate(...)`,
  **not** by replaying the full journal. The snapshot is aggregated in SQL
  (`database/sql/account-balances.sql`) and returned by
  `LedgerRepository.loadBalances`. New transactions are persisted with
  `LedgerRepository.append`.

### Money representation

Amounts are **`bigint` in cents** everywhere in the domain. They cross the JSON
boundary as **decimal strings** (DTO `amount`, balance responses) to avoid
`bigint`/float loss. Convert at the controller edge (`BigInt(body.amount)` /
`.toString()`).

### Settlement is a job, not an endpoint

`WalletController` exposes only `POST :accountId/charges` (open a PSP charge,
customer-facing) and `GET :accountId/balances` (read model). `confirmBalance`
applies payment to the ledger and is meant to run as an async job when the PSP
notifies payment — it is intentionally **not** a route. The PSP
(`src/settle/psp.ts`) is infrastructure; the wallet does not know its internals.

### Persistence conventions

- **Repositories wrap, don't extend, TypeORM's `Repository`**
  (`database/core/typeorm.ts`) to avoid leaking ORM methods. Concrete repos
  extend `DefaultTypeOrmRepository` and implement `toDomain`.
- **Entities** extend `DefaultEntity` (`database/core/base.entity.ts`): an
  internal `bigint` `id` for joins/indexes and a separate `external_id` UUID
  exposed via API/URLs. Never expose the numeric `id`; route params are UUIDs
  validated with `ParseUUIDPipe`.
- **Soft deletes** via `deleted_at` (`@DeleteDateColumn`). Hand-written SQL must
  filter `deleted_at IS NULL` (see `account-balances.sql`).
- **Transactions** use `typeorm-transactional`: `initializeTransactionalContext()`
  runs in `main.ts`/test setup *before* the `DataSource` is created, and the
  `DataSource` is wrapped with `addTransactionalDataSource`. Multi-step writes
  are annotated `@Transactional()` (e.g. `confirmBalance`).

### Request validation

`main.ts` installs a global `ValidationPipe({ whitelist: true,
forbidNonWhitelisted: true })` — unknown payload fields are rejected. DTOs use
`class-validator` decorators (the same pipe is re-registered in the test
harness).
