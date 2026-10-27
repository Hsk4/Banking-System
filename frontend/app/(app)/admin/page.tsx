import type { Metadata } from "next";
import { AdminOverviewView } from "@/features/admin/admin-overview";
import { AdminTabs } from "@/features/admin/admin-tabs";

export const metadata: Metadata = {
  title: "Admin · Banking",
};

/**
 * - Admin overview page (`/admin`)
 * The landing page for a system user: money minted, users, accounts and the
 * day's activity, above the section tabs.
 */
export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-240">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <AdminTabs />
      <div className="mt-5">
        <AdminOverviewView />
      </div>
    </div>
  );
}
