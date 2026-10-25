"use server";

import type { RfqRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { actionError, db, isNotFound, recordEvent, requireOwnedRequest, UserFacingError } from "@/lib/db/server";
import { getThread, replyToMessage, type ThreadMessage } from "@/lib/server/agentmail";

const MAX_REPLY_CHARS = 5_000;

export type Conversation = {
  supplierName: string;
  supplierEmail: string | null;
  messages: ThreadMessage[];
};

/**
 * The RFQ behind a conversation, checked against its request's owner. A
 * thread only exists once the RFQ has actually been sent.
 */
async function requireConversation(rfqId: string) {
  let rfq: RfqRow;
  try {
    rfq = await db().getRow<RfqRow>({ databaseId: DATABASE_ID, tableId: TABLES.rfqs.id, rowId: rfqId });
  } catch (err) {
    if (isNotFound(err)) throw new UserFacingError("That conversation was not found.");
    throw err;
  }
  const { request } = await requireOwnedRequest(rfq.requestId);
  if (!rfq.inboxId || !rfq.threadId) {
    throw new UserFacingError("Nothing has been sent to this supplier yet, so there is no conversation.");
  }
  const supplier = await db().getRow<SupplierRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.suppliers.id,
    rowId: rfq.supplierId,
  });
  return { rfq: rfq as RfqRow & { inboxId: string; threadId: string }, request, supplier };
}

/**
 * The whole email thread with one supplier, read from AgentMail, which holds
 * every message in it: our request, their replies, and our replies from here.
 */
export async function loadConversation(rfqId: string): Promise<{ error?: string; conversation?: Conversation }> {
  try {
    const { rfq, supplier } = await requireConversation(rfqId);
    const { messages } = await getThread(rfq.inboxId, rfq.threadId);
    const theirs = messages.find((m) => m.direction === "in")?.from ?? messages.find((m) => m.direction === "out")?.to[0];
    return {
      conversation: { supplierName: supplier.name, supplierEmail: theirs ?? null, messages },
    };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Reply to a supplier from the app. It goes out as an email reply on the same
 * thread, so the supplier sees it under their own message, and their answer
 * comes back through the webhook like any other reply.
 */
export async function sendConversationReply(rfqId: string, rawText: string): Promise<{ error?: string }> {
  try {
    const text = rawText.trim();
    if (!text) throw new UserFacingError("Write a message first.");
    if (text.length > MAX_REPLY_CHARS) {
      throw new UserFacingError(`Keep the message under ${MAX_REPLY_CHARS.toLocaleString()} characters.`);
    }
    const { rfq, request, supplier } = await requireConversation(rfqId);
    const { lastMessageId } = await getThread(rfq.inboxId, rfq.threadId);
    if (!lastMessageId) throw new UserFacingError("This conversation has no messages to reply to.");

    await replyToMessage({ inboxId: rfq.inboxId, messageId: lastMessageId, text });
    // The email has gone; nothing after this point may report "not sent".
    // The timeline entry is bookkeeping, so a dropped write is logged only.
    try {
      await recordEvent({
        requestId: rfq.requestId,
        ownerId: request.userId,
        kind: "conversation.reply",
        message: `You replied to ${supplier.name} from Quotebook.`,
      });
    } catch (err) {
      console.error("[conversation] reply sent, timeline entry not recorded", err);
    }
  } catch (err) {
    return actionError(err);
  }
  return {};
}
