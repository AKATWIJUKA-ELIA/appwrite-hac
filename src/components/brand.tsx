import { cn } from "@/lib/utils";

const MARK_SIZES = {
  sm: "size-8 rounded-lg text-base",
  lg: "size-28 rounded-3xl text-6xl shadow-lg shadow-primary/20",
};

// The Quotebook mark: a bold "Q" on the primary tile. Colours come from the
// theme tokens, so it follows light and dark mode with everything else.
export function BrandMark({
  size = "sm",
  className,
}: Readonly<{ size?: keyof typeof MARK_SIZES; className?: string }>) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-primary font-bold text-primary-foreground",
        MARK_SIZES[size],
        className,
      )}
    >
      Q
    </span>
  );
}

export function Brand({ className }: Readonly<{ className?: string }>) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="grid leading-tight">
        <span className="font-semibold tracking-tight">Quotebook</span>
        <span className="truncate text-xs text-muted-foreground">procurement, answered</span>
      </span>
    </span>
  );
}
