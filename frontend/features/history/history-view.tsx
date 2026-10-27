"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useHideBalances } from "@/lib/hide-balances";
import { ApiError, getAccounts, getHistory, statementUrl } from "@/lib/api";
import {
  formatAccountNumber,
  formatDateTime,
  formatMoney,
  formatSignedAmount,
} from "@/lib/format";
import type { Account, HistoryEntry } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, Spinner } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { statusLabel } from "@/lib/status-help";
import { Receipt } from "@/components/receipt";
import { cn } from "@/lib/cn";

/** Page size for the cursor pager. */
const PAGE_SIZE = 25;

type Direction = "all" | "in" | "out";

/** The filters the screen is showing. */
interface Filters {
  direction: Direction;
  from: string;
  to: string;
}

const NO_FILTERS: Filters = { direction: "all", from: "", to: "" };

/**
 * - One row of history
 * Date, counterparty, note, signed amount, status, and the balance after.
 */
function EntryRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: HistoryEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { hidden } = useHideBalances();
  const moneyIn = entry.direction === "CREDIT";

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent/50"
      >
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full",
            moneyIn
              ? "bg-success-soft text-success"
              : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          {moneyIn ? (
            <ArrowDownLeft className="size-4" />
          ) : (
            <ArrowUpRight className="size-4" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">
              {entry.counterparty?.name ?? "Another account"}
            </span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {formatDateTime(entry.createdAt)}
            {entry.counterparty?.accountNumber
              ? ` · ${entry.counterparty.accountNumber}`
              : ""}
          </span>
          {entry.note ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              “{entry.note}”
            </span>
          ) : null}
        </span>

        <span className="shrink-0 text-right">
          <span
            className={cn(
              "block text-sm font-semibold tabular-nums",
              moneyIn ? "text-success" : "text-foreground",
            )}
          >
            {hidden ? "••••" : formatSignedAmount(entry.amount)}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
            {hidden ? "••••" : `Bal ${formatMoney(entry.balanceAfter)}`}
          </span>
        </span>
      </button>

      {expanded ? (
        <div className="animate-fade-in border-t border-border bg-muted/40 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Badge tone={statusTone(entry.status)}>
              {statusLabel(entry.status)}
            </Badge>
            {/* the same page, one row up: a plain deep link for sharing */}
            <span className="font-mono text-xs text-muted-foreground">
              {entry.reference ?? ""}
            </span>
          </div>
          <Receipt
            showAmount={false}
            data={{
              reference: entry.reference,
              createdAt: entry.createdAt,
              amount: entry.amount,
              status: entry.status,
              note: entry.note,
              fee: 0,
              from:
                entry.direction === "DEBIT"
                  ? { name: "You" }
                  : {
                      accountNumber: entry.counterparty?.accountNumber ?? null,
                      name: entry.counterparty?.name ?? null,
                    },
              to:
                entry.direction === "DEBIT"
                  ? {
                      accountNumber: entry.counterparty?.accountNumber ?? null,
                      name: entry.counterparty?.name ?? null,
                    }
                  : { name: "You" },
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * - History screen
 * Cursor-paged ledger for one account, with in/out and date filters, a CSV
 * export and a receipt behind every row.
 */
function HistoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { handleUnauthorized } = useAuth();
  // the account is in the query string (a static export cannot pre-render a
  // page per account id); a dashboard row also names the entry to expand
  const accountId = searchParams.get("account") ?? "";
  const focusEntry = searchParams.get("entry") ?? "";

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  // null until the first page arrives: that is the loading state
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<{
    accountNumber: string | null;
    label: string | null;
    status: string;
  } | null>(null);

  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(focusEntry || null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Whether the first page for the current account and filters has arrived.
   * `entries === null` is the loading state, so nothing has to be set from
   * the effect body before the request starts.
   */
  const loading = entries === null;

  // the account list, so the customer can switch without going back
  useEffect(() => {
    void (async () => {
      try {
        const list = await getAccounts();
        if (!mounted.current) return;
        setAccounts(list);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          handleUnauthorized();
      }
    })();
  }, [handleUnauthorized]);

  // /history with no account and exactly one to show: go straight there
  useEffect(() => {
    const only = accounts?.length === 1 ? accounts[0] : undefined;
    if (!accountId && only) router.replace(`/history?account=${only._id}`);
  }, [accounts, accountId, router]);

  /**
   * - Read one page
   * A plain helper called from the async effect below. It resolves to the
   * page, or null when the request failed, and never throws.
   */
  async function readPage(next: string | null) {
    try {
      return await getHistory(accountId, {
        cursor: next ?? undefined,
        limit: PAGE_SIZE,
        direction: filters.direction,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
    } catch (caught) {
      if (!mounted.current) return null;
      if (caught instanceof ApiError && caught.status === 401) {
        handleUnauthorized();
        return null;
      }
      setError(
        caught instanceof ApiError ? caught.message : "Could not load history",
      );
      if (!next) {
        setEntries([]);
        setCursor(null);
      }
      return null;
    }
  }

  // a new account or new filters start from the first page again
  useEffect(() => {
    // `readPage` closes over the values below, which are what decide when to
    // reload; re-running on its identity would loop
    void (async () => {
      if (!accountId) {
        setEntries([]);
        setCursor(null);
        return;
      }

      const page = await readPage(null);
      if (!mounted.current || !page) return;

      setEntries(page.entries);
      setCursor(page.nextCursor);
      setAccountInfo(page.account);
      setError(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, filters]);

  /** Retry the first page after a failure. */
  async function reload() {
    const page = await readPage(null);
    if (!mounted.current || !page) return;
    setEntries(page.entries);
    setCursor(page.nextCursor);
    setAccountInfo(page.account);
    setError(null);
  }

  /** Append the next page. */
  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await readPage(cursor);
      if (!mounted.current || !page) return;
      // appending keeps the current list while the next page arrives
      setEntries((current) => [...(current ?? []), ...page.entries]);
      setCursor(page.nextCursor);
      setError(null);
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }

  const activeAccount = accounts?.find((account) => account._id === accountId);
  const headerNumber = accountInfo?.accountNumber
    ? formatAccountNumber(accountInfo.accountNumber)
    : activeAccount?.accountNumber
      ? formatAccountNumber(activeAccount.accountNumber)
      : null;
  const headerName = accountInfo?.label ?? activeAccount?.label ?? "Account";

  const filterCount =
    (filters.direction !== "all" ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0);

  // /history with no account: with one account, open it; with several, ask
  if (!accountId) {
    if (!accounts) {
      return (
        <div className="mx-auto w-full max-w-160">
          <Skeleton className="h-7 w-32" />
          <Card className="mt-4 border p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="mt-3 h-12 w-full" />
          </Card>
        </div>
      );
    }

    // one account: the effect above is sending us there, so just hold
    if (accounts.length === 1) {
      return (
        <div className="mx-auto w-full max-w-160">
          <Skeleton className="h-7 w-32" />
          <Card className="mt-4 border p-4">
            <Skeleton className="h-12 w-full" />
          </Card>
        </div>
      );
    }

    return (
      <div className="mx-auto w-full max-w-160">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        {accounts.length === 0 ? (
          <Alert tone="info" className="mt-4">
            Open an account first. Every account keeps its own history.{" "}
            <Link href="/dashboard" className="font-medium underline">
              Go to accounts
            </Link>
          </Alert>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose an account to see its transactions.
            </p>
            <div className="mt-4 space-y-2">
              {accounts.map((account) => (
                <Link
                  key={account._id}
                  href={`/history?account=${account._id}`}
                  className="flex items-center justify-between gap-3 rounded-(--radius) border border-border bg-card px-4 py-3 text-sm hover:border-primary/40 hover:bg-accent/40"
                >
                  <span>{account.label ?? "Account"}</span>
                  {account.accountNumber ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatAccountNumber(account.accountNumber)}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-160">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {headerName}
          </h1>
          {headerNumber ? (
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">
              {headerNumber}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard`}
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground sm:min-h-9"
          >
            Accounts
          </Link>
        </div>
      </div>

      {/* account switcher, when there is more than one */}
      {accounts && accounts.length > 1 ? (
        <div className="mt-4">
          <Select
            value={accountId}
            onChange={(value) => {
              // switching accounts is a navigation; the query string is the
              // source of truth for which account is shown
              router.push(`/history?account=${value}`);
            }}
            options={accounts.map((account) => ({
              value: account._id,
              label: `${account.label ?? "Account"}${
                account.accountNumber
                  ? ` · ${formatAccountNumber(account.accountNumber)}`
                  : ""
              }`,
            }))}
          />
        </div>
      ) : null}

      {/* filters */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-1 rounded-(--radius) border border-border bg-card p-1">
          {(["all", "in", "out"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filters.direction === value}
              onClick={() =>
                setFilters((current) => ({ ...current, direction: value }))
              }
              className={cn(
                "min-h-9 flex-1 rounded-md px-3 text-sm transition-colors",
                filters.direction === value
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "all"
                ? "All"
                : value === "in"
                  ? "Money in"
                  : "Money out"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowFilters((value) => !value)}
          aria-expanded={showFilters}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Dates
          {filterCount > (filters.direction !== "all" ? 1 : 0) ? (
            <span className="rounded-full bg-secondary px-1.5 text-xs text-secondary-foreground">
              {filterCount}
            </span>
          ) : null}
        </button>
      </div>

      {showFilters ? (
        <Card className="animate-fade-in mt-2 border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="from-date"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                From
              </label>
              <input
                id="from-date"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-(--radius) border border-input bg-card px-3 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="to-date"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                To
              </label>
              <input
                id="to-date"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
                className="h-10 w-full rounded-(--radius) border border-input bg-card px-3 text-sm"
              />
            </div>
          </div>
          {filterCount > 0 ? (
            <button
              type="button"
              onClick={() => setFilters(NO_FILTERS)}
              className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <X className="size-3" aria-hidden /> Clear filters
            </button>
          ) : null}
        </Card>
      ) : null}

      {/* export and count */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {loading
            ? "Loading…"
            : `${entries?.length ?? 0}${cursor ? "+" : ""} ${
                (entries?.length ?? 0) === 1 ? "entry" : "entries"
              }`}
        </p>
        {accountId ? (
          <a
            href={statementUrl(accountId, {
              direction: filters.direction,
              from: filters.from || undefined,
              to: filters.to || undefined,
            })}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline sm:min-h-9"
          >
            <Download className="size-4" aria-hidden />
            Download CSV
          </a>
        ) : null}
      </div>

      {error ? (
        <Alert tone="danger" className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void reload()}
              className="font-medium underline"
            >
              Try again
            </button>
          </div>
        </Alert>
      ) : null}

      <Card className="mt-2 border">
        {loading ? (
          <div className="space-y-3 p-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="mt-1.5 h-3 w-28" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : (entries ?? []).length === 0 ? (
          <div className="p-8 text-center">
            <h2 className="text-base font-semibold">No transactions yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {filterCount > 0
                ? "Nothing matches these filters. Try a wider date range or show both directions."
                : "When money moves in or out of this account, it will appear here with the balance after each entry."}
            </p>
            {filterCount > 0 ? (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setFilters(NO_FILTERS)}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <ul>
            {(entries ?? []).map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                expanded={expanded === entry.id}
                onToggle={() =>
                  setExpanded((current) =>
                    current === entry.id ? null : entry.id,
                  )
                }
              />
            ))}
          </ul>
        )}
      </Card>

      {cursor ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Spinner /> Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      ) : null}

      {!loading && (entries ?? []).length > 0 && !cursor ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          That is the start of this account&apos;s history.
        </p>
      ) : null}
    </div>
  );
}

/**
 * - History view
 * Wrapped in Suspense because it reads `?account=` and `?entry=` through
 * `useSearchParams`, which is request-time data.
 */
export function HistoryView() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-160">
          <Skeleton className="h-7 w-40" />
          <Card className="mt-5 border p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="mt-3 h-12 w-full" />
            <Skeleton className="mt-3 h-12 w-full" />
          </Card>
        </div>
      }
    >
      <HistoryContent />
    </Suspense>
  );
}
