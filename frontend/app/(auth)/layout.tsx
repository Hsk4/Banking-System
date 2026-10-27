import Link from "next/link";

/**
 * - Auth group layout
 * One centered card for login and register (max 400px, 24px padding) with the
 * wordmark inside it at the top, per the spec. On mobile the card loses its
 * border and background and fills the width, while the page keeps its
 * vertical centering.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-100 rounded-xl border border-border bg-card p-6 max-sm:border-0 max-sm:bg-transparent max-sm:p-4">
        <Link
          href="/login"
          className="block text-center text-xl font-semibold tracking-tight text-foreground"
        >
          Ledger
        </Link>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
