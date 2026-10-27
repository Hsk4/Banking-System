import type { Metadata } from "next";
import { HistoryView } from "@/features/history/history-view";

export const metadata: Metadata = {
  title: "History · Banking",
};

/**
 * - History page (`/history?account=<accountId>`)
 * The ledger for one account: every entry, its status, and the balance after
 * it, with filters and a CSV export.
 *
 * The account travels in the query string rather than the path because the
 * app is a static export: a folder per account id (`/history/<id>`) would
 * need one pre-rendered page per customer, and those ids do not exist at
 * build time. Without `?account=`, the view lists the accounts to choose
 * from.
 */
export default function HistoryPage() {
  return <HistoryView />;
}
