# Quotebook on Appwrite: roadmap

Goal: rebuild the full Convex prototype (`../convex`, `../src`) on Appwrite and
submit by **Sat 31 Oct 2026**. That gives us eight working days, starting Fri 23 Oct.

The prototype is the spec. Every feature below already exists there, so each phase
is a port, not a design exercise. Where this file says "port", copy the original's
logic and wording, then replace only the Convex calls.

---

## 1. Where we are

**Done in `appwrite-hac`**

- [x] Next.js 16, Tailwind v4, shadcn/ui, light and dark themes
- [x] Appwrite Auth with SSR sessions, the proxy, and sign-in/sign-up pages
      (replaces the prototype's custom PBKDF2 auth, its sessions table and its purge cron).
      Verified against the live project: sign-up, session, wrong password, duplicate email.
- [x] App shell (sidebar, account menu) and the landing page
- [x] TablesDB schema for all 11 tables, plus the idempotent `npm run db:setup`
- [x] Every API key in `.env.local`: Appwrite, OpenAI, Firecrawl, AgentMail

**Not started**: the whole procurement pipeline. `/requests` is an empty state.

## 2. What the prototype does (the benchmark)

The procurement pipeline is about 4,300 lines of backend and 2,600 lines of UI:

```
create request ─► extract spec (OpenAI) ─► discover (Firecrawl search ► scrape ► OpenAI ► MX check)
   ─► SEND GATE (human approves, max 5) ─► send RFQs (AgentMail) ─► chase silent suppliers (3 and 7 days)
   ─► webhook ─► parse reply (OpenAI) ─► emailed quote supersedes web price ─► recommend
```

| Prototype file | What it does | Phase |
| --- | --- | --- |
| `requests.ts` | create, retry from the failed stage, list, get, line items, timeline | 1 |
| `intake.ts` | OpenAI extraction of title, budget, currency, window, line items | 1 |
| `discovery.ts` | search, then parallel scrape and extract, dedupe by domain, MX check; writes supplier, contact, web-price quote and RFQ draft; cancel | 2 |
| `rfqs.ts` | add or clear an address by hand, approve-and-send (5 cap), retry send, chase-ups | 3, 5 |
| `http.ts`, `inbound.ts` | AgentMail webhook (Svix verify), idempotent intake, RFQ matching, parse, supersede, review queue (release, link) | 4 |
| `board.ts` | merge the two price tracks into one row per supplier, sorted | 2 |
| `recommendations.ts` | deterministic scoring, with the model writing only the prose | 5 |
| `lib/*` | money (minor units), FX snapshot, domains, MX, OpenAI strict JSON, RFQ wording, Svix, AgentMail REST | 0 |

UI to port from `../src/components/quotebook/`: `request-form`, `request-header`,
`pipeline-progress`, `board`, `send-gate` (the biggest, 564 lines), `review-queue`,
`recommendation`, `timeline`, `sidebar` history, `status-badge`, plus `lib/format.ts`
and `lib/vocabulary.ts`.

**Deliberately not ported**: PDF attachment parsing and `quoteLines`. The prototype
never wrote either; an attachment-only reply already goes to the review queue. The
seed-supplier list stays empty, as it was.

## 3. How Convex maps to Appwrite

| Convex | Appwrite / Next.js |
| --- | --- |
| `query` (reactive) | Server component reads, plus live refresh (see D2) |
| `mutation` | Server action: `requireUser()`, then an ownership check, then a write with the admin client |
| Multi-row atomic mutation | TablesDB transaction: `createTransaction`, then `createRow`/`updateRow` with its `transactionId`, then `updateTransaction({ commit: true })` |
| `scheduler.runAfter(0, action)` | `after(() => step(id))` from `next/server` |
| `@convex-dev/workflow` | **Status is the queue**: each step reads the request status, does one job and moves the status on. A cron tick re-runs stuck steps. |
| `scheduler.runAfter(3 days)` chase | The cron tick picks up `rfqs` where `status = sent` and a chase is due |
| `httpAction` webhook | Route handler at `src/app/api/webhooks/agentmail/route.ts` |
| Firecrawl component | `@mendable/firecrawl-js` SDK (`search`, `scrape`) |
| AgentMail component | Plain REST for sending (already written in `lib/agentmailRest.ts`) and the webhook payload for inbound. Simpler than the component, which needed workarounds. |
| `requireOwnedRequest` | One helper: load the row with the admin client, compare `userId`, and say "not found" for both missing and not-yours |
| Row visibility | Each request-scoped row is written with `Permission.read(Role.user(ownerId))` |
| `ConvexError` | The server action returns `{ error: string }`, as `lib/auth/actions.ts` already does |

## 4. Decisions needed before Phase 1

**D1. Hosting.** I recommend **Appwrite Sites**, which runs Next.js SSR and is all-Appwrite for
the judges. The alternative is Vercel. Either way we deploy a skeleton on day 1, because the
AgentMail webhook needs a public URL and we need to learn the host's request timeout early.
If that timeout is shorter than a discovery run (about 30–60 s), the step functions move into
an Appwrite Function (up to 900 s) unchanged. They are plain TypeScript for exactly that reason.

**D2. Live board.** Browser Realtime only authenticates with a session secret visible to
JavaScript, and ours is deliberately in an httpOnly cookie.
- *Recommended start:* while a request is in flight, the page refreshes every 3 s with
  `router.refresh()`. Nothing new to secure, and it works on day 1.
- *Upgrade in Phase 5 if time allows:* hand the browser the secret with `client.setSession()`
  and subscribe to the rows. That gives an instant board and is a visible Appwrite feature,
  at the cost of the session being readable by page scripts.

**D3. Demo supplier.** Discovery finds real businesses, and the prototype never auto-sends to
them. For the demo we need **one mailbox you control**, attached to a discovered supplier with
the existing "add address by hand" control, so you can reply live and watch the row upgrade.

## 5. Phases

Each phase ends with something you can click through. Don't start the next phase until the
"done when" line is true.

### Phase 0: Foundations · Fri 23 Oct
- [x] Run `npm run db:setup` against the project (done 22 Oct: 11 tables, every index `available`)
- [x] Port the pure libraries: `money`, `domains`, `rfq-text` in `src/lib/`; `fx`, `mx`,
      `openai`, `svix`, `agentmail` (REST) in `src/lib/server/`. No Convex imports.
      Svix verified with a self-signed delivery (valid passes; tampered, wrong-secret and
      stale fail). OpenAI, Firecrawl and the AgentMail inbox all answer with our keys.
- [x] `src/lib/db/`: `rows.ts` (typed rows) and `server.ts` (`ownerPermissions`,
      `recordEvent`, `requireOwnedRequest`, `UserFacingError`, `actionError`)
- [x] Job runner `runStep()` in `src/lib/server/jobs.ts`, wrapped in `after()`, with failures
      written to `failureReason` and the timeline
- [x] `/api/cron/tick` and `/api/cron/probe`, protected by `CRON_SECRET` (401 without it)
- [x] Port `format.ts`, `vocabulary.ts` and `status-badge.tsx` (the landing page now uses
      the shared `TrackBadge`)
- [x] `after()` verified locally on `next dev` and `next start`: the probe row lands 20 s
      after the response
- [x] **Deploy the skeleton** (D1): Appwrite Sites, https://quotebook.appwrite.network,
      SSR adapter (the site was first created as `static`, which 404s every route), all env
      vars set. Site request timeout is 30 s.
- [x] On the host, prove that work inside `after()` keeps running once the response is sent:
      the probe row landed 20 s after the response (23 Oct, 13:00:49 UTC).
- [ ] Before Phase 2: probe a run longer than the 30 s timeout. Discovery can take 30–60 s;
      if `after()` work is cut at 30 s, split discovery into one step per candidate or raise
      the site timeout.

**Done when**: the deployed app signs in, `/api/cron/tick` answers 200 with the secret
and 401 without it, and the `after()` test row appears.

### Phase 1: Request and extraction · Sat 24 Oct
- [x] Port `request-form.tsx` as a server action `createRequest` that writes the request, then `after(extract)`
- [x] `extract` step: port `intake.extractSpec` and save the spec plus line items in one transaction
      (verified 23 Oct: the Dell text gives 1 item, UGX 180,000,000, 14 days; gpt-5 took 17.7 s)
- [x] `/requests/[id]` page: header, line items, pipeline progress, timeline, failure banner with Retry
      (verified: owner sees it, a second account gets "That request no longer exists")
- [x] Sidebar history (port `sidebar.tsx`); `/requests` is now the new-request form
- [x] `retryRequest`: resume at extraction or discovery, depending on where it died
- [x] Live refresh while the status is `extracting`, `discovering` or `collecting` (D2)
- [ ] Click-through in a browser: submit the form, watch it fill in, Retry a failed request

**Done when**: typing *"50 × Dell Latitude 5550, i7/16GB/512GB, delivered to Kampala within
14 days, budget UGX 180,000,000"* shows 1 line item, a UGX 180,000,000 budget and a 14-day
window without a manual reload.

### Phase 2: Discovery and the board · Sun 25 Oct
- [x] Add `@mendable/firecrawl-js`; port `searchCandidates` and `enrichCandidate`
      (`Promise.allSettled`, at most 4 candidates). Search no longer asks Firecrawl to
      scrape (the content was never used); each candidate has a 15 s deadline.
- [x] FX snapshot once per run; MX check per address
- [x] `writeCandidate`: supplier and contact upserted first (shared, unique-indexed),
      then the web-price quote, RFQ draft and event in one transaction
- [x] Finish: status becomes `awaiting_approval` and an event is recorded. Stop search button.
      Zero suppliers now fails with a Retry message instead of an empty approval screen.
- [x] Port `board.forRequest` (one row per supplier, emailed beats crawled) and `board.tsx`
- [x] gpt-5 `reasoning_effort: "low"` for extraction and page reading (measured: 19.9 s →
      5.5 s per page, same answer). Full Dell run: 21 s, 4 real suppliers, ends at approval.
- [ ] After the next deploy: `POST /api/cron/probe?seconds=45` on the live site, to learn
      whether `after()` work outlives the 30 s site timeout

**Done when**: a request reaches "Your approval" with suppliers on the board, and at least
one has a web price.

### Phase 3: Send gate and sending · Mon 26 Oct
- [x] Port `send-gate.tsx`: recipient list, per-row address status, preview of the exact email
- [x] Actions `addContact` and `clearContact` (with an MX check in `after`), and
      `approveAndSend` with the **5-recipient cap enforced on the server**
- [x] `send` step: inbox from `AGENTMAIL_INBOX_ID`, one REST send per RFQ, each failure
      isolated to its own row; `retrySend`
- [x] Postal address in the RFQ footer comes from `RFQ_POSTAL_ADDRESS`; the old TODO line is
      stripped from stored drafts before preview and send (verified in a sent message)
- [x] Verified 24 Oct via the real server actions: cap, no-address refusal, other-user
      refusal (both approve and add-address), invalid address, re-approval refusal; two RFQs
      sent to our own inbox and received with `rfq` / `request:<id>` labels
- [ ] Set `RFQ_POSTAL_ADDRESS` locally and on the site (needs the user's registered address)
- [ ] Retry after a real send failure is not yet exercised end to end

**Done when**: an RFQ lands in your demo mailbox (D3), and its row shows *Awaiting reply*.

### Phase 4: Replies · Tue 27 Oct
- [x] Webhook route: Svix verification on the raw body; insert into `inboundParses` and
      treat a 409 on `eventId` as already handled. Unauthenticated senders are held for review.
      Mail from our own inbox is ignored; the parser reads AgentMail's `extracted_text`.
- [x] Port `matchRfq` (by thread, then by sender domain, sent/replied RFQs only) and
      `singleOutstandingRequest`
- [x] `parse` step: OpenAI quote parse, then `applyParsedQuote` in one transaction
      (insert the emailed quote, mark the crawled one `supersededBy`)
- [x] Port `review-queue.tsx` with `releaseForParsing` and `linkToRfq`; release and link
      only from a finished state, and a reply never produces two quotes
- [x] Verified 24 Oct with signed test deliveries: bad signature 401; own mail, duplicates
      and other event types ignored; quote reply → confirmed UGX 171,500,000 / VAT / 10 days /
      12 months with the web price superseded; unauthenticated held; out-of-office → not a
      quote; stranger → held; release refused for another user
- [ ] `linkToRfq` not exercised end to end (needs a request with exactly one waiting RFQ)
- [ ] Point the AgentMail webhook at `https://<host>/api/webhooks/agentmail` (after deploy;
      the existing webhook targets the old URL and is disabled)

**Done when**: you reply "Total UGX 171,500,000 incl. VAT, 10 days, 12 months warranty"
from the demo mailbox, and the row flips to *Confirmed* with those numbers.

### Phase 5: Decision, chasing and live updates · Wed 28 Oct
- [x] Port `recommendations.compute` (arithmetic picks, model writes the sentence) and
      `recommendation.tsx`. Fixed on the way: web prices are unit prices scaled to their line's
      quantity; multi-item requests compare confirmed quotes only; the trade-off names any
      cheaper offer, and the prose may not call the winner cheapest when it is not
- [x] Conversation per supplier (added 24 Oct at the user's request): the AgentMail thread is
      read on demand and replies go out threaded from the app; verified on a self-thread, with
      another user refused
- [ ] Cron tick: send chase-ups for RFQs sent 3 and 7 days ago, and re-run any request
      stuck in one status for more than 10 minutes
- [ ] Schedule the tick: an Appwrite Function on a 5-minute cron that calls the route
- [ ] Optional: the Realtime upgrade (D2)

**Done when**: the Dell request ends at *Decided*, with a recommendation and a named trade-off.

### Phase 6: Hardening and an end-to-end run · Thu 29 Oct
- [ ] Full run on the deployed app, from a fresh account, with two suppliers (one replies,
      one stays silent)
- [ ] Ownership checks: a second account cannot open, act on, or see the rows of the first
      account's request
- [ ] Empty, loading and error states on every screen; mobile width
- [ ] `npm run typecheck` and `npm run build` are clean

### Phase 7: Submission · Fri 30 Oct (Sat 31 is buffer)
- [ ] README: architecture, the Appwrite products used (Auth, TablesDB, Transactions,
      Functions, Sites, Realtime if used), how to run it
- [ ] A 2–3 minute demo video of the Phase 4 "done when" moment
- [ ] Submit

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Host timeout kills discovery mid-run | Learn the limit on day 1 (Phase 0). The steps are plain TS and can move into an Appwrite Function unchanged. |
| A step dies, and without the workflow component nothing retries it | Status-driven steps plus the stuck-request sweep in the cron tick; Retry button on every failure |
| Firecrawl finds no supplier email (common) | "Add address by hand" ships in Phase 3, not later |
| gpt-5 truncates JSON on reasoning tokens | Keep the prototype's 6,000 output-token cap and its explicit `length` error |
| The webhook can't reach localhost | Deploy on day 1; use `cloudflared tunnel` only for local debugging |
| Cold email deliverability | One warmed inbox (`AGENTMAIL_INBOX_ID`), the 5 cap, the footer with STOP and a postal address |
| Running out of days | Cut in this order: Realtime, chase-ups, cancel discovery, review-queue *link*. Never cut: the send gate, ownership checks, the webhook's idempotency. |
