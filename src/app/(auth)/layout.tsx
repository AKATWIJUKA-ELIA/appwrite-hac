import { CheckCircle2 } from "lucide-react";
import { Brand, BrandMark } from "@/components/brand";

const POINTS = [
  "Describe what you need in plain language",
  "We find suppliers and email them for real quotes",
  "Replies land on one board, compared like for like",
];

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-8 px-4 py-8 sm:px-8">
        <Brand />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <aside className="relative hidden flex-col overflow-hidden bg-muted p-12 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklch,var(--color-primary)_14%,transparent),transparent_60%)]" />
        <div className="relative flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <BrandMark size="lg" />
          <div className="grid gap-1">
            <p className="text-3xl font-semibold tracking-tight">Quotebook</p>
            <p className="text-muted-foreground">procurement, answered</p>
          </div>
        </div>
        <div className="relative grid gap-6">
          <blockquote className="max-w-md rounded-xl border bg-background/70 p-5 font-mono text-sm leading-relaxed shadow-sm backdrop-blur">
            50 × Dell Latitude 5550, i7/16GB/512GB, delivered to Kampala within 14 days, budget UGX
            180,000,000
          </blockquote>
          <ul className="grid gap-3 text-sm">
            {POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
