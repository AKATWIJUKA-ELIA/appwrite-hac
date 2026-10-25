import "server-only";

import { Query } from "node-appwrite";
import type { QuoteRow, RecommendationRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { db, isNotFound } from "@/lib/db/server";

export type RecommendationView = {
  quoteId: string;
  supplierName: string;
  totalMinor: number | null;
  currency: string | null;
  source: "crawled" | "emailed" | null;
  rationale: string;
  tradeoff: string;
  inputs: { label: string; value: string }[];
  createdAt: string;
};

/** The latest recommendation on a request. The caller must own the request. */
export async function loadRecommendation(requestId: string): Promise<RecommendationView | null> {
  const tables = db();
  const { rows } = await tables.listRows<RecommendationRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.recommendations.id,
    queries: [Query.equal("requestId", requestId), Query.orderDesc("$createdAt"), Query.limit(1)],
    total: false,
  });
  const recommendation = rows[0];
  if (!recommendation) return null;

  let quote: QuoteRow | null = null;
  let supplier: SupplierRow | null = null;
  try {
    quote = await tables.getRow<QuoteRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.quotes.id,
      rowId: recommendation.quoteId,
    });
    supplier = await tables.getRow<SupplierRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.suppliers.id,
      rowId: quote.supplierId,
    });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  let inputs: { label: string; value: string }[] = [];
  try {
    const parsed: unknown = JSON.parse(recommendation.inputs ?? "[]");
    if (Array.isArray(parsed)) inputs = parsed.filter((i) => typeof i?.label === "string" && typeof i?.value === "string");
  } catch {
    inputs = [];
  }

  return {
    quoteId: recommendation.quoteId,
    supplierName: supplier?.name ?? "Unknown supplier",
    totalMinor: quote?.totalMinor ?? null,
    currency: quote?.currency ?? null,
    source: quote?.source ?? null,
    rationale: recommendation.rationale,
    tradeoff: recommendation.tradeoff,
    inputs,
    createdAt: recommendation.$createdAt,
  };
}
