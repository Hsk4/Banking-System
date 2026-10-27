"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

/** How far the finger must travel before the pull counts. */
const THRESHOLD = 70;
/** The furthest the sheet follows the finger. */
const MAX_PULL = 110;

/**
 * - Pull to refresh
 * The gesture people expect in a banking app on a phone. Only active at the
 * top of the page and only for touch pointers, so it never fights a scroll or
 * a desktop drag.
 *
 * @param onRefresh - called once the pull passes the threshold
 * @param children - the page content
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: React.ReactNode;
}) {
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const startY = React.useRef<number | null>(null);

  const onTouchStart = (event: React.TouchEvent) => {
    // only from the very top of the document
    if (window.scrollY > 0 || refreshing) return;
    const touch = event.touches[0];
    startY.current = touch ? touch.clientY : null;
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (startY.current === null) return;
    const touch = event.touches[0];
    if (!touch) return;

    const distance = touch.clientY - startY.current;
    // pulling up is a scroll, not a refresh
    if (distance <= 0) {
      setPull(0);
      return;
    }

    // resistance, so the sheet does not run away with the finger
    setPull(Math.min(MAX_PULL, distance * 0.5));
  };

  const onTouchEnd = async () => {
    if (startY.current === null) return;
    startY.current = null;

    if (pull < THRESHOLD) {
      setPull(0);
      return;
    }

    setRefreshing(true);
    setPull(THRESHOLD);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  };

  const active = pull > 0 || refreshing;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => void onTouchEnd()}
    >
      <div
        aria-hidden={!active}
        className={cn(
          "flex items-end justify-center overflow-hidden md:hidden",
          !active && "h-0",
        )}
        style={active ? { height: pull } : undefined}
      >
        <span
          role="status"
          className="pb-2 text-xs font-medium text-muted-foreground"
        >
          {refreshing ? (
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="size-3.5 animate-spin" aria-hidden />
              Refreshing…
            </span>
          ) : pull >= THRESHOLD ? (
            "Release to refresh"
          ) : (
            "Pull to refresh"
          )}
        </span>
      </div>
      {children}
    </div>
  );
}
