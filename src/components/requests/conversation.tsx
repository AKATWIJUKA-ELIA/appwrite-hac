"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessagesSquare, Paperclip, RefreshCw, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { loadConversation, sendConversationReply, type Conversation as Thread } from "@/lib/conversations/actions";
import type { RfqStatus } from "@/lib/db/schema";
import { formatMoney, formatRelative, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ThreadSummary = {
  rfqId: string;
  supplierName: string;
  email: string | null;
  status: RfqStatus;
  sentAt: string | null;
  repliedAt: string | null;
  /** What was read from the supplier's reply, shown so the figures can be checked. */
  readAs: {
    totalMinor: number;
    currency: string;
    vatIncluded: boolean | null;
    leadTimeDays: number | null;
    warrantyMonths: number | null;
  } | null;
};

/**
 * Every supplier the buyer has emailed, beside the board, with replies at the
 * top and marked. Picking one opens its email thread right here, with a box
 * to answer it; the answer goes out as an email reply on the same thread.
 */
export function ConversationsPanel({ threads }: Readonly<{ threads: ThreadSummary[] }>) {
  // Replied first (newest reply on top), then the ones still waiting.
  const ordered = [...threads].sort((a, b) => {
    if (!!a.repliedAt !== !!b.repliedAt) return a.repliedAt ? -1 : 1;
    return (b.repliedAt ?? b.sentAt ?? "").localeCompare(a.repliedAt ?? a.sentAt ?? "");
  });
  const [selected, setSelected] = useState<string | null>(ordered[0]?.rfqId ?? null);
  const replied = threads.filter((t) => t.repliedAt).length;
  const current = ordered.find((t) => t.rfqId === selected) ?? null;

  return (
    <Card className={cn(replied > 0 && "border-success/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessagesSquare className="size-4 text-muted-foreground" />
          Conversations
          {replied > 0 && (
            <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
              {replied} replied
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {threads.length === 0
            ? "Suppliers you email appear here, with their replies."
            : "Read replies and answer suppliers without leaving Quotebook."}
        </CardDescription>
      </CardHeader>

      {threads.length > 0 && (
        <CardContent className="space-y-3">
          <ul className="divide-y overflow-hidden rounded-lg border">
            {ordered.map((thread) => {
              const active = thread.rfqId === selected;
              return (
                <li key={thread.rfqId}>
                  <button
                    type="button"
                    onClick={() => setSelected(thread.rfqId)}
                    aria-current={active}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                      active && "bg-accent",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        thread.repliedAt ? "bg-success" : "bg-track-awaiting/60",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{thread.supplierName}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelative(thread.repliedAt ?? thread.sentAt ?? "")}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[11px] text-muted-foreground">{thread.email}</span>
                        {thread.repliedAt ? (
                          <span className="shrink-0 rounded-full bg-success-bg px-1.5 py-px text-[10px] font-medium text-success">
                            Replied
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-muted-foreground">Awaiting reply</span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {current && <ChatThread key={current.rfqId} thread={current} />}
        </CardContent>
      )}
    </Card>
  );
}

/** One supplier's email thread, loaded from AgentMail when shown, with a reply box. */
function ChatThread({ thread: summary }: Readonly<{ thread: ThreadSummary }>) {
  const router = useRouter();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await loadConversation(summary.rfqId);
    setLoading(false);
    if (result.error) setLoadError(result.error);
    else setThread(result.conversation ?? null);
  }, [summary.rfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [thread]);

  function send() {
    setSendError(null);
    const text = draft;
    startSend(async () => {
      const result = await sendConversationReply(summary.rfqId, text);
      if (result.error) {
        setSendError(result.error);
        return;
      }
      setDraft("");
      toast.success(`Reply sent to ${summary.supplierName}.`);
      await load();
      router.refresh();
    });
  }

  const readAs = summary.readAs;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{summary.supplierName}</p>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {readAs && (
        <div className="rounded-lg border border-success/30 bg-success-bg/40 px-3 py-2 text-xs">
          <span className="font-medium text-success">Read as: </span>
          {formatMoney(readAs.totalMinor, readAs.currency)}
          {readAs.vatIncluded !== null && ` · VAT ${readAs.vatIncluded ? "included" : "excluded"}`}
          {readAs.leadTimeDays !== null && ` · ${readAs.leadTimeDays} days`}
          {readAs.warrantyMonths !== null && ` · ${readAs.warrantyMonths} months warranty`}
        </div>
      )}

      <div ref={scroller} className="max-h-[26rem] min-h-32 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
        {loading && !thread && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        )}
        {loadError && (
          <Alert variant="destructive">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}
        {thread?.messages.map((message) => {
          const ours = message.direction === "out";
          return (
            <div key={message.messageId || message.sentAt} className={cn("flex", ours ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[90%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                  ours ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border bg-card",
                )}
              >
                <p className={cn("mb-1 text-[10px]", ours ? "text-primary-foreground/75" : "text-muted-foreground")}>
                  {ours ? "You" : summary.supplierName} · {formatTime(message.sentAt)}
                </p>
                <p className="leading-relaxed break-words whitespace-pre-wrap">
                  {message.text || (message.attachments.length ? "" : "(no text)")}
                </p>
                {message.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {message.attachments.map((file) => (
                      <a
                        key={file.id}
                        href={`/api/attachments/${file.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        <Paperclip className="size-3 shrink-0" />
                        <span className="truncate">{file.filename}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sendError && (
        <Alert variant="destructive">
          <AlertDescription>{sendError}</AlertDescription>
        </Alert>
      )}

      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={`Reply to ${summary.supplierName}…`}
        rows={3}
        disabled={!thread || sending}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && draft.trim()) send();
        }}
      />
      <Button className="w-full" onClick={send} disabled={!thread || sending || !draft.trim()}>
        {sending ? <Loader2 className="animate-spin" /> : <Send />}
        Send reply
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">Arrives as an email reply in the same thread.</p>
    </div>
  );
}
