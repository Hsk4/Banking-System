import type { Metadata } from "next";
import { DashboardView } from "@/features/accounts/dashboard-view";

export const metadata: Metadata = {
  title: "Your accounts · Banking",
};

/**
 * - Dashboard page (`/dashboard`)
 * Balances, the account list and the open-account dialog.
 */
export default function DashboardPage() {
  return <DashboardView />;
}
