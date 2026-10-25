import express from "express";
import authController from "../controllers/auth.controller";

/**
 * - Auth routes
 * Public (unauthenticated) endpoints for account creation and login.
 * Mounted at `/api/auth` by the Express app.
 */
const router = express.Router();

/**
 * POST /api/auth/register
 * Creates a new user and returns the created user plus a JWT.
 *
 * @see userRegister
 */
router.post("/register", authController.userRegister);

/**
 * POST /api/auth/login
 * Verifies credentials and returns the user plus a JWT.
 *
 * @see userLogin
 */
router.post("/login", authController.userLogin);

/**
 * POST /api/auth/logout
 * Logs out the user and invalidates the JWT.
 *
 * @see userLogout
 */
router.post("/logout", authController.userLogout);

export default router;
