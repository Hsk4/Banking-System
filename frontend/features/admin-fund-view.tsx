"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ApiError, createInitialFunds } from "@/lib/api";
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

/** The backend's longest transfer window, mirrored from the transfer page. */
const TRANSFER_TIMEOUT_NOTE =
  "This can take up to 15 seconds. Please keep this page open.";

/**
 * - Admin fund view (`/admin/fund`)
 * System users only. The proxy cannot verify the JWT, so the real gate is the
 * 401 from the API, which renders a full-card message.
 */
export function AdminFundView() {
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

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
    if (!validate()) return;

    const numeric = Number(amount);
    setPending(true);
    try {
      const response = await createInitialFunds({
        toAccount: toAccount.trim(),
        amount: numeric,
        idempotencyKey: idempotencyKey.current,
      });
      // a 200 replay means these funds were already added with this key
      const replayed = /already (processed|completed)/i.test(response.message);
      setResult({
        amount: numeric,
        toAccount: toAccount.trim(),
        status: response.transaction?.status ?? "COMPLETED",
      });
      if (replayed) {
        toast.info("These funds had already been added.");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // the system-user middleware answers 401 for a normal session too,
        // so this is either an expired session or a non-system user
        setForbidden(true);
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
            System users only. Funds are created from the system account.
          </Alert>

          <form onSubmit={onSubmit} className="mt-5 space-y-5" noValidate>
            {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

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
