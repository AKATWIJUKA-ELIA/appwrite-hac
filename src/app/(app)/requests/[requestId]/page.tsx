import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Board } from "@/components/requests/board";
import { LiveRefresh } from "@/components/requests/live-refresh";
import { Recommendation } from "@/components/requests/recommendation";
import { RequestHeader } from "@/components/requests/request-header";
import { ReviewQueue } from "@/components/requests/review-queue";
import { SendGate } from "@/components/requests/send-gate";
import { Timeline } from "@/components/requests/timeline";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HOME_PATH } from "@/lib/auth/constants";
import type { RequestStatus } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/db/server";
import { getRequestDetail, type RequestDetail } from "@/lib/requests/queries";

export const metadata: Metadata = { title: "Request · Quotebook" };

// How the page keeps itself current, per status. Each refresh costs a dozen
// database reads, so this is a budget, not a nicety. Extraction and discovery
// finish in well under a minute: refresh fast, briefly. Replies take hours or
// days: check occasionally while someone is looking. Statuses that wait on a
// person (approval, decided, failed) never poll.
const REFRESH: Partial<Record<RequestStatus, { intervalMs: number; maxDurationMs: number }>> = {
  extracting: { intervalMs: 3_000, maxDurationMs: 3 * 60_000 },
  discovering: { intervalMs: 3_000, maxDurationMs: 3 * 60_000 },
  collecting: { intervalMs: 60_000, maxDurationMs: 15 * 60_000 },
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
  const { request, lineItems, events, board, recipients, held, recommendation } = detail;
  const confirmedCount = board.filter((row) => row.track === "confirmed").length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <LiveRefresh
        key={request.status}
        intervalMs={REFRESH[request.status]?.intervalMs ?? null}
        maxDurationMs={REFRESH[request.status]?.maxDurationMs ?? 0}
      />
      <RequestHeader request={request} lineItems={lineItems} confirmedCount={confirmedCount} />
      <Board rows={board} />
      {/* Held replies sit directly under the board: they are the reason a row
          still reads "awaiting" when a supplier has in fact written back. */}
      <ReviewQueue held={held} />
      {/* Hidden while discovery is still adding suppliers, so nobody approves
          a list that is about to change under them. */}
      {request.status !== "discovering" && request.status !== "extracting" && (
        <SendGate requestId={request.$id} recipients={recipients} />
      )}
      <Recommendation requestId={request.$id} recommendation={recommendation} rows={board} />
      <Timeline events={events} />
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
