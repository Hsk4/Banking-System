import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * - Logo mark
 * An "L" with a brass coin: the initial of Ledger, and the coin that sits in
 * the corner of every ledger line. Same artwork as `app/icon.svg`, so the tab
 * icon, the app icon and the in-app logo are one thing.
 *
 * The gradient id is unique per instance so two marks on one page (header and
 * auth panel) never reference each other's definitions.
 */
export function LogoMark({
  className,
  title,
}: {
  className?: string;
  /** set when the mark stands alone; otherwise it is decorative */
  title?: string;
}) {
  const id = React.useId();
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#17795f" />
          <stop offset="1" stopColor="#093528" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <g transform="translate(-2 2)">
        <path
          d="M22 14V43a3 3 0 0 0 3 3H46"
          fill="none"
          stroke="#f7f1e1"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="43" cy="22" r="6.5" fill="#dca847" />
      </g>
    </svg>
  );
}

/**
 * - Logo
 * The mark and the wordmark side by side. `tone="light"` is for use on the
 * emerald brand panel, where the wordmark must be cream rather than ink.
 */
export function Logo({
  className,
  markClassName,
  tone = "default",
}: {
  className?: string;
  markClassName?: string;
  tone?: "default" | "light";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span
        className={cn(
          "font-display text-[1.35rem] font-semibold leading-none tracking-tight",
          tone === "light" ? "text-[#f7f1e1]" : "text-foreground",
        )}
      >
        Ledger
      </span>
    </span>
  );
}
