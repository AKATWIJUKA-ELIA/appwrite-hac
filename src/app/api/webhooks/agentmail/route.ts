import { after } from "next/server";
import { addressOf, onMessageReceived, parseMessage } from "@/lib/pipeline/inbound";
import { readSvixHeaders, verifySvixSignature } from "@/lib/server/svix";

/**
 * AgentMail delivers inbound mail here.
 *
 * Every delivery is signature-checked on the exact raw body before anything is
 * read or written. A received message is recorded (once per event id) and
 * acknowledged immediately; reading the quote runs after the response, so
 * AgentMail never waits on a model call and never retries for that reason.
 */
export async function POST(request: Request) {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 500 });

  const raw = await request.text();
  const verified = await verifySvixSignature({ secret, rawBody: raw, headers: readSvixHeaders(request) });
  if (!verified) return new Response("invalid signature", { status: 401 });

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    payload = parsed as Record<string, unknown>;
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  const eventType = typeof payload.event_type === "string" ? payload.event_type : "";
  // Anything we have no use for is acknowledged, so AgentMail stops retrying.
  if (!eventType.startsWith("message.received")) return new Response(null, { status: 204 });

  const eventId = typeof payload.event_id === "string" ? payload.event_id : null;
  if (!eventId) return new Response("missing event id", { status: 400 });

  const message =
    typeof payload.message === "object" && payload.message !== null
      ? (payload.message as Record<string, unknown>)
      : {};

  // Mail we sent ourselves (an RFQ addressed to our own inbox, say) also
  // arrives as "received". It is not a supplier's reply.
  const from = typeof message.from === "string" ? addressOf(message.from) : "";
  const inbox = typeof message.inbox_id === "string" ? message.inbox_id.toLowerCase() : "";
  if (from && from === inbox) return new Response(null, { status: 204 });

  const parseId = await onMessageReceived({
    eventId,
    message,
    // AgentMail marks senders that failed SPF/DKIM/DMARC with this event type.
    unauthenticated: eventType === "message.received.unauthenticated",
  });

  if (parseId) {
    after(async () => {
      try {
        await parseMessage(parseId);
      } catch (err) {
        // parseMessage records its own failures; this only catches a lost
        // connection before it could. The row stays visible as "received".
        console.error("[webhook] parse failed", parseId, err);
      }
    });
  }
  return new Response(null, { status: 204 });
}
