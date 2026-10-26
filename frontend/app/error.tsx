"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * - Error boundary
 * Centered card that catches render/data errors under `app/` and offers a
 * retry. The raw message is only shown in development.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // keep the stack visible in the browser console during development
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-105 border p-8 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The page could not be loaded. Trying again usually fixes it.
        </p>

        {process.env.NODE_ENV !== "production" ? (
          <p className="mt-3 wrap-break-word rounded-md bg-muted p-2 text-left font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Link href="/dashboard" className="sm:contents">
            <Button variant="outline" fullWidth>
              Back to dashboard
            </Button>
          </Link>
          <Button onClick={reset} fullWidth className="sm:w-auto">
            Try again
          </Button>
        </div>
      </Card>
    </main>
  );
}
