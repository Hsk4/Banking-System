"use client";

import Link from "next/link";
import { CircleCheck, Clock } from "lucide-react";
import { formatMoney, shortId } from "@/lib/format";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Which panel to show: a completed movement or one still in flight. */
export type ResultTone = "success" | "warning";

/**
 * - Result panel
 * Replaces a money form once the server has answered. Shared by the transfer
 * page and the admin funding page so the two receipts look identical.
 *
 * @param title - "Transfer complete", "Already processed", "Funds added"...
 * @param tone - success (green check) or warning (clock)
 * @param amount - the amount that moved
 * @param toAccount - the recipient, rendered in mono and shortened
 * @param status - the transaction status shown in the detail list
 * @param actions - buttons under the receipt, primary first
 */
export function TransactionResult({
  title,
  tone,
  amount,
  toAccount,
  status,
  note,
  actions,
}: {
  title: string;
  tone: ResultTone;
  amount: number;
  toAccount: string;
  status?: string;
  note?: string;
  actions: React.ReactNode;
}) {
  const success = tone === "success";
  const shownStatus = status ?? (success ? "COMPLETED" : "PENDING");

  return (
    <div className="animate-fade-in text-center">
      <div
        className={cn(
          "mx-auto grid size-12 place-items-center rounded-full",
          success
            ? "bg-success-soft text-success"
            : "bg-warning-soft text-warning",
        )}
      >
        {success ? (
          <CircleCheck className="size-6" aria-hidden />
        ) : (
          <Clock className="size-6" aria-hidden />
        )}
      </div>

      <h2 role="status" className="mt-3 text-base font-semibold sm:text-lg">
        {title}
      </h2>
      {/* never wrap: a receipt amount must read as one number */}
      <p className="mt-2 whitespace-nowrap text-[30px] font-semibold leading-tight tracking-tight tabular-nums">
        {formatMoney(amount)}
      </p>

      <dl className="mt-5 space-y-2 rounded-(--radius) border border-border bg-muted px-3 py-2.5 text-left text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">To account</dt>
          <dd className="truncate font-mono text-xs" title={toAccount}>
            {shortId(toAccount, 10)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Transaction status</dt>
          <dd>
            <Badge tone={statusTone(shownStatus)}>{shownStatus}</Badge>
          </dd>
        </div>
      </dl>

      {note ? (
        <p className="mt-4 text-xs text-muted-foreground">{note}</p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">{actions}</div>
    </div>
  );
}

/**
 * - Back to dashboard
 * The primary exit from every receipt; kept here so both forms agree.
 */
export function BackToDashboard() {
  return (
    <Link href="/dashboard" className="flex-1">
      <Button fullWidth>Back to dashboard</Button>
    </Link>
  );
}
