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

export type ThreadMessage = {
  messageId: string;
  from: string;
  to: string[];
  sentAt: string;
  /** "out" for mail we sent, "in" for mail the supplier sent. */
  direction: "in" | "out";
  /** The message without the quoted history underneath, when AgentMail could separate it. */
  text: string;
};

/** Every message on a thread, oldest first. */
export async function getThread(
  inboxId: string,
  threadId: string,
): Promise<{ messages: ThreadMessage[]; lastMessageId: string | null }> {
  const { apiKey, baseUrl } = config();
  const response = await fetch(
    `${baseUrl}/inboxes/${encodeURIComponent(inboxId)}/threads/${encodeURIComponent(threadId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AgentMail ${response.status}: ${detail.slice(0, 200)}`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  const raw = Array.isArray(body.messages) ? (body.messages as Record<string, unknown>[]) : [];
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const messages = raw.map((m) => ({
    messageId: str(m.message_id),
    from: str(m.from),
    to: Array.isArray(m.to) ? m.to.filter((t): t is string => typeof t === "string") : [],
    sentAt: str(m.timestamp),
    direction: (Array.isArray(m.labels) && m.labels.includes("sent") ? "out" : "in") as "in" | "out",
    text: str(m.extracted_text) || str(m.text),
  }));
  messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const last = str(body.last_message_id) || messages.at(-1)?.messageId || null;
  return { messages, lastMessageId: last };
}

/**
 * Reply to a message, so the recipient sees it threaded under the email they
 * sent rather than as a new conversation.
 */
export async function replyToMessage(args: {
  inboxId: string;
  messageId: string;
  text: string;
}): Promise<{ messageId?: string; threadId?: string }> {
  const { apiKey, baseUrl } = config();
  const path = `/inboxes/${encodeURIComponent(args.inboxId)}/messages/${encodeURIComponent(args.messageId)}/reply`;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: args.text }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AgentMail ${response.status}: ${detail.slice(0, 200)}`);
  }
  const body: unknown = await response.json().catch(() => null);
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  return {
    messageId: typeof record.message_id === "string" ? record.message_id : undefined,
    threadId: typeof record.thread_id === "string" ? record.thread_id : undefined,
  };
}

export type AttachmentInfo = {
  attachmentId: string;
  filename: string;
  contentType: string;
  size: number;
};

/** The files attached to one message. */
export async function getMessageAttachments(inboxId: string, messageId: string): Promise<AttachmentInfo[]> {
  const { apiKey, baseUrl } = config();
  const response = await fetch(
    `${baseUrl}/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`AgentMail ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as { attachments?: unknown };
  const list = Array.isArray(body.attachments) ? (body.attachments as Record<string, unknown>[]) : [];
  return list.flatMap((a) =>
    typeof a.attachment_id === "string"
      ? [{
          attachmentId: a.attachment_id,
          filename: typeof a.filename === "string" && a.filename ? a.filename : "attachment",
          contentType: typeof a.content_type === "string" ? a.content_type : "application/octet-stream",
          size: typeof a.size === "number" ? a.size : 0,
        }]
      : [],
  );
}

/**
 * An attachment's bytes. AgentMail answers with a short-lived signed URL,
 * which is fetched straight away.
 */
export async function downloadAttachment(inboxId: string, messageId: string, attachmentId: string): Promise<Uint8Array> {
  const { apiKey, baseUrl } = config();
  const path = `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const meta = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
  if (!meta.ok) throw new Error(`AgentMail ${meta.status}: ${(await meta.text()).slice(0, 200)}`);
  const { download_url: url } = (await meta.json()) as { download_url?: string };
  if (!url) throw new Error("AgentMail returned no download URL");
  const file = await fetch(url, { cache: "no-store" });
  if (!file.ok) throw new Error(`Attachment download failed: HTTP ${file.status}`);
  return new Uint8Array(await file.arrayBuffer());
}
