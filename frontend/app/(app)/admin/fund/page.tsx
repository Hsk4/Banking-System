import type { Metadata } from "next";
import { AdminFundView } from "@/features/admin-fund-view";

export const metadata: Metadata = {
  title: "Fund an account · Banking",
};

/**
 * - Admin page (`/admin/fund`)
 * Not in the main navigation; reachable from the avatar menu.
 */
export default function AdminFundPage() {
  return <AdminFundView />;
}
