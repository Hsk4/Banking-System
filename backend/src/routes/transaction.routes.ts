import Router from "express";
import authMiddleware from "../middleware/auth.middleware";
import transactionController from "../controllers/transaction.controller";

/**
 * - Transaction routes
 * Protected endpoints for moving money. Every route here runs through one of
 * the auth middlewares first. Mounted at `/api/transactions` by the Express app.
 */
const transactionRouter = Router();

/**
 * POST /api/transactions/system/initial-funds
 * Seeds an account with a starting balance by transferring from the calling
 * user's own (system) account. Requires a system user.
 *
 * @see createInitialFundsTransaction
 */
transactionRouter.post(
  "/system/initial-funds",
  authMiddleware.authSystemUserMiddleware,
  transactionController.createInitialFundsTransaction,
);

/**
 * POST /api/transactions/
 * Transfers funds from `fromAccount` to `toAccount` using a ledger-backed,
 * idempotent, session-wrapped flow.
 * Requires authentication via JWT token.
 *
 * @see createTransaction
 */
transactionRouter.post(
  "/",
  authMiddleware.authMiddleware,
  transactionController.createTransaction,
);

export default transactionRouter;
