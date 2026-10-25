"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox, Loader2, Paperclip, ShieldQuestion } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format";
import { linkToRfq, releaseForParsing } from "@/lib/inbound/actions";
import type { HeldReply } from "@/lib/requests/review";

/**
 * Replies that arrived but did not become quotes. Handling the awkward reply
 * in the open is the point — the alternative is silently dropping it.
 */
export function ReviewQueue({ held }: Readonly<{ held: HeldReply[] }>) {
  if (held.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning-bg/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="size-4 text-warning" />
          Needs your review
        </CardTitle>
        <CardDescription>
          {held.length} repl{held.length === 1 ? "y" : "ies"} arrived but could not be turned into a quote
          automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {held.map((item) => (
            <ReviewItem key={item.parseId} item={item} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ReviewItem({ item }: Readonly<{ item: HeldReply }>) {
  const router = useRouter();
  const [rfqId, setRfqId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = item.needsLink ? await linkToRfq(item.parseId, rfqId) : await releaseForParsing(item.parseId);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Reading the message for a price…");
      router.refresh();
    });
  }

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{item.supplierName ?? "Unmatched reply"}</span>
        {item.fromAddress && <span className="font-mono text-xs text-muted-foreground">{item.fromAddress}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{formatTime(item.receivedAt)}</span>
      </div>

      <Alert className="mt-2">
        <ShieldQuestion />
        <AlertDescription>{item.reason}</AlertDescription>
      </Alert>

      {item.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.attachments.map((file) => (
            <a
              key={file.id}
              href={`/api/attachments/${file.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
            >
              <Paperclip className="size-3" />
              {file.filename}
            </a>
          ))}
        </div>
      )}

      {item.preview && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer py-1 text-muted-foreground hover:text-foreground">
            Read the message
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {item.preview}
          </pre>
        </details>
      )}

      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {item.needsLink && (
        <div className="mt-2 space-y-1">
          <label htmlFor={`link-${item.parseId}`} className="text-xs text-muted-foreground">
            This reply did not match a supplier automatically. Which supplier is it from?
          </label>
          <select
            id={`link-${item.parseId}`}
            value={rfqId}
            onChange={(event) => setRfqId(event.target.value)}
            className="block h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Choose a supplier…</option>
            {item.linkable.map((option) => (
              <option key={option.rfqId} value={option.rfqId}>
                {option.supplierName}
              </option>
            ))}
          </select>
        </div>
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={run}
        disabled={pending || (item.needsLink && !rfqId)}
        className="mt-2"
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {item.needsLink ? "Link to this supplier and read it for a price" : "I trust this sender — read it for a price"}
      </Button>
    </li>
  );
}
