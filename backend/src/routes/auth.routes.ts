import express from "express";
import authController from "../controllers/auth.controller";
import authMiddleware from "../middleware/auth.middleware";
import { authRateLimiter } from "../middleware/rateLimit.middleware";

/**
 * - Auth routes
 * Public (unauthenticated) endpoints for account creation and login.
 * Mounted at `/api/auth` by the Express app.
 *
 * Every public route here is rate-limited per IP: register and login are the
 * two doors an attacker can knock on endlessly, so they are the two that
 * count requests.
 */
const router = express.Router();

/**
 * POST /api/auth/register
 * Creates a new user and returns the created user plus a JWT.
 *
 * @see userRegister
 */
router.post("/register", authRateLimiter, authController.userRegister);

/**
 * POST /api/auth/login
 * Verifies credentials and returns the user plus a JWT.
 *
 * @see userLogin
 */
router.post("/login", authRateLimiter, authController.userLogin);

/**
 * POST /api/auth/logout
 * Logs out the user and invalidates the JWT.
 *
 * @see userLogout
 */
router.post("/logout", authController.userLogout);

/**
 * POST /api/auth/logout-all
 * Revokes every token the user has, on every device.
 * Requires authentication.
 *
 * @see userLogoutAll
 */
router.post(
  "/logout-all",
  authMiddleware.authMiddleware,
  authController.userLogoutAll,
);

/**
 * GET /api/auth/me
 * Returns the signed-in user, so the UI can confirm a session is still valid.
 * Requires authentication.
 *
 * @see currentUser
 */
router.get("/me", authMiddleware.authMiddleware, authController.currentUser);

export default router;
