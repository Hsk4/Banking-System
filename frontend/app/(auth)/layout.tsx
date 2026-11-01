import Link from "next/link";
import { Check } from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";

/** The promises the app really keeps, shown on the emerald panel. */
const PROMISES = [
  "A receipt for every transfer",
  "Large transfers held for an emailed code",
  "CSV statements whenever you need one",
];

/**
 * - Auth group layout
 * Two columns from `lg`: the emerald brand panel beside the form. On phones
 * only the mark sits above the form. Route lives under `(auth)` so the group
 * name is not part of the URL.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
      {/* brand panel: desktop only */}
      <aside className="bg-hero hidden flex-col justify-between p-10 text-[#f7f1e1] lg:flex">
        <Link href="/login" aria-label="Ledger">
          <Logo className="text-[#f7f1e1]" />
        </Link>

        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight text-[#f7f1e1]">
            Money, kept in plain sight.
          </h1>
          <ul className="mt-8 space-y-3">
            {PROMISES.map((promise) => (
              <li
                key={promise}
                className="flex items-center gap-3 text-sm text-[#f7f1e1]/85"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10">
                  <Check className="size-3.5" aria-hidden />
                </span>
                {promise}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-[#f7f1e1]/60">
          PKR accounts, held by Ledger.
        </p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 lg:px-10">
        <Link href="/login" className="mb-8 lg:hidden" aria-label="Ledger">
          <LogoMark size={44} />
        </Link>

        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
