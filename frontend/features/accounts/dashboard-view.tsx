"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ApiError, getAccounts, getBalance, openAccount } from "@/lib/api";
import { formatAmount, formatDate, shortId } from "@/lib/format";
import type { Account } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, Spinner } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";

/** Show the cold-start notice when the first request takes longer than this. */
const COLD_START_MS = 4_000;

type BalanceState =
  | { status: "loading" }
  | { status: "ready"; balance: number }
  | { status: "error" };

/**
 * - Copy button
 * Recipients need the account id, so copying it is a first-class action.
 * A 44px touch target on mobile, 32px on desktop.
 */
function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1_600);
    } catch {
      toast.error("Could not copy. Select the id and copy it manually.");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy account id"}
      className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground sm:size-8"
    >
      {copied ? (
        <Check className="size-4 text-success" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
    </button>
  );
}

/**
 * - Account card
 * Label + status badge, the balance as the largest text on the page, the
 * account id in mono with a copy button, and a footer with the opening date
 * and a shortcut into the transfer form.
 */
function AccountCard({
  account,
  state,
  onRetry,
}: {
  account: Account;
  state: BalanceState;
  onRetry: () => void;
}) {
  const active = account.status === "ACTIVE";

  return (
    <Card className="flex flex-col gap-3 border p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Account</span>
        <Badge tone={statusTone(account.status)}>{account.status}</Badge>
      </div>

      <div className="min-h-11">
        {state.status === "loading" ? (
          <Skeleton className="h-9 w-44" />
        ) : state.status === "error" ? (
          <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
            Could not load balance
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <RefreshCw className="size-3" aria-hidden /> Retry
            </button>
          </div>
        ) : (
          // the spec's "numbers come first" role: 30px on mobile, 36px up
          <p className="flex items-baseline gap-1.5 text-[30px] font-semibold leading-none tracking-tight sm:text-[36px]">
            <span className="text-base font-medium text-muted-foreground">
              PKR
            </span>
            <span className="tabular-nums">{formatAmount(state.balance)}</span>
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1">
        <code
          className="min-w-0 truncate font-mono text-xs text-muted-foreground"
          title={account._id}
        >
          {shortId(account._id, 12)}
        </code>
        <CopyIdButton id={account._id} />
      </div>

      <div className="mt-auto flex min-h-11 items-center justify-between gap-3 border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">
          Opened {formatDate(account.createdAt)}
        </span>
        <Link
          href={`/transfer?from=${account._id}`}
          aria-disabled={!active}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline aria-disabled:pointer-events-none aria-disabled:text-muted-foreground"
        >
          Transfer
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

/** Placeholder card shown while the account list is still loading. */
function AccountCardSkeleton() {
  return (
    <Card className="border p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-9 w-44" />
      <Skeleton className="mt-4 h-3 w-48" />
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-14" />
      </div>
    </Card>
  );
}

/**
 * - Dashboard
 * Lists accounts, loads each balance in parallel, and opens new accounts
 * through a dialog. Shows a cold-start hint if the backend is waking up.
 */
export function DashboardView() {
  const { handleUnauthorized } = useAuth();

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, BalanceState>>({});
  const [coldStart, setColdStart] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Fetch one balance into local state. */
  const loadBalance = useCallback(
    async (accountId: string) => {
      setBalances((current) => ({
        ...current,
        [accountId]: { status: "loading" },
      }));
      try {
        const { balance } = await getBalance(accountId);
        if (!mounted.current) return;
        setBalances((current) => ({
          ...current,
          [accountId]: { status: "ready", balance },
        }));
      } catch (error) {
        if (!mounted.current) return;
        if (error instanceof ApiError && error.status === 401) {
          handleUnauthorized();
          return;
        }
        setBalances((current) => ({
          ...current,
          [accountId]: { status: "error" },
        }));
      }
    },
    [handleUnauthorized],
  );

  /** Load the account list, then every balance. */
  const load = useCallback(async () => {
    setAccounts(null);
    setListError(null);
    const timer = setTimeout(() => {
      if (mounted.current) setColdStart(true);
    }, COLD_START_MS);

    try {
      const list = await getAccounts();
      if (!mounted.current) return;
      setAccounts(list);
      // balances are independent - kick them off one by one, each rendering
      // the skeleton until its own response arrives
      list.forEach((account) => void loadBalance(account._id));
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      setAccounts([]);
      setListError(
        error instanceof ApiError
          ? error.message
          : "Could not load your accounts",
      );
    } finally {
      clearTimeout(timer);
      if (mounted.current) setColdStart(false);
    }
  }, [handleUnauthorized, loadBalance]);

  // the dashboard is a live view of money - refresh whenever it becomes
  // visible again (Cache Components keeps it mounted but hidden)
  useEffect(() => {
    void (async () => {
      await load();
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  /** Run the list skeleton from the first render, before any effect commits. */
  const [loaded, setLoaded] = useState(false);
  if (!loaded && (accounts !== null || listError !== null)) {
    // render adjustment: the first data arrival flips the skeleton off
    setLoaded(true);
  }

  async function handleOpenAccount() {
    setOpening(true);
    setOpenError(null);
    try {
      await openAccount();
      setDialogOpen(false);
      toast.success("Account opened");
      await load();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        setDialogOpen(false);
      } else {
        setOpenError(
          error instanceof ApiError
            ? error.message
            : "Could not open an account",
        );
      }
    } finally {
      setOpening(false);
    }
  }

  const loadingList = !loaded || accounts === null;
  const hasAccounts = (accounts?.length ?? 0) > 0;
  // the account model allows several accounts, so the action stays available
  // until the list has loaded
  const showHeaderAction = loadingList || hasAccounts;

  return (
    <div>
      <div className="flex min-h-10 items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your accounts</h1>
        {showHeaderAction ? (
          <Button
            variant="outline"
            className="max-sm:h-9 max-sm:px-3"
            onClick={() => setDialogOpen(true)}
          >
            Open account
          </Button>
        ) : null}
      </div>

      {coldStart ? (
        <Alert tone="info" className="mt-4">
          Waking up the server, this can take up to a minute.
        </Alert>
      ) : null}

      {listError ? (
        <Alert tone="danger" className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span>{listError}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 font-medium underline"
            >
              <RefreshCw className="size-3" aria-hidden /> Try again
            </button>
          </div>
        </Alert>
      ) : null}

      <div className="mt-5">
        {loadingList ? (
          <div className="grid gap-4 md:grid-cols-2">
            <AccountCardSkeleton />
            <AccountCardSkeleton />
          </div>
        ) : hasAccounts ? (
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((account) => (
              <AccountCard
                key={account._id}
                account={account}
                state={balances[account._id] ?? { status: "loading" }}
                onRetry={() => void loadBalance(account._id)}
              />
            ))}
          </div>
        ) : listError ? null : (
          <Card className="border p-8 text-center sm:p-10">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <Wallet className="size-5" aria-hidden />
            </div>
            <h2 className="mt-4 text-base font-semibold">No accounts yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              A PKR account lets you receive money, check your balance and send
              transfers. Opening one takes a moment.
            </p>
            <div className="mt-5 flex justify-center">
              <Button onClick={() => setDialogOpen(true)}>
                Open your first account
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setOpenError(null);
        }}
        title="Open a new account"
        description="A PKR account will be created and activated immediately."
        footer={
          <>
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => setDialogOpen(false)}
              disabled={opening}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              onClick={() => void handleOpenAccount()}
              disabled={opening}
            >
              {opening ? (
                <>
                  <Spinner /> Opening…
                </>
              ) : (
                "Open account"
              )}
            </Button>
          </>
        }
      >
        {openError ? <Alert tone="danger">{openError}</Alert> : null}
      </Dialog>
    </div>
  );
}
