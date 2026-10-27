import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { HideBalancesProvider } from "@/lib/hide-balances";

/**
 * - App group layout
 * Every signed-in page shares the shell (top bar + mobile bottom bar), the
 * client-side session guard, which replaced the edge gate once the API moved
 * to its own origin, and the per-device "hide balances" preference.
 * Route lives under `(app)` so the group name is not part of the URL.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <HideBalancesProvider>
      <AppShell>
        <AuthGuard>{children}</AuthGuard>
      </AppShell>
    </HideBalancesProvider>
  );
}
