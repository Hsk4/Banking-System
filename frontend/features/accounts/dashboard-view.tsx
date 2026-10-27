"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useHideBalances } from "@/lib/hide-balances";
import {
  ApiError,
  getAccounts,
  getBalance,
  getHistory,
  openAccount,
  renameAccount,
} from "@/lib/api";
import {
  formatAmount,
  formatAccountNumber,
  formatDate,
  formatSignedAmount,
  shortId,
} from "@/lib/format";
import type { Account, HistoryEntry } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, Spinner } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { statusHelp, statusLabel } from "@/lib/status-help";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { cn } from "@/lib/cn";

/** Show the cold-start notice when the first request takes longer than this. */
const COLD_START_MS = 4_000;

/** How many recent movements sit under each balance. */
const LATEST_COUNT = 5;

type BalanceState =
  | { status: "loading" }
  | { status: "ready"; balance: number }
  | { status: "error" };

/**
 * - A figure, or dots
 * One place decides what "hidden" looks like, so a balance never leaks
 * through a screen that forgot about the eye icon.
 *
 * @param children - the formatted figure
 */
function Secret({ children }: { children: React.ReactNode }) {
  const { hidden } = useHideBalances();
  if (!hidden) return <>{children}</>;
  return (
    <span aria-label="Balance hidden" className="tracking-widest">
      ••••••
    </span>
  );
}

/**
 * - Copy button
 * Recipients need the account number, so copying it is a first-class action.
 * A 44px touch target on mobile, 32px on desktop.
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1_600);
    } catch {
      toast.error("Could not copy. Select the number and copy it manually.");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
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
 * - One recent movement
 * A single line: direction icon, who, when, and the signed amount.
 */
function LatestRow({ accountId, entry }: { accountId: string; entry: HistoryEntry }) {
  const moneyIn = entry.direction === "CREDIT";
  return (
    <li>
      <Link
        href={`/history?account=${accountId}&entry=${entry.id}`}
        className="flex min-h-11 items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-accent/60"
      >
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full",
            moneyIn ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          {moneyIn ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">
            {moneyIn ? "From " : "To "}
            {entry.counterparty?.name ?? "another account"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {formatDate(entry.createdAt)}
            {entry.note ? ` · ${entry.note}` : ""}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 text-sm font-medium tabular-nums",
            moneyIn ? "text-success" : "text-foreground",
          )}
        >
          <Secret>{formatSignedAmount(entry.amount)}</Secret>
        </span>
      </Link>
    </li>
  );
}

/**
 * - Latest transactions under a balance
 * Answers "what just happened" without leaving the page, with a link to the
 * full, filterable history.
 */
function LatestActivity({ accountId }: { accountId: string }) {
  const { handleUnauthorized } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const page = await getHistory(accountId, { limit: LATEST_COUNT, direction: "all" });
        if (!active) return;
        setEntries(page.entries);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          handleUnauthorized();
          return;
        }
        setFailed(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [accountId, handleUnauthorized]);

  return (
    <div className="mt-3 border-t border-border pt-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs font-medium text-muted-foreground">Recent activity</span>
        <Link
          href={`/history?account=${accountId}`}
          className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline sm:min-h-0"
        >
          View all
        </Link>
      </div>

      {entries === null && !failed ? (
        <div className="space-y-2 px-1 py-1.5">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-5/6" />
        </div>
      ) : failed ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          Could not load recent activity.
        </p>
      ) : entries && entries.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          Nothing yet. Money coming in or going out will show here.
        </p>
      ) : (
        <ul>
          {(entries ?? []).map((entry) => (
            <LatestRow key={entry.id} accountId={accountId} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * - Account card
 * The label and status, the balance as the largest text on the page, the
 * short account number with a copy button, the latest five movements, and a
 * footer with the opening date and a shortcut into the transfer form.
 */
function AccountCard({
  account,
  state,
  onRetry,
  onRename,
}: {
  account: Account;
  state: BalanceState;
  onRetry: () => void;
  onRename: () => void;
}) {
  const active = account.status === "ACTIVE";
  const number = account.accountNumber
    ? formatAccountNumber(account.accountNumber)
    : null;
  const help = statusHelp(account.status);

  return (
    <Card className="flex flex-col gap-3 border p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onRename}
            className="truncate text-left text-sm font-medium hover:underline"
            aria-label={`Name this account. Current name: ${account.label ?? "Account"}`}
          >
            {account.label ?? "Account"}
          </button>
        </div>
        <Badge
          tone={statusTone(account.status)}
          title={help ?? undefined}
        >
          {statusLabel(account.status)}
        </Badge>
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
          <div>
            {/* the spec's "numbers come first" role: 30px on mobile, 36px up */}
            <p className="flex items-baseline gap-1.5 text-[30px] font-semibold leading-none tracking-tight sm:text-[36px]">
              <span className="text-base font-medium text-muted-foreground">
                PKR
              </span>
              <span className="tabular-nums">
                <Secret>{formatAmount(state.balance)}</Secret>
              </span>
            </p>
            {state.balance === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No funds yet. An administrator can add funds to this account.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* a badge alone does not tell people what to do */}
      {help ? (
        <p
          className={cn(
            "rounded-(--radius) px-2.5 py-1.5 text-xs",
            account.status === "FROZEN"
              ? "bg-warning-soft text-warning"
              : "bg-danger-soft text-danger",
          )}
        >
          {help}
        </p>
      ) : null}

      <div className="flex min-w-0 items-center gap-1">
        {number ? (
          <>
            <code className="font-mono text-sm tracking-wide" title="Account number">
              {number}
            </code>
            <CopyButton value={number} label="Copy account number" />
          </>
        ) : null}
        <span className="text-xs text-muted-foreground">·</span>
        <code
          className="min-w-0 truncate font-mono text-xs text-muted-foreground"
          title={account._id}
        >
          {shortId(account._id, 8)}
        </code>
        <CopyButton value={account._id} label="Copy account id" />
      </div>

      <LatestActivity accountId={account._id} />

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
 *
 * A system user holds no customer accounts, so they are sent to the admin
 * dashboard. The proxy cannot do this itself: it only sees that a cookie
 * exists.
 */
export function DashboardView() {
  const { handleUnauthorized, user } = useAuth();
  const { hidden, toggle } = useHideBalances();
  const router = useRouter();
  const isSystemUser = user?.systemUser === true;

  useEffect(() => {
    if (isSystemUser) router.replace("/admin");
  }, [isSystemUser, router]);

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, BalanceState>>({});
  const [coldStart, setColdStart] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // the account being named, if any
  const [renaming, setRenaming] = useState<Account | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [savingLabel, setSavingLabel] = useState(false);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * - Fetch one balance into local state
   * A balance without its figure (missing, or being retried) renders the
   * skeleton, so the only state to record is the answer itself.
   */
  const loadBalance = useCallback(
    async (accountId: string) => {
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

  /**
   * - Load the account list, then every balance
   * Every state change lands inside the async body, after an `await` or in a
   * timer callback, so the effect that calls this never sets state directly.
   */
  const load = useCallback(async () => {
    const timer = setTimeout(() => {
      if (mounted.current) setColdStart(true);
    }, COLD_START_MS);

    try {
      const list = await getAccounts();
      if (!mounted.current) return;
      setAccounts(list);
      setListError(null);
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
      } else if (error instanceof ApiError && error.status === 409) {
        // the user already has an active account: that is the outcome the
        // dialog was asking for, so treat it as success and show the list
        setDialogOpen(false);
        toast.info("You already have an active account.");
        await load();
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

  /** Open the rename dialog for one account. */
  function startRename(account: Account) {
    setRenaming(account);
    setLabelDraft(account.label ?? "");
    setLabelError(null);
  }

  async function saveRename() {
    if (!renaming) return;
    const label = labelDraft.trim();

    if (!label) {
      setLabelError("Enter a name, or cancel to keep the current one");
      return;
    }
    if (label.length > 40) {
      setLabelError("Name must be 40 characters or fewer");
      return;
    }

    setSavingLabel(true);
    try {
      const updated = await renameAccount(renaming._id, label);
      setAccounts((current) =>
        (current ?? []).map((account) =>
          account._id === updated._id ? { ...account, label: updated.label } : account,
        ),
      );
      setRenaming(null);
      toast.success("Account renamed");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        setRenaming(null);
        return;
      }
      setLabelError(
        error instanceof ApiError ? error.message : "Could not rename the account",
      );
    } finally {
      setSavingLabel(false);
    }
  }

  // null while the list is on its way (or after a retry was requested)
  const loadingList = accounts === null;
  const hasAccounts = (accounts?.length ?? 0) > 0;
  // one active account is all a customer can hold, so once the list shows an
  // active one the action disappears. While loading, or with only a frozen or
  // closed account, it stays available.
  const hasActiveAccount = accounts?.some((a) => a.status === "ACTIVE") ?? false;
  const showHeaderAction = !hasActiveAccount;

  /**
   * Does any account hold money yet?
   * `null` while a balance is still loading, so the "no money yet" guidance
   * never flashes before the figures arrive.
   */
  const anyFunded =
    accounts && accounts.length > 0
      ? accounts.some((account) => {
          const state = balances[account._id];
          if (!state || state.status === "loading") return true;
          return state.status === "ready" && state.balance > 0;
        })
      : null;

  return (
    <PullToRefresh onRefresh={load}>
      <div>
        <div className="flex min-h-10 items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Your accounts</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-pressed={hidden}
              aria-label={hidden ? "Show balances" : "Hide balances"}
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {hidden ? (
                <EyeOff className="size-5" aria-hidden />
              ) : (
                <Eye className="size-5" aria-hidden />
              )}
            </button>
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
            <>
              {hasAccounts && anyFunded === false ? (
                <Alert tone="info" className="mb-4">
                  <span className="font-semibold">No money yet.</span> An
                  account only holds what someone sends it. An administrator
                  adds the first funds, and after that people can pay you with
                  your account number.
                </Alert>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                {accounts.map((account) => (
                  <AccountCard
                    key={account._id}
                    account={account}
                    state={balances[account._id] ?? { status: "loading" }}
                    onRetry={() => void loadBalance(account._id)}
                    onRename={() => startRename(account)}
                  />
                ))}
              </div>
            </>
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

        <Dialog
          open={renaming !== null}
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          title="Name this account"
          description="Only you see this name. It does not change your account number."
          footer={
            <>
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => setRenaming(null)}
                disabled={savingLabel}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => void saveRename()}
                disabled={savingLabel}
              >
                {savingLabel ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : (
                  "Save name"
                )}
              </Button>
            </>
          }
        >
          <Label htmlFor="account-label">Account name</Label>
          <Input
            id="account-label"
            value={labelDraft}
            maxLength={40}
            placeholder="Savings"
            disabled={savingLabel}
            invalid={Boolean(labelError)}
            aria-describedby={labelError ? "account-label-error" : undefined}
            onChange={(event) => {
              setLabelDraft(event.target.value);
              setLabelError(null);
            }}
          />
          <FieldError id="account-label-error" visible>
            {labelError}
          </FieldError>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
