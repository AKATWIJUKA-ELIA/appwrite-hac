"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Award, Loader2, Scale, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { recommend } from "@/lib/recommendations/actions";
import type { BoardRow } from "@/lib/requests/board";
import type { RecommendationView } from "@/lib/requests/recommendation";

/**
 * The decision and its reasoning — never a black box. The ranking is
 * arithmetic done on the server; the model only writes the sentence. Every
 * input behind the call is listed, so the trade-off is auditable.
 */
export function Recommendation({
  requestId,
  recommendation,
  rows,
}: Readonly<{ requestId: string; recommendation: RecommendationView | null; rows: BoardRow[] }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Recommending with nothing priced would spend a model call comparing an
  // empty set, so the button waits until there is something to compare.
  const priced = rows.filter((row) => row.totalMinor !== null).length;
  const confirmed = rows.filter((row) => row.track === "confirmed").length;

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await recommend(requestId);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Recommendation ready.");
      router.refresh();
    });
  }

  if (recommendation === null) {
    if (rows.length === 0) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="size-4 text-muted-foreground" />
            Recommendation
          </CardTitle>
          <CardDescription>
            Ranked on total landed cost against your delivery window, warranty, and whether the price was
            confirmed by the supplier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {priced === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nothing to compare yet — no supplier has a price on the board.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {priced} priced quote{priced === 1 ? "" : "s"} ready to compare
              {confirmed === 0 && " — all of them scraped web prices, so a recommendation now is indicative only"}.
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={run} disabled={pending || priced === 0}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {pending ? "Comparing quotes…" : "Recommend a supplier"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-success/30 bg-success-bg/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="size-4 text-success" />
          Recommendation
        </CardTitle>
        <CardDescription>Chosen by arithmetic, explained in words. Both are shown.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-lg font-semibold tracking-tight">
            {recommendation.supplierName}
            {recommendation.totalMinor !== null && recommendation.currency !== null && (
              <span className="tabular ml-2 font-normal text-muted-foreground">
                {formatMoney(recommendation.totalMinor, recommendation.currency)}
              </span>
            )}
          </p>
          <p className="mt-2 text-sm leading-relaxed">{recommendation.rationale}</p>
        </div>

        <Alert>
          <Scale />
          <AlertTitle>Trade-off accepted</AlertTitle>
          <AlertDescription>{recommendation.tradeoff}</AlertDescription>
        </Alert>

        <details className="text-sm">
          <summary className="cursor-pointer py-1 font-medium">What this was decided on</summary>
          <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {recommendation.inputs.map((input) => (
              <div
                key={input.label}
                className="flex items-baseline justify-between gap-3 border-b border-dashed pb-1.5"
              >
                <dt className="text-xs text-muted-foreground">{input.label}</dt>
                <dd className="tabular text-right text-sm font-medium">{input.value}</dd>
              </div>
            ))}
          </dl>
        </details>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button variant="outline" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Re-run with the latest quotes
        </Button>
      </CardContent>
    </Card>
  );
}
