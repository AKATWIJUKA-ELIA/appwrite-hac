// Failures, in words a buyer can act on. Providers answer with status codes
// and JSON; that detail belongs in the server log, never on the screen.

const text = (error: unknown) => (error instanceof Error ? error.message : String(error ?? ""));

/** Why an email to `to` did not leave, phrased for the buyer. */
export function emailFailure(error: unknown, to: string): string {
  const raw = text(error);
  if (/\b429\b|rate.?limit|limit exceeded|too many/i.test(raw)) {
    return `Not sent to ${to}: our email service is limiting how many new recipients we can contact right now. Try again later; your approval is kept.`;
  }
  if (/\b(400|422)\b|invalid.*(address|recipient|email)|bounce/i.test(raw)) {
    return `Not sent: ${to} was rejected as an address. Check it, or change the address and try again.`;
  }
  if (/\b(401|403)\b|not set|unauthori[sz]ed|forbidden/i.test(raw)) {
    return "Not sent: email sending is not set up correctly on the server. Nothing was sent.";
  }
  if (/fetch failed|timed? ?out|ECONN|ENOTFOUND|ETIMEDOUT|network|\b5\d\d\b/i.test(raw)) {
    return `Not sent to ${to}: the email service could not be reached. Try again in a moment.`;
  }
  return `Not sent to ${to}. Try again in a moment.`;
}

/** Why a pipeline step stopped, phrased for the buyer. `step` is e.g. "Reading the request". */
export function stepFailure(error: unknown, step: string): string {
  const raw = text(error);
  if (/\b429\b|rate.?limit|quota|too many/i.test(raw)) {
    return `${step} paused: a service we rely on is busy right now. Try again in a few minutes.`;
  }
  if (/token cap|output hit/i.test(raw)) {
    return `${step} could not finish: the request was too long to read in one go. Try shortening it.`;
  }
  if (/fetch failed|timed? ?out|ECONN|ENOTFOUND|ETIMEDOUT|network|\b5\d\d\b/i.test(raw)) {
    return `${step} stopped: a service we rely on did not respond. Try again in a moment.`;
  }
  return `${step} stopped unexpectedly. Try again.`;
}

/**
 * A stored reason, made presentable. New reasons are already written in plain
 * words; this cleans up older ones saved with a provider's raw response.
 */
export function presentableReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const technical = /AgentMail \d{3}|OpenAI \d{3}|Firecrawl|\{"|fetch failed|HTTP \d{3}|Error:/i.test(reason);
  if (!technical) return reason;
  const to = /Send to (\S+@\S+?) failed/i.exec(reason)?.[1];
  if (to || /AgentMail/i.test(reason)) return emailFailure(reason, to ?? "this supplier");
  if (/^Parse failed/i.test(reason)) return "This reply could not be read automatically. Read it, then release it to try again.";
  const step = /^Extraction/i.test(reason) ? "Reading the request" : /^Supplier search/i.test(reason) ? "Supplier search" : "This step";
  return stepFailure(reason, step);
}
