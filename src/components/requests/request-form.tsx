"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Loader2, Mail, Search, ShieldCheck, Table2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createRequest, type CreateRequestState } from "@/lib/requests/actions";
import { cn } from "@/lib/utils";

/**
 * Worked examples, not placeholder text. A procurement officer arriving cold
 * should be able to see the shape of a good request — quantity, spec,
 * destination, deadline, ceiling — and click one rather than compose it.
 */
const EXAMPLES = [
  {
    label: "Laptops",
    text: "50 × Dell Latitude 5550, i7/16GB/512GB, delivered to Kampala within 14 days, budget UGX 180,000,000",
    deliverTo: "Kampala, Uganda",
    currency: "UGX",
  },
  {
    label: "Office furniture",
    text: "120 ergonomic office chairs with lumbar support and 5-year warranty, delivered to Nairobi within 30 days, budget KES 4,200,000",
    deliverTo: "Nairobi, Kenya",
    currency: "KES",
  },
  {
    label: "Networking",
    text: "12 × Cisco Catalyst 9200 48-port switches plus 24 × Ubiquiti U6-Pro access points, delivered to Dar es Salaam within 21 days, budget USD 95,000",
    deliverTo: "Dar es Salaam, Tanzania",
    currency: "USD",
  },
];

const STEPS = [
  {
    icon: Search,
    title: "Find",
    body: "We search the open web and marketplaces for suppliers who actually stock this, and pick up any published prices along the way.",
  },
  {
    icon: Mail,
    title: "Ask",
    body: "You approve the exact recipient list. Only then do we email each supplier for a real, written quotation.",
  },
  {
    icon: Table2,
    title: "Compare",
    body: "Replies are read automatically and land on a live comparison board — scraped guesses upgrade to confirmed prices in front of you.",
  },
];

export function RequestForm() {
  const [state, action, pending] = useActionState<CreateRequestState, FormData>(createRequest, {});
  const [rawText, setRawText] = useState(EXAMPLES[0].text);
  const [deliverTo, setDeliverTo] = useState(EXAMPLES[0].deliverTo);
  const [currency, setCurrency] = useState(EXAMPLES[0].currency);

  const tooShort = rawText.trim().length < 10;

  function applyExample(example: (typeof EXAMPLES)[number]) {
    setRawText(example.text);
    setDeliverTo(example.deliverTo);
    setCurrency(example.currency);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 py-2 lg:py-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          What do you need to buy?
        </h1>
        <p className="max-w-2xl text-base text-pretty text-muted-foreground">
          Describe it the way you would to a colleague. Quotebook finds suppliers, asks them for
          real quotes, reads the replies, and lays the options out side by side.
        </p>
      </header>

      <Card className="shadow-sm">
        <CardContent>
          <form action={action} className="space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="requirement" className="text-sm font-medium">
                  The requirement
                </Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Try:</span>
                  {EXAMPLES.map((example) => (
                    <button
                      key={example.label}
                      type="button"
                      onClick={() => applyExample(example)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        rawText === example.text
                          ? "border-primary/40 bg-accent text-accent-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {example.label}
                    </button>
                  ))}
                </div>
              </div>

              <Textarea
                id="requirement"
                name="rawText"
                rows={4}
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="e.g. 50 × Dell Latitude 5550, i7/16GB/512GB, delivered to Kampala within 14 days, budget UGX 180,000,000"
                className="resize-y text-base leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                Include quantity, specification, destination, deadline and your ceiling. Anything
                you leave out is simply left out — nothing is invented on your behalf.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <div className="space-y-2">
                <Label htmlFor="deliver-to">Deliver to</Label>
                <Input
                  id="deliver-to"
                  name="deliverTo"
                  value={deliverTo}
                  onChange={(event) => setDeliverTo(event.target.value)}
                  placeholder="City, country"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  name="currency"
                  value={currency}
                  maxLength={3}
                  onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                  className="tabular uppercase"
                />
              </div>
            </div>

            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="submit"
                size="lg"
                disabled={pending || tooShort}
                className="w-full px-4 sm:w-auto"
              >
                {pending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>
                    Find suppliers
                    <ArrowRight />
                  </>
                )}
              </Button>

              <p className="flex items-start gap-2 text-xs text-muted-foreground sm:max-w-xs">
                <ShieldCheck className="mt-px size-4 shrink-0 text-success" />
                <span>Nothing is emailed to anyone until you approve an exact recipient list.</span>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Card className="h-full border-dashed bg-muted/30 shadow-none">
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <step.icon className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">{step.title}</h2>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
