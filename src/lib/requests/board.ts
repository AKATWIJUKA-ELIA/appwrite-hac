import "server-only";

import { Query } from "node-appwrite";
import type { ContactRow, QuoteRow, RfqRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES, type ContactVerification, type RfqStatus } from "@/lib/db/schema";
import { db } from "@/lib/db/server";
import type { BoardTrack } from "@/lib/vocabulary";

export type BoardRow = {
  supplierId: string;
  supplierName: string;
  supplierDomain: string;
  websiteUrl: string | null;
  track: BoardTrack;
  totalMinor: number | null;
  currency: string | null;
  normalizedUsdMinor: number | null;
  fxRate: number | null;
  fxRateAt: string | null;
  fxSource: string | null;
  vatIncluded: boolean | null;
  leadTimeDays: number | null;
  warrantyMonths: number | null;
  sourceUrl: string | null;
  quoteId: string | null;
  rfqId: string | null;
  rfqStatus: RfqStatus | null;
  /** Where the RFQ goes: found by discovery, or typed in at the send gate. */
  contactEmail: string | null;
  contactVerification: ContactVerification | null;
};

/**
 * The comparison board: the one read that merges the two quote tracks.
 *
 * Per supplier, an emailed quote always wins over a crawled one, and a
 * superseded crawled row never surfaces. Rows appear as `web price` during
 * discovery, then upgrade to `confirmed` when a real reply lands.
 * The caller must already have checked that the request is the user's.
 */
export async function loadBoard(requestId: string): Promise<BoardRow[]> {
  const tables = db();
  const [quotes, rfqs] = await Promise.all([
    tables.listRows<QuoteRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.quotes.id,
      queries: [Query.equal("requestId", requestId), Query.limit(200)],
      total: false,
    }),
    tables.listRows<RfqRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.rfqs.id,
      queries: [Query.equal("requestId", requestId), Query.limit(50)],
      total: false,
    }),
  ]);

  // One winner per supplier: emailed beats crawled, newer beats older.
  const best = new Map<string, QuoteRow>();
  for (const quote of quotes.rows) {
    if (quote.supersededBy) continue;
    const held = best.get(quote.supplierId);
    if (!held || outranks(quote, held)) best.set(quote.supplierId, quote);
  }
  const rfqBySupplier = new Map(rfqs.rows.map((rfq) => [rfq.supplierId, rfq]));

  // Suppliers we contacted but who have not priced anything yet still belong
  // on the board — silence is information too.
  const supplierIds = [...new Set([...best.keys(), ...rfqs.rows.map((rfq) => rfq.supplierId)])];
  if (supplierIds.length === 0) return [];

  const [suppliers, contacts] = await Promise.all([
    tables.listRows<SupplierRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.suppliers.id,
      queries: [Query.equal("$id", supplierIds), Query.limit(supplierIds.length)],
      total: false,
    }),
    tables.listRows<ContactRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.contacts.id,
      queries: [Query.equal("supplierId", supplierIds), Query.limit(100)],
      total: false,
    }),
  ]);
  const supplierById = new Map(suppliers.rows.map((s) => [s.$id, s]));
  const contactById = new Map(contacts.rows.map((c) => [c.$id, c]));
  // The address the RFQ draft points at; failing that, the supplier's first.
  const contactFor = (supplierId: string, rfq: RfqRow | null) =>
    (rfq?.contactId ? contactById.get(rfq.contactId) : undefined) ??
    contacts.rows.find((c) => c.supplierId === supplierId) ??
    null;

  const rows: BoardRow[] = supplierIds.map((supplierId) => {
    const supplier = supplierById.get(supplierId);
    const quote = best.get(supplierId) ?? null;
    const rfq = rfqBySupplier.get(supplierId) ?? null;
    const contact = contactFor(supplierId, rfq);

    return {
      supplierId,
      supplierName: supplier?.name ?? "Unknown supplier",
      supplierDomain: supplier?.domain ?? "",
      websiteUrl: supplier?.websiteUrl ?? null,
      // "awaiting" means we actually asked and are waiting; a supplier we
      // merely drafted is "no price" — claiming to be waiting on a reply we
      // never sent would be a lie on the board.
      track: quote
        ? quote.source === "emailed"
          ? "confirmed"
          : "web price"
        : rfq && (rfq.status === "sent" || rfq.status === "replied")
          ? "awaiting"
          : "no price",
      totalMinor: quote?.totalMinor ?? null,
      currency: quote?.currency ?? null,
      normalizedUsdMinor: quote?.normalizedUsdMinor ?? null,
      fxRate: quote?.fxRate ?? null,
      fxRateAt: quote?.fxRateAt ?? null,
      fxSource: quote?.fxSource ?? null,
      vatIncluded: quote?.vatIncluded ?? null,
      leadTimeDays: quote?.leadTimeDays ?? null,
      warrantyMonths: quote?.warrantyMonths ?? null,
      sourceUrl: quote?.sourceUrl ?? null,
      quoteId: quote?.$id ?? null,
      rfqId: rfq?.$id ?? null,
      rfqStatus: rfq?.status ?? null,
      contactEmail: contact?.email ?? null,
      contactVerification: contact?.verification ?? null,
    };
  });

  // Confirmed first, then priced crawled rows, then the silent ones. Within a
  // group, cheapest in comparable terms leads.
  return rows.sort((a, b) => {
    const rank = TRACK_RANK[a.track] - TRACK_RANK[b.track];
    if (rank !== 0) return rank;
    const aCost = a.normalizedUsdMinor ?? a.totalMinor ?? Infinity;
    const bCost = b.normalizedUsdMinor ?? b.totalMinor ?? Infinity;
    return aCost - bCost;
  });
}

const TRACK_RANK: Record<BoardTrack, number> = {
  confirmed: 0,
  "web price": 1,
  awaiting: 2,
  "no price": 3,
};

function outranks(candidate: QuoteRow, held: QuoteRow): boolean {
  if (candidate.source === held.source) return candidate.$createdAt > held.$createdAt;
  return candidate.source === "emailed";
}
