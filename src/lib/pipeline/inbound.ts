import "server-only";

import { ID, Query } from "node-appwrite";
import { domainOfEmail } from "@/lib/domains";
import { normalizeToUsdMinor, toMinor, type FxSnapshot } from "@/lib/money";
import type { InboundParseRow, QuoteRow, RequestRow, RfqRow, SupplierRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES, type ParseState } from "@/lib/db/schema";
import { db, isConflict, ownerPermissions, recordEvent, withTransaction } from "@/lib/db/server";
import { fetchUsdRates } from "@/lib/server/fx";
import { nullable, openAiJson, PARSING_MODEL, strictObject } from "@/lib/server/openai";

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The bare address inside a From header such as `Name <addr@host>`. */
export function addressOf(from: string): string {
  const bracketed = /<([^<>]+)>/.exec(from);
  return (bracketed ? bracketed[1] : from).trim().toLowerCase();
}

export type IncomingMessage = {
  eventId: string;
  message: Record<string, unknown>;
  /** The sender failed SPF/DKIM/DMARC: stored, but never trusted on its own. */
  unauthenticated: boolean;
};

/**
 * Idempotency at the door. One `inboundParses` row per AgentMail event, held
 * by a unique index on `eventId`, so a redelivered webhook is a no-op instead
 * of a second model call and a second quote.
 *
 * Returns the new row, and whether it should be read automatically (a reply
 * held for review is stored but not parsed), or null for a duplicate.
 */
export async function onMessageReceived(
  incoming: IncomingMessage,
): Promise<{ parseId: string; autoParse: boolean } | null> {
  const tables = db();
  const message = incoming.message;
  const messageId = asString(message.message_id) ?? incoming.eventId;
  const threadId = asString(message.thread_id);
  const inboxId = asString(message.inbox_id);
  const from = asString(message.from);
  // The reply without the quoted history (our own RFQ text) when AgentMail
  // could separate it, which is what the parser should read.
  const body = asString(message.extracted_text) ?? asString(message.text) ?? asString(message.html) ?? "";

  const rfq = await matchRfq({ threadId, from });
  const candidateRequestId = rfq ? null : await singleOutstandingRequest(inboxId);
  const ownerRequestId = rfq?.requestId ?? candidateRequestId;
  const owner = ownerRequestId
    ? await tables.getRow<RequestRow>({
        databaseId: DATABASE_ID,
        tableId: TABLES.requests.id,
        rowId: ownerRequestId,
        queries: [Query.select(["$id", "userId"])],
      })
    : null;

  let parse: InboundParseRow;
  try {
    parse = await tables.createRow<InboundParseRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.inboundParses.id,
      rowId: ID.unique(),
      data: {
        eventId: incoming.eventId.slice(0, 255),
        messageId: messageId.slice(0, 255),
        threadId: threadId?.slice(0, 255) ?? null,
        inboxId: inboxId?.slice(0, 255) ?? null,
        rfqId: rfq?.$id ?? null,
        candidateRequestId,
        state: "received",
        reason: null,
        quoteId: null,
        attempts: 0,
        lastError: null,
        fromAddress: from?.slice(0, 320) ?? null,
        // Bounded: a human only needs enough to judge it.
        text: body.slice(0, 8_000),
      },
      // Visible to the buyer whose request it answers, and nobody else.
      permissions: owner ? ownerPermissions(owner.userId) : [],
    });
  } catch (err) {
    if (isConflict(err)) return null; // Already received: AgentMail retried.
    throw err;
  }

  if (rfq && owner) {
    await withTransaction(async (transactionId) => {
      await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.rfqs.id,
        rowId: rfq.$id,
        data: { status: "replied", repliedAt: new Date().toISOString(), threadId: threadId ?? rfq.threadId },
        transactionId,
      });
      await recordEvent({
        requestId: rfq.requestId,
        ownerId: owner.userId,
        kind: "reply.received",
        message: `Reply received from ${from ?? "a supplier"}.`,
        transactionId,
      });
    });
  }

  if (incoming.unauthenticated) {
    // Anyone can forge an address that fails authentication. Letting it become
    // a confirmed quote would let a stranger set the price the recommendation
    // is computed from, so it stops here for a human.
    await setParseState(
      parse.$id,
      "needs_review",
      "Sender failed email authentication (SPF/DKIM/DMARC). Confirm this reply is genuine before trusting its price.",
    );
    if (owner) {
      await recordEvent({
        requestId: owner.$id,
        ownerId: owner.userId,
        kind: "reply.unauthenticated",
        message: `Unauthenticated reply from ${from ?? "an unknown sender"} held for review.`,
      });
    }
    return { parseId: parse.$id, autoParse: false };
  }
  return { parseId: parse.$id, autoParse: true };
}

/**
 * Match a reply to the RFQ that provoked it. The thread is authoritative; the
 * sender's domain is the fallback for a reply that starts a new thread.
 */
async function matchRfq(args: { threadId?: string; from?: string }): Promise<RfqRow | null> {
  const tables = db();
  if (args.threadId) {
    const { rows } = await tables.listRows<RfqRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.rfqs.id,
      queries: [Query.equal("threadId", args.threadId), Query.limit(1)],
      total: false,
    });
    if (rows[0]) return rows[0];
  }

  const domain = args.from ? domainOfEmail(args.from) : null;
  if (!domain) return null;
  const { rows: suppliers } = await tables.listRows<SupplierRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.suppliers.id,
    queries: [Query.equal("domain", domain), Query.limit(1)],
    total: false,
  });
  if (!suppliers[0]) return null;

  // Only an RFQ that actually went out can be answered.
  const { rows } = await tables.listRows<RfqRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.rfqs.id,
    queries: [
      Query.equal("supplierId", suppliers[0].$id),
      Query.equal("status", ["sent", "replied"]),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ],
    total: false,
  });
  return rows[0] ?? null;
}

/**
 * The one request an unmatched reply can belong to, or null.
 *
 * A supplier may reply from another address or start a fresh thread, so
 * neither the thread nor the domain matches. Guessing by lookalike domain
 * would let an impostor's price through, so nothing is auto-linked. But if
 * exactly one request has an RFQ awaiting a reply from this inbox, its owner
 * is the only person who could be asked, and they decide. With several
 * candidates the reply stays hidden rather than shown to the wrong buyer.
 */
async function singleOutstandingRequest(inboxId: string | undefined): Promise<string | null> {
  if (!inboxId) return null;
  const { rows } = await db().listRows<RfqRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.rfqs.id,
    queries: [
      Query.equal("status", "sent"),
      Query.equal("inboxId", inboxId),
      Query.select(["requestId"]),
      Query.limit(200),
    ],
    total: false,
  });
  const requestIds = new Set(rows.map((rfq) => rfq.requestId));
  return requestIds.size === 1 ? [...requestIds][0] : null;
}

async function setParseState(parseId: string, state: ParseState, reason?: string): Promise<void> {
  await db().updateRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.inboundParses.id,
    rowId: parseId,
    data: { state, reason: reason?.slice(0, 2000) ?? null },
  });
}

/**
 * received -> parsing -> parsed | needs_review | not_a_quote.
 * Never silently drop a message: every path below ends in a terminal state.
 */
export async function parseMessage(parseId: string): Promise<void> {
  const tables = db();
  const parse = await tables.getRow<InboundParseRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.inboundParses.id,
    rowId: parseId,
  });
  if (parse.state !== "received") return;

  await tables.updateRow({
    databaseId: DATABASE_ID,
    tableId: TABLES.inboundParses.id,
    rowId: parseId,
    data: { state: "parsing", attempts: parse.attempts + 1 },
  });

  try {
    if (!parse.rfqId) {
      await setParseState(parseId, "needs_review", "Could not match this reply to an outstanding RFQ.");
      return;
    }
    const rfq = await tables.getRow<RfqRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.rfqs.id,
      rowId: parse.rfqId,
    });
    const request = await tables.getRow<RequestRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: rfq.requestId,
    });

    const text = parse.text ?? "";
    if (text.trim().length === 0) {
      // A PDF pro-forma with an empty body is the common case, not the
      // exception. It goes to review, not to the bin.
      await setParseState(parseId, "needs_review", "Empty message body — likely an attachment-only quote.");
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    const parsed = await openAiJson({
      apiKey,
      model: PARSING_MODEL,
      reasoningEffort: "low",
      system:
        "You read a supplier's email reply and extract the quoted price. If the message is not a " +
        "quotation (a question, an out-of-office, a refusal), set isQuote to false. Never invent a " +
        "number that is not written in the message.",
      user: `Our request: ${request.title}\nFrom: ${parse.fromAddress ?? ""}\n\n${text}`,
      schemaName: "quote_parse",
      schema: strictObject({
        isQuote: { type: "boolean" },
        totalAmount: nullable("number"),
        currency: nullable("string"),
        vatIncluded: nullable("boolean"),
        incoterm: nullable("string"),
        leadTimeDays: nullable("number"),
        warrantyMonths: nullable("number"),
        note: nullable("string"),
      }),
    });

    if (parsed.isQuote !== true) {
      await setParseState(parseId, "not_a_quote", asString(parsed.note) ?? "Reply did not contain a quotation.");
      return;
    }
    const currency = asString(parsed.currency)?.toUpperCase();
    if (typeof parsed.totalAmount !== "number" || parsed.totalAmount <= 0 || !currency || currency.length !== 3) {
      await setParseState(parseId, "needs_review", "Reply reads as a quote but has no clear total and currency.");
      return;
    }

    let fx: FxSnapshot | undefined;
    try {
      fx = (await fetchUsdRates())[currency];
    } catch (error) {
      console.error("[parse] FX snapshot failed", error);
    }

    await applyParsedQuote(parse, rfq, request, {
      totalAmount: parsed.totalAmount,
      currency,
      vatIncluded: parsed.vatIncluded === true,
      incoterm: asString(parsed.incoterm),
      leadTimeDays: typeof parsed.leadTimeDays === "number" ? Math.round(parsed.leadTimeDays) : undefined,
      warrantyMonths: typeof parsed.warrantyMonths === "number" ? Math.round(parsed.warrantyMonths) : undefined,
      fx,
    });
  } catch (error) {
    await tables.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.inboundParses.id,
      rowId: parseId,
      data: {
        state: "needs_review",
        reason: `Parse failed: ${errorText(error)}`.slice(0, 2000),
        lastError: errorText(error).slice(0, 2000),
      },
    });
  }
}

/**
 * The moment the demo exists for: an emailed quote supersedes the crawled row
 * for that supplier, and the board upgrades. The crawled row is kept and
 * marked, not deleted, so the audit trail shows both. One transaction.
 */
async function applyParsedQuote(
  parse: InboundParseRow,
  rfq: RfqRow,
  request: RequestRow,
  quote: {
    totalAmount: number;
    currency: string;
    vatIncluded: boolean;
    incoterm?: string;
    leadTimeDays?: number;
    warrantyMonths?: number;
    fx?: FxSnapshot;
  },
): Promise<void> {
  const tables = db();
  // A second read of the same reply (a retry that overlapped the first) must
  // not produce a second quote. Re-check just before writing.
  const current = await tables.getRow<InboundParseRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.inboundParses.id,
    rowId: parse.$id,
    queries: [Query.select(["$id", "quoteId", "state"])],
  });
  if (current.quoteId || current.state === "parsed") {
    // Already produced its quote: settle the state this read left behind.
    await tables.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.inboundParses.id,
      rowId: parse.$id,
      data: { state: "parsed", reason: null },
    });
    return;
  }

  const totalMinor = toMinor(quote.totalAmount, quote.currency);
  const { rows: priors } = await tables.listRows<QuoteRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.quotes.id,
    queries: [
      Query.equal("requestId", rfq.requestId),
      Query.equal("supplierId", rfq.supplierId),
      Query.equal("source", "crawled"),
      Query.isNull("supersededBy"),
      Query.limit(20),
    ],
    total: false,
  });
  const quoteId = ID.unique();

  await withTransaction(async (transactionId) => {
    await tables.createRow<QuoteRow>({
      databaseId: DATABASE_ID,
      tableId: TABLES.quotes.id,
      rowId: quoteId,
      data: {
        requestId: rfq.requestId,
        supplierId: rfq.supplierId,
        rfqId: rfq.$id,
        source: "emailed",
        // Earned, not guessed: this price came from a real reply on a real thread.
        confidence: "high",
        totalMinor,
        currency: quote.currency,
        vatIncluded: quote.vatIncluded,
        incoterm: quote.incoterm?.slice(0, 16) ?? null,
        normalizedUsdMinor: quote.fx ? normalizeToUsdMinor(totalMinor, quote.currency, quote.fx) : null,
        fxRate: quote.fx?.fxRate ?? null,
        fxRateAt: quote.fx ? new Date(quote.fx.fxRateAt).toISOString() : null,
        fxSource: quote.fx?.fxSource ?? null,
        leadTimeDays: quote.leadTimeDays ?? null,
        warrantyMonths: quote.warrantyMonths ?? null,
        validUntil: null,
        supersededBy: null,
        sourceUrl: null,
      },
      permissions: ownerPermissions(request.userId),
      transactionId,
    });
    for (const prior of priors) {
      await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.quotes.id,
        rowId: prior.$id,
        data: { supersededBy: quoteId },
        transactionId,
      });
    }
    await tables.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.inboundParses.id,
      rowId: parse.$id,
      data: { state: "parsed", quoteId, reason: null },
      transactionId,
    });
    await recordEvent({
      requestId: rfq.requestId,
      ownerId: request.userId,
      kind: "quote.confirmed",
      message: "Confirmed quote received and applied to the board.",
      transactionId,
    });
  });
}
