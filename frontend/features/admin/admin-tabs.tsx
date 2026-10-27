"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** The admin sections, in the order an operator needs them. */
const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/accounts", label: "Users and accounts" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

/**
 * - Admin section tabs
 * A small, horizontal row rather than a sidebar: the dashboard has four
 * screens and a phone should not need a drawer to reach them.
 */
export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="mt-4 flex gap-1 overflow-x-auto border-b border-border pb-px"
    >
      {TABS.map((tab) => {
        // `/admin` must not light up for `/admin/accounts`
        const active =
          tab.href === "/admin"
            ? pathname === "/admin"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-2 -bottom-px h-0.5 rounded-full",
                active ? "bg-primary" : "bg-transparent",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
