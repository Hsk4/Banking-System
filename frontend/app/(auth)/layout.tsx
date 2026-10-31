import Link from "next/link";
import { FileSpreadsheet, MailCheck, Receipt } from "lucide-react";
import { Logo } from "@/components/logo";

/** What the brand panel promises; each line is something the app really does. */
const PROMISES = [
  {
    icon: Receipt,
    title: "A receipt for every transfer",
    body: "Reference, time and balance after, ready to share.",
  },
  {
    icon: MailCheck,
    title: "Large transfers wait for you",
    body: "Anything big is held until you confirm an emailed code.",
  },
  {
    icon: FileSpreadsheet,
    title: "Statements on demand",
    body: "Filter by date and download the ledger as a CSV.",
  },
];

/**
 * - Auth group layout
 * Two columns from `lg`: an emerald brand panel on the left, the form on the
 * right. Below `lg` the panel collapses to the logo above the form, so the
 * phone layout stays a single, quiet column.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="bg-hero relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Logo tone="light" markClassName="size-9" />

        <div className="max-w-md">
          <h2 className="font-display text-[2.75rem] font-medium leading-[1.05] tracking-tight">
            Money, kept in plain sight.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#f7f1e1]/70">
            A quiet place to hold, send and track your PKR balances.
          </p>

          <ul className="mt-10 space-y-5">
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f7f1e1]/10 text-[#dca847] ring-1 ring-[#f7f1e1]/10">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-[#f7f1e1]/65">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-[#f7f1e1]/45">
          Amounts are in Pakistani rupees (PKR).
        </p>
      </aside>

      <div className="flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-100">
          {/* the panel carries the brand on desktop; phones get the mark here */}
          <Link href="/login" aria-label="Ledger" className="mb-8 flex justify-center lg:hidden">
            <Logo markClassName="size-10" />
          </Link>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card max-sm:border-0 max-sm:bg-transparent max-sm:p-2 max-sm:shadow-none sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
