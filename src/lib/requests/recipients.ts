import "server-only";

import { Query } from "node-appwrite";
import type { ContactRow, RfqRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES, type ContactVerification, type RfqStatus } from "@/lib/db/schema";
import { presentableReason } from "@/lib/errors";
import { db } from "@/lib/db/server";
import { finalizeRfqBody } from "@/lib/rfq-text";

export type Recipient = {
  rfqId: string;
  status: RfqStatus;
  subject: string;
  /** Exactly what will be sent, so the preview and the send never differ. */
  body: string;
  chaseCount: number;
  sentAt: string | null;
  repliedAt: string | null;
  failureReason: string | null;
  supplierName: string;
  supplierDomain: string;
  email: string | null;
  verification: ContactVerification;
};

/**
 * The exact recipient list the buyer approves, shown verbatim in the send
 * gate. The caller must already have checked that the request is the user's.
 */
export async function loadRecipients(requestId: string): Promise<Recipient[]> {
  const tables = db();
  const { rows: rfqs } = await tables.listRows<RfqRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.rfqs.id,
    queries: [Query.equal("requestId", requestId), Query.orderAsc("$createdAt"), Query.limit(50)],
    total: false,
  });
  if (rfqs.length === 0) return [];

  const supplierIds = [...new Set(rfqs.map((rfq) => rfq.supplierId))];
  const contactIds = rfqs.flatMap((rfq) => (rfq.contactId ? [rfq.contactId] : []));
  const [suppliers, contacts] = await Promise.all([
    tables.listRows<SupplierRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.suppliers.id,
      queries: [Query.equal("$id", supplierIds), Query.limit(supplierIds.length)],
      total: false,
    }),
    contactIds.length
      ? tables.listRows<ContactRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.contacts.id,
          queries: [Query.equal("$id", contactIds), Query.limit(contactIds.length)],
          total: false,
        })
      : Promise.resolve({ rows: [] as ContactRow[] }),
  ]);
  const supplierById = new Map(suppliers.rows.map((s) => [s.$id, s]));
  const contactById = new Map(contacts.rows.map((c) => [c.$id, c]));
  const postalAddress = process.env.RFQ_POSTAL_ADDRESS;

  return rfqs.map((rfq) => {
    const supplier = supplierById.get(rfq.supplierId);
    const contact = rfq.contactId ? contactById.get(rfq.contactId) : undefined;
    return {
      rfqId: rfq.$id,
      status: rfq.status,
      subject: rfq.subject,
      body: finalizeRfqBody(rfq.body, postalAddress),
      chaseCount: rfq.chaseCount,
      sentAt: rfq.sentAt,
      repliedAt: rfq.repliedAt,
      failureReason: presentableReason(rfq.failureReason),
      supplierName: supplier?.name ?? "Unknown supplier",
      supplierDomain: supplier?.domain ?? "",
      email: contact?.email ?? null,
      verification: contact?.verification ?? "unverified",
    };
  });
}
