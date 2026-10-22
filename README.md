# Quotebook

A procurement agent built on Appwrite. State a need in plain language — Quotebook
finds suppliers, emails them for real quotes, reads the replies, and lines the
answers up on a live comparison board.

> 50 × Dell Latitude 5550, i7/16GB/512GB, delivered to Kampala within 14 days,
> budget UGX 180,000,000

Built for the [Appwrite Hackathon](https://hackathon.appwrite.io) (Oct 19–31, 2026).
The idea grew out of an earlier prototype I built on Convex; this repository is a
new implementation on Appwrite, written during the hackathon.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui |
| Database | Appwrite TablesDB |
| Auth | Appwrite Auth (email + password) |

Bootstrapped from the open-source
[appwrite/starter-for-nextjs](https://github.com/appwrite/starter-for-nextjs) (MIT).

## Running locally

```bash
cp .env.example .env.local   # then add APPWRITE_API_KEY (server only)
npm install
npm run db:setup             # creates the TablesDB database, tables and indexes
npm run dev
```

## Data model

The whole schema is declared in [`src/lib/db/schema.ts`](src/lib/db/schema.ts) and
applied by [`scripts/setup-db.ts`](scripts/setup-db.ts), which is idempotent: it
creates whatever is missing and never touches what exists.

| Table | Holds | Notable constraints |
| --- | --- | --- |
| `requests` | The buyer's need: raw text plus extracted budget, destination, window | `status` enum state machine; indexed by owner + newest first |
| `lineItems` | One extracted spec line per item | fulltext index on `description` |
| `suppliers` | Organisations, shared across requests | **unique** `domain` — dedupe at the database |
| `contacts` | Email addresses per supplier and how far we trust them | **unique** (`supplierId`, `email`) |
| `rfqs` | One quote request per (request, supplier) and its mail thread | **unique** (`requestId`, `supplierId`); send gate as a status enum |
| `quotes` | Web prices (crawled) and confirmed replies (emailed) | an emailed quote supersedes, never overwrites, the crawled one |
| `quoteLines` | Per-line pricing under a quote | |
| `inboundParses` | Every inbound email and where its parse ended up | **unique** `eventId` — redelivered webhooks are no-ops |
| `recommendations` | The decision, rationale and accepted trade-off | |
| `attachments` | Pro-forma PDFs (bytes in Appwrite Storage) | |
| `events` | Append-only audit trail per request | |

Money is stored as integer minor units in `bigint` columns, always beside its
currency. Request-scoped tables use **row security**: each row grants read to its
request's owner only, which is also what scopes Realtime updates to that user.
All writes go through the server with an API key.

Open http://localhost:3000. The browser console logs `[appwrite] ping ok` once the
client reaches your project.

## Checks

```bash
npm run typecheck
npm run build
```
