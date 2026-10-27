"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, Snowflake, Sun, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ApiError, getAdminAccounts, setAdminAccountStatus } from "@/lib/api";
import { formatAccountNumber, formatDate, formatMoney } from "@/lib/format";
import type { AdminAccount } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, Spinner } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { statusLabel } from "@/lib/status-help";

type StatusFilter = "" | "ACTIVE" | "FROZEN" | "CLOSED";

/**
 * - Admin accounts
 * Searchable list of every customer account, with the owner, the balance and
 * one action: freeze or unfreeze. A frozen account is refused by the transfer
 * controller, so the freeze is the real brake, not a label.
 *
 * Reads `?status=` and `?q=` so a link from the overview lands pre-filtered.
 */
function AccountsContent() {
  const searchParams = useSearchParams();
  const { handleUnauthorized } = useAuth();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState<StatusFilter>(
    (searchParams.get("status") as StatusFilter) || "",
  );
  const [page, setPage] = useState(1);
  const [debounced, setDebounced] = useState(query);

  const [rows, setRows] = useState<AdminAccount[] | null>(null);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // the account whose status is about to change
  const [target, setTarget] = useState<{
    account: AdminAccount;
    next: "ACTIVE" | "FROZEN" | "CLOSED";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // typing is debounced, so a search is one request, not one per keystroke
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query);
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  // `rows === null` is the loading state, so nothing is set synchronously
  const loading = rows === null;

  // one request per search, filter or page; every state change is after the
  // await, so the effect body itself never sets state
  useEffect(() => {
    void (async () => {
      try {
        const data = await getAdminAccounts({
          q: debounced || undefined,
          status: status || undefined,
          page,
        });
        if (!mounted.current) return;
        setRows(data.accounts);
        setPages(data.pages);
        setTotal(data.total);
        setError(null);
      } catch (caught) {
        if (!mounted.current) return;
        if (caught instanceof ApiError && caught.status === 401) {
          handleUnauthorized();
          return;
        }
        if (caught instanceof ApiError && caught.status === 403) {
          setError("This page is for administrators only.");
          setRows([]);
          return;
        }
        setError(
          caught instanceof ApiError ? caught.message : "Could not load accounts",
        );
        setRows([]);
      }
    })();
  }, [debounced, status, page, handleUnauthorized]);

  /** Apply the pending status change, then refresh the row. */
  async function applyStatus() {
    if (!target) return;
    setSaving(true);
    setDialogError(null);

    try {
      const { account } = await setAdminAccountStatus(
        target.account._id,
        target.next,
        reason.trim() || undefined,
      );
      if (!mounted.current) return;

      setRows((current) =>
        (current ?? []).map((row) =>
          row._id === account._id ? { ...row, status: account.status } : row,
        ),
      );
      toast.success(
        target.next === "FROZEN"
          ? "Account frozen"
          : target.next === "ACTIVE"
            ? "Account unfrozen"
            : "Account closed",
      );
      setTarget(null);
      setReason("");
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof ApiError && caught.status === 401) {
        handleUnauthorized();
        return;
      }
      setDialogError(
        caught instanceof ApiError
          ? caught.message
          : "Could not change the status",
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            placeholder="Search name, email, account number or id"
            aria-label="Search accounts"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="sm:w-44">
          <Select
            value={status}
            onChange={(value) => {
              setStatus(value as StatusFilter);
              setPage(1);
            }}
            options={[
              { value: "", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "FROZEN", label: "Frozen" },
              { value: "CLOSED", label: "Closed" },
            ]}
          />
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="border">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-auto h-4 w-24" />
              </div>
            ))}
          </div>
        ) : rows && rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No accounts match that search.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(rows ?? []).map((row) => {
              const frozen = row.status === "FROZEN";
              return (
                <li key={row._id} className="p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {row.owners[0]?.name ?? "Unknown owner"}
                        </span>
                        <Badge tone={statusTone(row.status)}>
                          {statusLabel(row.status)}
                        </Badge>
                        {row.label ? (
                          <span className="text-xs text-muted-foreground">
                            {row.label}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {row.owners[0]?.email ?? ""}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {row.accountNumber
                          ? formatAccountNumber(row.accountNumber)
                          : row._id}
                        {" · "}
                        Opened {formatDate(row.createdAt)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(row.balance)}
                      </p>
                      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                        <Link
                          href={`/admin/fund?to=${row.accountNumber ?? row._id}`}
                        >
                          <Button variant="outline" size="sm">
                            <Wallet className="size-3.5" aria-hidden />
                            Fund
                          </Button>
                        </Link>
                        {row.status !== "CLOSED" ? (
                          <Button
                            variant={frozen ? "primary" : "outline"}
                            size="sm"
                            onClick={() =>
                              setTarget({
                                account: row,
                                next: frozen ? "ACTIVE" : "FROZEN",
                              })
                            }
                          >
                            {frozen ? (
                              <>
                                <Sun className="size-3.5" aria-hidden />
                                Unfreeze
                              </>
                            ) : (
                              <>
                                <Snowflake className="size-3.5" aria-hidden />
                                Freeze
                              </>
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {total} account{total === 1 ? "" : "s"}
          {pages > 1 ? ` · page ${page} of ${pages}` : ""}
        </p>
        {pages > 1 ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || loading}
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            setReason("");
            setDialogError(null);
          }
        }}
        title={
          target?.next === "FROZEN"
            ? "Freeze this account?"
            : "Unfreeze this account?"
        }
        description={
          target?.next === "FROZEN"
            ? "A frozen account cannot send or receive money. The action is recorded in the audit log."
            : "The account will be able to send and receive money again. The action is recorded in the audit log."
        }
        footer={
          <>
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => setTarget(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              onClick={() => void applyStatus()}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : target?.next === "FROZEN" ? (
                "Freeze"
              ) : (
                "Unfreeze"
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {dialogError ? <Alert tone="danger">{dialogError}</Alert> : null}
          <div>
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input
              id="reason"
              value={reason}
              maxLength={200}
              placeholder="Reported lost card"
              disabled={saving}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldError visible={false} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/**
 * - Accounts view
 * Wrapped in Suspense because it reads the query string.
 */
export function AdminAccountsView() {
  return (
    <Suspense
      fallback={
        <Card className="border p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="mt-3 h-16 w-full" />
          <Skeleton className="mt-3 h-16 w-full" />
        </Card>
      }
    >
      <AccountsContent />
    </Suspense>
  );
}
