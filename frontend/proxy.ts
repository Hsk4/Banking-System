import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Pages that require a session. */
const PROTECTED = ["/dashboard", "/transfer", "/admin"];

/** Pages that should not be shown to someone who already has a session. */
const GUEST_ONLY = ["/login", "/register"];

/**
 * - Route gate
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (function `proxy`, Node.js
 * runtime). The JWT secret lives on the backend, so this can only check that
 * the `token` cookie exists - a forged or expired cookie still gets through to
 * the page, but every API call then returns 401 and the app redirects there.
 *
 * @param request - the incoming request
 * @returns a redirect for the auth pages, otherwise the request continues
 */
export function proxy(request: NextRequest) {
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
