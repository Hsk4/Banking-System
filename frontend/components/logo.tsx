"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * - Logo mark
 * The one mark used everywhere: a brass coin over an "L" on an emerald tile.
 * @param size - rendered edge length in pixels
 */
export function LogoMark({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  // useId keeps the gradient id unique when the page renders several marks
  const gradientId = `ledger-tile-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Ledger"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#17795f" />
          <stop offset="1" stopColor="#093528" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradientId})`} />
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
 * The mark plus the "Ledger" wordmark, for the header and the sign-in panel.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={28} />
      <span className="font-display text-lg font-semibold tracking-tight">
        Ledger
      </span>
    </span>
  );
}
