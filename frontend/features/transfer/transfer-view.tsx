"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ClipboardPaste, PenLine, Star, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  ApiError,
  confirmTransfer,
  createTransfer,
  getAccountLimit,
  getAccounts,
  getBalance,
  getRecentRecipients,
  getRecipients,
  lookupRecipient,
  saveRecipient,
} from "@/lib/api";
import {
  accountNumberDigits,
  formatAccountNumber,
  formatAmount,
  formatMoney,
  isAccountNumber,
  shortId,
} from "@/lib/format";
import type {
  Account,
  AccountLimit,
  RecentRecipient,
  RecipientLookup,
  SavedRecipient,
  Transaction,
} from "@/lib/types";
import { BackToDashboard } from "@/components/transaction-result";
import { Receipt, receiptFromTransaction } from "@/components/receipt";
import { Alert } from "@/components/ui/alert";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, Spinner } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { statusLabel } from "@/lib/status-help";
import { cn } from "@/lib/cn";

/** What the card is showing right now. */
type Phase =
  | { kind: "form" }
  | { kind: "review" }
  | { kind: "sending" }
  | {
      kind: "sent";
      title: string;
      transaction: Transaction;
      recipient: string;
      fromLabel: string;
    }
  | {
      kind: "processing";
      amount: number;
      toAccount: string;
      transactionId?: string;
      /** true when this is the step-up hold asking for a code */
      needsCode?: boolean;
      holdExpiresAt?: string | null;
    };

type Balances = Record<string, number | "error">;

type FormErrors = { to?: string; amount?: string };

/** Which recipient lookup is in flight, so only its answer is rendered. */
type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; data: RecipientLookup; forDigits: string }
  | { status: "missing"; forDigits: string }
  | { status: "error"; message: string; forDigits: string };

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
 * - A payee chip
 * Saved recipients and recent ones render the same way, so the two groups
 * read as one list of "people you have paid".
 */
function RecipientChip({
  accountNumber,
  label,
  onPick,
  disabled,
}: {
  accountNumber: string;
  label: string;
  onPick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm hover:border-primary/40 hover:bg-accent/40 disabled:opacity-50"
    >
      <span className="font-medium">{label}</span>
      <span className="font-mono text-xs text-muted-foreground">
        {formatAccountNumber(accountNumber)}
      </span>
    </button>
  );
}

/**
 * - Transfer form
 * Reads `?from=<accountId>` to preselect the source account, and
 * `?to=<accountNumber>` to pre-fill the recipient (the shareable request
 * link).
 *
 * The flow is deliberate: fill the form, check the review screen, confirm
 * once. A transfer cannot be undone, so the last screen before the money
 * moves says exactly what will happen.
 */
function TransferForm() {
  const searchParams = useSearchParams();
  const preselected = searchParams.get("from") ?? "";
  const prefillTo = searchParams.get("to") ?? "";
  const { handleUnauthorized } = useAuth();

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balances>({});

  // what the user picked; null means "not chosen yet, use the default"
  const [chosenAccount, setChosenAccount] = useState<string | null>(null);
  const [toAccount, setToAccount] = useState(prefillTo);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  // the name check for whatever is in the recipient field
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  // the name that was checked, so the review screen shows what was verified
  const [verified, setVerified] = useState<RecipientLookup | null>(null);

  // saved and recent payees
  const [saved, setSaved] = useState<SavedRecipient[]>([]);
  const [recent, setRecent] = useState<RecentRecipient[]>([]);
  const [limits, setLimits] = useState<AccountLimit | null>(null);

  // step-up code entry
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  // payees: saved first, then the people actually paid recently
  useEffect(() => {
    void (async () => {
      try {
        const [savedList, recentList] = await Promise.all([
          getRecipients(),
          getRecentRecipients(),
        ]);
        if (!mounted.current) return;
        setSaved(savedList);
        setRecent(recentList);
      } catch {
        // a failure here only hides the shortcuts, never blocks a transfer
      }
    })();
  }, []);

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

  // the remaining daily allowance for the chosen account
  useEffect(() => {
    if (!fromAccount) return;
    let active = true;
    void (async () => {
      try {
        const data = await getAccountLimit(fromAccount);
        if (active) setLimits(data);
      } catch {
        // the form still works: the server enforces the same limits
      }
    })();
    return () => {
      active = false;
    };
  }, [fromAccount]);

  const numericAmount = Number(amount);
  const amountValid =
    amount.trim() !== "" &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    /^\d+(\.\d{1,2})?$/.test(amount);

  const balanceAfter =
    availableBalance !== null && amountValid
      ? Math.round((availableBalance - numericAmount) * 100) / 100
      : null;

  const recipientDigits = accountNumberDigits(toAccount);
  const recipientReady = isAccountNumber(toAccount);

  /**
   * - Check the recipient's name
   * Debounced so typing does not fire a request per keystroke, and keyed by
   * the digits so spaces and dashes do not trigger a second check.
   */
  useEffect(() => {
    if (phase.kind !== "form" || !recipientReady) return;

    let active = true;

    // one request per pause in typing; the timer is the only trigger
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await lookupRecipient(recipientDigits);
          if (!active) return;
          setLookup({ status: "found", data, forDigits: recipientDigits });
        } catch (error) {
          if (!active) return;
          if (error instanceof ApiError && error.status === 401) {
            handleUnauthorized();
            return;
          }
          if (error instanceof ApiError && error.status === 404) {
            setLookup({ status: "missing", forDigits: recipientDigits });
            return;
          }
          setLookup({
            status: "error",
            message:
              error instanceof ApiError
                ? error.message
                : "Could not check this account",
            forDigits: recipientDigits,
          });
        }
      })();
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [recipientDigits, recipientReady, phase.kind, handleUnauthorized]);

  /**
   * While a check is running, show it running.
   * Derived during render rather than set from the effect, so the effect only
   * ever writes state from the request's own callbacks.
   */
  const effectiveLookup: LookupState =
    phase.kind !== "form" || !recipientReady
      ? { status: "idle" }
      : lookup.status === "idle" ||
          ("forDigits" in lookup && lookup.forDigits !== recipientDigits)
        ? { status: "loading" }
        : lookup;

  /**
   * Checks that can be done before talking to the server.
   * The name check has to be complete for the current number: reviewing while
   * an answer is still on its way would let a typo through unverified.
   */
  function validate(): boolean {
    const next: FormErrors = {};

    if (!recipientReady) {
      next.to = "Enter the recipient's 8-digit account number";
    } else if (effectiveLookup.status === "loading") {
      next.to = "Still checking this account number. One moment";
    } else if (effectiveLookup.status === "missing") {
      next.to = "No account has that number. Check it and try again";
    } else if (effectiveLookup.status === "error") {
      next.to = "That account could not be checked. Please try again";
    } else if (effectiveLookup.status === "found" && effectiveLookup.data.isSelf) {
      next.to = "This is your own account";
    } else if (
      effectiveLookup.status === "found" &&
      !effectiveLookup.data.canReceive
    ) {
      next.to = `That account is ${statusLabel(
        effectiveLookup.data.status,
      ).toLowerCase()} and cannot receive money`;
    }

    if (!amountValid) {
      next.amount = "Enter an amount greater than zero";
    } else if (availableBalance !== null && numericAmount > availableBalance) {
      next.amount = `This is more than your balance of ${formatMoney(availableBalance)}`;
    } else if (limits && numericAmount > limits.perTransfer) {
      next.amount = `A single transfer cannot exceed ${formatMoney(limits.perTransfer)}`;
    } else if (limits && numericAmount > limits.remainingToday) {
      next.amount = `This passes your daily limit. You can send ${formatMoney(limits.remainingToday)} more today`;
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  /** Rotate the idempotency key whenever the intent changes. */
  function rotateKey() {
    idempotencyKey.current = crypto.randomUUID();
  }

  /** Step two: show exactly what will happen. */
  function onReview(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setVerified(
      effectiveLookup.status === "found" ? effectiveLookup.data : null,
    );
    setPhase({ kind: "review" });
  }

  /** POST the transfer, reusing the current key. */
  async function send(to: string, value: number) {
    lastRequest.current = { to, amount: value };
    setServerError(null);
    setCodeError(null);
    setPhase({ kind: "sending" });

    try {
      const { status, data: response } = await createTransfer({
        fromAccount,
        toAccount: to,
        amount: value,
        idempotencyKey: idempotencyKey.current,
      });
      if (!mounted.current) return;

      // 202 is a successful response, so it never reaches the catch block:
      // either the server is still committing, or the transfer is held for
      // a code from email.
      if (status === 202) {
        setPhase({
          kind: "processing",
          amount: value,
          toAccount: to,
          transactionId: response.transaction?._id,
          needsCode: response.requiresCode === true,
          holdExpiresAt: response.holdExpiresAt ?? null,
        });
        return;
      }

      // 200 means this key had already been committed - a success, just not a
      // fresh one. 201 is the normal first-time commit.
      const replayed =
        status === 200 ||
        /already (processed|completed)/i.test(response.message);

      setPhase({
        kind: "sent",
        title: replayed ? "Already processed" : "Transfer complete",
        // without a body (a replay) the receipt is built from what we know
        transaction: response.transaction ?? {
          _id: "",
          fromAccount,
          toAccount: to,
          amount: value,
          status: "COMPLETED",
          idempotencyKey: idempotencyKey.current,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        recipient: verified?.name ?? "Recipient",
        fromLabel: selectedAccount?.accountNumber ?? "",
      });
      if (replayed) {
        toast.info("This transfer had already been made.");
      }
      // the balance changed - refresh quietly for the next transfer
      void loadAccounts();
    } catch (error) {
      if (!mounted.current) return;

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
      if (error instanceof ApiError && error.status === 409) {
        // the key belongs to a failed or reversed transfer, so retrying it
        // would replay that failure: the next attempt needs a new key.
        // A 408 timeout is different - it may have committed on the server,
        // so the retry must reuse the same key.
        rotateKey();
      }
      setPhase({ kind: "form" });
    }
  }

  /** Confirm the review screen: this is the only place money starts moving. */
  function onConfirm() {
    void send(recipientDigits, numericAmount);
  }

  function onCheckAgain() {
    const request = lastRequest.current;
    if (!request) return;
    void send(request.to, request.amount);
  }

  /** Submit the emailed code for a held transfer. */
  async function onConfirmCode(event: React.FormEvent) {
    event.preventDefault();
    if (phase.kind !== "processing" || !phase.transactionId) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setCodeError("Enter the 6-digit code from your email");
      return;
    }

    setConfirming(true);
    setCodeError(null);
    try {
      const response = await confirmTransfer(phase.transactionId, code.trim());
      if (!mounted.current) return;

      setPhase({
        kind: "sent",
        title: "Transfer complete",
        transaction: response.transaction ?? {
          _id: phase.transactionId,
          fromAccount,
          toAccount: phase.toAccount,
          amount: phase.amount,
          status: "COMPLETED",
          idempotencyKey: idempotencyKey.current,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        recipient: verified?.name ?? "Recipient",
        fromLabel: selectedAccount?.accountNumber ?? "",
      });
      void loadAccounts();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      setCodeError(
        error instanceof ApiError
          ? error.message
          : "Could not confirm the transfer",
      );
    } finally {
      if (mounted.current) setConfirming(false);
    }
  }

  /** Save the recipient the transfer just went to. */
  async function onSaveRecipient() {
    if (!verified) return;
    try {
      await saveRecipient({
        accountNumber: recipientDigits,
        nickname: verified.name,
      });
      const list = await getRecipients();
      if (mounted.current) setSaved(list);
      toast.success("Recipient saved");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not save the recipient",
      );
    }
  }

  function onSendAnother() {
    setPhase({ kind: "form" });
    setToAccount("");
    setAmount("");
    setNote("");
    setFieldErrors({});
    setServerError(null);
    setChosenAccount(null);
    setVerified(null);
    setLookup({ status: "idle" });
    setCode("");
    setCodeError(null);
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
        setServerError(
          "Clipboard access was blocked. Paste the number manually.",
        ),
      );
  }

  /** Pick a payee chip and go straight to the amount. */
  function pickRecipient(accountNumber: string) {
    setToAccount(accountNumber);
    setFieldErrors((current) => ({ ...current, to: undefined }));
    rotateKey();
  }

  // payees that are not the sending account. A plain derivation, so it stays
  // cheap and correct on every render, including the early returns below.
  const senderDigits = accountNumberDigits(selectedAccount?.accountNumber ?? "");
  const payeeChips: { accountNumber: string; label: string }[] = [];
  {
    const seen = new Set<string>();

    for (const recipient of saved) {
      const digits = accountNumberDigits(recipient.accountNumber);
      if (digits === senderDigits) continue;
      seen.add(digits);
      payeeChips.push({ accountNumber: digits, label: recipient.nickname });
    }

    for (const recipient of recent) {
      const digits = accountNumberDigits(recipient.accountNumber);
      if (seen.has(digits) || digits === senderDigits) continue;
      seen.add(digits);
      payeeChips.push({ accountNumber: digits, label: recipient.name });
    }

    payeeChips.splice(6);
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
        <div className="animate-fade-in text-center">
          <h2 role="status" className="text-base font-semibold sm:text-lg">
            {phase.title}
          </h2>
          <div className="mt-3">
            <Receipt
              data={receiptFromTransaction(
                phase.transaction,
                phase.recipient,
                phase.fromLabel || null,
              )}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <BackToDashboard />
          <Button
            variant="outline"
            className="flex-1 justify-center"
            onClick={onSendAnother}
          >
            Send another
          </Button>
        </div>

        {verified ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => void onSaveRecipient()}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline sm:min-h-9"
            >
              <Star className="size-4" aria-hidden />
              Save {verified.name} for next time
            </button>
          </div>
        ) : null}
      </Card>
    );
  }

  // a held transfer: ask for the code from the email
  if (phase.kind === "processing" && phase.needsCode) {
    return (
      <Card className="border p-6 text-card-foreground">
        <div className="text-center">
          <h2 className="text-base font-semibold sm:text-lg">
            Confirm this large transfer
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A 6-digit code was sent to your email. It confirms sending{" "}
            <span className="font-medium text-foreground tabular-nums">
              PKR {formatAmount(phase.amount)}
            </span>
            .
          </p>
        </div>

        <form onSubmit={onConfirmCode} className="mt-5 space-y-3" noValidate>
          <div>
            <Label htmlFor="code">Confirmation code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              maxLength={6}
              invalid={Boolean(codeError)}
              disabled={confirming}
              placeholder="123456"
              aria-describedby={codeError ? "code-error" : undefined}
              className="h-12 text-center font-mono text-xl tracking-[0.4em]"
              onChange={(event) => {
                const next = event.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(next);
                setCodeError(null);
              }}
            />
            <FieldError id="code-error">{codeError}</FieldError>
          </div>

          <Button type="submit" fullWidth disabled={confirming}>
            {confirming ? (
              <>
                <Spinner /> Confirming…
              </>
            ) : (
              "Confirm transfer"
            )}
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Nothing has moved yet. If the code expires, no money is sent.
          </span>
          <button
            type="button"
            onClick={onCheckAgain}
            className="font-medium text-primary hover:underline"
          >
            Resend code
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          <BackToDashboard variant="outline" />
        </div>
      </Card>
    );
  }

  if (phase.kind === "processing") {
    return (
      <Card className="border p-6 text-card-foreground">
        <div className="text-center">
          <h2 className="text-base font-semibold sm:text-lg">
            Your transfer is still being processed
          </h2>
          <p className="mt-2 flex items-baseline justify-center gap-1.5 whitespace-nowrap tracking-tight">
            <span className="text-sm font-medium text-muted-foreground">
              PKR
            </span>
            <span className="text-[30px] font-semibold leading-tight tabular-nums">
              {formatAmount(phase.amount)}
            </span>
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Checking again reuses the same request, so this cannot send the
            money twice.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {/* one primary on the card: asking the server is the next step,
              going back is the secondary escape */}
          <Button className="flex-1 justify-center" onClick={onCheckAgain}>
            Check again
          </Button>
          <BackToDashboard variant="outline" />
        </div>
      </Card>
    );
  }

  if (phase.kind === "review") {
    const recipientName = verified?.name ?? "This account";
    const senderLabel = selectedAccount?.accountNumber
      ? formatAccountNumber(selectedAccount.accountNumber)
      : shortId(fromAccount, 8);

    return (
      <Card className="border p-5 text-card-foreground sm:p-6 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
        <button
          type="button"
          onClick={() => setPhase({ kind: "form" })}
          className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Edit
        </button>

        <h2 className="text-base font-semibold sm:text-lg">
          Check the details
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A transfer cannot be undone once it is sent.
        </p>

        <dl className="mt-4 space-y-2 rounded-(--radius) border border-border bg-muted px-3 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">To</dt>
            <dd className="text-right">
              <span className="block font-medium">{recipientName}</span>
              <span className="block font-mono text-xs text-muted-foreground">
                {formatAccountNumber(recipientDigits)}
              </span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">From</dt>
            <dd className="font-mono text-xs">{senderLabel}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="font-semibold tabular-nums">
              {formatMoney(numericAmount)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Fee</dt>
            <dd>None</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
            <dt className="text-muted-foreground">Balance after</dt>
            <dd className="font-medium tabular-nums">
              {balanceAfter === null ? "—" : formatMoney(balanceAfter)}
            </dd>
          </div>
          {note.trim() ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Note</dt>
              <dd className="text-right">{note.trim()}</dd>
            </div>
          ) : null}
        </dl>

        {limits && numericAmount > limits.stepUpThreshold ? (
          <Alert tone="info" className="mt-3">
            This is above {formatMoney(limits.stepUpThreshold)}, so we will
            email you a 6-digit code to confirm it.
          </Alert>
        ) : null}

        {serverError ? (
          <Alert tone="danger" className="mt-3">
            {serverError}
          </Alert>
        ) : null}

        <div className="mt-5">
          <Button fullWidth onClick={onConfirm}>
            Send {formatMoney(numericAmount)}
          </Button>
        </div>
      </Card>
    );
  }

  const sending = phase.kind === "sending";
  const noAccounts = accounts !== null && accounts.length === 0;

  return (
    <Card className="relative overflow-hidden border p-5 text-card-foreground sm:p-6 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
      {sending ? <IndeterminateBar /> : null}

      <form onSubmit={onReview} className="space-y-5" noValidate>
        <div aria-live="polite" className="empty:hidden">
          {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
        </div>

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
                label: `${account.label ?? "Account"}${
                  account.accountNumber
                    ? ` · ${formatAccountNumber(account.accountNumber)}`
                    : ""
                } · ${balanceLabel}`,
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

        {payeeChips.length > 0 ? (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="size-3.5" aria-hidden />
              People you have paid
            </p>
            <div className="flex flex-wrap gap-2">
              {payeeChips.map((chip) => (
                <RecipientChip
                  key={chip.accountNumber}
                  accountNumber={chip.accountNumber}
                  label={chip.label}
                  onPick={() => pickRecipient(chip.accountNumber)}
                  disabled={sending}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <Label htmlFor="to">To account number</Label>
          <div className="relative">
            <Input
              id="to"
              value={toAccount}
              invalid={Boolean(fieldErrors.to)}
              disabled={sending || noAccounts}
              placeholder="4821 7360"
              inputMode="numeric"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="recipient-feedback"
              className="pr-11 font-mono tracking-wide"
              onChange={(event) => {
                setToAccount(event.target.value);
                setFieldErrors((current) => ({ ...current, to: undefined }));
                rotateKey();
              }}
            />
            <button
              type="button"
              aria-label="Paste recipient account number"
              disabled={sending}
              onClick={onPaste}
              className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <ClipboardPaste className="size-4" aria-hidden />
            </button>
          </div>

          {/* the name check: this is what catches a typo before money moves */}
          <div id="recipient-feedback" aria-live="polite" className="mt-1.5">
            {effectiveLookup.status === "loading" ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Spinner className="size-3" /> Checking the account…
              </p>
            ) : effectiveLookup.status === "found" ? (
              effectiveLookup.data.isSelf ? (
                <p className="text-xs text-destructive">
                  This is your own account.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">
                    {effectiveLookup.data.name}
                  </span>
                  <Badge tone={statusTone(effectiveLookup.data.status)}>
                    {statusLabel(effectiveLookup.data.status)}
                  </Badge>
                  {!effectiveLookup.data.canReceive ? (
                    <span className="text-destructive">
                      This account cannot receive money.
                    </span>
                  ) : null}
                </div>
              )
            ) : effectiveLookup.status === "missing" ? (
              <p className="text-xs text-destructive">
                No account has that number.
              </p>
            ) : effectiveLookup.status === "error" ? (
              <p className="text-xs text-destructive">
                {effectiveLookup.message}
              </p>
            ) : null}
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
            aria-describedby="amount-feedback"
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

          {/* balance after, live, so the most common mistake is caught here */}
          <div id="amount-feedback" aria-live="polite" className="mt-1.5">
            {balanceAfter !== null ? (
              <p
                className={cn(
                  "text-xs",
                  balanceAfter < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                Balance after:{" "}
                <span className="font-medium tabular-nums">
                  {formatMoney(balanceAfter)}
                </span>
              </p>
            ) : null}
            {limits ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Up to {formatMoney(limits.perTransfer)} per transfer ·{" "}
                {formatMoney(limits.remainingToday)} left today
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <Label htmlFor="note" className="mb-0">
              Note (optional)
            </Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {note.length}/140
            </span>
          </div>
          <div className="relative">
            <Input
              id="note"
              value={note}
              maxLength={140}
              disabled={sending || noAccounts}
              placeholder="Rent, March"
              className="pr-9"
              onChange={(event) => setNote(event.target.value)}
            />
            <PenLine
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
          </div>
        </div>

        {/* sticky above the mobile bottom nav while the form is in view */}
        <div className="max-sm:sticky max-sm:bottom-[calc(var(--bottom-nav)+0.75rem)] max-sm:z-10">
          <Button
            type="submit"
            fullWidth
            disabled={sending || noAccounts || !selectedAccount}
          >
            Review transfer
          </Button>
        </div>

        {sending ? (
          <div className="space-y-1 text-center text-xs text-muted-foreground">
            <p>This usually takes a few seconds. Please keep this page open.</p>
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
