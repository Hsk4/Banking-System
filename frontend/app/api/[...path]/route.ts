import type { NextRequest } from "next/server";

/**
 * - API proxy
 * Forwards `/api/*` to the Express API with `fetch`. A `rewrites()` entry
 * would be shorter, but it passes the upstream response through verbatim and
 * Express answers with `Transfer-Encoding: chunked` together with a
 * `Content-Length`: both hop-by-hop style headers at once, which HTTP/1.1
 * servers (the Render load balancer) reject with a 502.
 *
 * Reading the body here and rebuilding the response drops those two headers,
 * so the browser only ever talks to this origin and the login `Set-Cookie`
 * lands on our own domain.
 */

/**
 * Hop-by-hop headers, plus ones recomputed for the request we rebuild below.
 *
 * `expect` must go: an `Expect: 100-continue` from any client makes undici's
 * fetch throw `UND_ERR_NOT_SUPPORTED (expect header not supported)`, which
 * surfaced as a 502 on every POST from clients that send it.
 */
const DROPPED_REQUEST_HEADERS = [
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "content-length",
  "accept-encoding",
  "expect",
];

/** `content-length` / `content-encoding` are recomputed for the rebuilt body. */
const DROPPED_RESPONSE_HEADERS = [
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "content-length",
  "content-encoding",
];

/** The API answers within the request timeout; do not wait on Render forever. */
const UPSTREAM_TIMEOUT_MS = 60_000;

/** `Set-Cookie` must be forwarded as separate values, not joined by a comma. */
function copyCookies(upstream: Response, headers: Headers) {
  const cookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];
  if (cookies.length > 0) {
    headers.delete("set-cookie");
    cookies.forEach((cookie) => headers.append("set-cookie", cookie));
    return;
  }
  const single = upstream.headers.get("set-cookie");
  if (single) headers.set("set-cookie", single);
}

async function forward(request: NextRequest): Promise<Response> {
  const backend = (process.env.BACKEND_URL ?? "http://localhost:3001").replace(
    /\/+$/,
    "",
  );

  const path = request.nextUrl.pathname.replace(/^\/api/, "");
  const target = `${backend}/api${path}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (!DROPPED_REQUEST_HEADERS.includes(name)) headers.set(name, value);
  });

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    // keep the cause in the server log: a 502 with no reason is impossible to
    // debug from the browser
    console.error(`[api-proxy] ${method} ${target} failed`, error);
    return Response.json(
      { message: "Could not reach the server. Please try again." },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROPPED_RESPONSE_HEADERS.includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });
  copyCookies(upstream, responseHeaders);

  if (upstream.status === 204 || upstream.status === 205) {
    return new Response(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  const payload = await upstream.arrayBuffer();
  return new Response(payload, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

/** Any verb under `/api/*` is forwarded to the backend. */
export async function GET(request: NextRequest) {
  return forward(request);
}

/** See {@link GET}; used for logout. */
export async function POST(request: NextRequest) {
  return forward(request);
}

/** See {@link GET}. */
export async function PUT(request: NextRequest) {
  return forward(request);
}

/** See {@link GET}. */
export async function PATCH(request: NextRequest) {
  return forward(request);
}

/** See {@link GET}. */
export async function DELETE(request: NextRequest) {
  return forward(request);
}

/** See {@link GET}. */
export async function HEAD(request: NextRequest) {
  return forward(request);
}

/** See {@link GET}. */
export async function OPTIONS(request: NextRequest) {
  return forward(request);
}
