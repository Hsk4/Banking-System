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
