"use server";

import { revalidatePath } from "next/cache";
import { Query } from "node-appwrite";
import type { CurrentUser } from "@/lib/auth/session";
import type { LineItemRow, QuoteRow, RfqRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import {
  actionError,
  db,
  isNotFound,
  recordEvent,
  requireOwnedRequest,
  UserFacingError,
  withTransaction,
} from "@/lib/db/server";
import { draftDecline, draftPurchaseOrder, poNumberFor, type Buyer } from "@/lib/pipeline/award";
import { getThread, replyToMessage } from "@/lib/server/agentmail";

const MAX_PO_CHARS = 10_000;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const buyerOf = (user: CurrentUser): Buyer => ({
  name: user.name || user.email,
  email: user.email,
  organisation: user.prefs.organisation,
});

/**
 * Everything an award needs, checked: the request is the caller's and not yet
 * awarded, the quote belongs to it and was confirmed by the supplier's reply
 * (a web price cannot be ordered against), and there is a thread to reply on.
 */
async function loadAward(requestId: string, quoteId: string) {
  const { user, request } = await requireOwnedRequest(requestId);
  if (request.status === "awarded") throw new UserFacingError("This request has already been awarded.");

  const tables = db();
  let quote: QuoteRow;
  try {
    quote = await tables.getRow<QuoteRow>({ databaseId: DATABASE_ID, tableId: TABLES.quotes.id, rowId: quoteId });
  } catch (err) {
    if (isNotFound(err)) throw new UserFacingError("That quote was not found.");
    throw err;
  }
  if (quote.requestId !== requestId) throw new UserFacingError("That quote was not found.");
  if (quote.source !== "emailed" || quote.supersededBy) {
    throw new UserFacingError("Only a quote confirmed by the supplier's reply can be awarded.");
  }

  const [{ rows: rfqs }, { rows: lineItems }, supplier] = await Promise.all([
    tables.listRows<RfqRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.rfqs.id,
      queries: [Query.equal("requestId", requestId), Query.limit(50)],
      total: false,
    }),
    tables.listRows<LineItemRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.lineItems.id,
      queries: [Query.equal("requestId", requestId), Query.orderAsc("$createdAt"), Query.limit(50)],
      total: false,
    }),
    tables.getRow<SupplierRow>({ databaseId: DATABASE_ID, tableId: TABLES.suppliers.id, rowId: quote.supplierId }),
  ]);
  const winner = rfqs.find((r) => r.supplierId === quote.supplierId);
  if (!winner?.inboxId || !winner.threadId) {
    throw new UserFacingError("There is no email thread with this supplier to send the order on.");
  }
  // Suppliers who were actually asked and can be told, other than the winner.
  const others = rfqs.filter(
    (r) => r.$id !== winner.$id && (r.status === "sent" || r.status === "replied") && r.inboxId && r.threadId,
  );
  return { user, request, quote, supplier, winner, others, lineItems };
}

export type PurchaseOrderDraft = {
  poNumber: string;
  supplierName: string;
  text: string;
  othersToDecline: string[];
};

/** The PO the buyer reviews and edits before it is sent. Nothing is sent here. */
export async function getPurchaseOrderDraft(
  requestId: string,
  quoteId: string,
): Promise<{ error?: string; draft?: PurchaseOrderDraft }> {
  try {
    const { user, request, quote, supplier, others, lineItems } = await loadAward(requestId, quoteId);
    const poNumber = poNumberFor(request);
    const suppliers = others.length
      ? (
          await db().listRows<SupplierRow>({
            databaseId: DATABASE_ID,
            tableId: TABLES.suppliers.id,
            queries: [Query.equal("$id", others.map((o) => o.supplierId)), Query.limit(others.length)],
            total: false,
          })
        ).rows
      : [];
    return {
      draft: {
        poNumber,
        supplierName: supplier.name,
        text: draftPurchaseOrder({
          poNumber,
          request,
          lineItems,
          quote,
          supplierName: supplier.name,
          buyer: buyerOf(user),
          postalAddress: process.env.RFQ_POSTAL_ADDRESS,
        }),
        othersToDecline: suppliers.map((s) => s.name),
      },
    };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Award the request: send the purchase order as a reply on the winner's
 * thread, record the award, and optionally tell the other suppliers. If the
 * order fails to send, nothing is recorded. Once it has gone, the award is
 * recorded even if a decline note fails.
 */
export async function awardSupplier(
  requestId: string,
  quoteId: string,
  poNumber: string,
  rawText: string,
  declineOthers: boolean,
): Promise<{ error?: string; declined?: number; declineFailed?: number }> {
  let loaded: Awaited<ReturnType<typeof loadAward>>;
  try {
    loaded = await loadAward(requestId, quoteId);
    const text = rawText.trim();
    if (!text) throw new UserFacingError("The purchase order is empty.");
    if (text.length > MAX_PO_CHARS) throw new UserFacingError("The purchase order is too long.");
    if (!/^PO-\d{8}-[A-Z0-9]{5}$/.test(poNumber)) throw new UserFacingError("That PO number is not valid.");

    const { lastMessageId } = await getThread(loaded.winner.inboxId as string, loaded.winner.threadId as string);
    if (!lastMessageId) throw new UserFacingError("The thread with this supplier has no messages to reply to.");
    await replyToMessage({ inboxId: loaded.winner.inboxId as string, messageId: lastMessageId, text });
  } catch (err) {
    return actionError(err);
  }

  const { request, quote, supplier, others, user } = loaded;
  try {
    await withTransaction(async (transactionId) => {
      await db().updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.requests.id,
        rowId: requestId,
        data: { status: "awarded", awardedQuoteId: quote.$id, poNumber, awardedAt: new Date().toISOString() },
        transactionId,
      });
      await recordEvent({
        requestId,
        ownerId: request.userId,
        kind: "award.sent",
        message: `Purchase order ${poNumber} sent to ${supplier.name}.`,
        transactionId,
      });
    });
  } catch (err) {
    console.error("[award] PO sent but the award was not recorded", err);
    return {
      error: `The purchase order was sent to ${supplier.name}, but saving the award failed. Refresh the page; do not send it again.`,
    };
  }

  let declined = 0;
  let declineFailed = 0;
  if (declineOthers) {
    const text = draftDecline({ title: request.title, buyer: buyerOf(user) });
    for (const rfq of others) {
      try {
        const { lastMessageId } = await getThread(rfq.inboxId as string, rfq.threadId as string);
        if (!lastMessageId) throw new Error("thread has no messages");
        await replyToMessage({ inboxId: rfq.inboxId as string, messageId: lastMessageId, text });
        declined++;
      } catch (error) {
        console.error(`[award] decline to rfq ${rfq.$id} failed: ${errorText(error)}`);
        declineFailed++;
      }
    }
    if (declined + declineFailed > 0) {
      await recordEvent({
        requestId,
        ownerId: request.userId,
        kind: "award.declines",
        message: `Told ${declined} other supplier(s) they were not chosen${declineFailed ? `; ${declineFailed} could not be reached` : ""}.`,
      }).catch((err) => console.error("[award] decline event not recorded", err));
    }
  }

  revalidatePath(`/requests/${requestId}`);
  return { declined, declineFailed };
}

