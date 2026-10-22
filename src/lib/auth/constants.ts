// Kept free of server-only imports so src/proxy.ts can read it too.
export const SESSION_COOKIE = "qb_session";

export const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

// Only same-origin paths, so a crafted ?next= cannot bounce a user off-site.
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
