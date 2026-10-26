import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * - Card
 * `--card` surface, 1px border, no shadow (shadows are reserved for dialogs).
 */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-border bg-card text-card-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * - Skeleton
 * Muted placeholder block shown while data loads.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/**
 * - Spinner
 * Indeterminate ring used inside buttons only.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
