import type { Metadata } from "next";
import { AdminAccountsView } from "@/features/admin/admin-accounts";
import { AdminTabs } from "@/features/admin/admin-tabs";

export const metadata: Metadata = {
  title: "Accounts · Admin · Banking",
};

/**
 * - Admin accounts page (`/admin/accounts`)
 * Every customer account, searchable, with freeze and unfreeze.
 */
export default function AdminAccountsPage() {
  return (
    <div className="mx-auto w-full max-w-240">
      <h1 className="text-2xl font-semibold tracking-tight">
        Users and accounts
      </h1>
      <AdminTabs />
      <div className="mt-5">
        <AdminAccountsView />
      </div>
    </div>
  );
}
