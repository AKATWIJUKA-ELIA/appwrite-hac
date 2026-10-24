import { NextResponse } from "next/server";
import { failStalledRequests, sendDueChaseUps } from "@/lib/pipeline/maintenance";
import { isCronAuthorized } from "@/lib/server/cron-auth";

// Called every few minutes by a scheduled Appwrite Function. It sends due
// follow-ups to silent suppliers and fails requests whose job died, so they
// can be retried. Each part runs even if the other throws.
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [chases, stalled] = await Promise.allSettled([sendDueChaseUps(), failStalledRequests()]);
  const summary = {
    ok: chases.status === "fulfilled" && stalled.status === "fulfilled",
    chases: chases.status === "fulfilled" ? chases.value : { error: String(chases.reason) },
    stalled: stalled.status === "fulfilled" ? stalled.value : { error: String(stalled.reason) },
  };
  if (!summary.ok) console.error("[cron] tick had failures", summary);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
