import { exponentFor } from "@/lib/money";

export { formatMoney } from "@/lib/money";

// Appwrite returns datetimes as ISO strings; older callers pass epoch ms.
type When = string | number;
const toMs = (when: When) => (typeof when === "number" ? when : Date.parse(when));

/** Amount only, for table cells where the currency sits in its own column. */
export function formatAmount(minor: number, currency: string): string {
  const exponent = exponentFor(currency);
  return (minor / 10 ** exponent).toLocaleString(undefined, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
}

export function formatTime(when: When): string {
  return new Date(toMs(when)).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "3 minutes ago" — the sidebar reads better in elapsed time than clock time. */
export function formatRelative(when: When): string {
  const ms = toMs(when);
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
