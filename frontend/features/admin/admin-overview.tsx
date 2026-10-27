"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, getAdminOverview } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { AdminOverview } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";

/** One figure in the stats grid. */
function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const body = (
    <Card className="border p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </Card>
  );

  if (!href) return body;

  return (
    <Link
      href={href}
      className="block rounded-xl transition-colors hover:bg-accent/30"
    >
      {body}
    </Link>
  );
}

/**
 * - Admin overview
 * Money minted, how many people and accounts exist, and what happened today.
 * Every figure comes from the ledger or a count, never from a stored total.
 */
export function AdminOverviewView() {
  const { handleUnauthorized } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // one request per mount and per retry; every state change lands after the
  // await, so the effect body itself never sets state
  useEffect(() => {
    void (async () => {
      try {
        const overview = await getAdminOverview();
        if (!mounted.current) return;
        setData(overview);
        setError(null);
      } catch (caught) {
        if (!mounted.current) return;
        if (caught instanceof ApiError && caught.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not load the overview",
        );
      }
    })();
  }, [handleUnauthorized, reloadKey]);

  /** Ask for the figures again. */
  function load() {
    setReloadKey((value) => value + 1);
  }

  if (error) {
    return (
      <Alert tone="danger">
        <div className="flex flex-wrap items-center gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 font-medium underline"
          >
            <RefreshCw className="size-3" aria-hidden /> Try again
          </button>
        </div>
      </Alert>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="border p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Money minted"
          value={formatMoney(data.moneyMinted)}
          hint="Issued from the treasury"
        />
        <Stat
          label="Users"
          value={String(data.users)}
          hint={`${data.systemUsers} administrator${data.systemUsers === 1 ? "" : "s"}`}
          href="/admin/accounts"
        />
        <Stat
          label="Accounts"
          value={String(data.accounts)}
          hint={`${data.activeAccounts} active`}
          href="/admin/accounts"
        />
        <Stat
          label="Transfers today"
          value={String(data.transfersToday)}
          hint={`${data.fundingsToday} funding${data.fundingsToday === 1 ? "" : "s"}`}
          href="/admin/transactions"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Frozen"
          value={String(data.frozenAccounts)}
          href="/admin/accounts?status=FROZEN"
        />
        <Stat
          label="Closed"
          value={String(data.closedAccounts)}
          href="/admin/accounts?status=CLOSED"
        />
        <Stat
          label="Active"
          value={String(data.activeAccounts)}
          href="/admin/accounts?status=ACTIVE"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/admin/accounts" className="flex-1">
          <Button className="w-full justify-center">
            Manage accounts
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </Link>
        <Link href="/admin/audit" className="flex-1">
          <Button variant="outline" className="w-full justify-center">
            <ShieldCheck className="size-4" aria-hidden />
            Audit log
          </Button>
        </Link>
      </div>

      <Alert tone="info">
        The ledger is append-only. A mistake is corrected by writing a reversing
        entry that points at the original, never by editing history.
      </Alert>
    </div>
  );
}
