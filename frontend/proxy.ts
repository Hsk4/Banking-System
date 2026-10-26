import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Pages that require a session. */
const PROTECTED = ["/dashboard", "/transfer", "/admin"];

/** Pages that should not be shown to someone who already has a session. */
const GUEST_ONLY = ["/login", "/register"];

/**
 * - Route gate
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (function `proxy`, Node.js
 * runtime). The JWT secret lives on the backend, so this cannot verify a
 * session - it can only tell whether one is likely to exist.
 *
 * The API now lives on another origin, so its login cookie is not visible
 * here. Middleware cannot read localStorage either, which leaves one honest
 * option: do not gate at the edge at all. The app already handles the real
 * check - the first API call answers 401 and `handleUnauthorized` sends the
 * user to /login - and a static export has no server to protect.
 *
 * @param request - the incoming request
 * @returns the request, unchanged
 */
export function proxy(request: NextRequest) {
  return NextResponse.next();
}

/**
 * - Unused former gate
 * Kept as documentation of the rule the client-side guard now implements, in
 * case a same-origin API is restored (see docs/capacitor-adding-plan.md,
 * Option B). Remove once that decision is final.
 *
 * @param request - the incoming request
 * @returns a redirect for the auth pages, otherwise the request continues
 */
export function legacyProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.has("token");

  const isProtected = PROTECTED.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const isGuestOnly = GUEST_ONLY.includes(pathname);

  if (isProtected && !hasToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isGuestOnly && hasToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // everything except API routes, static assets and metadata files
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
