import { cn } from "@/lib/utils";

// The four tracks a supplier's row can be on. Colours come from the
// --track-* tokens in globals.css so every board, badge and legend agrees.
export type Track = "confirmed" | "web" | "awaiting" | "none";

const STYLES: Record<Track, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-track-confirmed-bg text-track-confirmed" },
  web: { label: "Web price", className: "bg-track-web-bg text-track-web" },
  awaiting: { label: "Awaiting reply", className: "bg-track-awaiting-bg text-track-awaiting" },
  none: { label: "No price", className: "bg-track-none-bg text-track-none" },
};

export function TrackBadge({ track, className }: Readonly<{ track: Track; className?: string }>) {
  const { label, className: tone } = STYLES[track];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
