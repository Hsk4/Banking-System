import express from "express";
import adminController from "../controllers/admin.controller";
import authMiddleware from "../middleware/auth.middleware";

/**
 * - Admin routes
 * The administrator dashboard. Every route requires a system user, so a
 * customer with a valid session gets a 403 from the middleware before any
 * controller runs. Mounted at `/api/admin`.
 */
const router = express.Router();

// one gate for the whole surface
router.use(authMiddleware.authSystemUserMiddleware);

/**
 * GET /api/admin/overview
 * Money minted, users, accounts and today's activity.
 *
 * @see getOverview
 */
router.get("/overview", adminController.getOverview);

/**
 * GET /api/admin/users
 * The customer directory, searchable by name or email.
 *
 * @see listUsers
 */
router.get("/users", adminController.listUsers);

/**
 * GET /api/admin/accounts
 * Accounts with their owners and balance, searchable and filterable.
 *
 * @see listAccounts
 */
router.get("/accounts", adminController.listAccounts);

/**
 * PATCH /api/admin/accounts/:accountId/status
 * Freezes, unfreezes or closes a customer account. Audited.
 *
 * @see setAccountStatus
 */
router.patch("/accounts/:accountId/status", adminController.setAccountStatus);

/**
 * GET /api/admin/transactions
 * Searchable transactions with the ledger entries behind each one.
 *
 * @see listTransactions
 */
router.get("/transactions", adminController.listTransactions);

/**
 * GET /api/admin/audit
 * The append-only log of administrator actions.
 *
 * @see listAudit
 */
router.get("/audit", adminController.listAudit);

export default router;
