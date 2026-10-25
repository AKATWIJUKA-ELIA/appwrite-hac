"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Channel, Client, Query } from "appwrite";
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from "@/lib/appwrite/client";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import { getRealtimeToken } from "@/lib/realtime/actions";

// Renew the token a few minutes before its fifteen-minute expiry.
const RENEW_MS = 12 * 60 * 1000;
// Several events often land together (a reply, then its quote); one refresh.
const DEBOUNCE_MS = 500;

/**
 * Keeps the request page live with Appwrite Realtime instead of polling.
 *
 * Every step of the pipeline records an event row for its request (a supplier
 * found, an RFQ sent, a reply received, a quote confirmed), so one
 * subscription to this request's events covers them all: when one arrives,
 * the page re-renders from the server. The filter runs on Appwrite's side,
 * and row permissions mean only the owner's events are ever delivered.
 */
export function RequestRealtime({ requestId }: Readonly<{ requestId: string }>) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      const { jwt } = await getRealtimeToken();
      if (cancelled || !jwt) return;
      unsubscribe?.();
      const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setJWT(jwt);
      unsubscribe = client.subscribe(
        Channel.tablesdb(DATABASE_ID).table(TABLES.events.id).row(),
        (message) => {
          const payload = message.payload as { requestId?: string };
          if (payload.requestId !== requestId) return;
          clearTimeout(debounce);
          debounce = setTimeout(() => router.refresh(), DEBOUNCE_MS);
        },
        [Query.equal("requestId", requestId)],
      );
    }

    void connect();
    const renew = setInterval(() => void connect(), RENEW_MS);
    return () => {
      cancelled = true;
      clearInterval(renew);
      clearTimeout(debounce);
      unsubscribe?.();
    };
  }, [requestId, router]);

  return null;
}
