import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

/**
 * - Badge
 * Fully rounded pill for status labels. Always pair colour with a label so
 * state is never communicated by colour alone.
 */
export function Badge({
  tone = "neutral",
  className,
  title,
  children,
}: {
  tone?: Tone;
  className?: string;
  /** a hover explanation, e.g. "Frozen: contact support" */
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Map an API status onto a badge tone.
 * @param status - ACTIVE / FROZEN / CLOSED or a transaction status
 */
export function statusTone(status: string): Tone {
  switch (status) {
    case "ACTIVE":
    case "COMPLETED":
      return "success";
    case "FROZEN":
    case "PENDING":
      return "warning";
    case "CLOSED":
    case "FAILED":
    case "REVERSED":
      return "danger";
    default:
      return "neutral";
  }
}
