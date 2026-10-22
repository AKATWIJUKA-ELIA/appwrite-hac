"use client";

import { useEffect } from "react";
import { client } from "@/lib/appwrite/client";

// Pings Appwrite once on startup so a misconfigured endpoint or project id
// shows up in the console immediately instead of as a confusing auth error.
export function AppwritePing() {
  useEffect(() => {
    client
      .ping()
      .then(() => console.info("[appwrite] ping ok"))
      .catch((err) => console.error("[appwrite] ping failed", err));
  }, []);
  return null;
}
