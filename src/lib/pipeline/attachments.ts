import "server-only";

import { ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { extractText, getDocumentProxy } from "unpdf";
import { createAdminClient } from "@/lib/appwrite/server";
import type { AttachmentRow, InboundParseRow } from "@/lib/db/rows";
import { ATTACHMENTS_BUCKET_ID, DATABASE_ID, TABLES } from "@/lib/db/schema";
import { db } from "@/lib/db/server";
import { downloadAttachment, getMessageAttachments } from "@/lib/server/agentmail";

// Bounds: a pro-forma is a page or two. Anything far larger is not a quote,
// and reading it would only crowd the parser's input window.
const MAX_PDFS = 3;
const MAX_PDF_BYTES = 15_000_000;
const MAX_TEXT_PER_PDF = 6_000;
const MAX_STORED_TEXT = 8_000;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isPdf = (contentType: string, filename: string) =>
  contentType.toLowerCase().includes("pdf") || filename.toLowerCase().endsWith(".pdf");

async function pdfText(bytes: Uint8Array): Promise<string> {
  // The PDF reader takes ownership of the buffer it is given (it moves it to
  // its worker, leaving the original empty), so it gets a copy.
  const pdf = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/[ \t]+\n/g, "\n").trim();
}

/**
 * Keep and read the PDFs on an inbound reply, before it is parsed.
 *
 * Suppliers very often reply with a pro-forma PDF and a one-line body. Each
 * PDF is stored in Appwrite Storage (owner-only, served through the checked
 * /api/attachments route), recorded in `attachments`, and its text appended to
 * the reply so the normal quote reader sees the figures.
 *
 * Returns false when the reply should not be parsed: it has PDFs, but neither
 * they nor the body contain readable text (a scanned document), in which case
 * it is held for review with the file attached.
 */
export async function ingestAttachments(parseId: string): Promise<boolean> {
  const tables = db();
  const parse = await tables.getRow<InboundParseRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.inboundParses.id,
    rowId: parseId,
  });
  if (!parse.inboxId || !parse.messageId) return true;

  let found;
  try {
    found = await getMessageAttachments(parse.inboxId, parse.messageId);
  } catch (error) {
    // The body can still be read; losing the attachment list is not fatal.
    console.error(`[attachments] could not list attachments for ${parseId}: ${errorText(error)}`);
    return true;
  }
  const pdfs = found.filter((a) => isPdf(a.contentType, a.filename) && a.size <= MAX_PDF_BYTES).slice(0, MAX_PDFS);
  if (pdfs.length === 0) return true;

  const { storage } = createAdminClient();
  const sections: string[] = [];
  for (const attachment of pdfs) {
    try {
      const bytes = await downloadAttachment(parse.inboxId, parse.messageId, attachment.attachmentId);
      const file = await storage.createFile({
        bucketId: ATTACHMENTS_BUCKET_ID,
        fileId: ID.unique(),
        file: InputFile.fromBuffer(bytes, attachment.filename),
      });

      let text = "";
      try {
        text = (await pdfText(bytes)).slice(0, MAX_TEXT_PER_PDF);
      } catch (error) {
        console.error(`[attachments] could not read ${attachment.filename}: ${errorText(error)}`);
      }
      if (text) sections.push(`--- Attached: ${attachment.filename} ---\n${text}`);

      await tables.createRow<AttachmentRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.attachments.id,
        rowId: ID.unique(),
        data: {
          rfqId: parse.rfqId,
          inboundParseId: parse.$id,
          fileId: file.$id,
          filename: attachment.filename.slice(0, 255),
          contentType: attachment.contentType.slice(0, 128),
          sizeBytes: bytes.byteLength,
          parsed: text.length > 0,
        },
        // The same readers as the reply itself: the buyer whose request it answers.
        permissions: parse.$permissions,
      });
    } catch (error) {
      console.error(`[attachments] could not store ${attachment.filename}: ${errorText(error)}`);
    }
  }

  const body = (parse.text ?? "").trim();
  if (sections.length > 0) {
    await tables.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.inboundParses.id,
      rowId: parseId,
      data: { text: [body, ...sections].filter(Boolean).join("\n\n").slice(0, MAX_STORED_TEXT) },
    });
    return true;
  }
  if (body.length > 0) return true;

  await tables.updateRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.inboundParses.id,
    rowId: parseId,
    data: {
      state: "needs_review",
      reason:
        "The reply is an attached PDF with no readable text (probably a scan). Open the attachment and check the price yourself.",
    },
  });
  return false;
}
