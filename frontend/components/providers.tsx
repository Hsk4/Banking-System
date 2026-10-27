"use client";

import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth-context";

/** Matches the shell's `md` breakpoint in the spec. */
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * - Toaster position
 * Bottom-right on desktop, top-center on mobile - the spec wants the toast to
 * mirror where the primary action lives on each layout.
 */
function PositionedToaster() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <Toaster
      position={desktop ? "bottom-right" : "top-center"}
      toastOptions={{ className: "text-sm" }}
      richColors
      closeButton
      // stay clear of the fixed bottom navigation on mobile
      mobileOffset={{ top: "16px" }}
    />
  );
}

/**
 * - Client providers
 * Theme (system default, no flash), auth state, and the toast region.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        {children}
        <PositionedToaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
