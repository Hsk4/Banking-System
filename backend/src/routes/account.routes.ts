import express from "express";
import accountController from "../controllers/account.controller";
import authMiddleware from "../middleware/auth.middleware";

/**
 * - Account routes
 * Protected endpoints for account management. Every route here runs through
 * an auth middleware first. Mounted at `/api/accounts` by the Express app.
 */
const router = express.Router();

/**
 * POST /api/accounts/
 * Creates a new account for the authenticated user.
 * Requires authentication via JWT token.
 *
 * @see createAccount
 */
router.post(
  "/",
  authMiddleware.authMiddleware,
  accountController.createAccount,
);

/**
 * GET /api/accounts/
 * Lists every account the authenticated user owns.
 * Requires authentication via JWT token.
 *
 * @see getUserAccounts
 */
router.get(
  "/",
  authMiddleware.authMiddleware,
  accountController.getUserAccounts,
);

/**
 * GET /api/accounts/balance/:accountId
 * Returns the balance of one account owned by the authenticated user.
 * Requires authentication via JWT token.
 *
 * @see getAccountBalance
 */
router.get(
  "/balance/:accountId",
  authMiddleware.authMiddleware,
  accountController.getAccountBalance,
);

/**
 * PATCH /api/accounts/:accountId
 * Renames one of the caller's accounts ("Savings"). The name is cosmetic.
 * Requires authentication via JWT token.
 *
 * @see renameAccount
 */
router.patch(
  "/:accountId",
  authMiddleware.authMiddleware,
  accountController.renameAccount,
);

/**
 * GET /api/accounts/:accountId/history.csv
 * Downloads the account's history as a CSV file.
 * Requires authentication via JWT token.
 *
 * @see exportHistory
 */
router.get(
  "/:accountId/history.csv",
  authMiddleware.authMiddleware,
  accountController.exportHistory,
);

export default router;
