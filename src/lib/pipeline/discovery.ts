import "server-only";

import { ID, Query } from "node-appwrite";
import { registrableDomain } from "@/lib/domains";
import { formatMoney, normalizeToUsdMinor, toMinor, type FxSnapshot } from "@/lib/money";
import { composeRfqBody } from "@/lib/rfq-text";
import type {
  ContactRow,
  LineItemRow,
  QuoteRow,
  RequestRow,
  RfqRow,
  SupplierRow,
} from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import {
  db,
  isConflict,
  ownerPermissions,
  recordEvent,
  UserFacingError,
  withTransaction,
} from "@/lib/db/server";
import {
  contactPageUrl,
  harvestEmails,
  isOwnDomain,
  pickContactEmail,
} from "@/lib/server/contact-emails";
import { firecrawl } from "@/lib/server/firecrawl";
import { fetchUsdRates } from "@/lib/server/fx";
import { verifyEmailMx, type MxVerification } from "@/lib/server/mx";
import { clip, nullable, openAiJson, PARSING_MODEL, strictObject } from "@/lib/server/openai";

// Cost and latency guard. Every candidate costs a scrape plus one model call,
// so this number is the per-run inference bill, not a tuning knob.
const MAX_CANDIDATES = 4;

// Extraction and discovery share one host request with a 30-second limit.
// Measured: extraction ~8 s, search ~2 s, and most candidates finish within
// ~15 s, but one slow site took 30 s on its own. A candidate that misses this
// deadline is dropped rather than holding the whole board back.
const CANDIDATE_DEADLINE_MS = 15_000;
const SCRAPE_TIMEOUT_MS = 10_000;

// One line per failed site. A dead or slow supplier page is routine during
// discovery, and the SDK's full error object buries the log.
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Resolves to null if `work` has not settled within `ms`. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type Candidate = { url: string; domain: string; name: string };

type Enriched = {
  domain: string;
  name: string;
  websiteUrl: string;
  sourceUrl: string;
  email?: string;
  /** The page the address was found on, kept with the contact for audit. */
  emailSourceUrl?: string;
  priceAmount?: number;
  currency?: string;
};

/**
 * Pipeline step 2: find suppliers for an extracted request.
 *
 *   search -> (per candidate, in parallel) scrape -> extract -> MX check -> write
 *
 * Each supplier is written the moment its own lookup finishes, so the board
 * fills in while the rest are still running and a slow or broken site never
 * costs the others. Throws on failure; the caller records it on the request.
 */
export async function discover(requestId: string): Promise<void> {
  const tables = db();
  const request = await tables.getRow<RequestRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.requests.id,
    rowId: requestId,
  });
  if (request.status !== "discovering") return;

  const { rows: items } = await tables.listRows<LineItemRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.lineItems.id,
    queries: [Query.equal("requestId", requestId), Query.limit(20)],
    total: false,
  });

  const [candidates, fx] = await Promise.all([searchCandidates(request, items), snapshotFx()]);
  if (candidates.length === 0) {
    throw new UserFacingError(
      "Supplier search found no suppliers for this request. Try again, or reword it with a more common product name.",
    );
  }

  const results = await Promise.allSettled(
    candidates.map(async (candidate) => {
      const supplier = await withDeadline(enrichCandidate(candidate, items), CANDIDATE_DEADLINE_MS);
      if (!supplier) return false;
      // Verify the contact before it is ever offered as a send target.
      const verification = supplier.email ? await verifyEmailMx(supplier.email) : "unverified";
      // Cancelled, failed elsewhere, or already finished (a candidate that
      // outlived its deadline lands here late): write nothing.
      if (!(await stillDiscovering(requestId))) return false;
      await writeCandidate(request, items, supplier, verification, fx);
      return true;
    }),
  );
  for (const result of results) {
    if (result.status === "rejected") console.error("[discover] candidate failed", result.reason);
  }
  const written = results.filter((r) => r.status === "fulfilled" && r.value).length;

  await finishDiscovery(request, written);
}

async function stillDiscovering(requestId: string): Promise<boolean> {
  const row = await db().getRow<RequestRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.requests.id,
    rowId: requestId,
    queries: [Query.select(["status"])],
  });
  return row.status === "discovering";
}

/**
 * Firecrawl search for candidate suppliers, one per registrable domain.
 * Only URLs and titles are used here; each page is scraped on its own later,
 * so the search does not ask Firecrawl to scrape anything.
 */
async function searchCandidates(request: RequestRow, items: LineItemRow[]): Promise<Candidate[]> {
  const terms = items.map((item) => item.description).join(", ");
  const query = `${terms} supplier price ${request.deliverTo}`;

  const results = await firecrawl().search(query, {
    limit: MAX_CANDIDATES,
    location: request.deliverTo,
  });

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const hit of results.web ?? []) {
    const record = hit as { url?: unknown; title?: unknown; metadata?: { sourceURL?: unknown } };
    const url =
      typeof record.url === "string"
        ? record.url
        : typeof record.metadata?.sourceURL === "string"
          ? record.metadata.sourceURL
          : null;
    if (!url) continue;

    const domain = registrableDomain(url);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    candidates.push({
      url,
      domain,
      name: typeof record.title === "string" ? record.title : domain,
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
}

async function snapshotFx(): Promise<Record<string, FxSnapshot>> {
  try {
    return await fetchUsdRates();
  } catch (error) {
    // No snapshot means no USD normalisation — the board still shows native
    // currency rather than a number nobody can defend.
    console.error("[discover] FX snapshot failed", error);
    return {};
  }
}

/**
 * Scrape the candidate's page and pull out the supplier, a listed price, and
 * a contact address. Returns null when the page yields nothing usable, which
 * is a normal outcome, not an error.
 */
async function enrichCandidate(candidate: Candidate, items: LineItemRow[]): Promise<Enriched | null> {
  const startedAt = Date.now();
  let markdown = "";
  let links: string[] = [];
  try {
    const page = await firecrawl().scrape(candidate.url, {
      // Links carry mailto: addresses and the way to the contact page.
      formats: ["markdown", "links"],
      onlyMainContent: true,
      maxAge: 3_600_000,
      timeout: SCRAPE_TIMEOUT_MS,
    });
    markdown = page.markdown ?? "";
    links = page.links ?? [];
  } catch (error) {
    console.error(`[discover] scrape failed for ${candidate.url}: ${errorText(error)}`);
    return null;
  }
  if (!markdown) return null;

  // Product pages rarely carry an address; the site's contact page or footer
  // usually does. When this page has none of the supplier's own, fetch the
  // contact page while the model reads the product page, so it costs no
  // extra time on the critical path.
  const onPage = harvestEmails([markdown], links);
  const ownOnPage = onPage.filter((email) => isOwnDomain(email, candidate.domain));
  const contactUrl =
    ownOnPage.length > 0 ? null : contactPageUrl(candidate.url, links, candidate.domain);
  const contactPage: Promise<{ emails: string[]; url: string } | null> = contactUrl
    ? firecrawl()
        .scrape(contactUrl, {
          formats: ["markdown", "links"],
          // The footer is the point here, so keep the whole page.
          onlyMainContent: false,
          maxAge: 86_400_000,
          timeout: SCRAPE_TIMEOUT_MS,
        })
        .then((page) => ({
          emails: harvestEmails([page.markdown ?? ""], page.links ?? []),
          url: contactUrl,
        }))
        .catch((error: unknown) => {
          console.error(`[discover] contact page failed for ${contactUrl}: ${errorText(error)}`);
          return null;
        })
    : Promise.resolve(null);

  const wanted = items.map((item) => `${item.quantity} x ${item.description}`).join("; ");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  try {
    const extracted = await openAiJson({
      apiKey,
      model: PARSING_MODEL,
      // Measured on a real supplier page: default effort took ~20 s, "low"
      // ~5.5 s with the same answer. The whole run has to fit the host's
      // 30-second request window.
      reasoningEffort: "low",
      system:
        "You read a supplier web page and extract the vendor, any listed price for the requested " +
        "item, and a contact email. Return null for anything the page does not state. Never guess " +
        "an email address or a price.",
      user: `Requested: ${wanted}\n\nPage (${candidate.url}):\n${clip(markdown)}`,
      schemaName: "supplier_extract",
      schema: strictObject({
        supplierName: { type: "string" },
        email: nullable("string"),
        priceAmount: nullable("number"),
        currency: nullable("string"),
        productDescription: nullable("string"),
      }),
    });

    // Give the contact page whatever is left of this candidate's deadline,
    // keeping a margin for the write that follows.
    const remaining = CANDIDATE_DEADLINE_MS - 1_500 - (Date.now() - startedAt);
    const fromContactPage = remaining > 0 ? await withDeadline(contactPage, remaining) : null;

    const modelEmail = typeof extracted.email === "string" ? harvestEmails([extracted.email], []) : [];
    const pageEmails = [...onPage, ...modelEmail];
    const contactEmails = fromContactPage?.emails ?? [];
    // Own-domain addresses win wherever they were found; anything else only
    // when the site offers nothing of its own.
    const email = pickContactEmail([...pageEmails, ...contactEmails], candidate.domain);
    const emailSourceUrl =
      email && !pageEmails.includes(email) && fromContactPage ? fromContactPage.url : candidate.url;

    return {
      domain: candidate.domain,
      name:
        typeof extracted.supplierName === "string" && extracted.supplierName.trim().length > 0
          ? extracted.supplierName.trim()
          : candidate.name,
      websiteUrl: candidate.url,
      sourceUrl: candidate.url,
      email,
      emailSourceUrl,
      priceAmount:
        typeof extracted.priceAmount === "number" && extracted.priceAmount > 0
          ? extracted.priceAmount
          : undefined,
      currency:
        typeof extracted.currency === "string" && extracted.currency.length === 3
          ? extracted.currency.toUpperCase()
          : undefined,
    };
  } catch (error) {
    console.error(`[discover] extraction failed for ${candidate.url}: ${errorText(error)}`);
    return null;
  }
}

/**
 * The supplier, deduped by registrable domain. Suppliers are shared across
 * requests, so this runs outside the request's transaction: the unique index
 * on `domain` settles a race, and a 409 means "use the row that won".
 */
async function upsertSupplier(supplier: Enriched): Promise<SupplierRow> {
  const tables = db();
  const findExisting = async () =>
    (
      await tables.listRows<SupplierRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.suppliers.id,
        queries: [Query.equal("domain", supplier.domain), Query.limit(1)],
        total: false,
      })
    ).rows[0];

  const existing = await findExisting();
  if (existing) return existing;
  try {
    return await tables.createRow<SupplierRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.suppliers.id,
      rowId: ID.unique(),
      data: {
        name: supplier.name.slice(0, 200),
        domain: supplier.domain,
        websiteUrl: supplier.websiteUrl,
        country: null,
        discoveredVia: "crawled",
        sourceUrl: supplier.sourceUrl,
      },
    });
  } catch (err) {
    if (!isConflict(err)) throw err;
    const winner = await findExisting();
    if (!winner) throw err;
    return winner;
  }
}

/** A contact address, once per supplier. Shared like the supplier itself. */
async function ensureContact(
  supplierId: string,
  supplier: Enriched,
  verification: MxVerification,
): Promise<void> {
  if (!supplier.email) return;
  const tables = db();
  const { rows } = await tables.listRows<ContactRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.contacts.id,
    queries: [Query.equal("email", supplier.email), Query.limit(1)],
    total: false,
  });
  if (rows.length > 0) return;
  try {
    await tables.createRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.contacts.id,
      rowId: ID.unique(),
      data: {
        supplierId,
        email: supplier.email.slice(0, 320),
        role: null,
        verification,
        verifiedAt: new Date().toISOString(),
        sourceUrl: supplier.emailSourceUrl ?? supplier.sourceUrl,
      },
    });
  } catch (err) {
    if (!isConflict(err)) throw err;
  }
}

/**
 * Write one discovered supplier against the request: the shared supplier and
 * contact rows, then the request's own rows (the web-price quote, the RFQ
 * draft and the timeline entry) in one transaction.
 */
async function writeCandidate(
  request: RequestRow,
  items: LineItemRow[],
  supplier: Enriched,
  verification: MxVerification,
  fx: Record<string, FxSnapshot>,
): Promise<void> {
  const tables = db();
  const supplierRow = await upsertSupplier(supplier);
  await ensureContact(supplierRow.$id, supplier, verification);

  const scoped = (tableId: string) =>
    tables.listRows({
      databaseId: DATABASE_ID,
      tableId,
      queries: [
        Query.equal("requestId", request.$id),
        Query.equal("supplierId", supplierRow.$id),
        Query.limit(1),
        Query.select(["$id"]),
      ],
      total: false,
    });
  const [quoted, drafted, contact] = await Promise.all([
    scoped(TABLES.quotes.id),
    scoped(TABLES.rfqs.id),
    tables.listRows<ContactRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.contacts.id,
      queries: [Query.equal("supplierId", supplierRow.$id), Query.limit(1)],
      total: false,
    }),
  ]);
  const permissions = ownerPermissions(request.userId);

  await withTransaction(async (transactionId) => {
    // A crawled price is optional. A supplier with no listed price still
    // belongs on the board — it is a valid RFQ target.
    if (supplier.priceAmount !== undefined && supplier.currency && quoted.rows.length === 0) {
      const currency = supplier.currency;
      const totalMinor = toMinor(supplier.priceAmount, currency);
      const snapshot = fx[currency];
      await tables.createRow<QuoteRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.quotes.id,
        rowId: ID.unique(),
        data: {
          requestId: request.$id,
          supplierId: supplierRow.$id,
          rfqId: null,
          source: "crawled",
          confidence: "low",
          totalMinor,
          currency,
          vatIncluded: false,
          normalizedUsdMinor: snapshot ? normalizeToUsdMinor(totalMinor, currency, snapshot) : null,
          fxRate: snapshot?.fxRate ?? null,
          fxRateAt: snapshot ? new Date(snapshot.fxRateAt).toISOString() : null,
          fxSource: snapshot?.fxSource ?? null,
          sourceUrl: supplier.sourceUrl,
          incoterm: null,
          leadTimeDays: null,
          warrantyMonths: null,
          validUntil: null,
          supersededBy: null,
        },
        permissions,
        transactionId,
      });
    }

    // Link the supplier to this request with an RFQ draft, whether or not it
    // has a price or an address. Without this row a discovered supplier has
    // nothing tying it to the request, so it never reaches the board and the
    // send gate has nothing to approve.
    if (drafted.rows.length === 0) {
      await tables.createRow<RfqRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.rfqs.id,
        rowId: ID.unique(),
        data: {
          requestId: request.$id,
          supplierId: supplierRow.$id,
          contactId: contact.rows[0]?.$id ?? null,
          status: "draft",
          subject: `Request for quotation — ${request.title}`.slice(0, 300),
          body: composeRfqBody({
            supplierName: supplierRow.name,
            title: request.title,
            items: items.map((item) => ({ description: item.description, quantity: item.quantity })),
            deliverTo: request.deliverTo,
            deliveryWindowDays: request.deliveryWindowDays ?? undefined,
            budget:
              request.budgetMinor === null
                ? undefined
                : formatMoney(request.budgetMinor, request.currency),
          }),
          chaseCount: 0,
          inboxId: null,
          threadId: null,
          outboundId: null,
          approvedAt: null,
          sentAt: null,
          repliedAt: null,
          lastChasedAt: null,
          failureReason: null,
        },
        permissions,
        transactionId,
      });
    }

    await recordEvent({
      requestId: request.$id,
      ownerId: request.userId,
      kind: "supplier.discovered",
      message: `${supplierRow.name} (${supplierRow.domain})${supplier.email ? "" : " — no email found"}`,
      transactionId,
    });
  });
}

async function finishDiscovery(request: RequestRow, supplierCount: number): Promise<void> {
  if (!(await stillDiscovering(request.$id))) return;
  if (supplierCount === 0) {
    throw new UserFacingError(
      "Supplier search found pages but could not read a supplier from any of them. Try again, or reword the request.",
    );
  }
  await withTransaction(async (transactionId) => {
    await db().updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: request.$id,
      data: { status: "awaiting_approval" },
      transactionId,
    });
    await recordEvent({
      requestId: request.$id,
      ownerId: request.userId,
      kind: "discovery.complete",
      message: `Discovery finished with ${supplierCount} supplier(s). Awaiting your approval to send.`,
      transactionId,
    });
  });
}
