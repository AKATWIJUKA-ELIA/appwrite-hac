"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ContactVerification, RequestStatus, RfqStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import {
  RFQ_STATUS_LABEL,
  STATUS_COPY,
  TRACK_COPY,
  VERIFICATION_COPY,
  type BoardTrack,
  type Tone,
} from "@/lib/vocabulary";

const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  busy: "bg-track-web-bg text-track-web border-track-web/25",
  action: "bg-warning-bg text-warning border-warning/25",
  good: "bg-success-bg text-success border-success/25",
  bad: "bg-destructive/10 text-destructive border-destructive/25",
};

type PillProps = React.ComponentProps<"span"> & { dot?: boolean; pulse?: boolean };

// Spreads the rest props so it can be a tooltip trigger's `render` target.
function Pill({ className, children, dot, pulse, ...props }: PillProps) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full bg-current", pulse && "animate-live")}
        />
      )}
      {children}
    </span>
  );
}

function WithHint({ hint, pill }: Readonly<{ hint: string; pill: React.ReactElement }>) {
  if (!hint) return pill;
  return (
    <Tooltip>
      <TooltipTrigger render={pill} />
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

/** The request's place in the pipeline, in the buyer's words. */
export function StatusBadge({
  status,
  className,
}: Readonly<{ status: RequestStatus; className?: string }>) {
  const entry = STATUS_COPY[status];
  return (
    <WithHint
      hint={entry.hint}
      pill={
        <Pill dot pulse={entry.tone === "busy"} className={cn(TONE[entry.tone], "cursor-help", className)}>
          {entry.label}
        </Pill>
      }
    />
  );
}

const TRACK_TONE: Record<BoardTrack, string> = {
  confirmed: "bg-track-confirmed-bg text-track-confirmed border-track-confirmed/25",
  "web price": "bg-track-web-bg text-track-web border-track-web/25",
  awaiting: "bg-track-awaiting-bg text-track-awaiting border-track-awaiting/25",
  "no price": "bg-track-none-bg text-track-none border-track-none/25",
};

/**
 * How much a price on the board is worth. This is the single most important
 * distinction in the app — a scraped listing and a supplier's own written
 * quote must never look alike.
 */
export function TrackBadge({
  track,
  className,
}: Readonly<{ track: BoardTrack; className?: string }>) {
  const entry = TRACK_COPY[track];
  return (
    <WithHint
      hint={entry.hint}
      pill={
        <Pill dot pulse={track === "awaiting"} className={cn(TRACK_TONE[track], "cursor-help", className)}>
          {entry.label}
        </Pill>
      }
    />
  );
}

const VERIFICATION_TONE: Record<ContactVerification, string> = {
  unverified: "bg-muted text-muted-foreground border-border",
  mx_valid: "bg-success-bg text-success border-success/25",
  mx_invalid: "bg-destructive/10 text-destructive border-destructive/25",
  bounced: "bg-destructive/10 text-destructive border-destructive/25",
};

/** Whether an address we found will actually accept mail. */
export function VerificationBadge({
  verification,
  className,
}: Readonly<{ verification: ContactVerification; className?: string }>) {
  const entry = VERIFICATION_COPY[verification];
  return (
    <WithHint
      hint={entry.hint}
      pill={
        <Pill className={cn(VERIFICATION_TONE[verification], "cursor-help", className)}>
          {entry.label}
        </Pill>
      }
    />
  );
}

const RFQ_TONE: Record<RfqStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  approved: "bg-track-web-bg text-track-web border-track-web/25",
  sent: "bg-track-web-bg text-track-web border-track-web/25",
  replied: "bg-success-bg text-success border-success/25",
  bounced: "bg-destructive/10 text-destructive border-destructive/25",
  cancelled: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/25",
};

export function RfqStatusBadge({
  status,
  className,
}: Readonly<{ status: RfqStatus; className?: string }>) {
  return <Pill className={cn(RFQ_TONE[status], className)}>{RFQ_STATUS_LABEL[status]}</Pill>;
}
