"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/card";

/**
 * - Administrator-only pages
 * The API answers 403 to a customer on every `/api/admin` route, so this is a
 * convenience redirect rather than a security boundary: it keeps a customer
 * from landing on a screen that would only fill with errors. Like the sign-in
 * guard, it waits for the stored user to be read before deciding.
 *
 * @param children - the admin pages
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  const allowed = user?.systemUser === true;

  useEffect(() => {
    // `user` is null both before hydration and when signed out; the sign-in
    // guard in the layout already handles the signed-out case, so only a
    // known non-administrator is sent home from here
    if (user && !user.systemUser) router.replace("/dashboard");
  }, [user, router]);

  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-240">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-4 h-9 w-full max-w-md" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
