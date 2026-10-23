import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/server/cron-auth";

// Called every few minutes by a scheduled Appwrite Function. It will send due
// chase-ups and re-run requests stalled in one status (ROADMAP Phase 5); for
// now it only proves the schedule and the secret work end to end.
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ran: [] });
}
