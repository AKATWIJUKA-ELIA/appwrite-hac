import "server-only";

import { AppwriteException, ID, Permission, Role } from "node-appwrite";
import { createAdminClient } from "@/lib/appwrite/server";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import type { RequestRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";

/**
 * A refusal meant for the person on the screen. Server actions catch it and
 * return its message as `{ error }`; anything else is logged and replaced
 * with a generic sentence, so internals never leak into the UI.
 */
export class UserFacingError extends Error {}

export function db() {
  return createAdminClient().tablesDB;
}

/**
 * Strip what the SDK adds to response objects (a hidden `toString` method) so
 * the data can be passed from a server component to a client component, which
 * React only allows for plain objects. Values stay numbers: every integer we
 * store is far inside the safe range, so nothing comes back as a BigInt.
 */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const isNotFound = (err: unknown) => err instanceof AppwriteException && err.code === 404;
export const isConflict = (err: unknown) => err instanceof AppwriteException && err.code === 409;

/**
 * Read access for the request's owner only. Every request-scoped row is
 * written with this, which is what keeps one buyer's suppliers, quotes and
 * replies invisible to another (and scopes Realtime to the owner too).
 */
export function ownerPermissions(userId: string): string[] {
  return [Permission.read(Role.user(userId))];
}

/**
 * Load a request the signed-in user owns. "Missing" and "not yours" give the
 * same message, so request ids cannot be probed.
 */
export async function requireOwnedRequest(
  requestId: string,
): Promise<{ user: CurrentUser; request: RequestRow }> {
  const user = await requireUser();
  let request: RequestRow | null = null;
  try {
    request = await db().getRow<RequestRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: requestId,
    });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (!request || request.userId !== user.$id) {
    throw new UserFacingError("That request was not found.");
  }
  return { user, request };
}

/**
 * Append to the audit trail. Pass the `transactionId` of the write the event
 * describes, so the trail commits or rolls back with it.
 */
export async function recordEvent(args: {
  requestId?: string;
  ownerId?: string;
  kind: string;
  message: string;
  meta?: Record<string, string>;
  transactionId?: string;
}): Promise<void> {
  await db().createRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.events.id,
    rowId: ID.unique(),
    data: {
      requestId: args.requestId ?? null,
      kind: args.kind,
      message: args.message,
      meta: args.meta ? JSON.stringify(args.meta) : null,
    },
    permissions: args.ownerId ? ownerPermissions(args.ownerId) : [],
    transactionId: args.transactionId,
  });
}

/**
 * Run several writes as one TablesDB transaction: every createRow/updateRow
 * inside `work` passes the given `transactionId`, and they all commit together
 * or are rolled back together if anything throws.
 */
export async function withTransaction<T>(work: (transactionId: string) => Promise<T>): Promise<T> {
  const tables = db();
  const { $id: transactionId } = await tables.createTransaction();
  try {
    const result = await work(transactionId);
    await tables.updateTransaction({ transactionId, commit: true });
    return result;
  } catch (err) {
    await tables.updateTransaction({ transactionId, rollback: true }).catch((rollbackErr) => {
      // A failed rollback expires on Appwrite's side; the original error is
      // the one worth surfacing.
      console.error("[db] rollback failed", rollbackErr);
    });
    throw err;
  }
}

/** Turn any thrown value into the `{ error }` a server action returns. */
export function actionError(err: unknown): { error: string } {
  if (err instanceof UserFacingError) return { error: err.message };
  console.error("[action] unexpected error", err);
  return { error: "Something went wrong. Please try again." };
}
