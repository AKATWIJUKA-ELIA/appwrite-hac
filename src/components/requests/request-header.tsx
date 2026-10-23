"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Loader2, MapPin, RotateCcw, Wallet } from "lucide-react";
import { PipelineProgress } from "@/components/requests/pipeline-progress";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LineItemRow, RequestRow } from "@/lib/db/rows";
import { formatMoney } from "@/lib/format";
import { retryRequest } from "@/lib/requests/actions";

// The extractor sometimes files a delivery or commercial fact under `specs`.
// Those already have their own cards, and showing "deliveryLocation: Kampala"
// beside "cpu: i7" reads as a hardware specification, which it is not.
const NON_PRODUCT_SPEC =
  /^(delivery|deliver|location|destination|budget|currency|leadtime|lead_time|quantity)/i;

function productSpecs(specs: string | null): [string, string][] {
  if (!specs) return [];
  try {
    const parsed: unknown = JSON.parse(specs);
    if (typeof parsed !== "object" || parsed === null) return [];
    return Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) =>
      typeof value === "string" && !NON_PRODUCT_SPEC.test(key) ? [[key, value]] : [],
    );
  } catch {
    return [];
  }
}

export function RequestHeader({
  request,
  lineItems,
  confirmedCount,
}: Readonly<{
  request: RequestRow;
  lineItems: LineItemRow[];
  confirmedCount: number;
}>) {
  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {request.title}
            </h1>
            <p className="text-sm text-pretty text-muted-foreground">{request.rawText}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusBadge status={request.status} />
            {/* "Waiting on replies" stops being the whole truth the moment one
                arrives. The status stays `collecting` because other suppliers
                may still answer, so the arrival is surfaced beside it. */}
            {confirmedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success">
                {confirmedCount} quote{confirmedCount === 1 ? "" : "s"} in
              </span>
            )}
          </div>
        </div>

        <PipelineProgress status={request.status} />

        {request.status === "failed" && (
          <RetryRequest
            requestId={request.$id}
            reason={request.failureReason ?? "This request failed."}
          />
        )}

        <dl className="grid gap-3 sm:grid-cols-3">
          <Fact icon={MapPin} label="Deliver to" value={request.deliverTo} />
          <Fact
            icon={CalendarClock}
            label="Delivery window"
            value={
              request.deliveryWindowDays === null
                ? "Not stated"
                : `${request.deliveryWindowDays} days`
            }
            muted={request.deliveryWindowDays === null}
          />
          <Fact
            icon={Wallet}
            label="Budget ceiling"
            value={
              request.budgetMinor === null
                ? `Not stated (${request.currency})`
                : formatMoney(request.budgetMinor, request.currency)
            }
            muted={request.budgetMinor === null}
          />
        </dl>

        {lineItems.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Line items
            </h2>
            <ul className="divide-y rounded-lg border">
              {lineItems.map((item) => {
                const specs = productSpecs(item.specs);
                return (
                  <li
                    key={item.$id}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5"
                  >
                    <span className="tabular text-sm font-semibold">
                      {item.quantity.toLocaleString()}
                      {item.unit ? ` ${item.unit}` : " ×"}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">{item.description}</span>
                    {specs.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {specs.map(([key, value]) => (
                          <span
                            key={key}
                            className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {key}: {value}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  muted,
}: Readonly<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
}>) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd className={muted ? "mt-0.5 text-sm text-muted-foreground" : "mt-0.5 text-sm font-medium"}>
        {value}
      </dd>
    </div>
  );
}

/**
 * A failed request is recoverable, not a dead end. The reason is shown in full
 * — a rate limit and a search that found nothing need different responses from
 * the person reading it.
 */
function RetryRequest({ requestId, reason }: Readonly<{ requestId: string; reason: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await retryRequest(requestId);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Retrying this request.");
      router.refresh();
    });
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>This request stopped</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{reason}</p>
        {error && <p className="font-medium">{error}</p>}
        <Button variant="outline" size="sm" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
