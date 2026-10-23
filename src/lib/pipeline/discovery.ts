import "server-only";

import type { RequestRow } from "@/lib/db/rows";

/**
 * Pipeline step 2: find suppliers for an extracted request.
 *
 * Called once the spec is saved and the request is in `discovering`. The
 * search itself (Firecrawl search, scrape, extract, MX check, and writing
 * suppliers, contacts, web-price quotes and RFQ drafts) is ROADMAP Phase 2;
 * until it lands, requests wait here in "Finding suppliers".
 */
export async function startDiscovery(_request: RequestRow): Promise<void> {}
