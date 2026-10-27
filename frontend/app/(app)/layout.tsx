import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";

/**
 * - App group layout
 * Every signed-in page shares the shell (top bar + mobile bottom bar) and the
 * client-side session guard, which replaced the edge gate once the API moved
 * to its own origin. Route lives under `(app)` so the group name is not part
 * of the URL.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AuthGuard>{children}</AuthGuard>
    </AppShell>
  );
}
