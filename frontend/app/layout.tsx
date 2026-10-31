import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts: no build-time network, and the Capacitor shell
// has them offline. The families are wired up in globals.css.
import "@fontsource-variable/fraunces";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "Ledger",
    template: "%s · Ledger",
  },
  description: "A quiet place to hold, send and track your PKR balances.",
  applicationName: "Ledger",
  // app/icon.svg, app/apple-icon.png and app/favicon.ico are picked up by
  // the file conventions; the manifest is app/manifest.webmanifest
  appleWebApp: { capable: true, title: "Ledger", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  // the browser chrome takes the emerald (or the paper, in light mode)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0a110f" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // next-themes sets the class before paint; suppress the mismatch warning
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
