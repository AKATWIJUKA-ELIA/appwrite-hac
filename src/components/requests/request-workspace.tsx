"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { RequestStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { STATUS_COPY } from "@/lib/vocabulary";

const STAGES = [
  { key: "read", label: "Read" },
  { key: "find", label: "Find suppliers" },
  { key: "approve", label: "Your approval" },
  // Quotes arrive and are compared in one place; recommending happens here.
  { key: "collect", label: "Collect & decide" },
  { key: "award", label: "Award" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

type StageState = "done" | "busy" | "yours" | "failed" | "upcoming";

/**
 * Where the request is, as one step of five. While collecting, the step is
 * the machine's until a confirmed quote is in, then the buyer's (compare and
 * recommend). Once decided, the award is next. A failed request sits on the
 * step that failed: Read if nothing was extracted, otherwise Find.
 */
function locate(status: RequestStatus, quotesIn: number, hasLineItems: boolean): { index: number; state: StageState } {
  switch (status) {
    case "draft":
    case "extracting":
      return { index: 0, state: "busy" };
    case "discovering":
      return { index: 1, state: "busy" };
    case "awaiting_approval":
      return { index: 2, state: "yours" };
    case "collecting":
      return { index: 3, state: quotesIn > 0 ? "yours" : "busy" };
    case "decided":
      return { index: 4, state: "yours" };
    case "awarded":
      return { index: 4, state: "done" };
    case "failed":
      return { index: hasLineItems ? 1 : 0, state: "failed" };
  }
}

function hintFor(status: RequestStatus, quotesIn: number, awaiting: number): string {
  if (status === "collecting" && quotesIn > 0) {
    return awaiting === 0
      ? "Every supplier you contacted has replied. Compare the quotes and recommend a supplier below."
      : `${quotesIn} quote${quotesIn === 1 ? "" : "s"} in, ${awaiting} still awaited. You can recommend a supplier now or wait for the rest.`;
  }
  return STATUS_COPY[status].hint;
}

/**
 * The request page's spine: a continuous progress bar across the five steps,
 * and below it only the panel for the selected step. The current step is
 * selected by default (and again whenever the request moves on); any step
 * already reached can be opened to look back.
 */
export function RequestWorkspace({
  status,
  quotesIn,
  awaiting,
  hasLineItems,
  panels,
}: Readonly<{
  status: RequestStatus;
  quotesIn: number;
  awaiting: number;
  hasLineItems: boolean;
  panels: Partial<Record<StageKey, React.ReactNode>>;
}>) {
  const { index: current, state } = locate(status, quotesIn, hasLineItems);
  const currentKey = STAGES[current].key;
  const [selected, setSelected] = useState<StageKey>(currentKey);

  // Follow the request when it moves to a new step (the page refreshes itself
  // while work is in flight), so a finished search lands on the approval.
  useEffect(() => {
    setSelected(currentKey);
  }, [currentKey]);

  const stateOf = (i: number): StageState =>
    i < current || (i === current && state === "done") ? "done" : i === current ? state : "upcoming";
  // The filled part of the track runs to the current marker (all the way once awarded).
  const progress = state === "done" ? 1 : current / (STAGES.length - 1);

  return (
    <div className="space-y-4">
      <nav aria-label="Request progress" className="rounded-xl border bg-card px-3 pt-4 pb-3 shadow-xs sm:px-5">
        <div className="relative">
          {/* Track and fill, from the centre of the first marker to the centre of the last. */}
          <div aria-hidden="true" className="absolute top-3.5 right-[calc(100%/10)] left-[calc(100%/10)] h-1 rounded-full bg-border">
            <div
              className={cn("h-full rounded-full transition-[width] duration-500", state === "failed" ? "bg-destructive/60" : "bg-success")}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <ol className="relative grid grid-cols-5">
            {STAGES.map((stage, i) => {
              const s = stateOf(i);
              const reachable = i <= current;
              const isSelected = stage.key === selected;
              return (
                <li key={stage.key} className="flex justify-center">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => setSelected(stage.key)}
                    aria-current={i === current ? "step" : undefined}
                    className="group flex w-full flex-col items-center gap-1.5 rounded-md pb-1 outline-none disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full border-2 bg-card text-xs font-semibold transition-colors",
                        s === "done" && "border-success bg-success text-white dark:text-background",
                        s === "busy" && "border-track-web text-track-web",
                        s === "yours" && "border-warning bg-warning-bg text-warning",
                        s === "failed" && "border-destructive bg-destructive/10 text-destructive",
                        s === "upcoming" && "border-border text-muted-foreground",
                        isSelected && "ring-4 ring-ring/30",
                        reachable && "group-hover:ring-4 group-hover:ring-ring/20",
                      )}
                    >
                      {s === "done" ? (
                        <Check className="size-3.5" strokeWidth={3} />
                      ) : s === "busy" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : s === "failed" ? (
                        <X className="size-3.5" strokeWidth={3} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        "max-w-full truncate px-0.5 text-[11px] leading-tight sm:text-xs",
                        isSelected ? "font-semibold text-foreground" : reachable ? "text-muted-foreground" : "text-muted-foreground/60",
                      )}
                    >
                      {stage.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <p
          className={cn(
            "mt-2 border-t pt-2 text-center text-xs",
            state === "yours" ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {hintFor(status, quotesIn, awaiting)}
        </p>
      </nav>

      <div className="space-y-4">
        {panels[selected] ?? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing to show for this step yet.
          </p>
        )}
      </div>
    </div>
  );
}
