import "server-only";

import { Query } from "node-appwrite";
import type { ContactRow, RequestRow, RfqRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { db, recordEvent, withTransaction } from "@/lib/db/server";

const EMAIL = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

/**
 * The recipients a delivery-failure notice (a bounce) is about, or null when
 * the message is not one. Bounces come from the mail system itself
 * (mailer-daemon, postmaster) and carry delivery-status fields such as
 * "Final-Recipient"; they are never a supplier's reply.
 */
export function bouncedRecipients(from: string, text: string, ownInbox: string): string[] | null {
  const fromSystem = /mailer-daemon|postmaster|mail delivery (sub)?system/i.test(from);
  const statusReport = /Final-Recipient:|Delivery Status Notification|Undeliver(able|ed)|could not be delivered|delivery (to the following recipients? )?(has )?failed|error occurred while trying to deliver/i.test(text);
  if (!fromSystem && !statusReport) return null;

  const finals = [...text.matchAll(/Final-Recipient:\s*rfc822;\s*<?([^\s>]+@[^\s>]+)>?/gi)].map((m) => m[1].toLowerCase());
  const addresses = finals.length > 0 ? finals : [...text.matchAll(EMAIL)].map((m) => m[0].toLowerCase());
  const own = ownInbox.toLowerCase();
  const recipients = [...new Set(addresses)].filter(
    (a) => a !== own && !/mailer-daemon|postmaster|amazonses\.com$|agentmail\.to$/i.test(a),
  );
  return fromSystem || recipients.length > 0 ? recipients : null;
}

/**
 * Mark the RFQs to a bounced address as bounced, and the address itself, so
 * the buyer sees why a supplier never answered and can change the address
 * and retry. Returns the request the bounce belongs to (for the notice row's
 * permissions), when there is exactly one.
 */
export async function markBounced(recipients: string[], inboxId: string | undefined): Promise<RequestRow | null> {
  if (recipients.length === 0) return null;
  const tables = db();
  const { rows: contacts } = await tables.listRows<ContactRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.contacts.id,
    queries: [Query.equal("email", recipients), Query.limit(20)],
    total: false,
  });
  if (contacts.length === 0) return null;

  const { rows: rfqs } = await tables.listRows<RfqRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.rfqs.id,
    queries: [
      Query.equal("contactId", contacts.map((c) => c.$id)),
      Query.equal("status", ["sent", "replied"]),
      ...(inboxId ? [Query.equal("inboxId", inboxId)] : []),
      Query.limit(20),
    ],
    total: false,
  });

  let owner: RequestRow | null = null;
  for (const rfq of rfqs) {
    const contact = contacts.find((c) => c.$id === rfq.contactId);
    const request = await tables.getRow<RequestRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: rfq.requestId,
      queries: [Query.select(["$id", "userId"])],
    });
    owner = owner ?? request;
    const reason = `The email to ${contact?.email ?? "this supplier"} bounced: their mail server refused it. Use another address and retry.`;
    await withTransaction(async (transactionId) => {
      await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.rfqs.id,
        rowId: rfq.$id,
        data: { status: "bounced", failureReason: reason },
        transactionId,
      });
      await recordEvent({
        requestId: rfq.requestId,
        ownerId: request.userId,
        kind: "rfq.bounced",
        message: `The email to ${contact?.email ?? "a supplier"} bounced; their mail server refused it.`,
        transactionId,
      });
    });
  }
  for (const contact of contacts) {
    await tables
      .updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.contacts.id,
        rowId: contact.$id,
        data: { verification: "bounced", verifiedAt: new Date().toISOString() },
      })
      .catch((err) => console.error("[bounce] contact not updated", err));
  }
  return owner;
}
