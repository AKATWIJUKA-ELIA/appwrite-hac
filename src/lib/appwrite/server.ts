import "server-only";

import { cookies } from "next/headers";
import { Account, Client, TablesDB, Users } from "node-appwrite";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!;

// Full access via the API key. Use for work the signed-in user is not allowed
// to do directly (every write in this app), and always check ownership first.
export function createAdminClient() {
  const key = process.env.APPWRITE_API_KEY;
  if (!key) throw new Error("APPWRITE_API_KEY is not set");
  const client = new Client().setEndpoint(endpoint).setProject(project).setKey(key);
  return {
    account: new Account(client),
    users: new Users(client),
    tablesDB: new TablesDB(client),
  };
}

// Acts as the user whose session secret is in the cookie, so Appwrite applies
// that user's permissions. Returns null when there is no session cookie.
export async function createSessionClient() {
  const secret = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!secret) return null;
  const client = new Client().setEndpoint(endpoint).setProject(project).setSession(secret);
  return {
    account: new Account(client),
    tablesDB: new TablesDB(client),
  };
}
