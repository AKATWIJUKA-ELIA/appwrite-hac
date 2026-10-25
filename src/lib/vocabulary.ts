/**
 * One place that turns a database state into words a procurement officer
 * understands. "collecting" is a row value; "Waiting on replies" is what is
 * actually happening to their request.
 */

import type { ContactVerification, RequestStatus, RfqStatus } from "@/lib/db/schema";

export type Tone = "neutral" | "busy" | "action" | "good" | "bad";

export const STATUS_COPY: Record<RequestStatus, { label: string; hint: string; tone: Tone }> = {
  draft: {
    label: "Draft",
    hint: "Not started yet.",
    tone: "neutral",
  },
  extracting: {
    label: "Reading request",
    hint: "Turning your description into a structured specification.",
    tone: "busy",
  },
  discovering: {
    label: "Finding suppliers",
    hint: "Searching the web and marketplaces for vendors who stock this.",
    tone: "busy",
  },
  awaiting_approval: {
    label: "Needs your approval",
    hint: "Suppliers found. Nothing is emailed until you approve the recipients.",
    tone: "action",
  },
  collecting: {
    label: "Waiting on replies",
    hint: "Requests for quotation are out. Replies upgrade the board as they land.",
    tone: "busy",
  },
  decided: {
    label: "Decided",
    hint: "A supplier has been recommended. Award the order when you are ready.",
    tone: "good",
  },
  awarded: {
    label: "Awarded",
    hint: "A purchase order has gone to the chosen supplier. Their acceptance arrives in the conversation.",
    tone: "good",
  },
  failed: {
    label: "Failed",
    hint: "Something went wrong. It can be retried.",
    tone: "bad",
  },
};

export type BoardTrack = "confirmed" | "web price" | "awaiting" | "no price";

export const TRACK_COPY: Record<BoardTrack, { label: string; hint: string }> = {
  confirmed: {
    label: "Confirmed",
    hint: "Price came from the supplier's own emailed reply. Trustworthy.",
  },
  "web price": {
    label: "Web price",
    hint: "Scraped from the supplier's website. Indicative only — not confirmed.",
  },
  awaiting: {
    label: "Awaiting reply",
    hint: "We emailed this supplier and have not heard back yet.",
  },
  "no price": {
    label: "No price",
    hint: "Supplier found, but no published price and not yet contacted.",
  },
};

export const RFQ_STATUS_LABEL: Record<RfqStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  sent: "Sent",
  replied: "Replied",
  bounced: "Bounced",
  cancelled: "Cancelled",
  failed: "Failed",
};

export const VERIFICATION_COPY: Record<ContactVerification, { label: string; hint: string }> = {
  unverified: {
    label: "Unverified",
    hint: "We have not checked whether this domain accepts mail.",
  },
  mx_valid: {
    label: "Deliverable",
    hint: "The domain has mail servers, so this address can receive email.",
  },
  mx_invalid: {
    label: "Undeliverable",
    hint: "No mail servers on this domain. Email here will almost certainly fail.",
  },
  bounced: {
    label: "Bounced",
    hint: "We sent to this address and it was rejected.",
  },
};
