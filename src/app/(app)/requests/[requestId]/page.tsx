import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { LiveRefresh } from "@/components/requests/live-refresh";
import { RequestHeader } from "@/components/requests/request-header";
import { Timeline } from "@/components/requests/timeline";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HOME_PATH } from "@/lib/auth/constants";
import type { RequestStatus } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/db/server";
import { getRequestDetail, type RequestDetail } from "@/lib/requests/queries";

export const metadata: Metadata = { title: "Request · Quotebook" };

// Statuses in which the machine is still working, so the page keeps itself
// current. `awaiting_approval` and `decided` wait on a person and stay still.
const IN_FLIGHT: RequestStatus[] = ["extracting", "discovering", "collecting"];

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
  const { request, lineItems, events } = detail;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <LiveRefresh active={IN_FLIGHT.includes(request.status)} />
      {/* Confirmed-quote count comes from the board, which arrives in Phase 2. */}
      <RequestHeader request={request} lineItems={lineItems} confirmedCount={0} />
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
