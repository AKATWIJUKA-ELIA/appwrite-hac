import "server-only";

import { cookies } from "next/headers";
import { Account, AppwriteException, Client, TablesDB, Users } from "node-appwrite";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!;

const RETRY_DELAYS_MS = [300, 1_000];

// A connection that dropped or timed out, or Appwrite briefly unavailable.
// An Appwrite answer such as 401 or 404 is a real result and never retried.
function isTransient(err: unknown): boolean {
  if (err instanceof AppwriteException) return err.code === 0 || err.code >= 500;
  return err instanceof TypeError || (err instanceof Error && "cause" in err);
}

/**
 * Retry read calls (get*, list*) on transient network failures. Reads are
 * safe to repeat; writes are not retried, because repeating one that did land
 * could duplicate a row or an event.
 */
export function withReadRetry<T extends object>(service: T): T {
  return new Proxy(service, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string" || !/^(get|list)/.test(prop)) {
        return value;
      }
      return async (...args: unknown[]) => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await value.apply(target, args);
          } catch (err) {
            if (attempt >= RETRY_DELAYS_MS.length || !isTransient(err)) throw err;
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          }
        }
      };
    },
  });
}

// Full access via the API key. Use for work the signed-in user is not allowed
// to do directly (every write in this app), and always check ownership first.
export function createAdminClient() {
  const key = process.env.APPWRITE_API_KEY;
  if (!key) throw new Error("APPWRITE_API_KEY is not set");
  const client = new Client().setEndpoint(endpoint).setProject(project).setKey(key);
  return {
    account: new Account(client),
    users: withReadRetry(new Users(client)),
    tablesDB: withReadRetry(new TablesDB(client)),
  };
}

// Acts as the user whose session secret is in the cookie, so Appwrite applies
// that user's permissions. Returns null when there is no session cookie.
export async function createSessionClient() {
  const secret = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!secret) return null;
  const client = new Client().setEndpoint(endpoint).setProject(project).setSession(secret);
  return {
    account: withReadRetry(new Account(client)),
    tablesDB: withReadRetry(new TablesDB(client)),
  };
}
