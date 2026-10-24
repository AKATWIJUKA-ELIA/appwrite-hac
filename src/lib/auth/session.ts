import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { AppwriteException, type Models } from "node-appwrite";
import { createSessionClient } from "@/lib/appwrite/server";

export type UserPrefs = Models.Preferences & { organisation?: string };
export type CurrentUser = Models.User<UserPrefs>;

// The real authorization boundary. src/proxy.ts only checks that a cookie is
// present; this asks Appwrite whether the session behind it is still valid.
// Cached so a layout and a page in one render share a single round-trip.
//
// Only Appwrite saying "unauthorized" means signed out. Anything else (a
// network blip, a timeout, a 5xx) is rethrown: treating it as signed out would
// send the user through /api/auth/clear and delete a perfectly good session.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await createSessionClient();
  if (!session) return null;
  try {
    return await session.account.get<UserPrefs>();
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 401) return null;
    throw err;
  }
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // A cookie whose session has expired or been revoked. Server components
  // cannot delete cookies, and the proxy would bounce /sign-in straight back
  // while the cookie exists, so clear it in a route handler first.
  if (!user) redirect("/api/auth/clear");
  return user;
}
