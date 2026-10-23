import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CircleCheck,
  FileSearch,
  History,
  Mail,
  MailCheck,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { TrackBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BoardTrack } from "@/lib/vocabulary";

export const metadata: Metadata = {
  title: "Quotebook · procurement, answered",
  description:
    "Describe what you need to buy. Quotebook finds suppliers, emails them for real quotes, reads the replies, and lays the options out side by side.",
};

const STEPS = [
  {
    title: "Find",
    body: "Describe the need once. We search the open web and marketplaces for suppliers and any prices they publish.",
  },
  {
    title: "Ask",
    body: "You approve the exact recipient list. We email each supplier a clear request for a real quote.",
  },
  {
    title: "Compare",
    body: "Replies are read for you and land on one board, upgrading web prices to confirmed quotes as they arrive.",
  },
];

const FEATURES = [
  {
    icon: FileSearch,
    title: "Two kinds of price, never confused",
    body: "A price scraped from a website is marked as indicative. A price from the supplier's own reply is marked confirmed, and replaces it on the board.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing is sent without you",
    body: "Every request for quote waits for your approval, with a hard cap on recipients. No surprise emails in your name.",
  },
  {
    icon: MailCheck,
    title: "Replies read for you",
    body: "Totals, VAT, lead time and warranty are pulled out of each reply. Anything unclear is held for review instead of guessed.",
  },
  {
    icon: Calculator,
    title: "Money handled exactly",
    body: "Amounts are stored as whole minor units with their currency, and every USD conversion keeps the rate it used.",
  },
  {
    icon: Radio,
    title: "A board that updates live",
    body: "Watch suppliers appear and quotes upgrade in real time. No refreshing, no spreadsheet to keep in sync.",
  },
  {
    icon: History,
    title: "A record of every decision",
    body: "Each step is logged, so you can show how a supplier was found, what was asked, and why one quote was picked.",
  },
];

// The hero's sample board, for the same Dell request. Suppliers are made up;
// the recommendation's numbers are worked from these rows and the UGX 180M budget.
const HERO_BOARD: { supplier: string; track: BoardTrack; total?: string; lead?: string }[] = [
  { supplier: "Kampala Office Tech", track: "confirmed", total: "171,500,000", lead: "10 days" },
  { supplier: "EastLink Distributors", track: "confirmed", total: "176,000,000", lead: "7 days" },
  { supplier: "Marketplace listing", track: "web price", total: "168,250,000" },
  { supplier: "Nile IT Supplies", track: "awaiting" },
];

// Illustrative rows for the preview board. Suppliers are made up.
const PREVIEW: { supplier: string; track: BoardTrack; total?: string; lead?: string }[] = [
  { supplier: "Lakeside Computers Ltd", track: "confirmed", total: "171,500,000", lead: "10 days" },
  { supplier: "Nile Office Systems", track: "web price", total: "176,250,000", lead: "—" },
  { supplier: "Entebbe Tech Traders", track: "awaiting" },
  { supplier: "Pearl Business Machines", track: "no price" },
];

export default function LandingPage() {
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="Quotebook home">
            <Brand />
          </Link>
          <nav className="flex items-center gap-1">
            <a
              href="#how-it-works"
              className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}
            >
              How it works
            </a>
            <ThemeToggle />
            <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
              Sign in
            </Link>
            <Link href="/sign-up" className={buttonVariants()}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden border-b">
          {/* Backdrop: the real request page, tilted and faded behind everything. In dark
              mode the light screenshot is inverted (hue kept) so it reads as dark UI. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,color-mix(in_oklch,var(--color-primary)_12%,transparent),transparent_60%)]" />
            <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_65%_75%_at_50%_50%,black_25%,transparent_80%)] perspective-[2200px]">
              <Image
                src="/hero-board.webp"
                alt=""
                width={1900}
                height={833}
                sizes="2000px"
                className="absolute top-1/2 left-1/2 w-[2000px] max-w-none opacity-[0.3] blur-[1.5px] dark:opacity-[0.2] dark:invert dark:hue-rotate-180"
                style={{
                  transform:
                    "translate(-46%, -50%) rotateX(22deg) rotateY(-8deg) rotateZ(-11deg)",
                }}
              />
            </div>
            {/* Keeps the copy legible where the backdrop is busiest. */}
            <div className="absolute inset-0 bg-linear-to-r from-background/70 via-background/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-background to-transparent" />
          </div>

          <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 pt-16 pb-24 md:pt-28 md:pb-32 lg:grid-cols-[1.05fr_1fr]">
            <div className="grid gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700">
              <span className="w-fit rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                For procurement officers who need real quotes, fast
              </span>
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Say what you need.
                <br />
                Get real quotes, side by side.
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
                Quotebook finds suppliers, emails them for quotations, reads the replies, and lays
                the options out so you can decide with confidence.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/sign-up"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-10 px-4 shadow-lg shadow-primary/25",
                  )}
                >
                  Start a request <ArrowRight />
                </Link>
                <a
                  href="#how-it-works"
                  className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-10 px-6")}
                >
                  See how it works
                </a>
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" />
                Nothing is emailed until you approve the recipients.
              </p>
            </div>

            <HeroBoard />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16 border-y bg-muted/40">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:py-20">
            <div className="grid max-w-2xl gap-2">
              <h2 className="text-3xl font-semibold tracking-tight">Three steps, one board</h2>
              <p className="text-muted-foreground">
                The slow parts of sourcing (finding sellers, chasing emails, retyping prices) are
                done for you. The decisions stay yours.
              </p>
            </div>
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-xl border bg-card p-6">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Board preview */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:py-20 lg:grid-cols-[1fr_1.3fr]">
          <div className="grid gap-3">
            <h2 className="text-3xl font-semibold tracking-tight">Know exactly what each price is</h2>
            <p className="text-muted-foreground">
              Every supplier sits on one of four tracks. Web prices give you a quick picture in
              seconds; confirmed quotes from real replies replace them as they arrive.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["confirmed", "web price", "awaiting", "no price"] as const).map((t) => (
                <TrackBadge key={t} track={t} />
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <p className="text-sm font-medium">50 × Dell Latitude 5550</p>
              <span className="animate-live text-xs text-muted-foreground">Live</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-5 py-2 font-medium">Supplier</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 text-right font-medium">Total (UGX)</th>
                    <th className="px-5 py-2 text-right font-medium">Lead time</th>
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW.map((row) => (
                    <tr key={row.supplier} className="border-b last:border-0">
                      <td className="px-5 py-3 font-medium whitespace-nowrap">{row.supplier}</td>
                      <td className="px-5 py-3">
                        <TrackBadge track={row.track} />
                      </td>
                      <td className="tabular px-5 py-3 text-right">{row.total ?? "—"}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">
                        {row.lead ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-muted/40">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:py-20">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">
              Built for the way procurement actually works
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border bg-card p-6">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="flex flex-col items-center gap-5 rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
              Your next purchase, quoted without the chasing
            </h2>
            <p className="max-w-lg opacity-85">
              Create an account, describe what you need, and watch the quotes come in.
            </p>
            <Link
              href="/sign-up"
              className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "px-5")}
            >
              Get started <ArrowRight />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <Brand />
          <p>Built on Appwrite · {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}

// The hero's product shot: a requirement, its board, and the pick, with two
// floating notes for the parts that happen by email.
function HeroBoard() {
  return (
    <div className="relative mx-auto w-full max-w-lg perspective-[1600px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:delay-150 motion-safe:duration-700 motion-safe:fill-mode-backwards lg:mr-0">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[3rem] bg-primary/15 blur-3xl dark:bg-primary/25"
      />

      <div className="relative transform-3d lg:transform-[rotateY(-6deg)_rotateX(3deg)]">
        {/* A second sheet behind, so the board reads as one of a stack. */}
        <div
          aria-hidden
          className="absolute inset-0 translate-x-3 translate-y-3 rotate-2 rounded-2xl border bg-card/70 shadow-lg"
        />

        <div className="relative grid gap-4 rounded-2xl border bg-card p-5 shadow-2xl shadow-primary/10">
          <div className="rounded-xl border bg-background/60 p-3">
            <p className="mb-1 text-xs text-muted-foreground">The requirement</p>
            <p className="font-mono text-[0.8rem] leading-relaxed">
              50 × Dell Latitude 5550, i7/16GB/512GB, delivered to Kampala within 14 days, budget
              UGX 180,000,000
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Comparison board</p>
              <p className="text-xs text-muted-foreground">{HERO_BOARD.length} suppliers</p>
            </div>
            <ul className="divide-y rounded-xl border">
              {HERO_BOARD.map((row) => (
                <li
                  key={row.supplier}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <span className="truncate">{row.supplier}</span>
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {row.lead ?? "—"}
                  </span>
                  <span className="tabular font-mono text-xs">
                    {row.total ? `UGX ${row.total}` : "—"}
                  </span>
                  <TrackBadge track={row.track} />
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-track-confirmed/30 bg-track-confirmed-bg p-4">
            <p className="text-sm font-medium text-track-confirmed">Recommended</p>
            <p className="mt-1 text-sm text-foreground/80">
              Kampala Office Tech: UGX 8.5M under budget and delivered within the 14-day window.
              Trade-off: 3 days slower than EastLink.
            </p>
          </div>
        </div>
      </div>

      <div className="absolute -top-7 -left-4 flex items-center gap-2.5 rounded-xl border bg-card/95 px-3 py-2 shadow-lg backdrop-blur sm:-left-10">
        <span className="flex size-7 items-center justify-center rounded-full bg-track-confirmed-bg text-track-confirmed">
          <Mail className="size-3.5" />
        </span>
        <span className="grid text-xs leading-tight">
          <span className="font-medium">Reply received</span>
          <span className="text-muted-foreground">EastLink · quote confirmed</span>
        </span>
      </div>

      <div className="absolute -right-2 -bottom-6 flex items-center gap-2 rounded-full border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur sm:-right-4">
        <CircleCheck className="size-4 text-primary" />
        3 suppliers emailed, 2 replied
      </div>
    </div>
  );
}
