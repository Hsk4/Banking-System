"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ApiError, createTransfer, getAccounts, getBalance } from "@/lib/api";
import { formatAmount, formatMoney, isObjectId, shortId } from "@/lib/format";
import type { Account } from "@/lib/types";
import {
  BackToDashboard,
  TransactionResult,
} from "@/components/transaction-result";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, Spinner } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/** What the card is showing right now. */
type Phase =
  | { kind: "idle" }
  | { kind: "sending" }
  | {
      kind: "sent";
      title: string;
      amount: number;
      toAccount: string;
      status: string;
    }
  | { kind: "processing"; amount: number; toAccount: string };

type Balances = Record<string, number | "error">;

type FormErrors = { to?: string; amount?: string };

/**
 * - Elapsed counter
 * Shows how long the transfer has been in flight, so a slow commit does not
 * look like a frozen page.
 */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  return <span className="tabular-nums">{seconds}s elapsed</span>;
}

/**
 * - Indeterminate bar
 * Thin progress strip at the top of the card while the request is in flight.
 */
function IndeterminateBar() {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-muted"
    >
      <div className="h-full w-1/3 animate-[transfer-slide_1.2s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}

/**
 * - Transfer form
 * Reads `?from=<accountId>` to preselect the source account.
 */
function TransferForm() {
  const searchParams = useSearchParams();
  const preselected = searchParams.get("from") ?? "";
  const { handleUnauthorized } = useAuth();

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balances>({});

  // what the user picked; null means "not chosen yet, use the default"
  const [chosenAccount, setChosenAccount] = useState<string | null>(null);
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // The key must stay stable across retries of the same intent, so it is
  // generated once and rotated only after a terminal failure or an edit.
  const idempotencyKey = useRef(crypto.randomUUID());
  const lastRequest = useRef<{ to: string; amount: number } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const list = await getAccounts();
      if (!mounted.current) return;
      setAccounts(list);
      setListError(null);
      const entries = await Promise.all(
        list.map(async (account) => {
          try {
            const { balance } = await getBalance(account._id);
            return [account._id, balance] as const;
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              handleUnauthorized();
            }
            return [account._id, "error"] as const;
          }
        }),
      );
      if (!mounted.current) return;
      setBalances(Object.fromEntries(entries));
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      setAccounts([]);
      setListError(
        error instanceof ApiError ? error.message : "Could not load accounts",
      );
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void (async () => {
      await loadAccounts();
    })();
  }, [loadAccounts]);

  // Only ACTIVE accounts can send money: a choice wins while it is still
  // valid, then the account named in `?from=`, then the first active one.
  const candidate = chosenAccount ?? (preselected || null);
  const picked = accounts?.find((account) => account._id === candidate);
  const fromAccount =
    picked && picked.status === "ACTIVE"
      ? picked._id
      : (accounts?.find((account) => account.status === "ACTIVE")?._id ?? "");

  const selectedAccount = accounts?.find(
    (account) => account._id === fromAccount,
  );

  const availableBalance =
    fromAccount && typeof balances[fromAccount] === "number"
      ? (balances[fromAccount] as number)
      : null;

  const numericAmount = Number(amount);
  const amountValid =
    amount.trim() !== "" &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    /^\d+(\.\d{1,2})?$/.test(amount);

  /** Checks that can be done before talking to the server. */
  function validate(): boolean {
    const next: FormErrors = {};

    if (!isObjectId(toAccount.trim())) {
      next.to = "Enter the recipient's 24-character account ID";
    } else if (toAccount.trim().toLowerCase() === fromAccount.toLowerCase()) {
      next.to = "Choose a different recipient account";
    }

    if (!amountValid) {
      next.amount = "Enter an amount greater than zero";
    } else if (availableBalance !== null && numericAmount > availableBalance) {
      next.amount = "This is more than the available balance";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  /** Rotate the idempotency key whenever the intent changes. */
  function rotateKey() {
    idempotencyKey.current = crypto.randomUUID();
  }

  /** POST the transfer, reusing the current key. */
  async function send(to: string, value: number) {
    lastRequest.current = { to, amount: value };
    setServerError(null);
    setFieldErrors({});
    setPhase({ kind: "sending" });

    try {
      const response = await createTransfer({
        fromAccount,
        toAccount: to,
        amount: value,
        idempotencyKey: idempotencyKey.current,
      });
      if (!mounted.current) return;
      // A replay of a key the server already committed comes back as a 200
      // "already processed" - it is a success, just not a fresh one.
      const replayed = /already (processed|completed)/i.test(response.message);
      setPhase({
        kind: "sent",
        title: replayed ? "Already processed" : "Transfer complete",
        amount: value,
        toAccount: to,
        status: response.transaction?.status ?? "COMPLETED",
      });
      if (replayed) {
        toast.info("This transfer had already been made.");
      }
      // the balance changed - refresh quietly for the next transfer
      void loadAccounts();
    } catch (error) {
      if (!mounted.current) return;

      if (error instanceof ApiError && error.status === 202) {
        setPhase({ kind: "processing", amount: value, toAccount: to });
        return;
      }

      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }

      // 400 / 403 / 409 / 500 keep the form filled and editable
      const message =
        error instanceof ApiError
          ? error.message
          : "The transfer failed. Please try again.";
      setServerError(
        error instanceof ApiError && error.status === 500
          ? `${message} You can safely try again.`
          : message,
      );
      if (
        error instanceof ApiError &&
        (error.status === 409 || error.status === 408)
      ) {
        // the server told us to retry with a new key
        rotateKey();
      }
      setPhase({ kind: "idle" });
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    void send(toAccount.trim(), numericAmount);
  }

  function onCheckAgain() {
    const request = lastRequest.current;
    if (!request) return;
    void send(request.to, request.amount);
  }

  function onSendAnother() {
    setPhase({ kind: "idle" });
    setToAccount("");
    setAmount("");
    setFieldErrors({});
    setServerError(null);
    setChosenAccount(null);
    rotateKey();
    setAccounts(null);
    void loadAccounts();
  }

  function onPaste() {
    navigator.clipboard
      .readText()
      .then((text) => {
        setToAccount(text.trim());
        setFieldErrors((current) => ({ ...current, to: undefined }));
        rotateKey();
      })
      .catch(() =>
        setServerError("Clipboard access was blocked. Paste the ID manually."),
      );
  }

  if (accounts === null && !listError) {
    return (
      <Card className="border p-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-10 w-full" />
        <Skeleton className="mt-5 h-3 w-24" />
        <Skeleton className="mt-2 h-10 w-full" />
        <Skeleton className="mt-5 h-3 w-16" />
        <Skeleton className="mt-2 h-12 w-full" />
        <Skeleton className="mt-6 h-10 w-full" />
      </Card>
    );
  }

  if (phase.kind === "sent") {
    return (
      <Card className="border p-6 text-card-foreground">
        <TransactionResult
          title={phase.title}
          tone="success"
          amount={phase.amount}
          toAccount={phase.toAccount}
          status={phase.status}
          actions={
            <>
              <BackToDashboard />
              <Button
                variant="outline"
                className="flex-1 justify-center"
                onClick={onSendAnother}
              >
                Send another
              </Button>
            </>
          }
        />
      </Card>
    );
  }

  if (phase.kind === "processing") {
    return (
      <Card className="border p-6 text-card-foreground">
        <TransactionResult
          title="Your transfer is still being processed"
          tone="warning"
          amount={phase.amount}
          toAccount={phase.toAccount}
          note="Checking again reuses the same request, so this cannot send the money twice."
          actions={
            <>
              <Button
                className="flex-1 justify-center"
                onClick={onCheckAgain}
              >
                Check again
              </Button>
              <BackToDashboard />
            </>
          }
        />
      </Card>
    );
  }

  const sending = phase.kind === "sending";
  const noAccounts = accounts !== null && accounts.length === 0;

  return (
    <Card className="relative overflow-hidden border p-5 text-card-foreground sm:p-6 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
      {sending ? <IndeterminateBar /> : null}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

        {listError ? (
          <Alert tone="danger">
            <div className="flex flex-wrap items-center gap-2">
              <span>{listError}</span>
              <button
                type="button"
                onClick={() => void loadAccounts()}
                className="font-medium underline"
              >
                Try again
              </button>
            </div>
          </Alert>
        ) : noAccounts ? (
          <Alert tone="warning">
            You need an account before you can send money.{" "}
            <Link href="/dashboard" className="font-medium underline">
              Open one
            </Link>
          </Alert>
        ) : null}

        <div>
          <Label htmlFor="from">From account</Label>
          <Select
            id="from"
            value={fromAccount}
            placeholder="Select an account"
            disabled={sending}
            onChange={(value) => {
              setChosenAccount(value);
              rotateKey();
            }}
            options={(accounts ?? []).map((account) => {
              const balance = balances[account._id];
              const balanceLabel =
                typeof balance === "number"
                  ? formatMoney(balance)
                  : "balance unavailable";
              return {
                value: account._id,
                label: `${shortId(account._id)} · ${account.status} · ${balanceLabel}`,
                disabled: account.status !== "ACTIVE",
              };
            })}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Available balance:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {availableBalance === null ? "—" : formatMoney(availableBalance)}
            </span>
          </p>
        </div>

        <div>
          <Label htmlFor="to">To account</Label>
          <div className="relative">
            <Input
              id="to"
              value={toAccount}
              invalid={Boolean(fieldErrors.to)}
              disabled={sending || noAccounts}
              placeholder="Recipient account ID"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="pr-11 font-mono text-xs"
              onChange={(event) => {
                setToAccount(event.target.value);
                setFieldErrors((current) => ({ ...current, to: undefined }));
                rotateKey();
              }}
              onBlur={() => {
                // only nag once something was typed, never on a first tab-in
                const value = toAccount.trim();
                if (!value) return;
                if (!isObjectId(value)) {
                  setFieldErrors((current) => ({
                    ...current,
                    to: "Enter the recipient's 24-character account ID",
                  }));
                } else if (value.toLowerCase() === fromAccount.toLowerCase()) {
                  setFieldErrors((current) => ({
                    ...current,
                    to: "Choose a different recipient account",
                  }));
                }
              }}
            />
            <button
              type="button"
              aria-label="Paste recipient account ID"
              disabled={sending}
              onClick={onPaste}
              className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <ClipboardPaste className="size-4" aria-hidden />
            </button>
          </div>
          <FieldError>{fieldErrors.to}</FieldError>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <Label htmlFor="amount" className="mb-0">
              Amount
            </Label>
            <span className="text-xs font-medium text-muted-foreground">
              PKR
            </span>
          </div>
          <Input
            id="amount"
            inputMode="decimal"
            value={amount}
            invalid={Boolean(fieldErrors.amount)}
            disabled={sending || noAccounts}
            placeholder="0.00"
            autoComplete="off"
            className="h-14 text-2xl font-semibold tabular-nums"
            onChange={(event) => {
              const next = event.target.value;
              // at most two decimals, digits only otherwise
              if (/^\d*(\.\d{0,2})?$/.test(next)) {
                setAmount(next);
                setFieldErrors((current) => ({
                  ...current,
                  amount: undefined,
                }));
                rotateKey();
              }
            }}
          />
          <FieldError>{fieldErrors.amount}</FieldError>
        </div>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          You will send{" "}
          <span className="font-medium text-foreground tabular-nums">
            PKR {formatAmount(amountValid ? numericAmount : 0)}
          </span>
        </p>

        {/* sticky above the mobile bottom nav while the form is in view */}
        <div className="max-sm:sticky max-sm:bottom-[calc(var(--bottom-nav)+0.75rem)] max-sm:z-10">
          <Button
            type="submit"
            fullWidth
            disabled={sending || noAccounts || !selectedAccount}
          >
            {sending ? (
              <>
                <Spinner /> Sending…
              </>
            ) : (
              "Send money"
            )}
          </Button>
        </div>

        {sending ? (
          <div className="space-y-1 text-center text-xs text-muted-foreground">
            <p>This can take up to 15 seconds. Please keep this page open.</p>
            <Elapsed />
          </div>
        ) : null}
      </form>
    </Card>
  );
}

/**
 * - Transfer view
 * Page title plus a single 560px card. Wrapped in Suspense because
 * `useSearchParams` is request-time data.
 */
export function TransferView() {
  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Send money</h1>
      <div className="mx-auto w-full max-w-140">
        <Suspense
          fallback={
            <Card className="border p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="mt-5 h-10 w-full" />
              <Skeleton className="mt-5 h-12 w-full" />
              <Skeleton className="mt-6 h-10 w-full" />
            </Card>
          }
        >
          <TransferForm />
        </Suspense>
      </div>
    </div>
  );
}
