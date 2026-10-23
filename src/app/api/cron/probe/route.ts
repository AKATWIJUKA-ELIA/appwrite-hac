import { after, NextResponse } from "next/server";
import { recordEvent } from "@/lib/db/server";
import { isCronAuthorized } from "@/lib/server/cron-auth";

const DEFAULT_SECONDS = 20;
const MAX_SECONDS = 120;

// Answers whether this host keeps running work inside `after()` once the
// response has gone out, and for how long, which every pipeline step depends
// on. Call it (optionally with ?seconds=N, up to 120), wait that long plus a
// little, then look for a `probe.after` row in the events table. No row means
// the host stopped the work before the delay ran out.
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const asked = Number(new URL(request.url).searchParams.get("seconds") ?? DEFAULT_SECONDS);
  const seconds = Number.isFinite(asked)
    ? Math.min(Math.max(Math.round(asked), 1), MAX_SECONDS)
    : DEFAULT_SECONDS;
  const startedAt = new Date().toISOString();
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    await recordEvent({
      kind: "probe.after",
      message: `after() ran ${seconds}s after a response sent at ${startedAt}`,
    });
  });
  return NextResponse.json({ ok: true, startedAt, seconds });
}
