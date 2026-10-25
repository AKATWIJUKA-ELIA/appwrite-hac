import "server-only";

import { Query } from "node-appwrite";
import type { AttachmentRow, InboundParseRow, RfqRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { db } from "@/lib/db/server";

export type HeldReply = {
  parseId: string;
  reason: string;
  fromAddress: string | null;
  preview: string;
  supplierName: string | null;
  receivedAt: string;
  /** An unmatched reply is linked to a supplier by hand before it is read. */
  needsLink: boolean;
  linkable: { rfqId: string; supplierName: string }[];
  /** PDFs that came with the reply, served through /api/attachments. */
  attachments: { id: string; filename: string }[];
};

/**
 * Replies on one request that arrived but did not become quotes. Without
 * this the messy path is invisible: a supplier replies, the board still reads
 * "awaiting", and nothing explains why. The caller must already have checked
 * that the request is the user's.
 */
export async function loadReviewQueue(requestId: string): Promise<HeldReply[]> {
  const tables = db();
  const { rows: rfqs } = await tables.listRows<RfqRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.rfqs.id,
    queries: [Query.equal("requestId", requestId), Query.limit(50)],
    total: false,
  });

  const rfqIds = rfqs.map((rfq) => rfq.$id);
  const [matched, unmatched] = await Promise.all([
    rfqIds.length
      ? tables.listRows<InboundParseRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.inboundParses.id,
          queries: [
            Query.equal("state", "needs_review"),
            Query.equal("rfqId", rfqIds),
            Query.orderDesc("$createdAt"),
            Query.limit(50),
          ],
          total: false,
        })
      : Promise.resolve({ rows: [] as InboundParseRow[] }),
    tables.listRows<InboundParseRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.inboundParses.id,
      queries: [
        Query.equal("state", "needs_review"),
        Query.equal("candidateRequestId", requestId),
        Query.isNull("rfqId"),
        Query.orderDesc("$createdAt"),
        Query.limit(50),
      ],
      total: false,
    }),
  ]);
  const held = [...matched.rows, ...unmatched.rows];
  if (held.length === 0) return [];

  const { rows: files } = await tables.listRows<AttachmentRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.attachments.id,
    queries: [Query.equal("inboundParseId", held.map((p) => p.$id)), Query.limit(50)],
    total: false,
  });

  const supplierIds = [...new Set(rfqs.map((rfq) => rfq.supplierId))];
  const { rows: suppliers } = supplierIds.length
    ? await tables.listRows<SupplierRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.suppliers.id,
        queries: [Query.equal("$id", supplierIds), Query.limit(supplierIds.length)],
        total: false,
      })
    : { rows: [] as SupplierRow[] };
  const supplierName = new Map(suppliers.map((s) => [s.$id, s.name]));
  const rfqById = new Map(rfqs.map((rfq) => [rfq.$id, rfq]));

  // Suppliers a reply could be linked to: those actually sent a request.
  const linkable = rfqs
    .filter((rfq) => rfq.status === "sent" || rfq.status === "replied")
    .map((rfq) => ({ rfqId: rfq.$id, supplierName: supplierName.get(rfq.supplierId) ?? "Unknown supplier" }))
    .slice(0, 20);

  return held.map((parse) => {
    const rfq = parse.rfqId ? rfqById.get(parse.rfqId) : undefined;
    return {
      parseId: parse.$id,
      reason: parse.reason ?? "Held for review.",
      fromAddress: parse.fromAddress,
      preview: (parse.text ?? "").slice(0, 600),
      supplierName: rfq ? (supplierName.get(rfq.supplierId) ?? null) : null,
      receivedAt: parse.$createdAt,
      needsLink: !parse.rfqId,
      linkable: parse.rfqId ? [] : linkable,
      attachments: files.filter((f) => f.inboundParseId === parse.$id).map((f) => ({ id: f.$id, filename: f.filename })),
    };
  });
}
