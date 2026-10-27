import type { Metadata } from "next";
import { AdminTransactionsView } from "@/features/admin/admin-transactions";
import { AdminTabs } from "@/features/admin/admin-tabs";

export const metadata: Metadata = {
  title: "Transactions · Admin · Banking",
};

/**
 * - Admin transactions page (`/admin/transactions`)
 * Search by id, reference or account number, with the ledger entries behind
 * each row.
 */
export default function AdminTransactionsPage() {
  return (
    <div className="mx-auto w-full max-w-240">
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
      <AdminTabs />
      <div className="mt-5">
        <AdminTransactionsView />
      </div>
    </div>
  );
}
