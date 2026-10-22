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
npm run dev
```

Open http://localhost:3000. The browser console logs `[appwrite] ping ok` once the
client reaches your project.

## Checks

```bash
npm run typecheck
npm run build
```
