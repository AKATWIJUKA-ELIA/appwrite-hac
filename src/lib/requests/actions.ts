"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ID, Query } from "node-appwrite";
import { requireUser } from "@/lib/auth/session";
import type { RequestRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import {
  actionError,
  db,
  ownerPermissions,
  recordEvent,
  requireOwnedRequest,
  UserFacingError,
} from "@/lib/db/server";
import { discover } from "@/lib/pipeline/discovery";
import { extractSpec } from "@/lib/pipeline/extract";
import { runStep } from "@/lib/server/jobs";

export type CreateRequestState = { error?: string };

/**
 * State the need. Free text in, a request row out, with extraction running
 * behind it. The structured spec does not exist yet when this redirects; the
 * request page refreshes and watches it fill in.
 */
export async function createRequest(
  _prev: CreateRequestState,
  form: FormData,
): Promise<CreateRequestState> {
  let requestId: string;
  try {
    const user = await requireUser();
    const rawText = String(form.get("rawText") ?? "").trim();
    const deliverTo = String(form.get("deliverTo") ?? "").trim();
    const currency = String(form.get("currency") ?? "").trim().toUpperCase();

    if (rawText.length < 10) {
      throw new UserFacingError("Describe what you need in a sentence or two.");
    }
    if (!deliverTo) throw new UserFacingError("Say where this should be delivered.");
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new UserFacingError("Use a three-letter currency code, such as UGX or USD.");
    }

    const row = await db().createRow<RequestRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: ID.unique(),
      data: {
        userId: user.$id,
        // A readable placeholder until extraction names the request properly.
        title: rawText.slice(0, 60),
        rawText,
        status: "extracting",
        deliverTo: deliverTo.slice(0, 200),
        currency,
        // Budget and delivery window are extracted, not typed in.
        deliveryWindowDays: null,
        budgetMinor: null,
        failureReason: null,
      },
      permissions: ownerPermissions(user.$id),
    });
    requestId = row.$id;

    await recordEvent({
      requestId,
      ownerId: user.$id,
      kind: "request.created",
      message: "Request received, extracting the specification.",
    });

    runStep("extract", { id: requestId, ownerId: user.$id }, () => extractSpec(requestId));
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/requests", "layout");
  redirect(`/requests/${requestId}`);
}

/**
 * Retry a request that failed, resuming from the stage it actually died at.
 *
 * Extraction and supplier search both fail for transient reasons: a rate
 * limit, a bad gateway, a search that returned nothing. Re-typing the whole
 * requirement to recover from that is not a reasonable ask, so this restarts
 * the pipeline in place. If the spec was already extracted, it does not pay
 * for extraction again; it goes straight back to discovery.
 */
export async function retryRequest(requestId: string): Promise<{ error?: string }> {
  try {
    const { request } = await requireOwnedRequest(requestId);
    if (request.status !== "failed") {
      throw new UserFacingError("This request has not failed, so there is nothing to retry.");
    }

    const tables = db();
    const { rows: existingItems } = await tables.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.lineItems.id,
      queries: [Query.equal("requestId", requestId), Query.limit(1), Query.select(["$id"])],
      total: false,
    });
    const extracted = existingItems.length > 0;
    const owner = { id: requestId, ownerId: request.userId };

    await tables.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: requestId,
      data: { status: extracted ? "discovering" : "extracting", failureReason: null },
    });
    await recordEvent({
      requestId,
      ownerId: request.userId,
      kind: "request.retry",
      message: extracted ? "Retrying supplier search." : "Retrying extraction of the requirement.",
    });

    if (extracted) {
      runStep("discover", owner, () => discover(requestId));
    } else {
      runStep("extract", owner, () => extractSpec(requestId));
    }
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/requests/${requestId}`);
  return {};
}

/**
 * Stop an in-flight supplier search. Every remaining candidate costs a scrape
 * and a model call, so this is the switch that bounds a run going wrong. The
 * running search checks the status before each write and stops on its own.
 */
export async function cancelDiscovery(requestId: string): Promise<{ error?: string }> {
  try {
    const { request } = await requireOwnedRequest(requestId);
    if (request.status !== "discovering") {
      throw new UserFacingError("Supplier search is not running for this request.");
    }
    await db().updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: requestId,
      data: { status: "failed", failureReason: "Discovery cancelled." },
    });
    await recordEvent({
      requestId,
      ownerId: request.userId,
      kind: "discovery.cancelled",
      message: "Discovery cancelled before it finished.",
    });
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/requests/${requestId}`);
  return {};
}
