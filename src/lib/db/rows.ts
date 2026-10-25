import type { Models } from "node-appwrite";
import type {
  Confidence,
  ContactVerification,
  ParseState,
  QuoteSource,
  RequestStatus,
  RfqStatus,
} from "@/lib/db/schema";

// Row shapes as TablesDB returns them, mirroring src/lib/db/schema.ts.
// Optional columns come back as null when unset. Datetime columns are ISO
// strings; JSON columns (specs, meta, inputs) are strings until parsed.

export type RequestRow = Models.Row & {
  userId: string;
  title: string;
  rawText: string;
  status: RequestStatus;
  deliverTo: string;
  deliveryWindowDays: number | null;
  budgetMinor: number | null;
  currency: string;
  failureReason: string | null;
  awardedQuoteId: string | null;
  poNumber: string | null;
  awardedAt: string | null;
};

export type LineItemRow = Models.Row & {
  requestId: string;
  description: string;
  quantity: number;
  unit: string | null;
  specs: string | null;
};

export type SupplierRow = Models.Row & {
  name: string;
  domain: string;
  websiteUrl: string | null;
  country: string | null;
  discoveredVia: "crawled" | "seed";
  sourceUrl: string | null;
};

export type ContactRow = Models.Row & {
  supplierId: string;
  email: string;
  role: string | null;
  verification: ContactVerification;
  verifiedAt: string | null;
  sourceUrl: string | null;
};

export type RfqRow = Models.Row & {
  requestId: string;
  supplierId: string;
  contactId: string | null;
  status: RfqStatus;
  subject: string;
  body: string;
  inboxId: string | null;
  threadId: string | null;
  outboundId: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  chaseCount: number;
  lastChasedAt: string | null;
  failureReason: string | null;
};

export type QuoteRow = Models.Row & {
  requestId: string;
  supplierId: string;
  rfqId: string | null;
  source: QuoteSource;
  confidence: Confidence;
  totalMinor: number;
  currency: string;
  vatIncluded: boolean;
  incoterm: string | null;
  normalizedUsdMinor: number | null;
  fxRate: number | null;
  fxRateAt: string | null;
  fxSource: string | null;
  leadTimeDays: number | null;
  warrantyMonths: number | null;
  validUntil: string | null;
  supersededBy: string | null;
  sourceUrl: string | null;
};

export type InboundParseRow = Models.Row & {
  eventId: string;
  messageId: string;
  threadId: string | null;
  inboxId: string | null;
  rfqId: string | null;
  candidateRequestId: string | null;
  state: ParseState;
  reason: string | null;
  quoteId: string | null;
  attempts: number;
  lastError: string | null;
  fromAddress: string | null;
  text: string | null;
};

export type RecommendationRow = Models.Row & {
  requestId: string;
  quoteId: string;
  rationale: string;
  tradeoff: string;
  totalLandedUsdMinor: number | null;
  leadTimeDays: number | null;
  inputs: string | null;
};

export type EventRow = Models.Row & {
  requestId: string | null;
  kind: string;
  message: string;
  meta: string | null;
};

export type AttachmentRow = Models.Row & {
  rfqId: string | null;
  inboundParseId: string | null;
  /** The file's id in the attachments Storage bucket. */
  fileId: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  /** True once text was read out of the file for the quote parser. */
  parsed: boolean;
};
