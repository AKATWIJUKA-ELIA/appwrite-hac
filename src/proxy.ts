import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PATHS, HOME_PATH, LANDING_PATH, SESSION_COOKIE } from "@/lib/auth/constants";

// Optimistic redirects on cookie presence only. This is a convenience, not the
// boundary: every page and action re-checks the session with Appwrite through
// getCurrentUser()/requireUser() in src/lib/auth/session.ts.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const isPublic = pathname === LANDING_PATH || AUTH_PATHS.includes(pathname);

  if (!signedIn && !isPublic) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && isPublic) {
    return NextResponse.redirect(new URL(HOME_PATH, request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip API routes (they authorize themselves), Next internals, and files.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
