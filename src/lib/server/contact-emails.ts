import "server-only";

import { registrableDomain } from "@/lib/domains";

// Finding a supplier's address without guessing one. Every address here was
// literally on one of the supplier's pages, as text or as a mailto: link.

const EMAIL = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

// Strings that match the email pattern but are not anyone's inbox: retina
// image names, placeholders, and the error-tracking addresses site builders
// embed in every page.
const NOT_AN_INBOX_DOMAIN =
  /(^|\.)(example\.(com|org|net)|domain\.com|email\.com|yourdomain\.com|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com|mysite\.com)$/i;
const IMAGE_SUFFIX = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i;
const NO_REPLY = /^(no-?reply|donotreply|do-not-reply|mailer-daemon|postmaster)\b/i;

// Inboxes that read RFQs, best first. Support desks answer, but slowly and to
// the wrong team, so they rank last.
const ROLE_RANK = [
  /^(sales|procurement|purchasing|orders?|quotes?|rfq)\b/i,
  /^(info|contact|enquir|inquir|hello|office|admin)/i,
  /^(support|help|service|care)/i,
];

function clean(raw: string): string | null {
  const email = raw.trim().toLowerCase().replace(/\.+$/, "");
  const [local, domain] = email.split("@");
  if (!local || !domain) return null;
  if (IMAGE_SUFFIX.test(email) || NOT_AN_INBOX_DOMAIN.test(domain) || NO_REPLY.test(local)) {
    return null;
  }
  return email;
}

/** Every plausible address on a page: mailto: links first, then the text. */
export function harvestEmails(texts: string[], links: string[]): string[] {
  const found = new Set<string>();
  for (const link of links) {
    if (!link.toLowerCase().startsWith("mailto:")) continue;
    const address = decodeURIComponent(link.slice("mailto:".length).split("?")[0] ?? "");
    for (const part of address.split(",")) {
      const email = clean(part);
      if (email) found.add(email);
    }
  }
  for (const text of texts) {
    for (const match of text.matchAll(EMAIL)) {
      const email = clean(match[0]);
      if (email) found.add(email);
    }
  }
  return [...found];
}

function roleRank(email: string): number {
  const local = email.split("@")[0];
  const index = ROLE_RANK.findIndex((pattern) => pattern.test(local));
  return index === -1 ? ROLE_RANK.length : index;
}

/**
 * The best address for an RFQ. An address on the supplier's own domain wins;
 * one elsewhere (a seller's Gmail on a marketplace listing, say) is used only
 * when the site offers nothing of its own.
 */
export function pickContactEmail(emails: string[], supplierDomain: string): string | undefined {
  const sorted = [...emails].sort((a, b) => roleRank(a) - roleRank(b));
  const own = sorted.find((email) => registrableDomain(email.split("@")[1]) === supplierDomain);
  return own ?? sorted[0];
}

/** True when `email` is on the supplier's own registrable domain. */
export function isOwnDomain(email: string, supplierDomain: string): boolean {
  return registrableDomain(email.split("@")[1] ?? "") === supplierDomain;
}

/**
 * Where the site keeps its address: a linked contact page if there is one,
 * otherwise its home page, whose footer usually carries it.
 */
export function contactPageUrl(pageUrl: string, links: string[], supplierDomain: string): string {
  const candidates = links.filter((link) => {
    try {
      const url = new URL(link);
      return (
        /^https?:$/.test(url.protocol) &&
        registrableDomain(url.hostname) === supplierDomain &&
        /contact|kontakt|reach-us|get-in-touch|about/i.test(url.pathname)
      );
    } catch {
      return false;
    }
  });
  const best =
    candidates.find((link) => /contact|kontakt|reach-us|get-in-touch/i.test(new URL(link).pathname)) ??
    candidates[0];
  return best ?? new URL("/", pageUrl).toString();
}
