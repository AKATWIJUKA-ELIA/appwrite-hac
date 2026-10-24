import "server-only";

import { ID, Query } from "node-appwrite";
import { formatMoney } from "@/lib/money";
import type { QuoteRow, RecommendationRow, RequestRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { db, ownerPermissions, recordEvent, UserFacingError, withTransaction } from "@/lib/db/server";
import { openAiJson, PARSING_MODEL, strictObject } from "@/lib/server/openai";

type Candidate = {
  quoteId: string;
  supplierName: string;
  source: "crawled" | "emailed";
  totalMinor: number;
  currency: string;
  normalizedUsdMinor: number | null;
  leadTimeDays: number | null;
  warrantyMonths: number | null;
  vatIncluded: boolean;
};

/**
 * Not "cheapest". The ranking is arithmetic: total landed cost, lead time
 * against the stated window, warranty, and whether the price was confirmed by
 * the supplier or merely scraped. The model writes the sentence explaining
 * the choice; it does not make the choice, and every input is stored with the
 * recommendation and shown to the buyer.
 */
export async function computeRecommendation(request: RequestRow): Promise<void> {
  const tables = db();
  const [{ rows: allQuotes }, { total: lineCount }] = await Promise.all([
    tables.listRows<QuoteRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.quotes.id,
      queries: [Query.equal("requestId", request.$id), Query.isNull("supersededBy"), Query.limit(200)],
      total: false,
    }),
    tables.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.lineItems.id,
      queries: [Query.equal("requestId", request.$id), Query.select(["$id"]), Query.limit(1)],
    }),
  ]);
  if (allQuotes.length === 0) {
    throw new UserFacingError("Nothing to compare yet — no supplier has a price on the board.");
  }
  // A web listing prices one product. On a request with several line items
  // it is not a price for the order, so comparing it with a supplier's quote
  // for everything would crown a partial price. Only confirmed quotes count.
  const quotes = lineCount > 1 ? allQuotes.filter((q) => q.source === "emailed") : allQuotes;
  if (quotes.length === 0) {
    throw new UserFacingError(
      "This request has several items, and web prices cover only one of them, so they can't be compared. A recommendation needs at least one quote confirmed by a supplier's reply.",
    );
  }
  const supplierIds = [...new Set(quotes.map((q) => q.supplierId))];
  const { rows: suppliers } = await tables.listRows<SupplierRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.suppliers.id,
    queries: [Query.equal("$id", supplierIds), Query.limit(supplierIds.length)],
    total: false,
  });
  const nameOf = new Map(suppliers.map((s) => [s.$id, s.name]));
  const candidates: Candidate[] = quotes.map((q) => ({
    quoteId: q.$id,
    supplierName: nameOf.get(q.supplierId) ?? "Unknown supplier",
    source: q.source,
    totalMinor: q.totalMinor,
    currency: q.currency,
    normalizedUsdMinor: q.normalizedUsdMinor,
    leadTimeDays: q.leadTimeDays,
    warrantyMonths: q.warrantyMonths,
    vatIncluded: q.vatIncluded,
  }));

  // Deterministic ranking. Nothing below is a model output.
  const window = request.deliveryWindowDays;
  const scored = candidates
    .map((candidate) => {
      const cost = candidate.normalizedUsdMinor ?? candidate.totalMinor;
      const lateBy =
        window !== null && candidate.leadTimeDays !== null ? Math.max(0, candidate.leadTimeDays - window) : 0;
      return {
        ...candidate,
        cost,
        lateBy,
        // A confirmed price is worth more than a scraped one; a late delivery
        // and a missing warranty each cost the candidate ground.
        score:
          cost *
          (1 + lateBy * 0.02) *
          (candidate.source === "emailed" ? 1 : 1.15) *
          (candidate.warrantyMonths !== null && candidate.warrantyMonths >= 12 ? 1 : 1.05),
      };
    })
    .sort((a, b) => a.score - b.score);

  const winner = scored[0];
  const runnerUp = scored[1];
  // The cheapest offer anywhere in the field, not just the runner-up: a lower
  // price that ranked third is still a trade-off the buyer should hear about.
  const cheaper = scored.filter((c) => c.cost < winner.cost).sort((a, b) => a.cost - b.cost)[0];

  const inputs = [
    { label: "Total", value: formatMoney(winner.totalMinor, winner.currency) },
    { label: "Price track", value: winner.source === "emailed" ? "confirmed by reply" : "web price" },
    { label: "Lead time", value: winner.leadTimeDays !== null ? `${winner.leadTimeDays} days` : "not stated" },
    { label: "Delivery window", value: window !== null ? `${window} days` : "not stated" },
    { label: "Warranty", value: winner.warrantyMonths !== null ? `${winner.warrantyMonths} months` : "not stated" },
    { label: "Candidates compared", value: String(scored.length) },
  ];

  // The named trade-off, derived before the model sees anything.
  let tradeoff = "No material trade-off — it leads on every input compared.";
  if (winner.lateBy > 0) {
    tradeoff = `Arrives ${winner.lateBy} day(s) past the stated window.`;
  } else if (winner.source === "crawled") {
    tradeoff = "Price is a scraped web listing, not yet confirmed by the supplier.";
  } else if (cheaper) {
    tradeoff = `Not the cheapest — ${cheaper.supplierName} is lower but scores worse on lead time, warranty, or confirmation.`;
  } else if (winner.warrantyMonths === null) {
    tradeoff = "Warranty terms were never stated in the quotation.";
  }

  let rationale = `${winner.supplierName} at ${formatMoney(winner.totalMinor, winner.currency)}, chosen on total landed cost against the stated delivery window.`;

  // The model writes prose from the computed facts, and only that.
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const written = await openAiJson({
        apiKey,
        model: PARSING_MODEL,
        reasoningEffort: "low",
        system:
          "You write one short, factual procurement recommendation from the supplied facts. " +
          "Use only the facts given. Do not introduce numbers, claims, or comparisons that are not present. " +
          "If cheaperOffer is not null, never call the winner the cheapest or lowest-priced; say why it was " +
          "chosen anyway, consistent with the stated tradeoff.",
        user: JSON.stringify({ winner, runnerUp, cheaperOffer: cheaper ?? null, tradeoff, window, inputs }),
        schemaName: "recommendation_prose",
        schema: strictObject({ rationale: { type: "string" } }),
      });
      if (typeof written.rationale === "string" && written.rationale.trim()) {
        rationale = written.rationale.trim();
      }
    } catch (error) {
      // The computed sentence above already stands on its own.
      console.error("[recommend] prose failed", error);
    }
  }

  await withTransaction(async (transactionId) => {
    await tables.createRow<RecommendationRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.recommendations.id,
      rowId: ID.unique(),
      data: {
        requestId: request.$id,
        quoteId: winner.quoteId,
        rationale: rationale.slice(0, 5000),
        tradeoff,
        totalLandedUsdMinor: winner.normalizedUsdMinor,
        leadTimeDays: winner.leadTimeDays,
        inputs: JSON.stringify(inputs),
      },
      permissions: ownerPermissions(request.userId),
      transactionId,
    });
    await tables.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: request.$id,
      data: { status: "decided" },
      transactionId,
    });
    await recordEvent({
      requestId: request.$id,
      ownerId: request.userId,
      kind: "recommendation.made",
      message: rationale.slice(0, 500),
      transactionId,
    });
  });
}
