"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  Wrench,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";

/** The two main destinations shown in the top bar and the mobile bottom bar. */
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transfer", label: "Transfer", icon: ArrowLeftRight },
] as const;

/**
 * - Active link state
 * Whether a nav item is the current page.
 * @param href - the destination path
 */
function useIsActive(href: string): boolean {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * - Theme toggle
 * Lives in the top bar (and in the user menu on mobile). Follows the system
 * setting by default; this switches explicitly.
 */
function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // false until hydration: next-themes only knows the theme on the client
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {mounted && dark ? (
        <Sun className="size-5" aria-hidden />
      ) : (
        <Moon className="size-5" aria-hidden />
      )}
    </button>
  );
}

/**
 * - Theme toggle menu item
 * The icon button is hidden below `md`, so the user menu carries the same
 * control on mobile.
 */
function ThemeToggleItem({ onChoose }: { onChoose: () => void }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="menuitem"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        setTheme(dark ? "light" : "dark");
        onChoose();
      }}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent md:hidden"
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
      {mounted ? (dark ? "Light theme" : "Dark theme") : "Theme"}
    </button>
  );
}

/**
 * - User menu
 * Initials button opening a panel with the user, theme toggle, the admin link
 * and sign out. Closes on outside click and Escape.
 */
function UserMenu({ signOut }: { signOut: () => Promise<void> }) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const name = user?.name ?? "";
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => setOpen((value) => !value)}
        className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground transition-colors duration-150 hover:brightness-95"
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 top-11 z-40 w-60 rounded-xl border-border bg-popover p-1.5 shadow-lg"
        >
          <div className="border-b border-border px-2.5 py-2">
            <p className="truncate text-sm font-medium">
              {user?.name ?? "Signed in"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email ?? ""}
            </p>
          </div>

          <div className="mt-1">
            <ThemeToggleItem onChoose={() => setOpen(false)} />

            <Link
              href="/admin/fund"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
            >
              <Wrench className="size-4 text-muted-foreground" />
              Admin: fund account
            </Link>

            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-destructive hover:bg-accent"
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * - Top bar link
 * Hidden below `md`, where the bottom bar takes over navigation.
 */
function TopNavLink({ href, label }: { href: string; label: string }) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-14 items-center px-1 text-sm transition-colors duration-150",
        active
          ? "font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 h-0.5 rounded-full",
          active ? "bg-primary" : "bg-transparent",
        )}
      />
    </Link>
  );
}

/**
 * - Bottom bar link
 * Mobile only; the active item uses the teal colour plus a top indicator.
 */
function BottomNavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors duration-150",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-4 top-0 h-0.5 rounded-full",
          active ? "bg-primary" : "bg-transparent",
        )}
      />
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

/**
 * - App shell
 * 56px top bar with the wordmark, the two nav links and the avatar menu;
 * content capped at 960px; a fixed bottom bar below `md`.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-240 items-center gap-2 px-4 md:gap-8 md:px-6">
          <Link
            href="/dashboard"
            className="text-base font-semibold tracking-tight"
          >
            Ledger
          </Link>

          {/* no top nav below md: the mobile menu and the bottom bar cover it */}
          <nav
            className="hidden h-full items-center gap-6 md:flex"
            aria-label="Main"
          >
            {NAV.map((item) => (
              <TopNavLink key={item.href} href={item.href} label={item.label} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="max-md:hidden" />
            <UserMenu signOut={signOut} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-240 px-4 py-6 pb-[calc(var(--bottom-nav)+1.5rem)] md:px-6 md:pb-6">
        {children}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map((item) => (
          <BottomNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </nav>
    </div>
  );
}


