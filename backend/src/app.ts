import express from "express";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes";
import cookieParser from "cookie-parser";
import accountRoutes from "./routes/account.routes";
import transactionRoutes from "./routes/transaction.routes";
import recipientRoutes from "./routes/recipient.routes";
import adminRoutes from "./routes/admin.routes";

/**
 * - Express application
 * Builds the app, registers global middleware, and mounts every feature
 * router. Kept separate from `server.ts` so the app can be imported (e.g. in
 * tests) without opening a port.
 */
const app = express();

/**
 * - Security headers
 * `helmet` sets the conservative defaults: no MIME sniffing, no framing, a
 * Referrer-Policy, HSTS in production. Two defaults are wrong for this API:
 * - `crossOriginResourcePolicy` would block the browser UI (and the Capacitor
 *   WebView) from reading responses that come from another origin.
 * - `contentSecurityPolicy` is for documents. This service returns JSON and
 *   CSV only, so a CSP would just be noise; the UI owns its own policy.
 */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

/**
 * - Allowed browser origins
 * The UI calls the API from its own origin, so the cookie must be readable
 * cross-site. Comma-separate `CORS_ORIGIN` for more than one (local dev plus
 * the Vercel domain); a single value works too.
 */
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * - Origins the native shells are served from
 * Capacitor serves a static export from the WebView's own scheme rather than a
 * public domain: `https://localhost` on Android, `capacitor://localhost` on
 * iOS. They are not something an operator should have to remember to paste into
 * a dashboard, and a missing one fails every native request with an opaque
 * fetch error. They are always allowed.
 */
const NATIVE_ORIGINS = ["https://localhost", "capacitor://localhost"];

/**
 * - CORS
 * Must run before the routers so preflights and every response carry the
 * headers. `credentials: true` is required for the httpOnly auth cookie, and
 * it means the origin has to be echoed explicitly instead of `*`.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (
    origin &&
    (allowedOrigins.includes(origin) || NATIVE_ORIGINS.includes(origin))
  ) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
    // PATCH is needed by the admin routes (account status changes) and the
    // account rename; DELETE by removing a saved recipient
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Idempotency-Key",
    );
    // let the UI read the rate-limit state and a retry delay
    res.header(
      "Access-Control-Expose-Headers",
      "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, Content-Disposition",
    );
  }

  // answer preflights without touching any route or the database
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

// the API only ever speaks JSON in, so a large body is a mistake or an attack
app.use(express.json({ limit: "100kb" }));

// parse cookies so the auth middleware can read the `token` cookie
app.use(cookieParser());

// feature routers - each router owns its own auth requirements
app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/recipients", recipientRoutes);
app.use("/api/admin", adminRoutes);

/**
 * GET /
 * Liveness probe - lets you confirm the API is up without touching the DB.
 */
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * - Unknown route
 * A JSON 404, so a typo in a path never falls through to Express's HTML page
 * (which the UI would report as "the server answered with a web page").
 */
app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

/**
 * - Failure handler
 * A malformed JSON body and anything unexpected both answer JSON, and never
 * leak a stack trace to the client.
 */
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const err = error as { type?: string; status?: number; message?: string };

    // body-parser's own errors: a bad or oversized JSON payload
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ message: "Request body is not valid JSON" });
      return;
    }
    if (err?.type === "entity.too.large") {
      res.status(413).json({ message: "Request body is too large" });
      return;
    }

    console.error("Unhandled request error", error);
    res.status(500).json({ message: "Something went wrong" });
  },
);

export default app;
