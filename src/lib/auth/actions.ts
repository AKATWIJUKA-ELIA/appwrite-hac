"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppwriteException, ID } from "node-appwrite";
import { createAdminClient, createSessionClient } from "@/lib/appwrite/server";
import { HOME_PATH, SESSION_COOKIE, safeNext } from "@/lib/auth/constants";

export type AuthFormState = {
  error?: string;
  // Echoed back so a failed submit does not wipe what the user typed.
  // Passwords are deliberately never echoed.
  fields?: { name?: string; organisation?: string; email?: string };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function describe(err: unknown): string {
  if (!(err instanceof AppwriteException)) {
    console.error("[auth] unexpected error", err);
    return "Something went wrong. Please try again.";
  }
  switch (err.type) {
    case "user_already_exists":
      return "An account with this email already exists. Sign in instead.";
    case "user_invalid_credentials":
      return "Email or password is incorrect.";
    case "general_rate_limit_exceeded":
      return "Too many attempts. Wait a minute and try again.";
    case "user_blocked":
      return "This account has been disabled.";
    default:
      // Appwrite's 400s (password policy and the like) are written for users.
      if (err.code === 400) return err.message;
      console.error("[auth] appwrite error", err.code, err.type, err.message);
      return "Something went wrong. Please try again.";
  }
}

async function startSession(email: string, password: string) {
  const { account } = createAdminClient();
  const session = await account.createEmailPasswordSession({ email, password });
  (await cookies()).set(SESSION_COOKIE, session.secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expire),
  });
}

export async function signUp(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const name = field(form, "name");
  const organisation = field(form, "organisation");
  const email = field(form, "email").toLowerCase();
  const password = form.get("password");
  const fields = { name, organisation, email };

  if (!name) return { error: "Enter your name.", fields };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address.", fields };
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Use a password of at least 8 characters.", fields };
  }

  try {
    const { account, users } = createAdminClient();
    const user = await account.create({ userId: ID.unique(), email, password, name });
    if (organisation) {
      await users.updatePrefs({ userId: user.$id, prefs: { organisation } });
    }
    await startSession(email, password);
  } catch (err) {
    return { error: describe(err), fields };
  }
  redirect(HOME_PATH);
}

export async function signIn(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = field(form, "email").toLowerCase();
  const password = form.get("password");
  const fields = { email };

  if (!EMAIL.test(email) || typeof password !== "string" || !password) {
    return { error: "Enter your email and password.", fields };
  }

  try {
    await startSession(email, password);
  } catch (err) {
    return { error: describe(err), fields };
  }
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  const session = await createSessionClient();
  try {
    await session?.account.deleteSession({ sessionId: "current" });
  } catch {
    // Already expired or revoked: clearing the cookie is all that is left.
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}
