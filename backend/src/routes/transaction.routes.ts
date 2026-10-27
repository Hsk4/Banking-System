import Router from "express";
import authMiddleware from "../middleware/auth.middleware";
import { userRateLimiter } from "../middleware/rateLimit.middleware";
import transactionController from "../controllers/transaction.controller";

/**
 * - Transaction routes
 * Protected endpoints for moving money and reading what moved. Every route
 * here runs through one of the auth middlewares first, and the customer ones
 * through a per-user rate limit as well. Mounted at `/api/transactions` by
 * the Express app.
 */
const transactionRouter = Router();

/**
 * POST /api/transactions/system/initial-funds
 * Seeds an account with a starting balance by transferring from the treasury.
 * Requires a system user.
 *
 * @see createInitialFundsTransaction
 */
transactionRouter.post(
  "/system/initial-funds",
  authMiddleware.authSystemUserMiddleware,
  transactionController.createInitialFundsTransaction,
);

/**
 * GET /api/transactions/limits
 * The per-transfer, daily and step-up thresholds the UI should show.
 * Requires authentication.
 *
 * @see getLimits
 */
transactionRouter.get(
  "/limits",
  authMiddleware.authMiddleware,
  transactionController.getLimits,
);

/**
 * GET /api/transactions/limits/:accountId
 * How much of the daily limit one account has left.
 * Requires authentication.
 *
 * @see getAccountLimit
 */
transactionRouter.get(
  "/limits/:accountId",
  authMiddleware.authMiddleware,
  transactionController.getAccountLimit,
);

/**
 * GET /api/transactions/history/:accountId
 * One cursor-paged page of an account's ledger, newest first.
 * Requires authentication.
 *
 * @see getAccountHistory
 */
transactionRouter.get(
  "/history/:accountId",
  authMiddleware.authMiddleware,
  transactionController.getAccountHistory,
);

/**
 * POST /api/transactions/
 * Transfers funds from `fromAccount` to `toAccount` using a ledger-backed,
 * idempotent, session-wrapped flow. Large transfers are held for an emailed
 * code and answered with 202.
 * Requires authentication via JWT token.
 *
 * @see createTransaction
 */
transactionRouter.post(
  "/",
  authMiddleware.authMiddleware,
  userRateLimiter("transfer"),
  transactionController.createTransaction,
);

/**
 * GET /api/transactions/:transactionId
 * The receipt for one transaction, readable by either side.
 * Requires authentication.
 *
 * @see getTransaction
 */
transactionRouter.get(
  "/:transactionId",
  authMiddleware.authMiddleware,
  transactionController.getTransaction,
);

/**
 * POST /api/transactions/:transactionId/confirm
 * Releases a held large transfer when the emailed code is correct.
 * Requires authentication.
 *
 * @see confirmTransaction
 */
transactionRouter.post(
  "/:transactionId/confirm",
  authMiddleware.authMiddleware,
  userRateLimiter("verification"),
  transactionController.confirmTransaction,
);

export default transactionRouter;
