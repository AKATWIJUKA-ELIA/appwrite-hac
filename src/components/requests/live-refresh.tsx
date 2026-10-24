"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Re-renders the page from the server on an interval while the request is
 * being worked on, so it fills in without a manual reload.
 *
 * Every refresh re-reads the request from the database, and an Appwrite plan
 * counts those reads. So refreshing is bounded three ways: it pauses while the
 * tab is hidden, it runs only for `maxDurationMs` per page view (a forgotten
 * tab must not poll for hours), and the interval is chosen per status by the
 * caller. Once it stops, a button offers a manual refresh.
 */
export function LiveRefresh({
  intervalMs,
  maxDurationMs,
}: Readonly<{ intervalMs: number | null; maxDurationMs: number }>) {
  const router = useRouter();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (intervalMs === null) return;
    setExpired(false);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > maxDurationMs) {
        clearInterval(timer);
        setExpired(true);
        return;
      }
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, maxDurationMs, router]);

  if (!expired) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span>Live updates paused on this page.</span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => {
          setExpired(false);
          router.refresh();
        }}
      >
        <RefreshCw className="size-3" />
        Refresh
      </Button>
    </div>
  );
}
