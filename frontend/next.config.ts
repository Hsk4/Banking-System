import type { NextConfig } from "next";

/**
 * The browser only ever talks to this origin. `/api/*` is handled by the
 * route handler in `app/api/[...path]/route.ts`, which forwards to the Express
 * API so the login `Set-Cookie` lands on our own domain and is sent back
 * automatically (and no CORS is needed in the browser path).
 *
 * That handler also strips hop-by-hop headers - a plain `rewrites()` entry
 * passes Express's `Transfer-Encoding: chunked` through alongside
 * `Content-Length`, which HTTP/1.1 servers reject with a 502.
 */
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
