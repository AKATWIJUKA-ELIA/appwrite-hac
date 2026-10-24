"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { ID, Query } from "node-appwrite";
import type { ContactRow, RfqRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import {
  actionError,
  db,
  isConflict,
  isNotFound,
  recordEvent,
  requireOwnedRequest,
  UserFacingError,
  withTransaction,
} from "@/lib/db/server";
import { sendApproved } from "@/lib/pipeline/send";
import { MAX_RECIPIENTS } from "@/lib/server/agentmail";
import { runStep } from "@/lib/server/jobs";
import { verifyEmailMx } from "@/lib/server/mx";

type Result = { error?: string };

/**
 * Load a draft the caller may edit. Ownership is checked on the parent
 * request: writing an address onto someone else's draft would aim their
 * approved send at a recipient of the caller's choosing.
 */
async function requireOwnedRfq(rfqId: string) {
  let rfq: RfqRow | null = null;
  try {
    rfq = await db().getRow<RfqRow>({ databaseId: DATABASE_ID, tableId: TABLES.rfqs.id, rowId: rfqId });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (!rfq) throw new UserFacingError("That draft no longer exists.");
  const { request } = await requireOwnedRequest(rfq.requestId);
  // "failed" is editable too: a send that failed on a bad address is exactly
  // the case where the address needs changing before the retry.
  if (rfq.status !== "draft" && rfq.status !== "failed") {
    throw new UserFacingError("This RFQ has already been approved or sent.");
  }
  return { rfq, request };
}

/**
 * Supply a contact address by hand, for a supplier whose site published none.
 * Without this, a request whose suppliers all came back without an address
 * would reach approval with nothing to approve and no way forward.
 */
export async function addContact(rfqId: string, rawEmail: string): Promise<Result> {
  try {
    const email = rawEmail.trim().toLowerCase();
    // Deliberately loose: a real address the parser dislikes is worse than a
    // typo the supplier bounces. The MX check below is the real test.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new UserFacingError("That does not look like an email address.");
    }
    const { rfq, request } = await requireOwnedRfq(rfqId);
    const tables = db();

    const findContact = async () =>
      (
        await tables.listRows<ContactRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.contacts.id,
          queries: [Query.equal("email", email), Query.limit(1)],
          total: false,
        })
      ).rows[0];
    let contact = await findContact();
    if (!contact) {
      try {
        contact = await tables.createRow<ContactRow>({
          databaseId: DATABASE_ID,
          tableId: TABLES.contacts.id,
          rowId: ID.unique(),
          data: {
            supplierId: rfq.supplierId,
            email,
            role: null,
            verification: "unverified",
            verifiedAt: null,
            sourceUrl: null,
          },
        });
      } catch (err) {
        if (!isConflict(err)) throw err;
        contact = await findContact();
        if (!contact) throw err;
      }
    }
    const contactId = contact.$id;

    const supplier = await tables.getRow<SupplierRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.suppliers.id,
      rowId: rfq.supplierId,
    });
    await withTransaction(async (transactionId) => {
      await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.rfqs.id,
        rowId: rfqId,
        data: { contactId },
        transactionId,
      });
      await recordEvent({
        requestId: rfq.requestId,
        ownerId: request.userId,
        kind: "contact.added",
        message: `Address added by hand for ${supplier.name}.`,
        transactionId,
      });
    });

    // An MX lookup costs one DNS query and no model tokens, so it always runs.
    if (contact.verification === "unverified") {
      after(async () => {
        try {
          const verification = await verifyEmailMx(email);
          await db().updateRow({
            databaseId: DATABASE_ID,
            tableId: TABLES.contacts.id,
            rowId: contactId,
            data: { verification, verifiedAt: new Date().toISOString() },
          });
        } catch (err) {
          console.error("[addContact] MX check failed", err);
        }
      });
    }
    revalidatePath(`/requests/${rfq.requestId}`);
  } catch (err) {
    return actionError(err);
  }
  return {};
}

/**
 * Detach the address from a draft, so a wrong or unwanted one can be replaced
 * before anything is approved. The contact row is left alone: other requests
 * may use the same supplier.
 */
export async function clearContact(rfqId: string): Promise<Result> {
  try {
    const { rfq } = await requireOwnedRfq(rfqId);
    await db().updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.rfqs.id,
      rowId: rfqId,
      data: { contactId: null },
    });
    revalidatePath(`/requests/${rfq.requestId}`);
  } catch (err) {
    return actionError(err);
  }
  return {};
}

/**
 * The one human checkpoint. `sent` is unreachable except through here, and
 * the five-supplier cap lives on the server rather than in the UI, so it
 * cannot be clicked around.
 */
export async function approveAndSend(requestId: string, rfqIds: string[]): Promise<Result> {
  try {
    // This is what puts real email in front of real businesses, so ownership
    // is checked first, before anything is read or written.
    const { request } = await requireOwnedRequest(requestId);
    const ids = [...new Set(rfqIds)];
    if (ids.length === 0) throw new UserFacingError("Select at least one supplier to contact.");
    if (ids.length > MAX_RECIPIENTS) {
      throw new UserFacingError(`Nothing goes to more than ${MAX_RECIPIENTS} suppliers at once.`);
    }

    const tables = db();
    const { rows } = await tables.listRows<RfqRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.rfqs.id,
      queries: [Query.equal("$id", ids), Query.limit(ids.length)],
      total: false,
    });
    if (rows.length !== ids.length) throw new UserFacingError("That draft no longer exists.");
    for (const rfq of rows) {
      if (rfq.requestId !== requestId) {
        throw new UserFacingError("That draft belongs to a different request.");
      }
      // Approving a supplier with no address would move it to "approved" and
      // then fail at dispatch. Refuse it here, where the buyer can fix it.
      if (rfq.status === "draft" && !rfq.contactId) {
        throw new UserFacingError("One of the selected suppliers has no email address. Add one first.");
      }
    }
    const drafts = rows.filter((rfq) => rfq.status === "draft");
    if (drafts.length === 0) throw new UserFacingError("These suppliers have already been contacted.");

    const approvedAt = new Date().toISOString();
    await withTransaction(async (transactionId) => {
      for (const rfq of drafts) {
        await tables.updateRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.rfqs.id,
          rowId: rfq.$id,
          data: { status: "approved", approvedAt },
          transactionId,
        });
      }
      await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.requests.id,
        rowId: requestId,
        data: { status: "collecting" },
        transactionId,
      });
      await recordEvent({
        requestId,
        ownerId: request.userId,
        kind: "rfq.approved",
        message: `Approved ${drafts.length} RFQ(s) for sending.`,
        transactionId,
      });
    });

    runStep("send", { id: requestId, ownerId: request.userId }, () => sendApproved(requestId));
    revalidatePath(`/requests/${requestId}`);
  } catch (err) {
    return actionError(err);
  }
  return {};
}

/**
 * Retry the sends that failed. The buyer already approved these exact
 * recipients and a transport failure does not undo that, so they go back to
 * `approved` and are sent again. The cap was applied at approval and holds.
 */
export async function retrySend(requestId: string): Promise<Result & { retried?: number }> {
  let retried = 0;
  try {
    const { request } = await requireOwnedRequest(requestId);
    const tables = db();
    const { rows } = await tables.listRows<RfqRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.rfqs.id,
      queries: [
        Query.equal("requestId", requestId),
        Query.equal("status", ["failed", "approved"]),
        Query.limit(50),
      ],
      total: false,
    });
    if (rows.length === 0) throw new UserFacingError("There are no failed sends to retry.");

    await withTransaction(async (transactionId) => {
      for (const rfq of rows) {
        if (rfq.status !== "failed") continue;
        await tables.updateRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.rfqs.id,
          rowId: rfq.$id,
          data: { status: "approved", failureReason: null },
          transactionId,
        });
      }
      await recordEvent({
        requestId,
        ownerId: request.userId,
        kind: "rfq.retry",
        message: `Retrying ${rows.length} RFQ(s) that never sent.`,
        transactionId,
      });
    });
    retried = rows.length;

    runStep("send", { id: requestId, ownerId: request.userId }, () => sendApproved(requestId));
    revalidatePath(`/requests/${requestId}`);
  } catch (err) {
    return actionError(err);
  }
  return { retried };
}
