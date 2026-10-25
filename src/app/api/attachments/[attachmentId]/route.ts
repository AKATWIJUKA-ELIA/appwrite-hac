import { createAdminClient } from "@/lib/appwrite/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { AttachmentRow, InboundParseRow, RfqRow } from "@/lib/db/rows";
import { ATTACHMENTS_BUCKET_ID, DATABASE_ID, TABLES } from "@/lib/db/schema";
import { db, isNotFound, requireOwnedRequest, UserFacingError } from "@/lib/db/server";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Serve a supplier's attachment to the buyer whose request it belongs to.
 * The bucket has no public access; this route is the only way in. Missing
 * and not-yours both answer 404, so file ids cannot be probed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  if (!(await getCurrentUser())) return new Response("Sign in to view this file.", { status: 401 });
  const { attachmentId } = await params;
  const tables = db();

  try {
    const attachment = await tables.getRow<AttachmentRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.attachments.id,
      rowId: attachmentId,
    });

    // The request it belongs to: through its RFQ, or, for a reply not yet
    // linked to a supplier, the one request it was offered to.
    let requestId: string | null = null;
    if (attachment.rfqId) {
      const rfq = await tables.getRow<RfqRow>({ databaseId: DATABASE_ID, tableId: TABLES.rfqs.id, rowId: attachment.rfqId });
      requestId = rfq.requestId;
    } else if (attachment.inboundParseId) {
      const parse = await tables.getRow<InboundParseRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.inboundParses.id,
        rowId: attachment.inboundParseId,
      });
      if (parse.rfqId) {
        const rfq = await tables.getRow<RfqRow>({ databaseId: DATABASE_ID, tableId: TABLES.rfqs.id, rowId: parse.rfqId });
        requestId = rfq.requestId;
      } else {
        requestId = parse.candidateRequestId;
      }
    }
    if (!requestId) return notFound();
    await requireOwnedRequest(requestId);

    const bytes = await createAdminClient().storage.getFileDownload({
      bucketId: ATTACHMENTS_BUCKET_ID,
      fileId: attachment.fileId,
    });
    const filename = attachment.filename.replace(/[^\w.\- ]+/g, "_");
    return new Response(bytes, {
      headers: {
        "Content-Type": attachment.contentType ?? "application/octet-stream",
        // Shown in the browser's PDF viewer; the name is kept for saving.
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof UserFacingError || isNotFound(err)) return notFound();
    throw err;
  }
}
