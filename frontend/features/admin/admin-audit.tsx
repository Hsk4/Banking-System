"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, getAdminAudit } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";

/** A tone per kind of action, so freezes stand out from fundings. */
function toneFor(action: string) {
  switch (action) {
    case "ACCOUNT_FROZEN":
      return "warning" as const;
    case "ACCOUNT_CLOSED":
      return "danger" as const;
    case "ACCOUNT_UNFROZEN":
      return "success" as const;
    case "FUNDS_ISSUED":
      return "info" as const;
    default:
      return "neutral" as const;
  }
}

/** A readable label for an action. */
function labelFor(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((word, index) => (index === 0 ? word : word))
    .join(" ")
    .replace(/^./, (first) => first.toUpperCase());
}

/**
 * - Admin audit log
 * Who froze, funded or changed what, and when. Read-only by design: the
 * backend rejects every update and delete on the collection, so this screen
 * has no controls at all.
 */
export function AdminAuditView() {
  const { handleUnauthorized } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // `entries === null` is the loading state, so nothing is set synchronously
  const loading = entries === null;

  // one request per page; every state change is after the await
  useEffect(() => {
    void (async () => {
      try {
        const data = await getAdminAudit(page);
        if (!mounted.current) return;
        setEntries(data.entries);
        setPages(data.pages);
        setTotal(data.total);
        setError(null);
      } catch (caught) {
        if (!mounted.current) return;
        if (caught instanceof ApiError && caught.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(
          caught instanceof ApiError ? caught.message : "Could not load the log",
        );
        setEntries([]);
      }
    })();
  }, [page, handleUnauthorized]);

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Append-only. Entries can be read here but never edited or deleted.
      </Alert>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="border">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="h-4 w-64" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
            ))}
          </div>
        ) : entries && entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(entries ?? []).map((entry) => (
              <li key={entry._id} className="px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={toneFor(entry.action)}>
                    {labelFor(entry.action)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm">{entry.summary}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  by {entry.actorEmail ?? entry.actor}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {total} entr{total === 1 ? "y" : "ies"}
          {pages > 1 ? ` · page ${page} of ${pages}` : ""}
        </p>
        {pages > 1 ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || loading}
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
