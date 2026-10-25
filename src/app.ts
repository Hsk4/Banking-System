import express from "express";
import authRoutes from "./routes/auth.routes";
import cookieParser from "cookie-parser";
import accountRoutes from "./routes/account.routes";
import transactionRoutes from "./routes/transaction.routes";

/**
 * - Express application
 * Builds the app, registers global middleware, and mounts every feature
 * router. Kept separate from `server.ts` so the app can be imported (e.g. in
 * tests) without opening a port.
 */
const app = express();

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
 * - CORS
 * Must run before the routers so preflights and every response carry the
 * headers. `credentials: true` is required for the httpOnly auth cookie, and
 * it means the origin has to be echoed explicitly instead of `*`.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  // answer preflights without touching any route or the database
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

// parse cookies so the auth middleware can read the `token` cookie
app.use(cookieParser());

// parse JSON request bodies
app.use(express.json());

// feature routers - each router owns its own auth requirements
app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);

/**
 * GET /
 * Liveness probe - lets you confirm the API is up without touching the DB.
 */
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export default app;
