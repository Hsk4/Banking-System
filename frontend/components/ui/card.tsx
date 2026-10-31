import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * - Card
 * `--card` surface on warm paper, 1px border and a barely-there lift, so
 * cards read as sheets resting on the page rather than outlined boxes.
 */
export function Card({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={style}
      className={cn(
        "rounded-2xl border-border bg-card text-card-foreground shadow-card",
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
