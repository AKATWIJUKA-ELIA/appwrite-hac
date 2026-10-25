import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-5 px-4 text-center">
      <BrandMark />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground">The link may be wrong, or the page may have moved.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Home
        </Link>
        <Link href="/requests" className={buttonVariants()}>
          Your requests
        </Link>
      </div>
    </main>
  );
}
