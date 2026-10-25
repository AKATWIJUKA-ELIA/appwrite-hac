import "server-only";

import { Query } from "node-appwrite";
import type { ContactRow, RequestRow, RfqRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { emailFailure } from "@/lib/errors";
import { db, recordEvent, withTransaction } from "@/lib/db/server";
import { finalizeRfqBody } from "@/lib/rfq-text";
import { rfqInboxId, sendMessage } from "@/lib/server/agentmail";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Pipeline step 3: send every approved RFQ on a request.
 *
 * Each recipient is isolated: one failure is recorded against its own RFQ,
 * with the reason, and the rest still go. A failed RFQ keeps its approval, so
 * Retry sends it again without asking the buyer to re-tick it.
 */
export async function sendApproved(requestId: string, onlyRfqId?: string): Promise<void> {
  const tables = db();
  const request = await tables.getRow<RequestRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.requests.id,
    rowId: requestId,
  });
  const { rows: rfqs } = await tables.listRows<RfqRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.rfqs.id,
    queries: [
      Query.equal("requestId", requestId),
      Query.equal("status", "approved"),
      // A single-supplier retry sends that one and leaves the rest untouched.
      ...(onlyRfqId ? [Query.equal("$id", onlyRfqId)] : []),
      Query.limit(50),
    ],
    total: false,
  });
  if (rfqs.length === 0) return;

  const contactIds = rfqs.flatMap((rfq) => (rfq.contactId ? [rfq.contactId] : []));
  const { rows: contacts } = contactIds.length
    ? await tables.listRows<ContactRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.contacts.id,
        queries: [Query.equal("$id", contactIds), Query.limit(contactIds.length)],
        total: false,
      })
    : { rows: [] as ContactRow[] };
  const emailFor = new Map(contacts.map((c) => [c.$id, c.email]));

  let inboxId: string;
  try {
    inboxId = rfqInboxId();
    if (!process.env.AGENTMAIL_API_KEY) throw new Error("AGENTMAIL_API_KEY is not set");
  } catch (error) {
    for (const rfq of rfqs) {
      console.error(`[send] email not configured: ${errorText(error)}`);
      await markRfqFailed(request, rfq, emailFailure(error, "this supplier"));
    }
    return;
  }

  for (const rfq of rfqs) {
    const email = rfq.contactId ? emailFor.get(rfq.contactId) : undefined;
    if (!email) {
      await markRfqFailed(request, rfq, "This supplier no longer has an email address. Add one and retry.");
      continue;
    }
    try {
      const sent = await sendMessage({
        inboxId,
        to: email,
        subject: rfq.subject,
        text: finalizeRfqBody(rfq.body, process.env.RFQ_POSTAL_ADDRESS),
        labels: ["rfq", `request:${requestId}`],
      });
      await withTransaction(async (transactionId) => {
        await tables.updateRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.rfqs.id,
          rowId: rfq.$id,
          data: {
            status: "sent",
            sentAt: new Date().toISOString(),
            inboxId,
            threadId: sent.threadId ?? null,
            outboundId: sent.messageId ?? null,
            failureReason: null,
          },
          transactionId,
        });
        await recordEvent({
          requestId,
          ownerId: request.userId,
          kind: "rfq.sent",
          message: `RFQ sent to ${email}`,
          transactionId,
        });
      });
    } catch (error) {
      // The provider's raw answer goes to the log; the buyer reads a sentence.
      console.error(`[send] to ${email} failed: ${errorText(error)}`);
      await markRfqFailed(request, rfq, emailFailure(error, email));
    }
  }
}

async function markRfqFailed(request: RequestRow, rfq: RfqRow, reason: string): Promise<void> {
  await withTransaction(async (transactionId) => {
    await db().updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.rfqs.id,
      rowId: rfq.$id,
      data: { status: "failed", failureReason: reason.slice(0, 2000) },
      transactionId,
    });
    await recordEvent({
      requestId: request.$id,
      ownerId: request.userId,
      kind: "rfq.send_failed",
      message: reason.slice(0, 500),
      transactionId,
    });
  });
}
