import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * - Not found
 * Large muted 404 with one line of copy and a single way back.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-6xl font-semibold tracking-tight text-muted-foreground">
        404
      </p>
      <h1 className="mt-3 text-base font-semibold">This page does not exist</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The link may be broken, or the page may have moved.
      </p>
      <div className="mt-6">
        <Link href="/dashboard">
          <Button>Back to dashboard</Button>
        </Link>
      </div>
    </main>
  );
}
