import "server-only";

import { Query } from "node-appwrite";
import type { EventRow, LineItemRow, QuoteRow, RequestRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { db, plain, requireOwnedRequest } from "@/lib/db/server";
import { requireUser } from "@/lib/auth/session";
import { loadBoard, type BoardRow } from "@/lib/requests/board";
import { loadRecipients, type Recipient } from "@/lib/requests/recipients";
import { loadReviewQueue, type HeldReply } from "@/lib/requests/review";
import { loadRecommendation, type RecommendationView } from "@/lib/requests/recommendation";
import { loadAwardSummary, type AwardSummary } from "@/lib/requests/award";

export type RequestSummary = Pick<RequestRow, "$id" | "$createdAt" | "title" | "status"> & {
  confirmedQuotes: number;
};

/**
 * The signed-in buyer's requests, newest first, for the history sidebar.
 * Scoped by the (userId, $createdAt) index, never filtered after the fact.
 */
export async function listMyRequests(limit = 30): Promise<RequestSummary[]> {
  const user = await requireUser();
  const tables = db();
  const { rows } = await tables.listRows<RequestRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.requests.id,
    queries: [
      Query.equal("userId", user.$id),
      Query.orderDesc("$createdAt"),
      Query.limit(Math.min(limit, 100)),
      Query.select(["$id", "$createdAt", "title", "status"]),
    ],
    total: false,
  });
  if (rows.length === 0) return [];

  // Confirmed-reply count per request, so the history shows at a glance which
  // one a supplier actually answered. One query for the whole list.
  const { rows: confirmed } = await tables.listRows<QuoteRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.quotes.id,
    queries: [
      Query.equal(
        "requestId",
        rows.map((r) => r.$id),
      ),
      Query.equal("source", "emailed"),
      Query.isNull("supersededBy"),
      Query.select(["requestId"]),
      Query.limit(500),
    ],
    total: false,
  });
  const counts = new Map<string, number>();
  for (const quote of confirmed) counts.set(quote.requestId, (counts.get(quote.requestId) ?? 0) + 1);

  return rows.map((r) => ({
    $id: r.$id,
    $createdAt: r.$createdAt,
    title: r.title,
    status: r.status,
    confirmedQuotes: counts.get(r.$id) ?? 0,
  }));
}

export type RequestDetail = {
  request: RequestRow;
  lineItems: LineItemRow[];
  events: EventRow[];
  board: BoardRow[];
  recipients: Recipient[];
  held: HeldReply[];
  recommendation: RecommendationView | null;
  award: AwardSummary | null;
};

/** Everything the request page shows. Throws UserFacingError if not the caller's. */
export async function getRequestDetail(requestId: string): Promise<RequestDetail> {
  const { request } = await requireOwnedRequest(requestId);
  const tables = db();
  const [lineItems, events, board, recipients, held, recommendation, award] = await Promise.all([
    tables.listRows<LineItemRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.lineItems.id,
      queries: [Query.equal("requestId", requestId), Query.orderAsc("$createdAt"), Query.limit(50)],
      total: false,
    }),
    tables.listRows<EventRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.events.id,
      queries: [Query.equal("requestId", requestId), Query.orderDesc("$createdAt"), Query.limit(30)],
      total: false,
    }),
    loadBoard(requestId),
    loadRecipients(requestId),
    loadReviewQueue(requestId),
    loadRecommendation(requestId),
    loadAwardSummary(request),
  ]);
  // Plain data only: this goes straight into client components.
  return plain({ request, lineItems: lineItems.rows, events: events.rows, board, recipients, held, recommendation, award });
}
