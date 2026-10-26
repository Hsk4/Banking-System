import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/register-form";

export const metadata: Metadata = {
  title: "Create account · Banking",
};

/**
 * - Register page (`/register`)
 * Lives in `(auth)/register` so the route group does not appear in the URL.
 */
export default function RegisterPage() {
  return <RegisterForm />;
}
