import type { Metadata } from "next";
import { AdminAuditView } from "@/features/admin/admin-audit";
import { AdminTabs } from "@/features/admin/admin-tabs";

export const metadata: Metadata = {
  title: "Audit log · Admin · Banking",
};

/**
 * - Admin audit page (`/admin/audit`)
 * The append-only record of administrator actions.
 */
export default function AdminAuditPage() {
  return (
    <div className="mx-auto w-full max-w-240">
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <AdminTabs />
      <div className="mt-5">
        <AdminAuditView />
      </div>
    </div>
  );
}
