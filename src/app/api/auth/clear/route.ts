import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Lands here when the session cookie no longer maps to a live Appwrite session.
// Clearing it lets the proxy allow /sign-in instead of bouncing back to /.
//
// The redirect is relative on purpose: behind the host's reverse proxy,
// request.url carries the container's internal address (localhost:3000), so
// an absolute URL built from it would send the user off the real domain.
export function GET() {
  const response = new NextResponse(null, { status: 307, headers: { Location: "/sign-in" } });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
