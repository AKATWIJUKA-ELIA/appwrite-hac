"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 3000;

/**
 * Re-renders the page from the server every few seconds while `active`, so a
 * request that is still being worked on fills in without a manual reload.
 * Pauses while the tab is hidden; does nothing once the request settles.
 */
export function LiveRefresh({ active }: Readonly<{ active: boolean }>) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  return null;
}
