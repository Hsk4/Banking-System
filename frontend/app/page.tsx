import { redirect } from "next/navigation";

/**
 * - Root route
 * There is no marketing page; the app starts at the dashboard (the proxy
 * forwards signed-out visitors to /login).
 */
export default function RootPage() {
  redirect("/dashboard");
}
