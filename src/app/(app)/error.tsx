"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown when a signed-in page fails to load, almost always because a request
 * to the database dropped. The data is still there; trying again usually
 * works, so that is the one thing offered.
 */
export default function AppError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-xl py-16">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <WifiOff className="size-8 text-muted-foreground/60" />
          <div className="space-y-1">
            <p className="font-medium">Couldn&apos;t reach the server</p>
            <p className="text-sm text-muted-foreground">
              The connection dropped while loading this page. Nothing was lost.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                router.refresh();
                reset();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
