"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Eye,
  Loader2,
  Mail,
  MailCheck,
  RotateCcw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { RfqStatusBadge, VerificationBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatTime } from "@/lib/format";
import { MAX_RECIPIENTS } from "@/lib/limits";
import type { Recipient } from "@/lib/requests/recipients";
import { addContact, approveAndSend, clearContact, retrySend } from "@/lib/rfqs/actions";
import { cn } from "@/lib/utils";

/**
 * The one human checkpoint. The exact recipient list is on screen, capped at
 * five, and nothing leaves without a deliberate click.
 */
export function SendGate({
  requestId,
  recipients,
}: Readonly<{ requestId: string; recipients: Recipient[] }>) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();

  if (recipients.length === 0) return null;

  const drafts = recipients.filter((rfq) => rfq.status === "draft");
  // "approved" means approved but never dispatched — stalled, not sent. It
  // belongs with the failures, because the recovery is identical.
  // A bounce is recovered the same way: change the address, retry.
  const stalled = recipients.filter((rfq) => rfq.status === "failed" || rfq.status === "approved" || rfq.status === "bounced");
  const dispatched = recipients.filter(
    (rfq) => rfq.status !== "draft" && rfq.status !== "failed" && rfq.status !== "approved" && rfq.status !== "bounced",
  );
  const reachable = drafts.filter((rfq) => rfq.email !== null);
  // A selection can outlive its row's address (cleared with "Change").
  const chosen = [...selected].filter((id) => reachable.some((rfq) => rfq.rfqId === id));

  function toggle(rfqId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(rfqId)) next.delete(rfqId);
      else if (next.size < MAX_RECIPIENTS) next.add(rfqId);
      return next;
    });
  }

  function send() {
    setError(null);
    const count = chosen.length;
    startSend(async () => {
      const result = await approveAndSend(requestId, chosen);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      toast.success(`${count} request${count === 1 ? "" : "s"} for quotation approved.`, {
        description: "Sending now. Replies are read automatically as they arrive.",
      });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          Send gate
        </CardTitle>
        <CardDescription>Real email to real businesses. Nothing sends without your click.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Suppliers exist, none has an address, so there is nothing to
            approve. Say so, and offer the way out. */}
        {drafts.length > 0 && reachable.length === 0 && (
          <Alert>
            <AlertTriangle />
            <AlertDescription>
              None of these suppliers published an email address we could find. Add one below and
              the request for quotation becomes sendable.
            </AlertDescription>
          </Alert>
        )}

        {drafts.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">
                Ready to contact
                <span className="ml-2 font-normal text-muted-foreground">
                  {chosen.length} of {MAX_RECIPIENTS} selected
                </span>
              </h3>
              {reachable.length > 1 && chosen.length < Math.min(reachable.length, MAX_RECIPIENTS) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(new Set(reachable.slice(0, MAX_RECIPIENTS).map((rfq) => rfq.rfqId)))
                  }
                  className="h-7 text-xs"
                >
                  Select {Math.min(reachable.length, MAX_RECIPIENTS)}
                </Button>
              )}
            </div>

            <ul className="space-y-2">
              {drafts.map((rfq) => (
                <RecipientRow
                  key={rfq.rfqId}
                  rfq={rfq}
                  checked={chosen.includes(rfq.rfqId)}
                  disabled={
                    rfq.email === null ||
                    (!chosen.includes(rfq.rfqId) && chosen.length >= MAX_RECIPIENTS)
                  }
                  onToggle={() => toggle(rfq.rfqId)}
                />
              ))}
            </ul>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {reachable.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="lg" onClick={send} disabled={sending || chosen.length === 0} className="px-4">
              {sending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send />
                  {chosen.length === 0
                    ? "Select a supplier to contact"
                    : `Approve and send ${chosen.length} RFQ${chosen.length === 1 ? "" : "s"}`}
                </>
              )}
            </Button>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-px size-4 shrink-0 text-success" />
              <span>You are approving these exact addresses. Read any draft first with “Preview”.</span>
            </p>
          </div>
        )}

        {stalled.length > 0 && (
          <>
            <Separator />
            <FailedSends requestId={requestId} failed={stalled} />
          </>
        )}

        {dispatched.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <MailCheck className="size-4 text-muted-foreground" />
                Sent
              </h3>
              <ul className="space-y-1.5">
                {dispatched.map((rfq) => (
                  <li
                    key={rfq.rfqId}
                    className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{rfq.supplierName}</span>
                    {rfq.email && (
                      <a
                        href={`mailto:${rfq.email}`}
                        className="font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
                      >
                        {rfq.email}
                      </a>
                    )}
                    <RfqStatusBadge status={rfq.status} />
                    {rfq.sentAt && (
                      <span className="text-xs text-muted-foreground">{formatTime(rfq.sentAt)}</span>
                    )}
                    {rfq.chaseCount > 0 && (
                      <span className="text-xs text-muted-foreground">followed up {rfq.chaseCount}×</span>
                    )}
                    <PreviewEmail rfq={rfq} />
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Sends that errored before leaving. The approval is still on record, so the
 * way back is one button — not re-ticking the same boxes.
 */
function FailedSends({ requestId, failed }: Readonly<{ requestId: string; failed: Recipient[] }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retry() {
    setError(null);
    startTransition(async () => {
      const result = await retrySend(requestId);
      if (result.error) {
        setError(result.error);
        return;
      }
      const n = result.retried ?? failed.length;
      toast.success(`Retrying ${n} send${n === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  // The same reason repeated on every row is noise; show it once.
  const reasons = [...new Set(failed.map((rfq) => rfq.failureReason).filter(Boolean))] as string[];

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-destructive" />
        Did not send
      </h3>

      <Alert variant="destructive">
        <AlertDescription>
          {reasons.length === 1
            ? reasons[0]
            : `${failed.length} request${failed.length === 1 ? " was" : "s were"} approved but never left.`}
        </AlertDescription>
      </Alert>

      <ul className="space-y-1.5">
        {failed.map((rfq) => (
          <li key={rfq.rfqId} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <span className="font-medium">{rfq.supplierName}</span>
            {rfq.email && <span className="font-mono text-xs text-muted-foreground">{rfq.email}</span>}
            <RfqStatusBadge status={rfq.status} />
            {reasons.length > 1 && rfq.failureReason && (
              <span className="text-xs text-muted-foreground">{rfq.failureReason}</span>
            )}
            <RetryOne requestId={requestId} rfq={rfq} disabled={pending} />
            {rfq.status !== "approved" && <ReplaceAddress rfq={rfq} />}
          </li>
        ))}
      </ul>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {failed.length > 1 && (
        <Button variant="outline" onClick={retry} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Retry all {failed.length}
        </Button>
      )}
    </div>
  );
}

/** Retry one supplier, e.g. right after changing its address. */
function RetryOne({ requestId, rfq, disabled }: Readonly<{ requestId: string; rfq: Recipient; disabled: boolean }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const result = await retrySend(requestId, rfq.rfqId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Retrying the send to ${rfq.supplierName}.`);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" className="ml-auto h-7" onClick={retry} disabled={disabled || pending}>
      {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
      Retry
    </Button>
  );
}

function RecipientRow({
  rfq,
  checked,
  disabled,
  onToggle,
}: Readonly<{ rfq: Recipient; checked: boolean; disabled: boolean; onToggle: () => void }>) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addContact(rfq.rfqId, email);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEmail("");
      toast.success(`Address added for ${rfq.supplierName}.`);
      router.refresh();
    });
  }

  function change() {
    setError(null);
    startTransition(async () => {
      const result = await clearContact(rfq.rfqId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const unreachable = rfq.email === null;

  return (
    <li
      className={cn(
        "rounded-lg border p-3 transition-colors",
        checked && "border-primary/40 bg-accent/40",
        unreachable && "border-dashed bg-muted/20",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Checkbox
          id={`select-${rfq.rfqId}`}
          checked={checked}
          onCheckedChange={onToggle}
          disabled={disabled}
          aria-label={`Contact ${rfq.supplierName}`}
        />

        <Label
          htmlFor={`select-${rfq.rfqId}`}
          className={cn(
            "min-w-0 flex-1 cursor-pointer flex-col items-start gap-0",
            disabled && "cursor-not-allowed",
          )}
        >
          <span className="font-medium">{rfq.supplierName}</span>
          {rfq.supplierDomain && (
            <span className="text-xs font-normal text-muted-foreground">{rfq.supplierDomain}</span>
          )}
        </Label>

        {rfq.email ? (
          <div className="flex flex-wrap items-center gap-2">
            <a href={`mailto:${rfq.email}`} className="font-mono text-xs hover:text-primary hover:underline">
              {rfq.email}
            </a>
            <VerificationBadge verification={rfq.verification} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={pending}
              onClick={change}
            >
              Change
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No address found</span>
        )}

        <PreviewEmail rfq={rfq} />
      </div>

      {unreachable && (
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={add}>
          <Label htmlFor={`email-${rfq.rfqId}`} className="sr-only">
            Email address for {rfq.supplierName}
          </Label>
          <Input
            id={`email-${rfq.rfqId}`}
            type="email"
            placeholder={`sales@${rfq.supplierDomain || "supplier.com"}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="h-9 min-w-0 flex-1 font-mono text-xs"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={pending || email.trim().length === 0}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Add address
          </Button>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </li>
  );
}

/**
 * The draft, verbatim. Approving an email you have not read is not really
 * approval, so the exact text that will be sent is one click away.
 */
function PreviewEmail({ rfq }: Readonly<{ rfq: Recipient }>) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-7 text-xs" />}>
        <Eye className="size-3" />
        Preview
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email to {rfq.supplierName}</DialogTitle>
          <DialogDescription>
            This is exactly what {rfq.status === "draft" ? "will be" : "was"} sent
            {rfq.email ? ` to ${rfq.email}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Subject</p>
            <p className="mt-1 text-sm font-medium">{rfq.subject}</p>
          </div>
          <div className="rounded-lg border p-3">
            <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{rfq.body}</pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A failed or bounced send is usually the address's fault. Swap it here, then
 * Retry sends to the new one; the approval stands.
 */
function ReplaceAddress({ rfq }: Readonly<{ rfq: Recipient }>) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addContact(rfq.rfqId, email);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEmail("");
      toast.success(`Address changed for ${rfq.supplierName}. Retry to send to it.`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex w-full flex-wrap gap-2 pt-1">
      <Input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={`Use a different address for ${rfq.supplierName}`}
        className="h-8 min-w-0 flex-1 font-mono text-xs"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || !email.trim()}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Change address
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </form>
  );
}
