import "server-only";

import type { QuoteRow, RequestRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { db } from "@/lib/db/server";

export type AwardSummary = { supplierName: string; poNumber: string; awardedAt: string };

/** The award as shown on the request page. The caller must own the request. */
export async function loadAwardSummary(request: RequestRow): Promise<AwardSummary | null> {
  if (request.status !== "awarded" || !request.awardedQuoteId || !request.poNumber || !request.awardedAt) return null;
  const quote = await db().getRow<QuoteRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.quotes.id,
    rowId: request.awardedQuoteId,
  });
  const supplier = await db().getRow<SupplierRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.suppliers.id,
    rowId: quote.supplierId,
  });
  return { supplierName: supplier.name, poNumber: request.poNumber, awardedAt: request.awardedAt };
}
