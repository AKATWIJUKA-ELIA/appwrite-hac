import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Lands here when the session cookie no longer maps to a live Appwrite session.
// Clearing it lets the proxy allow /sign-in instead of bouncing back to /.
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/sign-in", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
