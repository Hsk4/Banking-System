"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/card";

/**
 * - Signed-in route guard
 * The edge gate in `proxy.ts` can no longer see a session, because the login
 * cookie belongs to the API's origin. This replaces it on the client: a
 * request for a signed-in page without a stored user is sent to `/login`.
 *
 * It is a convenience redirect, not a security boundary - the API answers 401
 * to anything that is not authenticated, and `handleUnauthorized` already
 * covers that path.
 *
 * @param children - the signed-in pages
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  // false until the stored user has been read after hydration
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // one frame later, so the provider has finished reading localStorage
    const id = requestAnimationFrame(() => setHydrated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  // render nothing until the answer is known, so a signed-out visitor never
  // sees a flash of account data
  if (!hydrated || !user) {
    return (
      <div className="mx-auto w-full max-w-240 px-4 py-6">
        <Skeleton className="h-7 w-40" />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
