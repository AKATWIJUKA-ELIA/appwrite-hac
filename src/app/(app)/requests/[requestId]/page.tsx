import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Award } from "@/components/requests/award";
import { Board } from "@/components/requests/board";
import { ConversationsPanel, type ThreadSummary } from "@/components/requests/conversation";
import { LiveRefresh } from "@/components/requests/live-refresh";
import { Recommendation } from "@/components/requests/recommendation";
import { RequestDetails, RequestHeader } from "@/components/requests/request-header";
import { RequestRealtime } from "@/components/requests/request-realtime";
import { RequestWorkspace } from "@/components/requests/request-workspace";
import { ReviewQueue } from "@/components/requests/review-queue";
import { SendGate } from "@/components/requests/send-gate";
import { ActivitySheet } from "@/components/requests/timeline";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HOME_PATH } from "@/lib/auth/constants";
import type { RequestStatus } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/db/server";
import { getRequestDetail, type RequestDetail } from "@/lib/requests/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Request · Quotebook" };

// Fallback polling, on top of Realtime (RequestRealtime), for the two steps
// the buyer actually sits and watches. Each refresh costs a dozen database
// reads, so it is brief: extraction and discovery finish in well under a
// minute. Replies arrive through Realtime alone, however long they take.
const REFRESH: Partial<Record<RequestStatus, { intervalMs: number; maxDurationMs: number }>> = {
  extracting: { intervalMs: 3_000, maxDurationMs: 3 * 60_000 },
  discovering: { intervalMs: 3_000, maxDurationMs: 3 * 60_000 },
};

export default async function RequestPage({
  params,
}: Readonly<{ params: Promise<{ requestId: string }> }>) {
  const { requestId } = await params;

  let detail: RequestDetail;
  try {
    detail = await getRequestDetail(requestId);
  } catch (err) {
    if (err instanceof UserFacingError) return <RequestNotFound />;
    throw err;
  }
  const { request, lineItems, events, board, recipients, held, recommendation, award } = detail;
  const confirmedCount = board.filter((row) => row.track === "confirmed").length;

  // One conversation per supplier actually emailed, with the figures read
  // from a confirmed reply so they can be checked against the thread.
  const boardByRfq = new Map(board.filter((row) => row.rfqId).map((row) => [row.rfqId as string, row]));
  const threads: ThreadSummary[] = recipients
    .filter((r) => r.status === "sent" || r.status === "replied")
    .map((r) => {
      const row = boardByRfq.get(r.rfqId);
      return {
        rfqId: r.rfqId,
        supplierName: r.supplierName,
        email: r.email,
        status: r.status,
        sentAt: r.sentAt,
        repliedAt: r.repliedAt,
        readAs:
          row?.track === "confirmed" && row.totalMinor !== null && row.currency
            ? {
                totalMinor: row.totalMinor,
                currency: row.currency,
                vatIncluded: row.vatIncluded,
                leadTimeDays: row.leadTimeDays,
                warrantyMonths: row.warrantyMonths,
              }
            : null,
      };
    });
  const hasConversations = threads.length > 0;

  // Panels shared by several steps.
  const board$ = <Board rows={board} multiItem={lineItems.length > 1} />;
  // Held replies explain why a supplier who wrote back still reads "awaiting".
  const held$ = <ReviewQueue held={held} />;
  const award$ = (
    <Award
      requestId={request.$id}
      award={award}
      recommendedQuoteId={recommendation?.quoteId ?? null}
      options={board.flatMap((row) =>
        row.track === "confirmed" && row.quoteId && row.totalMinor !== null && row.currency
          ? [{ quoteId: row.quoteId, supplierName: row.supplierName, totalMinor: row.totalMinor, currency: row.currency }]
          : [],
      )}
    />
  );

  return (
    <div className={cn("mx-auto w-full space-y-4", hasConversations ? "max-w-7xl" : "max-w-5xl")}>
      {/* Live updates: Realtime pushes every new event for this request. The
          short polling while reading and searching is a fallback only. */}
      <RequestRealtime requestId={request.$id} />
      <LiveRefresh
        key={request.status}
        intervalMs={REFRESH[request.status]?.intervalMs ?? null}
        maxDurationMs={REFRESH[request.status]?.maxDurationMs ?? 0}
      />
      <RequestHeader request={request} confirmedCount={confirmedCount} actions={<ActivitySheet events={events} />} />
      <div className={cn("gap-4", hasConversations && "grid lg:grid-cols-[minmax(0,1fr)_24rem]")}>
        <div className="min-w-0">
          <RequestWorkspace
            status={request.status}
            quotesIn={confirmedCount}
            awaiting={board.filter((row) => row.track === "awaiting").length}
            hasLineItems={lineItems.length > 0}
            panels={{
              read: <RequestDetails request={request} lineItems={lineItems} />,
              find: board$,
              // Hidden while discovery is still adding suppliers, so nobody
              // approves a list that is about to change under them.
              approve:
                request.status === "discovering" || request.status === "extracting" ? undefined : (
                  <>
                    <SendGate requestId={request.$id} recipients={recipients} />
                    {board$}
                  </>
                ),
              collect: (
                <>
                  {held$}
                  {board$}
                  <Recommendation requestId={request.$id} recommendation={recommendation} rows={board} />
                </>
              ),
              award: (
                <>
                  {held$}
                  {award$}
                  {recommendation && (
                    <Recommendation requestId={request.$id} recommendation={recommendation} rows={board} />
                  )}
                </>
              ),
            }}
          />
          {/* On narrow screens the conversations follow the step's panel. */}
          {hasConversations && (
            <div className="mt-4 lg:hidden">
              <ConversationsPanel threads={threads} />
            </div>
          )}
        </div>
        {hasConversations && (
          <aside className="hidden lg:block">
            <div className="sticky top-4">
              <ConversationsPanel threads={threads} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function RequestNotFound() {
  return (
    <div className="mx-auto w-full max-w-5xl py-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <FileQuestion className="size-8 text-muted-foreground/50" />
          <div>
            <p className="font-medium">That request no longer exists</p>
            <p className="text-sm text-muted-foreground">
              It may have been removed, or the link may be wrong.
            </p>
          </div>
          <Link href={HOME_PATH} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft />
            Start a new request
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
