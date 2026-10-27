import type { NextConfig } from "next";

/**
 * Static export, so the same build can be loaded by the Capacitor WebView.
 *
 * A static export cannot contain server code, so there is no `/api/*` proxy
 * route any more: the app talks to the Express API directly and the base URL
 * comes from `NEXT_PUBLIC_API_URL` (see `lib/api.ts`). Authentication therefore
 * relies on the bearer token the API returns, with the login cookie kept as a
 * bonus wherever it is allowed.
 *
 * The backend's `CORS_ORIGIN` must list every origin the app is served from:
 * the Vercel domain for web, `https://localhost` for Android and
 * `capacitor://localhost` for iOS. See docs/capacitor-adding-plan.md.
 */
const nextConfig: NextConfig = {
  output: "export", // static HTML/CSS/JS, for both Vercel and the native shell
  images: {
    unoptimized: true, // Required for static exports
  },
  // Cache Components implies Partial Prerendering, which a static export
  // cannot do ("PPR cannot be enabled in export mode"). Both are off now;
  // they only affect server rendering, which this build no longer has.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
