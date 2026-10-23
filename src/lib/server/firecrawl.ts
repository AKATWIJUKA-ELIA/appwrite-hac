import "server-only";

import Firecrawl from "@mendable/firecrawl-js";

let client: Firecrawl | null = null;

/** One Firecrawl client per server process, created on first use. */
export function firecrawl(): Firecrawl {
  if (!client) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");
    client = new Firecrawl({ apiKey });
  }
  return client;
}
