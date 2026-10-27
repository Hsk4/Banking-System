import express from "express";
import recipientController from "../controllers/recipient.controller";
import authMiddleware from "../middleware/auth.middleware";
import { userRateLimiter } from "../middleware/rateLimit.middleware";

/**
 * - Recipient routes
 * The name-check and the caller's saved payees. Mounted at `/api/recipients`.
 *
 * The lookup is rate-limited per user because it is the one endpoint that
 * answers "does account N exist, and whose is it?": without a limit it could
 * be walked through the whole number space to enumerate customers.
 */
const router = express.Router();

/**
 * GET /api/recipients/lookup/:accountNumber
 * Returns the masked name and status for an account number.
 * Requires authentication, rate-limited per user.
 *
 * @see lookupRecipient
 */
router.get(
  "/lookup/:accountNumber",
  authMiddleware.authMiddleware,
  userRateLimiter("lookup"),
  recipientController.lookupRecipient,
);

/**
 * GET /api/recipients/recent
 * The people this customer paid most recently, derived from the ledger.
 * Requires authentication.
 *
 * @see recentRecipients
 */
router.get(
  "/recent",
  authMiddleware.authMiddleware,
  recipientController.recentRecipients,
);

/**
 * GET /api/recipients
 * Every payee the caller has saved, newest first.
 * Requires authentication.
 *
 * @see listRecipients
 */
router.get(
  "/",
  authMiddleware.authMiddleware,
  recipientController.listRecipients,
);

/**
 * POST /api/recipients
 * Saves a payee, or renames one that was already saved.
 * Requires authentication.
 *
 * @see saveRecipient
 */
router.post(
  "/",
  authMiddleware.authMiddleware,
  recipientController.saveRecipient,
);

/**
 * DELETE /api/recipients/:recipientId
 * Removes one of the caller's saved payees.
 * Requires authentication.
 *
 * @see deleteRecipient
 */
router.delete(
  "/:recipientId",
  authMiddleware.authMiddleware,
  recipientController.deleteRecipient,
);

export default router;
