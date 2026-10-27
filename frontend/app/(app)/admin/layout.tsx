import { AdminGuard } from "@/features/admin/admin-guard";

/**
 * - Admin layout
 * Every `/admin/*` page is wrapped in the administrator guard, so the shared
 * tabs and the section screens only render for a system user.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminGuard>{children}</AdminGuard>;
}
