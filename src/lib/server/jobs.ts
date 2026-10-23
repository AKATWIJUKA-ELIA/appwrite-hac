import "server-only";

import { after } from "next/server";
import { recordEvent, db } from "@/lib/db/server";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";

// Replaces Convex's scheduler and workflow component. The request's status is
// the queue: each step reads it, does one job, and moves it on. A step runs
// after the response is sent, so the buyer's click returns immediately, and a
// step that dies is never silent: the request is marked failed with the reason,
// the timeline says so, and the Retry button resumes from that stage. The cron
// tick re-runs anything that stalls without failing (a killed process).

/**
 * Run `work` for a request once the current response has been sent. Any
 * throw marks the request failed rather than disappearing into a log.
 */
export function runStep(
  step: string,
  request: { id: string; ownerId: string },
  work: () => Promise<void>,
): void {
  after(async () => {
    try {
      await work();
    } catch (err) {
      await markRequestFailed(step, request, err);
    }
  });
}

export async function markRequestFailed(
  step: string,
  request: { id: string; ownerId: string },
  err: unknown,
): Promise<void> {
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`[step:${step}] request ${request.id} failed:`, reason);
  try {
    await db().updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: request.id,
      data: { status: "failed", failureReason: `${step}: ${reason}`.slice(0, 2000) },
    });
    await recordEvent({
      requestId: request.id,
      ownerId: request.ownerId,
      kind: `${step}.failed`,
      message: reason.slice(0, 500),
    });
  } catch (writeErr) {
    // The database itself is unreachable. Nothing more can be recorded; the
    // cron tick's stalled-request sweep will pick this request up again.
    console.error(`[step:${step}] could not record failure for ${request.id}`, writeErr);
  }
}
