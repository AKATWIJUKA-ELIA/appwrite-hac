import "server-only";

// AgentMail over plain REST. Sending is one call per RFQ; inbound mail arrives
// on the webhook route, so there is no client state to keep in sync.

const DEFAULT_BASE_URL = "https://api.agentmail.to/v0";

export { MAX_RECIPIENTS } from "@/lib/limits";

function config() {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) throw new Error("AGENTMAIL_API_KEY is not set");
  const baseUrl = (process.env.AGENTMAIL_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  return { apiKey, baseUrl };
}

/**
 * The one warmed inbox every RFQ is sent from. A stable reply-to address is
 * better for deliverability on cold outbound than a fresh inbox per request.
 */
export function rfqInboxId(): string {
  const inboxId = process.env.AGENTMAIL_INBOX_ID;
  if (!inboxId) throw new Error("AGENTMAIL_INBOX_ID is not set");
  return inboxId;
}

export async function sendMessage(args: {
  inboxId: string;
  to: string;
  subject: string;
  text: string;
  labels?: string[];
}): Promise<{ messageId?: string; threadId?: string }> {
  const { apiKey, baseUrl } = config();
  const path = `/inboxes/${encodeURIComponent(args.inboxId)}/messages/send`;

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      stripUndefined({
        to: [args.to],
        subject: args.subject,
        text: args.text,
        labels: args.labels,
      }),
    ),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AgentMail ${response.status}: ${detail.slice(0, 200)}`);
  }

  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null) return {};
  const record = body as Record<string, unknown>;
  return {
    messageId: typeof record.message_id === "string" ? record.message_id : undefined,
    threadId: typeof record.thread_id === "string" ? record.thread_id : undefined,
  };
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
