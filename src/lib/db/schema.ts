// Single source of truth for the TablesDB schema. `scripts/setup-db.ts` reads
// this to create the tables, and the app imports the ids and enum values from
// here, so the two can never drift apart.
//
// Conventions:
// - Money is never a float. Every amount is an integer count of minor units
//   (UGX 1 => 1, USD 1.99 => 199) in a `bigint` column, with its currency next
//   to it. The SDK returns values inside the safe-integer range as plain
//   numbers, which covers any realistic procurement total.
// - References between tables are plain id columns with a key index. They are
//   filtered on constantly, and an indexed varchar keeps those queries cheap.
// - Free-form maps (line-item specs, event metadata, recommendation inputs)
//   are stored as JSON text; nothing ever queries inside them.
// - Users and sessions are not tables here: Appwrite Auth owns them.

export const DATABASE_ID = "quotebook";

export const REQUEST_STATUS = [
  "draft",
  "extracting",
  "discovering",
  "awaiting_approval",
  "collecting",
  "decided",
  "failed",
] as const;

// The send gate is a status machine, not a flag: "sent" is only reachable from
// "approved", and only a human action writes "approved".
export const RFQ_STATUS = [
  "draft",
  "approved",
  "sent",
  "replied",
  "bounced",
  "cancelled",
  // The send errored before the mail left. Approval is already on record, so a
  // failed RFQ can be retried without asking the human again.
  "failed",
] as const;

// Every inbound message ends in a terminal state; nothing is silently dropped.
export const PARSE_STATE = ["received", "parsing", "parsed", "needs_review", "not_a_quote"] as const;

export const CONTACT_VERIFICATION = ["unverified", "mx_valid", "mx_invalid", "bounced"] as const;

// A crawled quote is a web price (low confidence); an emailed quote came from
// the supplier's own reply (high confidence) and supersedes the crawled one.
export const QUOTE_SOURCE = ["crawled", "emailed"] as const;
export const CONFIDENCE = ["low", "high"] as const;
export const DISCOVERED_VIA = ["crawled", "seed"] as const;

export type RequestStatus = (typeof REQUEST_STATUS)[number];
export type RfqStatus = (typeof RFQ_STATUS)[number];
export type ParseState = (typeof PARSE_STATE)[number];
export type ContactVerification = (typeof CONTACT_VERIFICATION)[number];
export type QuoteSource = (typeof QUOTE_SOURCE)[number];
export type Confidence = (typeof CONFIDENCE)[number];

export type ColumnSpec =
  | { key: string; type: "varchar"; size: number; required?: boolean; default?: string }
  | { key: string; type: "text"; required?: boolean }
  | { key: string; type: "integer"; required?: boolean; default?: number; min?: number }
  | { key: string; type: "bigint"; required?: boolean; min?: number }
  | { key: string; type: "float"; required?: boolean }
  | { key: string; type: "boolean"; required?: boolean; default?: boolean }
  | { key: string; type: "datetime"; required?: boolean }
  | {
      key: string;
      type: "enum";
      elements: readonly string[];
      required?: boolean;
      default?: string;
    };

export type IndexSpec = {
  key: string;
  type: "key" | "unique" | "fulltext";
  columns: string[];
  orders?: ("asc" | "desc")[];
};

export type TableSpec = {
  id: string;
  name: string;
  // Request-scoped rows carry per-row read permission for the request owner,
  // which is what lets Realtime deliver them to that user and no one else.
  rowSecurity: boolean;
  // Table-level grants. Writes always go through the server with an API key.
  readableByAnyUser?: boolean;
  columns: ColumnSpec[];
  indexes: IndexSpec[];
};

// Appwrite ids are at most 36 characters.
const id = (key: string, required = true): ColumnSpec => ({
  key,
  type: "varchar",
  size: 36,
  required,
});
const currency: ColumnSpec = { key: "currency", type: "varchar", size: 3, required: true };

export const TABLES = {
  requests: {
    id: "requests",
    name: "Requests",
    rowSecurity: true,
    columns: [
      id("userId"),
      { key: "title", type: "varchar", size: 200, required: true },
      { key: "rawText", type: "text", required: true },
      { key: "status", type: "enum", elements: REQUEST_STATUS, required: true },
      { key: "deliverTo", type: "varchar", size: 200, required: true },
      { key: "deliveryWindowDays", type: "integer", min: 0 },
      { key: "budgetMinor", type: "bigint", min: 0 },
      currency,
      { key: "failureReason", type: "text" },
    ],
    indexes: [
      { key: "by_userId", type: "key", columns: ["userId", "$createdAt"], orders: ["asc", "desc"] },
      { key: "by_status", type: "key", columns: ["status"] },
    ],
  },

  lineItems: {
    id: "lineItems",
    name: "Line items",
    rowSecurity: true,
    columns: [
      id("requestId"),
      { key: "description", type: "varchar", size: 500, required: true },
      { key: "quantity", type: "integer", required: true, min: 1 },
      { key: "unit", type: "varchar", size: 32 },
      // JSON object of spec name -> value, e.g. {"CPU":"i7","RAM":"16GB"}.
      { key: "specs", type: "text" },
    ],
    indexes: [
      { key: "by_requestId", type: "key", columns: ["requestId"] },
      { key: "search_description", type: "fulltext", columns: ["description"] },
    ],
  },

  // Organisations, deduped by registrable domain and shared across requests,
  // so a supplier found for one buyer is already known for the next.
  suppliers: {
    id: "suppliers",
    name: "Suppliers",
    rowSecurity: false,
    readableByAnyUser: true,
    columns: [
      { key: "name", type: "varchar", size: 200, required: true },
      { key: "domain", type: "varchar", size: 253, required: true },
      { key: "websiteUrl", type: "text" },
      { key: "country", type: "varchar", size: 64 },
      { key: "discoveredVia", type: "enum", elements: DISCOVERED_VIA, required: true },
      { key: "sourceUrl", type: "text" },
    ],
    indexes: [
      { key: "by_domain", type: "unique", columns: ["domain"] },
      { key: "by_country", type: "key", columns: ["country"] },
      { key: "search_name", type: "fulltext", columns: ["name"] },
    ],
  },

  contacts: {
    id: "contacts",
    name: "Contacts",
    rowSecurity: false,
    readableByAnyUser: true,
    columns: [
      id("supplierId"),
      { key: "email", type: "varchar", size: 320, required: true },
      { key: "role", type: "varchar", size: 100 },
      {
        key: "verification",
        type: "enum",
        elements: CONTACT_VERIFICATION,
        required: true,
      },
      { key: "verifiedAt", type: "datetime" },
      { key: "sourceUrl", type: "text" },
    ],
    indexes: [
      { key: "by_supplier_email", type: "unique", columns: ["supplierId", "email"] },
      { key: "by_email", type: "key", columns: ["email"] },
    ],
  },

  // One per (request, supplier): the draft, its approval, and the mail thread.
  rfqs: {
    id: "rfqs",
    name: "RFQs",
    rowSecurity: true,
    columns: [
      id("requestId"),
      id("supplierId"),
      id("contactId", false),
      { key: "status", type: "enum", elements: RFQ_STATUS, required: true },
      { key: "subject", type: "varchar", size: 300, required: true },
      { key: "body", type: "text", required: true },
      { key: "inboxId", type: "varchar", size: 255 },
      { key: "threadId", type: "varchar", size: 255 },
      { key: "outboundId", type: "varchar", size: 255 },
      { key: "approvedAt", type: "datetime" },
      { key: "sentAt", type: "datetime" },
      { key: "repliedAt", type: "datetime" },
      { key: "chaseCount", type: "integer", default: 0, min: 0 },
      { key: "lastChasedAt", type: "datetime" },
      { key: "failureReason", type: "text" },
    ],
    indexes: [
      { key: "by_request_supplier", type: "unique", columns: ["requestId", "supplierId"] },
      { key: "by_supplierId", type: "key", columns: ["supplierId"] },
      { key: "by_threadId", type: "key", columns: ["threadId"] },
      { key: "by_status", type: "key", columns: ["status"] },
    ],
  },

  quotes: {
    id: "quotes",
    name: "Quotes",
    rowSecurity: true,
    columns: [
      id("requestId"),
      id("supplierId"),
      id("rfqId", false),
      { key: "source", type: "enum", elements: QUOTE_SOURCE, required: true },
      { key: "confidence", type: "enum", elements: CONFIDENCE, required: true },
      { key: "totalMinor", type: "bigint", required: true, min: 0 },
      currency,
      { key: "vatIncluded", type: "boolean", required: true },
      { key: "incoterm", type: "varchar", size: 16 },
      // USD normalisation plus the snapshot of the rate that produced it, so a
      // quote cannot silently change value when the shilling moves.
      { key: "normalizedUsdMinor", type: "bigint", min: 0 },
      { key: "fxRate", type: "float" },
      { key: "fxRateAt", type: "datetime" },
      { key: "fxSource", type: "varchar", size: 64 },
      { key: "leadTimeDays", type: "integer", min: 0 },
      { key: "warrantyMonths", type: "integer", min: 0 },
      { key: "validUntil", type: "datetime" },
      // Set on a crawled quote once an emailed quote for the same supplier
      // lands. The row is kept, so the audit trail shows both.
      id("supersededBy", false),
      { key: "sourceUrl", type: "text" },
    ],
    indexes: [
      { key: "by_request_supplier", type: "key", columns: ["requestId", "supplierId"] },
      { key: "by_supplierId", type: "key", columns: ["supplierId"] },
    ],
  },

  quoteLines: {
    id: "quoteLines",
    name: "Quote lines",
    rowSecurity: true,
    columns: [
      id("quoteId"),
      id("lineItemId", false),
      { key: "description", type: "varchar", size: 500, required: true },
      { key: "quantity", type: "integer", required: true, min: 0 },
      { key: "unitPriceMinor", type: "bigint", required: true, min: 0 },
      { key: "totalMinor", type: "bigint", required: true, min: 0 },
      currency,
    ],
    indexes: [{ key: "by_quoteId", type: "key", columns: ["quoteId"] }],
  },

  // Idempotency at the door: one row per AgentMail event, enforced by a unique
  // index, so a redelivered webhook can never produce a second quote.
  inboundParses: {
    id: "inboundParses",
    name: "Inbound parses",
    rowSecurity: true,
    columns: [
      { key: "eventId", type: "varchar", size: 255, required: true },
      { key: "messageId", type: "varchar", size: 255, required: true },
      { key: "threadId", type: "varchar", size: 255 },
      { key: "inboxId", type: "varchar", size: 255 },
      id("rfqId", false),
      // Set only for a reply that matched no RFQ but belongs to exactly one
      // request, so its owner can link it by hand. Never confirms a quote.
      id("candidateRequestId", false),
      { key: "state", type: "enum", elements: PARSE_STATE, required: true },
      { key: "reason", type: "text" },
      id("quoteId", false),
      { key: "attempts", type: "integer", default: 0, min: 0 },
      { key: "lastError", type: "text" },
      { key: "fromAddress", type: "varchar", size: 320 },
      // Clipped message body, kept so a held reply can be read and re-parsed
      // without another round-trip to AgentMail.
      { key: "text", type: "text" },
    ],
    indexes: [
      { key: "by_eventId", type: "unique", columns: ["eventId"] },
      { key: "by_state", type: "key", columns: ["state"] },
      { key: "by_rfqId", type: "key", columns: ["rfqId"] },
      { key: "by_candidateRequestId", type: "key", columns: ["candidateRequestId"] },
    ],
  },

  // The decision, its reasoning, and the trade-off it accepts by name.
  recommendations: {
    id: "recommendations",
    name: "Recommendations",
    rowSecurity: true,
    columns: [
      id("requestId"),
      id("quoteId"),
      { key: "rationale", type: "text", required: true },
      { key: "tradeoff", type: "text", required: true },
      { key: "totalLandedUsdMinor", type: "bigint", min: 0 },
      { key: "leadTimeDays", type: "integer", min: 0 },
      // JSON array of {label, value}: the inputs behind the call.
      { key: "inputs", type: "text" },
    ],
    indexes: [{ key: "by_requestId", type: "key", columns: ["requestId", "$createdAt"], orders: ["asc", "desc"] }],
  },

  // Pro-forma PDFs that arrive on a reply; the bytes live in Appwrite Storage.
  attachments: {
    id: "attachments",
    name: "Attachments",
    rowSecurity: true,
    columns: [
      id("rfqId", false),
      id("inboundParseId", false),
      id("fileId"),
      { key: "filename", type: "varchar", size: 255, required: true },
      { key: "contentType", type: "varchar", size: 128 },
      { key: "sizeBytes", type: "integer", min: 0 },
      { key: "parsed", type: "boolean", default: false },
    ],
    indexes: [
      { key: "by_rfqId", type: "key", columns: ["rfqId"] },
      { key: "by_inboundParseId", type: "key", columns: ["inboundParseId"] },
    ],
  },

  // Append-only audit trail for each request.
  events: {
    id: "events",
    name: "Events",
    rowSecurity: true,
    columns: [
      id("requestId", false),
      { key: "kind", type: "varchar", size: 64, required: true },
      { key: "message", type: "text", required: true },
      // JSON object of string -> string.
      { key: "meta", type: "text" },
    ],
    indexes: [
      { key: "by_requestId", type: "key", columns: ["requestId", "$createdAt"] },
      { key: "by_kind", type: "key", columns: ["kind"] },
    ],
  },
} satisfies Record<string, TableSpec>;

export type TableKey = keyof typeof TABLES;

// Appwrite Storage bucket for supplier attachments (PDF quotations). It has
// no public permissions: files are only reachable through the owner-checked
// /api/attachments route, using the server's API key.
export const ATTACHMENTS_BUCKET_ID = "6addafa900340bd5d7c7";
