import "server-only";

import { formatMoney } from "@/lib/money";
import type { LineItemRow, QuoteRow, RequestRow } from "@/lib/db/rows";

export type Buyer = { name: string; email: string; organisation?: string };

/** A readable, unique-enough PO number: date plus the tail of the request id. */
export function poNumberFor(request: RequestRow, now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `PO-${day}-${request.$id.slice(-5).toUpperCase()}`;
}

/**
 * The purchase order, drafted from what Quotebook already knows: the items,
 * the supplier's confirmed price and terms, the delivery details and the
 * buyer. The buyer edits it before it is sent, so anything we cannot know
 * (payment terms, a postal address when none is configured) is phrased as an
 * open line rather than invented.
 */
export function draftPurchaseOrder(args: {
  poNumber: string;
  request: RequestRow;
  lineItems: LineItemRow[];
  quote: QuoteRow;
  supplierName: string;
  buyer: Buyer;
  postalAddress?: string;
  now?: Date;
}): string {
  const { request, quote, buyer } = args;
  const date = (args.now ?? new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const from = [buyer.name, buyer.organisation].filter(Boolean).join(", ");
  const vat = quote.vatIncluded ? "VAT included" : "VAT not included";
  const delivery =
    quote.leadTimeDays !== null
      ? `${request.deliverTo}, within ${quote.leadTimeDays} days as quoted`
      : request.deliveryWindowDays !== null
        ? `${request.deliverTo}, within ${request.deliveryWindowDays} days`
        : request.deliverTo;

  return [
    `PURCHASE ORDER ${args.poNumber}`,
    `Date: ${date}`,
    "",
    `To: ${args.supplierName}`,
    `From: ${from}`,
    args.postalAddress?.trim() || null,
    "",
    "Thank you for your quotation. We are pleased to place the following order:",
    "",
    ...args.lineItems.map((item) => `  • ${item.quantity} × ${item.description}`),
    "",
    `Order total: ${formatMoney(quote.totalMinor, quote.currency)} (${vat})`,
    `Delivery: ${delivery}`,
    quote.warrantyMonths !== null ? `Warranty: ${quote.warrantyMonths} months as quoted` : null,
    "Payment terms: as agreed. Please state your terms on the pro-forma invoice.",
    "",
    `Please confirm acceptance of this order by replying to this email, and send your pro-forma invoice quoting ${args.poNumber}.`,
    "",
    "Regards,",
    buyer.name,
    buyer.organisation ?? null,
    buyer.email,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** A courteous note to the suppliers who were not chosen. */
export function draftDecline(args: { title: string; buyer: Buyer }): string {
  return [
    `Thank you for your quotation for ${args.title}.`,
    "",
    "After comparing the offers we received, we have decided to proceed with another supplier on this occasion. We appreciate the time you took, and hope to work with you on future requests.",
    "",
    "Regards,",
    args.buyer.name,
    args.buyer.organisation ?? null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
