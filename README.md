# Perkly

Perkly is a mass payout platform. Companies add balance to a wallet, create a
campaign, upload a list of recipients, and pay everyone via PIX — without
collecting anyone's PIX key in advance. Each recipient receives a notification,
opens a link, enters their key, and gets paid.

The MVP is focused on reward campaigns (surveys, incentives, referrals, prizes),
but the core of the product is distributing value at scale. The same engine is
designed to support cashback, commissions, refunds, supplier payments and gift
cards over time.

> **Status:** backend in active development. A web frontend is planned.

## Why

Companies that need to pay many people still rely on spreadsheets, manual PIX-key
collection, one-by-one transfers, and little traceability. Perkly replaces that
with a few clicks: bulk PIX payouts, full traceability, and no upfront key
collection.

## How it works

**Company**

```
Add balance → Create campaign → Create batch → Import recipients
→ Review amounts → Confirm → Track status
```

**Recipient**

```
Receive notification → Open link → Enter PIX key → Get paid
```

## Core concepts

| Concept        | Responsibility                                                        |
| -------------- | --------------------------------------------------------------------- |
| **Company**    | The partner company that funds and sends payouts.                     |
| **Wallet**     | The company's balance: reserve, release, consume, query.              |
| **Charge**     | A balance top-up (PENDING → PAID / EXPIRED / FAILED).                  |
| **Ledger**     | Financial source of truth, double-entry, every transaction sums zero. |
| **Campaign**   | Business grouping for related payouts (MVP abstraction).              |
| **Batch**      | A lot of payouts: import, validate, total, confirm, cancel.           |
| **Payout**     | A person's right to receive an amount — not the PIX transfer itself.  |
| **Claim**      | The redemption flow: link, PIX key, expiry, single use.               |
| **Settlement** | PSP, PIX, webhooks, liquidation.                                      |

## Architecture

The system is split into bounded contexts — Funding, Wallet, Ledger, Campaign,
Payout, Claim and Settlement — around a few financial invariants:

- Money never disappears and never duplicates.
- The ledger is the financial source of truth.
- The PSP is infrastructure; the wallet does not know about it.
- A payout is not a PIX transfer, and a claim does not move money.

Operations that cannot complete in a single transaction are modeled as explicit
states, so the system can always resume from where it stopped toward a
consistent outcome.

The ledger uses four accounts (`external`, `available`, `reserved`, `revenue`)
and four transaction types (`fund`, `reserve`, `settle`, `expire`). Example —
funding a wallet:

```
external  -1000
available +1000
```

A full breakdown of domains, journeys, states and financial flows lives in
[`docs/project.md`](docs/project.md).

## Tech stack

- **Backend:** NestJS (TypeScript), TypeORM, PostgreSQL
- **Testing:** Jest, Supertest, Testcontainers (real Postgres for integration
  and e2e)

## Getting started

Requirements: Node.js, Docker.

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install and run the backend
cd backend
npm install
npm run start:dev
```

The database connection is read from the environment (`DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, `DB_NAME`); the defaults match the bundled
`docker-compose.yaml`.

## Testing

```bash
cd backend

npm test                 # unit
npm run test:integration # service + real Postgres (Testcontainers)
npm run test:e2e         # HTTP, full app over a real Postgres
```

Integration and e2e suites spin up a throwaway Postgres container, so no local
database setup is required to run them.
