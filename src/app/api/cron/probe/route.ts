import { after, NextResponse } from "next/server";
import { recordEvent } from "@/lib/db/server";
import { isCronAuthorized } from "@/lib/server/cron-auth";

const DELAY_MS = 20_000;

// Answers whether this host keeps running work inside `after()` once the
// response has gone out, which every pipeline step depends on. Call it, wait
// half a minute, then look for a `probe.after` row in the events table. If no
// row appears, the host froze the work and the steps must move into an
// Appwrite Function.
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = new Date().toISOString();
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    await recordEvent({
      kind: "probe.after",
      message: `after() ran ${DELAY_MS / 1000}s after a response sent at ${startedAt}`,
    });
  });
  return NextResponse.json({ ok: true, startedAt, expectEventWithin: "30s" });
}
