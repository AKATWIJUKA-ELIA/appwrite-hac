"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessagesSquare, RefreshCw, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { loadConversation, sendConversationReply, type Conversation as Thread } from "@/lib/conversations/actions";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The email thread with one supplier, and a way to answer it without leaving
 * the app. Replies go out as ordinary email on the same thread, so to the
 * supplier it is just a reply from the buyer.
 */
export function Conversation({ rfqId, supplierName }: Readonly<{ rfqId: string; supplierName: string }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await loadConversation(rfqId);
    setLoading(false);
    if (result.error) setLoadError(result.error);
    else setThread(result.conversation ?? null);
  }, [rfqId]);

  // Fetched when opened, not with the page: the thread lives in AgentMail
  // and most visits never open it.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread]);

  function send() {
    setSendError(null);
    const text = draft;
    startSend(async () => {
      const result = await sendConversationReply(rfqId, text);
      if (result.error) {
        setSendError(result.error);
        return;
      }
      setDraft("");
      toast.success(`Reply sent to ${supplierName}.`);
      await load();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="mt-1.5 h-6 gap-1 px-2 text-[11px]" />}>
        <MessagesSquare className="size-3" />
        Conversation
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conversation with {supplierName}</DialogTitle>
          <DialogDescription>
            {thread?.supplierEmail ?? "Email thread"} · replies you send here arrive as email in the same thread.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-40 flex-1 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
          {loading && !thread && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading the conversation…
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
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                    ours ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border bg-card",
                  )}
                >
                  <p className={cn("mb-1 text-[11px]", ours ? "text-primary-foreground/75" : "text-muted-foreground")}>
                    {ours ? "You" : message.from || supplierName} · {formatTime(message.sentAt)}
                  </p>
                  <p className="leading-relaxed whitespace-pre-wrap">{message.text || "(no text)"}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>

        {sendError && (
          <Alert variant="destructive">
            <AlertDescription>{sendError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Reply to ${supplierName}…`}
            rows={3}
            disabled={!thread || sending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && draft.trim()) send();
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button onClick={send} disabled={!thread || sending || !draft.trim()}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Send reply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
