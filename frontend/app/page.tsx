import { redirect } from "next/navigation";

/**
 * - Root route
 * There is no marketing page: `/` sends the visitor to the dashboard, which
 * walks signed-out visitors on to /login.
 */
export default function RootPage() {
  redirect("/dashboard");
}
