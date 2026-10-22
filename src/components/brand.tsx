import { ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className }: Readonly<{ className?: string }>) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ReceiptText className="size-4" />
      </span>
      Quotebook
    </span>
  );
}
