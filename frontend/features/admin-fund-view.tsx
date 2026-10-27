"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ApiError, createInitialFunds } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isObjectId } from "@/lib/format";
import {
  BackToDashboard,
  TransactionResult,
} from "@/components/transaction-result";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, Spinner } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";

type Result = { amount: number; toAccount: string; status: string };
type Errors = { to?: string; amount?: string };

/** Shown while the commit is in flight, mirroring the transfer page. */
const TRANSFER_TIMEOUT_NOTE =
  "This usually takes a few seconds. Please keep this page open.";

/**
 * - Admin fund view (`/admin/fund`)
 * System users only. The proxy cannot verify the JWT, so the real gate is the
 * API: a non-system user gets a 403, which renders the full-card message.
 *
 * Reads `?to=<accountId>` so an admin can arrive here from an account row with
 * the recipient already filled in.
 */
export function AdminFundView() {
  const searchParams = useSearchParams();
  const { handleUnauthorized } = useAuth();

  const [toAccount, setToAccount] = useState(searchParams.get("to") ?? "");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /** the last request was accepted but is still being committed */
  const [stillProcessing, setStillProcessing] = useState(false);

  // stable across retries of the same intent; rotated when the input changes
  const idempotencyKey = useRef(crypto.randomUUID());

  function rotateKey() {
    idempotencyKey.current = crypto.randomUUID();
  }

  /** Validate the two fields; returns true when the request may be sent. */
  function validate(): boolean {
    const numeric = Number(amount);
    const next: Errors = {};
    if (!isObjectId(toAccount.trim())) {
      next.to = "Enter the 24-character account ID";
    }
    if (!Number.isFinite(numeric) || numeric <= 0) {
      next.amount = "Enter an amount greater than zero";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    setStillProcessing(false);
    if (!validate()) return;

    const numeric = Number(amount);
    setPending(true);
    try {
      const { status, data: response } = await createInitialFunds({
        toAccount: toAccount.trim(),
        amount: numeric,
        idempotencyKey: idempotencyKey.current,
      });

      // 202 is a success response: accepted, still committing. Keep the key so
      // a second submit safely asks "is it done?" instead of adding again.
      if (status === 202) {
        setStillProcessing(true);
        return;
      }

      // 200 is a replay of a key the server already committed
      const replayed =
        status === 200 ||
        /already (processed|completed)/i.test(response.message);
      // This panel says "Funds added", so it must not print a PENDING status:
      // an unfinished row belongs to the "still processing" branch above.
      const transactionStatus =
        response.transaction?.status && response.transaction.status !== "PENDING"
          ? response.transaction.status
          : "COMPLETED";
      setResult({
        amount: numeric,
        toAccount: toAccount.trim(),
        status: transactionStatus,
      });
      if (replayed) {
        toast.info("These funds had already been added.");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        // a valid session that is not a system user
        setForbidden(true);
      } else if (error instanceof ApiError && error.status === 401) {
        // a missing or expired session: back to /login, not the admin message
        handleUnauthorized();
        return;
      } else {
        const message =
          error instanceof Error ? error.message : "Could not add funds";
        setServerError(
          error instanceof ApiError && error.status === 500
            ? `${message} You can safely try again.`
            : message,
        );
        if (error instanceof ApiError && error.status === 409) rotateKey();
      }
    } finally {
      setPending(false);
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-120">
        <Card className="border p-8 text-center">
          <h1 className="text-base font-semibold">
            This page is for system users
          </h1>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            Your account does not have permission to create funds. Ask an
            administrator if you need access.
          </p>
          <div className="mt-5 flex justify-center">
            <Link href="/dashboard">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-120">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">
        Fund an account
      </h1>

      {result ? (
        <Card className="border p-6">
          <TransactionResult
            title="Funds added"
            tone="success"
            amount={result.amount}
            toAccount={result.toAccount}
            status={result.status}
            actions={
              <>
                <BackToDashboard />
                <Button
                  variant="outline"
                  className="flex-1 justify-center"
                  onClick={() => {
                    setResult(null);
                    setToAccount("");
                    setAmount("");
                    setErrors({});
                    rotateKey();
                  }}
                >
                  Fund another
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <Card className="relative overflow-hidden border p-5 sm:p-6 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
          <Alert tone="warning">
            System users only. Funds are created from the treasury account.
          </Alert>

          <form
            id="fund-form"
            onSubmit={onSubmit}
            className="mt-5 space-y-5"
            noValidate
          >
            {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

            {stillProcessing ? (
              <Alert tone="warning" title="Still processing">
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    The server accepted this funding and is finishing it.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const form = document.getElementById(
                        "fund-form",
                      ) as HTMLFormElement | null;
                      form?.requestSubmit();
                    }}
                    className="font-medium underline"
                  >
                    Check again
                  </button>
                </div>
              </Alert>
            ) : null}

            <div>
              <Label htmlFor="to">To account</Label>
              <Input
                id="to"
                value={toAccount}
                invalid={Boolean(errors.to)}
                disabled={pending}
                placeholder="24-character account ID"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono text-xs"
                maxLength={24}
                onChange={(event) => {
                  setToAccount(event.target.value);
                  setErrors((current) => ({ ...current, to: undefined }));
                  rotateKey();
                }}
              />
              <FieldError>{errors.to}</FieldError>
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
                invalid={Boolean(errors.amount)}
                disabled={pending}
                placeholder="0.00"
                autoComplete="off"
                className="h-14 text-2xl font-semibold tabular-nums"
                onChange={(event) => {
                  const next = event.target.value;
                  if (/^\d*(\.\d{0,2})?$/.test(next)) {
                    setAmount(next);
                    setErrors((current) => ({
                      ...current,
                      amount: undefined,
                    }));
                    rotateKey();
                  }
                }}
              />
              <FieldError>{errors.amount}</FieldError>
            </div>

            <Button type="submit" fullWidth disabled={pending}>
              {pending ? (
                <>
                  <Spinner /> Adding funds…
                </>
              ) : (
                "Add funds"
              )}
            </Button>

            {pending ? (
              <p className="text-center text-xs text-muted-foreground">
                {TRANSFER_TIMEOUT_NOTE}
              </p>
            ) : null}
          </form>
        </Card>
      )}
    </div>
  );
}
