// Kept free of server-only imports so src/proxy.ts can read it too.
export const SESSION_COOKIE = "qb_session";

// Where a signed-in user lands: after sign-in, and when opening / or an auth page.
export const HOME_PATH = "/requests";

export const AUTH_PATHS = ["/sign-in", "/sign-up"];
export const LANDING_PATH = "/";

// Only same-origin paths, so a crafted ?next= cannot bounce a user off-site.
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : HOME_PATH;
}
