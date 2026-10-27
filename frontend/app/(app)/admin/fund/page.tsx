import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminFundView } from "@/features/admin-fund-view";
import { Card, Skeleton } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Fund an account · Banking",
};

/**
 * - Admin page (`/admin/fund`)
 * Reachable from the avatar menu, and the landing page for a system user.
 * Wrapped in Suspense because the view reads `?to=` through useSearchParams,
 * which is request-time data (same as the transfer page).
 */
export default function AdminFundPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-120">
          <Skeleton className="h-7 w-48" />
          <Card className="mt-5 border p-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="mt-5 h-14 w-full" />
            <Skeleton className="mt-5 h-10 w-full" />
          </Card>
        </div>
      }
    >
      <AdminFundView />
    </Suspense>
  );
}
