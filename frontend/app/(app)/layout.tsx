import { AppShell } from "@/components/app-shell";

/**
 * - App group layout
 * Every signed-in page shares the shell (top bar + mobile bottom bar).
 * Route lives under `(app)` so the group name is not part of the URL.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
