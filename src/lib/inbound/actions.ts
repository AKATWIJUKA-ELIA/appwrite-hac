"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { InboundParseRow, RfqRow } from "@/lib/db/rows";
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
import { parseMessage } from "@/lib/pipeline/inbound";

type Result = { error?: string };
const GONE = "That message no longer exists.";

async function loadParse(parseId: string): Promise<InboundParseRow> {
  try {
    return await db().getRow<InboundParseRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.inboundParses.id,
      rowId: parseId,
    });
  } catch (err) {
    if (isNotFound(err)) throw new UserFacingError(GONE);
    throw err;
  }
}

function parseLater(parseId: string) {
  after(async () => {
    try {
      await parseMessage(parseId);
    } catch (err) {
      console.error("[review] parse failed", parseId, err);
    }
  });
}

/**
 * Release a held reply for parsing. Holding an unauthenticated reply is the
 * safe default, not a verdict: a buyer who recognises the sender can let it
 * through, and the normal parse runs from the stored body.
 */
export async function releaseForParsing(parseId: string): Promise<Result> {
  try {
    const parse = await loadParse(parseId);
    // Releasing says "I recognise this sender" and lets its price become a
    // confirmed quote. Only the buyer whose request it answers can say that;
    // a reply matched to no RFQ cannot be released by anyone.
    if (!parse.rfqId) throw new UserFacingError(GONE);
    const rfq = await db().getRow<RfqRow>({ databaseId: DATABASE_ID, tableId: TABLES.rfqs.id, rowId: parse.rfqId });
    await requireOwnedRequest(rfq.requestId);

    if (parse.state === "parsed") throw new UserFacingError("This message has already produced a quote.");
    // Only a message that has finished being read can be sent back. Resetting
    // one mid-parse would start a second read of the same reply.
    if (parse.state !== "needs_review" && parse.state !== "not_a_quote") {
      throw new UserFacingError("This message is already being read.");
    }
    if (!parse.text) throw new UserFacingError("The message body was not stored, so it cannot be re-read.");

    await db().updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.inboundParses.id,
      rowId: parseId,
      data: { state: "received", reason: null },
    });
    parseLater(parseId);
    revalidatePath(`/requests/${rfq.requestId}`);
  } catch (err) {
    return actionError(err);
  }
  return {};
}

/**
 * Attach a reply we could not match to the RFQ the buyer says it answers, and
 * read it for a price. Choosing the supplier is the buyer's judgement call,
 * the same one release asks for, so it goes straight to parsing.
 */
export async function linkToRfq(parseId: string, rfqId: string): Promise<Result> {
  try {
    const parse = await loadParse(parseId);
    if (!parse.candidateRequestId || parse.rfqId || parse.state !== "needs_review") {
      throw new UserFacingError("That message cannot be linked.");
    }
    const { request } = await requireOwnedRequest(parse.candidateRequestId);

    let rfq: RfqRow;
    try {
      rfq = await db().getRow<RfqRow>({ databaseId: DATABASE_ID, tableId: TABLES.rfqs.id, rowId: rfqId });
    } catch (err) {
      if (isNotFound(err)) throw new UserFacingError("That supplier is not part of this request.");
      throw err;
    }
    if (rfq.requestId !== parse.candidateRequestId) {
      throw new UserFacingError("That supplier is not part of this request.");
    }
    if (rfq.status !== "sent" && rfq.status !== "replied") {
      throw new UserFacingError("That supplier has not been sent a request yet.");
    }
    if (!parse.text) throw new UserFacingError("The message body was not stored, so it cannot be read.");

    await withTransaction(async (transactionId) => {
      await db().updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.inboundParses.id,
        rowId: parseId,
        data: { rfqId, state: "received", reason: null },
        transactionId,
      });
      // Record the reply's thread on the RFQ, so later messages match by thread.
      await db().updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.rfqs.id,
        rowId: rfqId,
        data: { status: "replied", repliedAt: new Date().toISOString(), threadId: parse.threadId ?? rfq.threadId },
        transactionId,
      });
      await recordEvent({
        requestId: rfq.requestId,
        ownerId: request.userId,
        kind: "reply.linked",
        message: `Reply from ${parse.fromAddress ?? "a supplier"} linked to an RFQ by the buyer.`,
        transactionId,
      });
    });
    parseLater(parseId);
    revalidatePath(`/requests/${rfq.requestId}`);
  } catch (err) {
    return actionError(err);
  }
  return {};
}
