"use server";

import { createAdminClient } from "@/lib/appwrite/server";
import { requireUser } from "@/lib/auth/session";

// Short enough that a leaked token is soon useless; the page asks for a new
// one before it runs out.
const TOKEN_SECONDS = 15 * 60;

/**
 * A short-lived Appwrite JWT for the signed-in user, so the browser can open
 * a Realtime subscription. The session itself stays in its httpOnly cookie,
 * out of reach of page scripts; this token is the only credential the page
 * ever holds, and it expires in fifteen minutes. Realtime still applies row
 * permissions to it, so it only ever delivers the user's own rows.
 */
export async function getRealtimeToken(): Promise<{ jwt?: string; error?: string }> {
  try {
    const user = await requireUser();
    const { jwt } = await createAdminClient().users.createJWT({ userId: user.$id, duration: TOKEN_SECONDS });
    return { jwt };
  } catch (err) {
    console.error("[realtime] token failed", err);
    return { error: "Live updates are unavailable right now." };
  }
}
