// RFQ wording lives here so discovery and the send gate compose the identical
// message. A supplier should never receive two differently-worded requests
// depending on which code path drafted it.

// Drafts written before the postal address was configurable carry this line.
// It must never reach a supplier, so finalizeRfqBody() replaces it.
const LEGACY_ADDRESS_PLACEHOLDER =
  "TODO(build day): add the registered postal address before the first send.";

export function composeRfqBody(args: {
  supplierName: string;
  title: string;
  items: Array<{ description: string; quantity: number }>;
  deliverTo: string;
  deliveryWindowDays?: number;
  budget?: string;
  /** The sender's registered postal address, for the compliance footer. */
  postalAddress?: string;
}): string {
  const lines = args.items
    .map((item) => `  • ${item.quantity} × ${item.description}`)
    .join("\n");

  return [
    `Hello ${args.supplierName},`,
    "",
    "We are sourcing the following and would like a quotation:",
    "",
    lines,
    "",
    `Deliver to: ${args.deliverTo}`,
    args.deliveryWindowDays
      ? `Required within: ${args.deliveryWindowDays} days`
      : null,
    args.budget ? `Indicative budget: ${args.budget}` : null,
    "",
    "Please include unit price, total, whether VAT is included, lead time, and",
    "warranty terms. A reply to this email reaches us directly.",
    "",
    "Thank you,",
    "Quotebook",
    "",
    "—",
    // Compliance footer: a real reply-to, a way out, and a postal address are
    // what keep cold outbound out of the spam bucket.
    "You received this because your business is listed as a supplier of this",
    "equipment. Reply STOP and we will not contact you again.",
    args.postalAddress?.trim() || null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * The exact text that goes out, and that the preview shows: a stored draft
 * with the old placeholder gets the configured address, or loses the line.
 */
export function finalizeRfqBody(body: string, postalAddress?: string): string {
  if (!body.includes(LEGACY_ADDRESS_PLACEHOLDER)) return body;
  const address = postalAddress?.trim();
  return address
    ? body.replace(LEGACY_ADDRESS_PLACEHOLDER, address)
    : body.replace(`\n${LEGACY_ADDRESS_PLACEHOLDER}`, "").replace(LEGACY_ADDRESS_PLACEHOLDER, "");
}
