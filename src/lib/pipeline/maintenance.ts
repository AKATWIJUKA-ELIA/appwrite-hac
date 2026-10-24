import "server-only";

import { Query } from "node-appwrite";
import type { ContactRow, RequestRow, RfqRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { db, recordEvent } from "@/lib/db/server";
import { getThread, replyToMessage } from "@/lib/server/agentmail";

const DAY_MS = 24 * 60 * 60 * 1000;
// Follow up 3 days after the RFQ went out, then again at 7. Never a third time.
const CHASE_AFTER_MS = [3 * DAY_MS, 7 * DAY_MS];
// Each tick runs inside one 30-second host request; leave the rest for next time.
const MAX_CHASES_PER_TICK = 10;
// Extraction and discovery finish in well under a minute. A request still in
// one of those states this long after its last write has lost its job.
const STALLED_AFTER_MS = 10 * 60 * 1000;

const CHASE_TEXT =
  "Following up on our request for quotation below — if you are able to quote, a price and lead time is all we need.";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Nudge suppliers that have not replied. The follow-up goes out as a reply on
 * the original thread, so it sits under the RFQ in the supplier's inbox and
 * their answer still matches by thread.
 */
export async function sendDueChaseUps(now = Date.now()): Promise<{ chased: number; failed: number }> {
  const tables = db();
  const { rows } = await tables.listRows<RfqRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.rfqs.id,
    queries: [
      Query.equal("status", "sent"),
      Query.lessThan("chaseCount", CHASE_AFTER_MS.length),
      Query.isNotNull("sentAt"),
      Query.orderAsc("sentAt"),
      Query.limit(100),
    ],
    total: false,
  });
  const due = rows
    .filter((rfq) => rfq.sentAt && rfq.inboxId && rfq.threadId)
    .filter((rfq) => now - Date.parse(rfq.sentAt as string) >= CHASE_AFTER_MS[rfq.chaseCount])
    .slice(0, MAX_CHASES_PER_TICK);

  let chased = 0;
  let failed = 0;
  for (const rfq of due) {
    // Claim first, atomically: the increment is capped at the count this tick
    // read plus one, so if an overlapping tick already claimed this follow-up
    // the database refuses the second increment and this tick skips it.
    try {
      await tables.incrementRowColumn({
        databaseId: DATABASE_ID,
        tableId: TABLES.rfqs.id,
        rowId: rfq.$id,
        column: "chaseCount",
        value: 1,
        max: rfq.chaseCount + 1,
      });
    } catch {
      continue;
    }
    await tables.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.rfqs.id,
      rowId: rfq.$id,
      data: { lastChasedAt: new Date(now).toISOString() },
    });
    try {
      const { lastMessageId } = await getThread(rfq.inboxId as string, rfq.threadId as string);
      if (!lastMessageId) throw new Error("thread has no messages");
      await replyToMessage({ inboxId: rfq.inboxId as string, messageId: lastMessageId, text: CHASE_TEXT });

      const [request, contact] = await Promise.all([
        tables.getRow<RequestRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.requests.id,
          rowId: rfq.requestId,
          queries: [Query.select(["$id", "userId"])],
        }),
        rfq.contactId
          ? tables.getRow<ContactRow>({ databaseId: DATABASE_ID, tableId: TABLES.contacts.id, rowId: rfq.contactId })
          : Promise.resolve(null),
      ]);
      await recordEvent({
        requestId: rfq.requestId,
        ownerId: request.userId,
        kind: "rfq.chased",
        message: `Followed up with ${contact?.email ?? "the supplier"}.`,
      });
      chased++;
    } catch (error) {
      // A failed nudge is not worth failing the RFQ over; it already sent once.
      // Give the claim back so the next tick tries again.
      console.error(`[chase] rfq ${rfq.$id} failed: ${errorText(error)}`);
      await tables
        .updateRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.rfqs.id,
          rowId: rfq.$id,
          data: { chaseCount: rfq.chaseCount, lastChasedAt: rfq.lastChasedAt },
        })
        .catch(() => {});
      failed++;
    }
  }
  return { chased, failed };
}

/**
 * Requests whose extraction or discovery job died (a host restart mid-run)
 * would otherwise sit at "Reading request" or "Finding suppliers" forever.
 * They are marked failed with a reason, so the buyer sees Retry. They are not
 * re-run automatically: a retry spends model and search credits, and that is
 * the buyer's call.
 */
export async function failStalledRequests(now = Date.now()): Promise<{ stalled: number }> {
  const tables = db();
  const { rows } = await tables.listRows<RequestRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.requests.id,
    queries: [
      Query.equal("status", ["extracting", "discovering"]),
      Query.lessThan("$updatedAt", new Date(now - STALLED_AFTER_MS).toISOString()),
      Query.limit(50),
    ],
    total: false,
  });
  for (const request of rows) {
    const step = request.status === "extracting" ? "Reading the request" : "Supplier search";
    const reason = `${step} stopped without finishing. Nothing was lost; try again.`;
    await tables.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: request.$id,
      data: { status: "failed", failureReason: reason },
    });
    await recordEvent({
      requestId: request.$id,
      ownerId: request.userId,
      kind: "request.stalled",
      message: reason,
    });
  }
  return { stalled: rows.length };
}
