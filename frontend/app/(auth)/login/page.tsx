import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in · Banking",
};

/**
 * - Login page (`/login`)
 * Lives in `(auth)/login` so the route group does not appear in the URL.
 */
export default function LoginPage() {
  return <LoginForm />;
}
