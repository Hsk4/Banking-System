"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Send,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useHideBalances, Secret } from "@/lib/hide-balances";
import {
  ApiError,
  getBalance,
  getHistory,
  getRecentRecipients,
  statementUrl,
} from "@/lib/api";
import { formatAccountNumber, formatAmount, formatMoney } from "@/lib/format";
import type { Account, RecentRecipient } from "@/lib/types";
import { Skeleton } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** How many recent payees the "Send again" row shows. */
const RECENT_COUNT = 3;

/** History pages read per account: 5 pages of 100 entries each. */
const MAX_PAGES = 5;
const PAGE_SIZE = 100;

/**
 * - Greeting by time of day
 * A plain function, so the dashboard can call it while rendering: AuthGuard
 * only renders once hydrated, so the hour is already the browser's.
 * @param hour - 0-23, from `new Date().getHours()`
 */
export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * - Money in and money out for the last 30 days
 * Reads completed entries of every account, a page at a time, and stops after
 * `MAX_PAGES` so a busy account cannot stall the dashboard.
 */
async function loadLast30Days(accounts: Account[]) {
  let inTotal = 0;
  let outTotal = 0;
  let truncated = false;

  for (const account of accounts) {
    let cursor: string | null = null;
    let pages = 0;

    do {
      const page = await getHistory(account._id, { cursor, limit: PAGE_SIZE });
      for (const entry of page.entries) {
        if (entry.status !== "COMPLETED") continue;
        if (entry.direction === "CREDIT") inTotal += Math.abs(entry.amount);
        else outTotal += Math.abs(entry.amount);
      }
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);

    if (cursor) truncated = true;
  }

  return { inTotal, outTotal, truncated };
}

/**
 * - The last 30 days as one bar
 * Money in on the left of the bar, money out on the right, and a net badge.
 */
function Last30Days({ accounts }: { accounts: Account[] }) {
  const { handleUnauthorized } = useAuth();
  const [totals, setTotals] = useState<{
    inTotal: number;
    outTotal: number;
    truncated: boolean;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const result = await loadLast30Days(accounts);
        if (active) setTotals(result);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          handleUnauthorized();
        else setFailed(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [accounts, handleUnauthorized]);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not read the last 30 days.
      </p>
    );
  }
  if (!totals) return <Skeleton className="h-16 w-full" />;

  const net = totals.inTotal - totals.outTotal;
  const total = totals.inTotal + totals.outTotal;
  const inShare = total > 0 ? (totals.inTotal / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Last 30 days</p>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            net >= 0
              ? "bg-success-soft text-success"
              : "bg-danger-soft text-danger",
          )}
        >
          {net >= 0 ? (
            <ArrowUpRight className="size-3" aria-hidden />
          ) : (
            <ArrowDownLeft className="size-3" aria-hidden />
          )}
          Net{" "}
          <Secret>{`${net >= 0 ? "+" : "-"}${formatAmount(Math.abs(net))}`}</Secret>
        </span>
      </div>

      {/* one bar: in on the left, out on the right */}
      <div
        className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Money in ${formatMoney(totals.inTotal)}, money out ${formatMoney(totals.outTotal)}`}
      >
        <span className="bg-primary" style={{ width: `${inShare}%` }} />
        <span className="bg-brass" style={{ width: `${100 - inShare}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowDownLeft className="size-3 text-success" aria-hidden /> Money
            in
          </p>
          <p className="font-display text-xl">
            <Secret>{formatAmount(totals.inTotal)}</Secret>
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowUpRight className="size-3 text-brass" aria-hidden /> Money out
          </p>
          <p className="font-display text-xl">
            <Secret>{formatAmount(totals.outTotal)}</Secret>
          </p>
        </div>
      </div>

      {totals.truncated ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Only the latest {MAX_PAGES * PAGE_SIZE} entries per account were
          counted.
        </p>
      ) : null}
    </div>
  );
}

/**
 * - Receive money dialog
 * The account number large in mono, the holder, then Copy and (where the
 * browser allows it) Share.
 */
export function ReceiveDialog({ account }: { account: Account }) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const number = account.accountNumber
    ? formatAccountNumber(account.accountNumber)
    : null;

  async function copy() {
    if (!number) return;
    try {
      await navigator.clipboard.writeText(number.replace(/\D/g, ""));
      setCopied(true);
      toast.success("Account number copied");
      setTimeout(() => setCopied(false), 1_600);
    } catch {
      toast.error("Could not copy. Select the number and copy it manually.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-muted px-4 py-4">
        <p className="text-xs text-muted-foreground">
          {account.label ?? "Account"} · PKR
        </p>
        <p className="mt-1 font-mono text-2xl font-medium tracking-wider">
          {number ?? "No number yet"}
        </p>
        <p className="mt-1 text-sm">{user?.name ?? "Your Ledger account"}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => void copy()}
          disabled={!number}
        >
          <Copy className="size-4" aria-hidden />
          {copied ? "Copied" : "Copy number"}
        </Button>
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <Button
            className="flex-1"
            disabled={!number}
            onClick={() => {
              if (!number) return;
              // a dismissed share sheet rejects too - nothing to report
              void navigator
                .share({
                  title: "Ledger account",
                  text: `${number} · ${user?.name ?? "Ledger"}`,
                })
                .catch(() => {});
            }}
          >
            <Send className="size-4" aria-hidden />
            Share
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** - The last few payees as round chips that fill the transfer form. */
function SendAgain({ account }: { account: Account }) {
  const { handleUnauthorized } = useAuth();
  const [recipients, setRecipients] = useState<RecentRecipient[] | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const list = await getRecentRecipients();
        if (active) setRecipients(list.slice(0, RECENT_COUNT));
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          handleUnauthorized();
        else setRecipients([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [handleUnauthorized]);

  if (recipients === null) return <Skeleton className="h-12 w-40" />;
  if (recipients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No one yet. Send money to see them here.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {recipients.map((recipient) => (
        <Link
          key={recipient.accountNumber}
          href={`/transfer?from=${account._id}&to=${recipient.accountNumber.replace(/\D/g, "")}`}
          className="flex w-20 flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-3 text-xs transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="grid size-9 place-items-center rounded-full bg-brass-soft font-medium text-brass">
            {recipient.name.slice(0, 2)}
          </span>
          <span className="max-w-full truncate">{recipient.name}</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * - Dashboard overview
 * The greeting, the total balance on the emerald surface with its three
 * actions, the last 30 days, and the people paid most recently.
 */
export function OverviewCards({ accounts }: { accounts: Account[] }) {
  const { user } = useAuth();
  const { hidden, toggle } = useHideBalances();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  // Send, Receive and Statement act on the active account
  const primary =
    accounts.find((account) => account.status === "ACTIVE") ?? accounts[0];
  const firstName = user?.name?.split(/\s+/)[0] ?? "there";

  // the sum of every account, read once for this headline
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const balances = await Promise.all(
          accounts.map((a) => getBalance(a._id)),
        );
        if (active) setTotal(balances.reduce((sum, b) => sum + b.balance, 0));
      } catch {
        if (active) setTotal(0);
      }
    })();

    return () => {
      active = false;
    };
  }, [accounts]);

  return (
    <div className="space-y-5">
      <div className="animate-rise-in flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">
            {greeting(new Date().getHours())}, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here is where your money stands today.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? "Show balances" : "Hide balances"}
          className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {/* the headline balance, on the emerald surface in both themes */}
      <section
        className="bg-hero animate-rise-in rounded-2xl px-6 py-5 text-[#f7f1e1]"
        style={{ animationDelay: "40ms" }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[#dca847]">
            <span className="size-1.5 rounded-full bg-[#dca847]" aria-hidden />
            Total balance
          </p>
          <p className="text-xs text-[#f7f1e1]/60">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
          </p>
        </div>

        <p className="mt-2 flex items-baseline gap-2 font-display text-5xl leading-none">
          <span className="text-base font-normal text-[#f7f1e1]/60">PKR</span>
          {total === null ? (
            <Skeleton className="h-12 w-40 bg-white/15" />
          ) : (
            <Secret>{formatAmount(total)}</Secret>
          )}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Link
            href={primary ? `/transfer?from=${primary._id}` : "/transfer"}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#f7f1e1] py-2.5 text-sm font-medium text-[#0e4d3c]"
          >
            <Send className="size-4" aria-hidden />
            Send
          </Link>
          <button
            type="button"
            onClick={() => setReceiveOpen(true)}
            disabled={!primary}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2.5 text-sm font-medium hover:bg-white/15 disabled:opacity-50"
          >
            <ArrowDownLeft className="size-4" aria-hidden />
            Receive
          </button>
          {primary ? (
            <a
              href={statementUrl(primary._id)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2.5 text-sm font-medium hover:bg-white/15"
            >
              <FileText className="size-4" aria-hidden />
              Statement
            </a>
          ) : null}
        </div>
      </section>

      {primary ? (
        <>
          <section
            className="animate-rise-in"
            style={{ animationDelay: "80ms" }}
          >
            <h2 className="mb-2 text-sm font-medium">Send again</h2>
            <SendAgain account={primary} />
          </section>

          <section
            className="animate-rise-in rounded-2xl border border-border bg-card p-5"
            style={{ animationDelay: "120ms" }}
          >
            <Last30Days accounts={accounts} />
          </section>

          <Dialog
            open={receiveOpen}
            onOpenChange={setReceiveOpen}
            title="Receive money"
            description="Anyone with your account number can pay you. Share it, they do the rest."
          >
            <ReceiveDialog account={primary} />
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
