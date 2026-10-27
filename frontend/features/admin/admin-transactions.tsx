"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, getAdminTransactions } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { AdminTransaction } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/** One transaction, expandable to its two ledger entries. */
function TransactionRow({ row }: { row: AdminTransaction }) {
  const [open, setOpen] = useState(false);
  const moneyInFunding = row.kind === "FUNDING";

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent/40"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {moneyInFunding ? "Funding" : "Transfer"} ·{" "}
            <span className="tabular-nums">{formatMoney(row.amount)}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {formatDateTime(row.createdAt)}
            {row.reference ? ` · ${row.reference}` : ""}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
            {row.fromAccount.accountNumber ?? row.fromAccount._id.slice(-8)} →{" "}
            {row.toAccount.accountNumber ?? row.toAccount._id.slice(-8)}
          </span>
        </span>
        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="animate-fade-in border-t border-border bg-muted/40 px-3 py-3 text-sm">
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">From</dt>
              <dd className="font-mono text-xs">
                {row.fromAccount.accountNumber ?? row.fromAccount._id}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">To</dt>
              <dd className="font-mono text-xs">
                {row.toAccount.accountNumber ?? row.toAccount._id}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Note</dt>
              <dd className="text-right">{row.note || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Transaction id</dt>
              <dd className="font-mono text-xs">{row._id}</dd>
            </div>
          </dl>

          <p className="mt-3 text-xs font-medium text-muted-foreground">
            Ledger entries
          </p>
          {row.entries.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No ledger entries: a held or failed transfer moves nothing.
            </p>
          ) : (
            <ul className="mt-1 space-y-1">
              {row.entries.map((entry) => (
                <li
                  key={entry._id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
                >
                  <span className="font-medium">{entry.type}</span>
                  <span className="tabular-nums">
                    {formatMoney(entry.amount)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * - Admin transactions
 * Search by id, reference or account number, and a date range. Each row opens
 * to show the ledger entries behind it, which is how a mistake is traced.
 */
export function AdminTransactionsView() {
  const { handleUnauthorized } = useAuth();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminTransaction[] | null>(null);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query);
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  // `rows === null` is the loading state, so nothing is set synchronously
  const loading = rows === null;

  // one request per search, date range or page; every state change is after
  // the await, so the effect body itself never sets state
  useEffect(() => {
    void (async () => {
      try {
        const data = await getAdminTransactions({
          q: debounced || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
        });
        if (!mounted.current) return;
        setRows(data.transactions);
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
          caught instanceof ApiError
            ? caught.message
            : "Could not load transactions",
        );
        setRows([]);
      }
    })();
  }, [debounced, from, to, page, handleUnauthorized]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            placeholder="Search by id, reference or account number"
            aria-label="Search transactions"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <input
          type="date"
          value={from}
          aria-label="From date"
          onChange={(event) => {
            setFrom(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-(--radius) border border-input bg-card px-3 text-sm"
        />
        <input
          type="date"
          value={to}
          aria-label="To date"
          onChange={(event) => {
            setTo(event.target.value);
            setPage(1);
          }}
          className="h-10 rounded-(--radius) border border-input bg-card px-3 text-sm"
        />
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="border">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="h-4 w-56" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
            ))}
          </div>
        ) : rows && rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No transactions match that search.
          </p>
        ) : (
          <ul>
            {(rows ?? []).map((row) => (
              <TransactionRow key={row._id} row={row} />
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {total} transaction{total === 1 ? "" : "s"}
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
