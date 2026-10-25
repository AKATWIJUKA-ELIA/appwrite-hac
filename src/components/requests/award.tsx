"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileCheck2, Loader2, Send, Stamp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { awardSupplier, getPurchaseOrderDraft, type PurchaseOrderDraft } from "@/lib/award/actions";
import { formatMoney, formatTime } from "@/lib/format";
import type { AwardSummary } from "@/lib/requests/award";

export type AwardOption = { quoteId: string; supplierName: string; totalMinor: number; currency: string };

/**
 * The step after the decision: place the order. The purchase order is drafted
 * from the confirmed quote, edited by the buyer, and sent as a reply on the
 * supplier's own thread, so their acceptance comes back in the conversation.
 */
export function Award({
  requestId,
  options,
  recommendedQuoteId,
  award,
}: Readonly<{
  requestId: string;
  options: AwardOption[];
  recommendedQuoteId: string | null;
  award: AwardSummary | null;
}>) {
  const router = useRouter();
  const preferred = options.find((o) => o.quoteId === recommendedQuoteId) ?? options[0];
  const [quoteId, setQuoteId] = useState(preferred?.quoteId ?? "");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PurchaseOrderDraft | null>(null);
  const [text, setText] = useState("");
  const [declineOthers, setDeclineOthers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [sending, startSending] = useTransition();

  if (award) {
    return (
      <Card className="border-success/30 bg-success-bg/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="size-4 text-success" />
            Awarded
          </CardTitle>
          <CardDescription>
            Purchase order {award.poNumber} went to {award.supplierName} on {formatTime(award.awardedAt)}. Their
            acceptance and pro-forma invoice will arrive in Conversations.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (options.length === 0) return null;

  function openDraft() {
    setError(null);
    startLoading(async () => {
      const result = await getPurchaseOrderDraft(requestId, quoteId);
      if (result.error || !result.draft) {
        setError(result.error ?? "Could not prepare the purchase order.");
        return;
      }
      setDraft(result.draft);
      setText(result.draft.text);
      setDeclineOthers(result.draft.othersToDecline.length > 0);
      setOpen(true);
    });
  }

  function send() {
    if (!draft) return;
    setError(null);
    startSending(async () => {
      const result = await awardSupplier(requestId, quoteId, draft.poNumber, text, declineOthers);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(`Purchase order ${draft.poNumber} sent to ${draft.supplierName}.`, {
        description: result.declined ? `${result.declined} other supplier(s) were told they were not chosen.` : undefined,
      });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stamp className="size-4 text-muted-foreground" />
          Award the order
        </CardTitle>
        <CardDescription>
          Send a purchase order to the supplier you choose. You can read and edit it before it goes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="award-supplier" className="text-xs text-muted-foreground">
            Supplier (confirmed quotes only)
          </Label>
          <select
            id="award-supplier"
            value={quoteId}
            onChange={(event) => setQuoteId(event.target.value)}
            className="block h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            {options.map((o) => (
              <option key={o.quoteId} value={o.quoteId}>
                {o.supplierName} — {formatMoney(o.totalMinor, o.currency)}
                {o.quoteId === recommendedQuoteId ? " (recommended)" : ""}
              </option>
            ))}
          </select>
        </div>
        {error && !open && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button onClick={openDraft} disabled={loading || !quoteId}>
          {loading ? <Loader2 className="animate-spin" /> : <Stamp />}
          Award &amp; send purchase order
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Purchase order {draft?.poNumber} to {draft?.supplierName}
            </DialogTitle>
            <DialogDescription>
              Sent as a reply in your thread with {draft?.supplierName}. Edit anything before sending.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={18}
            className="font-mono text-xs leading-relaxed"
          />
          {draft && draft.othersToDecline.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={declineOthers} onCheckedChange={(checked) => setDeclineOthers(checked === true)} />
              <span>
                Send a polite “not this time” note to the other {draft.othersToDecline.length} supplier
                {draft.othersToDecline.length === 1 ? "" : "s"}{" "}
                <span className="text-muted-foreground">({draft.othersToDecline.join(", ")})</span>
              </span>
            </label>
          )}
          {error && open && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} disabled={sending || !text.trim()}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Send purchase order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
