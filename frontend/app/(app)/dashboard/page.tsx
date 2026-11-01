import type { Metadata } from "next";
import { DashboardView } from "@/features/accounts/dashboard-view";

export const metadata: Metadata = {
  title: "Your accounts",
};

/** Dashboard: greeting, balances, the overview cards and the account list. */
export default function DashboardPage() {
  return <DashboardView />;
}
