"use client";

import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { EventRow } from "@/lib/db/rows";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// The audit trail speaks in event kinds; a dot colour is the fastest way to
// read "this went wrong" without parsing every line.
function toneFor(kind: string): string {
  if (kind.includes("failed") || kind.includes("cancelled") || kind.includes("stalled")) return "bg-destructive";
  if (kind.includes("confirmed") || kind.includes("recommendation") || kind.includes("award")) return "bg-success";
  if (kind.includes("review") || kind.includes("unauthenticated")) return "bg-warning";
  return "bg-muted-foreground/40";
}

/**
 * The request's audit trail, in a panel that slides in from the right. It
 * narrates every step the request took, but it is reference material, so it
 * stays off the main page until asked for.
 */
export function ActivitySheet({ events }: Readonly<{ events: EventRow[] }>) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" />}>
        <Activity className="size-3.5" />
        Activity
        {events.length > 0 && <span className="tabular text-muted-foreground">{events.length}</span>}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            Activity
          </SheetTitle>
          <SheetDescription>Every step this request has taken, newest first.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing has happened yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l pl-5">
              {events.map((event) => (
                <li key={event.$id} className="relative">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-1.5 -left-[1.4rem] size-2 rounded-full ring-4 ring-background",
                      toneFor(event.kind),
                    )}
                  />
                  <p className="text-sm leading-snug">{event.message}</p>
                  <p className="tabular mt-0.5 text-xs text-muted-foreground">{formatTime(event.$createdAt)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
