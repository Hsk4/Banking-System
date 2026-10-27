"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatAccountNumber,
  formatAmount,
  formatDateTime,
  shortId,
} from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { Badge, statusTone } from "@/components/ui/badge";
import { statusHelp, statusLabel } from "@/lib/status-help";
import { cn } from "@/lib/cn";

/**
 * - Receipt details
 * The proof of payment people ask for: what moved, between whom, when, and
 * the reference support can look up. Shared by the transfer result and the
 * history row that opens it.
 */

/** One label/value line in the details block. */
function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right wrap-break-word",
          mono && "font-mono text-xs",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * - Share a receipt
 * Uses the Web Share sheet when the device has one (the APK and phones do),
 * and falls back to the clipboard on desktop.
 */
function ShareButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  async function share() {
    // `navigator.share` is missing on desktop browsers
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Transfer receipt", text });
        return;
      } catch {
        // the user dismissed the sheet - fall through to copying
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Receipt copied");
      setTimeout(() => setCopied(false), 1_600);
    } catch {
      toast.error("Could not copy the receipt");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline sm:min-h-9"
    >
      {copied ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <Share2 className="size-4" aria-hidden />
      )}
      {copied ? "Copied" : "Share"}
    </button>
  );
}

/** The fields a receipt needs, taken from a transaction or a history row. */
export interface ReceiptData {
  /** the receipt reference, e.g. "TRX-7K2M9QP4" */
  reference: string | null;
  /** when the money moved */
  createdAt: string;
  /** the signed amount: negative when money left this account */
  amount: number;
  /** the transaction status */
  status: string;
  /** an optional note */
  note?: string | null;
  /** the account the money left */
  from: { accountNumber?: string | null; name?: string | null } | null;
  /** the account the money arrived in */
  to: { accountNumber?: string | null; name?: string | null } | null;
  /** the fee recorded on the transfer */
  fee?: number;
}

/** The account label a receipt line shows: the number, or a short id. */
function accountLabel(
  side: { accountNumber?: string | null; name?: string | null } | null,
  fallback: string,
): string {
  if (!side) return fallback;
  if (side.accountNumber) return formatAccountNumber(side.accountNumber);
  return side.name ?? fallback;
}

/**
 * - Receipt
 * @param data - what moved and between whom
 * @param showAmount - false when the page already prints the amount in a hero
 */
export function Receipt({
  data,
  showAmount = true,
}: {
  data: ReceiptData;
  showAmount?: boolean;
}) {
  const help = statusHelp(data.status);

  const shareText = [
    data.reference ? `Reference ${data.reference}` : null,
    `PKR ${formatAmount(data.amount)}`,
    `From ${accountLabel(data.from, "your account")}`,
    `To ${accountLabel(data.to, "recipient")}`,
    formatDateTime(data.createdAt),
    `Status ${statusLabel(data.status)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="w-full">
      {showAmount ? (
        <p className="flex items-baseline justify-center gap-1.5 whitespace-nowrap tracking-tight">
          <span className="text-sm font-medium text-muted-foreground">PKR</span>
          <span className="text-[30px] font-semibold leading-tight tabular-nums">
            {formatAmount(data.amount)}
          </span>
        </p>
      ) : null}

      <dl className="mt-5 space-y-2 rounded-(--radius) border border-border bg-muted px-3 py-2.5 text-left text-sm">
        <Row label="Reference" mono>
          {data.reference ?? "—"}
        </Row>
        <Row label="Date">{formatDateTime(data.createdAt)}</Row>
        <Row label="From" mono>
          {accountLabel(data.from, shortId("unknown", 12))}
          {data.from?.name ? (
            <span className="block font-sans text-xs text-muted-foreground">
              {data.from.name}
            </span>
          ) : null}
        </Row>
        <Row label="To" mono>
          {accountLabel(data.to, shortId("unknown", 12))}
          {data.to?.name ? (
            <span className="block font-sans text-xs text-muted-foreground">
              {data.to.name}
            </span>
          ) : null}
        </Row>
        <Row label="Fee">
          {data.fee ? `PKR ${formatAmount(data.fee)}` : "None"}
        </Row>
        <Row label="Status">
          <Badge tone={statusTone(data.status)}>
            {statusLabel(data.status)}
          </Badge>
        </Row>
      </dl>

      {help ? (
        <p className="mt-3 text-xs text-muted-foreground">{help}</p>
      ) : null}

      {data.note ? (
        <p className="mt-3 rounded-(--radius) border border-border px-3 py-2 text-left text-sm">
          <span className="text-muted-foreground">Note: </span>
          {data.note}
        </p>
      ) : null}

      <div className="mt-3 flex justify-center">
        <ShareButton text={shareText} />
      </div>
    </div>
  );
}

/**
 * - Receipt from a transaction header
 * Adapts the API's shape to {@link ReceiptData}. Names are not on the header,
 * so the transfer result passes the recipient name it already looked up.
 *
 * @param transaction - the header returned by the transfer call
 * @param recipientName - the masked name from the name check, when known
 * @param fromLabel - the sending account's short number
 */
export function receiptFromTransaction(
  transaction: Transaction,
  recipientName?: string | null,
  fromLabel?: string | null,
): ReceiptData {
  return {
    reference: transaction.reference ?? null,
    createdAt: transaction.createdAt,
    amount: -Math.abs(transaction.amount),
    status: transaction.status,
    note: transaction.note ?? null,
    fee: transaction.fee ?? 0,
    from: { accountNumber: fromLabel ?? null, name: "You" },
    to: { accountNumber: null, name: recipientName ?? null },
  };
}


