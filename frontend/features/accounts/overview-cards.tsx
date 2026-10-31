"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  Send,
  Share2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Secret } from "@/lib/hide-balances";
import { ApiError, getHistory, getRecentRecipients } from "@/lib/api";
import {
  formatAccountNumber,
  formatAmount,
  initialsOf,
  toDateInputValue,
} from "@/lib/format";
import type { Account, RecentRecipient } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

/** What the dashboard knows about one account's balance. */
export type BalanceState =
  | { status: "loading" }
  | { status: "ready"; balance: number }
  | { status: "error" };

/** How far back the cash-flow summary looks. */
const FLOW_DAYS = 30;

/** History pages are 100 rows; five of them bound the work per account. */
const FLOW_MAX_PAGES = 5;

/** How many people the "send again" strip offers. */
const RECENT_COUNT = 6;

/* ------------------------------------------------------------------ */
/* Greeting                                                            */
/* ------------------------------------------------------------------ */

function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const noSubscription = () => () => {};

/**
 * - Time-of-day greeting
 * Read through `useSyncExternalStore`: the server snapshot is a neutral
 * "Welcome", so the static HTML and the first client render agree, and the
 * real greeting appears right after hydration without any effect.
 */
export function useGreeting(): string {
  return useSyncExternalStore(
    noSubscription,
    () => greetingForHour(new Date().getHours()),
    () => "Welcome",
  );
}

/* ------------------------------------------------------------------ */
/* Balance hero                                                        */
/* ------------------------------------------------------------------ */

/**
 * - Balance hero
 * The total across the customer's accounts, set large in the serif on the
 * emerald brand surface, with the three things people do most: send, receive
 * and open the statement.
 */
export function BalanceHero({
  accounts,
  balances,
  onReceive,
}: {
  accounts: Account[];
  balances: Record<string, BalanceState>;
  onReceive: () => void;
}) {
  const states = accounts.map((a) => balances[a._id] ?? { status: "loading" as const });
  const loading = states.some((s) => s.status === "loading");
  const failed = states.some((s) => s.status === "error");
  const total = states.reduce(
    (sum, s) => (s.status === "ready" ? sum + s.balance : sum),
    0,
  );
  const active = accounts.find((a) => a.status === "ACTIVE");

  const action =
    "inline-flex min-h-11 w-full items-center justify-center [&>svg]:shrink-0 gap-1.5 rounded-xl px-2 text-sm font-semibold transition duration-150 sm:w-auto sm:gap-2 sm:px-4";

  return (
    <section
      aria-label="Total balance"
      className="bg-hero animate-rise-in relative overflow-hidden rounded-3xl p-6 shadow-card sm:p-8"
    >
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-[#f7f1e1]/70">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="size-1.5 rounded-full bg-[#dca847]" />
          Total balance
        </span>
        <span>
          {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
        </span>
      </div>

      <div className="mt-3 min-h-14 sm:min-h-16">
        {loading ? (
          <Skeleton className="h-12 w-60 bg-[#f7f1e1]/15" />
        ) : (
          <p className="flex items-baseline gap-2">
            <span className="text-lg font-medium text-[#f7f1e1]/60">PKR</span>
            <span className="font-display text-[44px] font-medium leading-none tracking-tight sm:text-[60px]">
              <Secret>{formatAmount(total)}</Secret>
            </span>
          </p>
        )}
        {failed && !loading ? (
          <p className="mt-2 text-xs text-[#f7f1e1]/70">
            Some balances could not be loaded, so this total may be low.
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
        <Link
          href={active ? `/transfer?from=${active._id}` : "/transfer"}
          aria-disabled={!active}
          className={cn(
            action,
            "bg-[#f7f1e1] text-[#0b3b2e] hover:bg-white aria-disabled:pointer-events-none aria-disabled:opacity-50",
          )}
        >
          <Send className="size-4" aria-hidden />
          Send
        </Link>
        <button
          type="button"
          onClick={onReceive}
          className={cn(
            action,
            "bg-[#f7f1e1]/12 text-[#f7f1e1] ring-1 ring-[#f7f1e1]/20 hover:bg-[#f7f1e1]/20",
          )}
        >
          <ArrowDownLeft className="size-4" aria-hidden />
          Receive
        </button>
        <Link
          href="/history"
          className={cn(
            action,
            "bg-[#f7f1e1]/12 text-[#f7f1e1] ring-1 ring-[#f7f1e1]/20 hover:bg-[#f7f1e1]/20",
          )}
        >
          <FileText className="size-4" aria-hidden />
          Statement
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Receive dialog                                                      */
/* ------------------------------------------------------------------ */

/**
 * - Receive money
 * People pay by account number, so this puts the number, the holder's name
 * and a share button in one place instead of making the customer hunt for the
 * copy icon on a card.
 */
export function ReceiveDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
}) {
  const { user } = useAuth();
  const [copied, setCopied] = useState<string | null>(null);
  const payable = accounts.filter((a) => a.status === "ACTIVE" && a.accountNumber);
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  /** The text that goes to a payer. */
  function detailsFor(account: Account): string {
    const number = formatAccountNumber(account.accountNumber ?? "");
    return `Pay me on Ledger\nName: ${user?.name ?? ""}\nAccount number: ${number} (PKR)`;
  }

  async function copy(account: Account) {
    try {
      await navigator.clipboard.writeText(formatAccountNumber(account.accountNumber ?? ""));
      setCopied(account._id);
      toast.success("Account number copied");
      setTimeout(() => setCopied(null), 1_600);
    } catch {
      toast.error("Could not copy. Select the number and copy it manually.");
    }
  }

  async function share(account: Account) {
    try {
      await navigator.share({ title: "My Ledger account", text: detailsFor(account) });
    } catch {
      // the person closed the share sheet: nothing to report
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Receive money"
      description="Anyone with your account number can pay you. Share it, they do the rest."
    >
      {payable.length === 0 ? (
        <Alert tone="warning">
          You have no active account to receive into right now.
        </Alert>
      ) : (
        <ul className="space-y-3">
          {payable.map((account) => (
            <li
              key={account._id}
              className="rounded-2xl bg-secondary p-4 text-secondary-foreground"
            >
              <p className="text-xs font-medium opacity-70">
                {account.label ?? "Account"} · PKR
              </p>
              <p className="mt-1 font-mono text-[26px] font-semibold tracking-[0.08em]">
                {formatAccountNumber(account.accountNumber ?? "")}
              </p>
              {user?.name ? <p className="mt-0.5 text-sm">{user.name}</p> : null}

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 justify-center"
                  onClick={() => void copy(account)}
                >
                  {copied === account._id ? (
                    <Check className="size-4 text-success" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {copied === account._id ? "Copied" : "Copy number"}
                </Button>
                {canShare ? (
                  <Button className="flex-1 justify-center" onClick={() => void share(account)}>
                    <Share2 className="size-4" aria-hidden />
                    Share
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Cash flow                                                           */
/* ------------------------------------------------------------------ */

type FlowState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; inflow: number; outflow: number; truncated: boolean };

/**
 * - Cash flow, last 30 days
 * Money in against money out, summed from the ledger the History screen
 * already reads. Only completed movements count: a held transfer has not
 * moved anything yet.
 */
export function CashFlowCard({ accounts }: { accounts: Account[] }) {
  const { handleUnauthorized } = useAuth();
  const [flow, setFlow] = useState<FlowState>({ status: "loading" });
  // a stable dependency: the list is a new array on every refresh
  const key = accounts.map((a) => a._id).join(",");

  useEffect(() => {
    if (!key) return;
    let active = true;
    const ids = key.split(",");
    const from = toDateInputValue(new Date(Date.now() - FLOW_DAYS * 86_400_000));

    void (async () => {
      try {
        let inflow = 0;
        let outflow = 0;
        let truncated = false;

        for (const id of ids) {
          let cursor: string | null = null;
          for (let page = 0; page < FLOW_MAX_PAGES; page += 1) {
            const result = await getHistory(id, { limit: 100, from, cursor });
            for (const entry of result.entries) {
              if (entry.status !== "COMPLETED") continue;
              if (entry.direction === "CREDIT") inflow += Math.abs(entry.amount);
              else outflow += Math.abs(entry.amount);
            }
            cursor = result.nextCursor;
            if (!cursor) break;
            if (page === FLOW_MAX_PAGES - 1) truncated = true;
          }
        }

        if (!active) return;
        setFlow({ status: "ready", inflow, outflow, truncated });
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          handleUnauthorized();
          return;
        }
        setFlow({ status: "error" });
      }
    })();

    return () => {
      active = false;
    };
  }, [key, handleUnauthorized]);

  const ready = flow.status === "ready" ? flow : null;
  const total = ready ? ready.inflow + ready.outflow : 0;
  const inShare = ready && total > 0 ? (ready.inflow / total) * 100 : 0;
  const net = ready ? ready.inflow - ready.outflow : 0;

  return (
    <Card className="animate-rise-in p-5" style={{ "--i": 1 } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Last {FLOW_DAYS} days</h2>
        {ready && total > 0 ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              net >= 0 ? "bg-success-soft text-success" : "bg-brass-soft text-brass",
            )}
          >
            {net >= 0 ? (
              <TrendingUp className="size-3.5" aria-hidden />
            ) : (
              <TrendingDown className="size-3.5" aria-hidden />
            )}
            Net {net >= 0 ? "+" : "-"}
            <Secret>{formatAmount(Math.abs(net))}</Secret>
          </span>
        ) : null}
      </div>

      {flow.status === "loading" ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : flow.status === "error" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Could not load your activity summary.
        </p>
      ) : total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No money has moved in the last {FLOW_DAYS} days.
        </p>
      ) : (
        <>
          {/* in against out, as one bar: the longer side is the busier one */}
          <div
            className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-brass/30"
            role="img"
            aria-label={`Money in is ${Math.round(inShare)} percent of the total movement`}
          >
            <div className="bg-success transition-[width] duration-500" style={{ width: `${inShare}%` }} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="grid size-5 place-items-center rounded-full bg-success-soft text-success">
                  <ArrowDownLeft className="size-3.5" aria-hidden />
                </span>
                Money in
              </p>
              <p className="mt-1 font-display text-2xl font-medium tracking-tight">
                <Secret>{formatAmount(flow.inflow)}</Secret>
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="grid size-5 place-items-center rounded-full bg-brass-soft text-brass">
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </span>
                Money out
              </p>
              <p className="mt-1 font-display text-2xl font-medium tracking-tight">
                <Secret>{formatAmount(flow.outflow)}</Secret>
              </p>
            </div>
          </div>

          {flow.truncated ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Based on your most recent movements; open History for the full list.
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Send again                                                          */
/* ------------------------------------------------------------------ */

/**
 * - Send again
 * The people the customer paid most recently, one tap from a pre-filled
 * transfer form. It renders nothing until there is someone to show, and stays
 * silent if the request fails: it is a shortcut, not something to block on.
 */
export function SendAgain({ fromAccountId }: { fromAccountId: string | null }) {
  const [people, setPeople] = useState<RecentRecipient[]>([]);

  useEffect(() => {
    if (!fromAccountId) return;
    let active = true;
    void (async () => {
      try {
        const recent = await getRecentRecipients();
        if (active) setPeople(recent.slice(0, RECENT_COUNT));
      } catch {
        // a missing shortcut is not worth an error
      }
    })();
    return () => {
      active = false;
    };
  }, [fromAccountId]);

  if (!fromAccountId || people.length === 0) return null;

  return (
    <section
      aria-label="Send again"
      className="animate-rise-in"
      style={{ "--i": 2 } as React.CSSProperties}
    >
      <h2 className="mb-2 text-base font-semibold">Send again</h2>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {people.map((person) => (
          <li key={person.accountNumber} className="shrink-0">
            <Link
              href={`/transfer?from=${fromAccountId}&to=${person.accountNumber.replace(/\D/g, "")}`}
              className="flex w-24 flex-col items-center gap-2 rounded-2xl border border-border bg-card px-2 py-3 text-center shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-brass/60"
            >
              <span className="grid size-11 place-items-center rounded-full bg-brass-soft text-sm font-bold text-brass">
                {initialsOf(person.name)}
              </span>
              <span className="w-full truncate text-xs font-medium">{person.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
