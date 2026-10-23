import { Check, Loader2 } from "lucide-react";
import type { RequestStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { STATUS_COPY } from "@/lib/vocabulary";

/**
 * Where the request is in the pipeline.
 *
 * Procurement work happens over hours and days, not seconds. Someone returning
 * to a tab needs to see at a glance whether the machine is still working, or
 * whether it is waiting on *them* — which is the single most common reason a
 * request sits untouched.
 */
const STAGES = [
  { key: "read", label: "Read" },
  { key: "find", label: "Find suppliers" },
  { key: "approve", label: "Your approval" },
  { key: "collect", label: "Collect quotes" },
  { key: "decide", label: "Decide" },
] as const;

// Index of the stage a status sits in. Everything before it is done.
const ORDER: Partial<Record<RequestStatus, number>> = {
  draft: -1,
  extracting: 0,
  discovering: 1,
  awaiting_approval: 2,
  collecting: 3,
  decided: 4,
};

export function PipelineProgress({ status }: Readonly<{ status: RequestStatus }>) {
  if (status === "failed" || status === "draft") return null;

  const current = ORDER[status] ?? -1;
  const busy = STATUS_COPY[status].tone === "busy";
  const needsYou = status === "awaiting_approval";

  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {STAGES.map((stage, index) => {
          const done = index < current || status === "decided";
          const active = index === current && status !== "decided";

          return (
            <li key={stage.key} className="flex items-center gap-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  done && "border-success/25 bg-success-bg text-success",
                  active && !needsYou && "border-track-web/25 bg-track-web-bg text-track-web",
                  active && needsYou && "border-warning/30 bg-warning-bg text-warning",
                  !done && !active && "border-border text-muted-foreground/70",
                )}
              >
                {done ? (
                  <Check className="size-3" />
                ) : active && busy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                )}
                {stage.label}
              </span>
              {index < STAGES.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn("h-px w-3", index < current ? "bg-success/40" : "bg-border")}
                />
              )}
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-muted-foreground">{STATUS_COPY[status].hint}</p>
    </div>
  );
}
