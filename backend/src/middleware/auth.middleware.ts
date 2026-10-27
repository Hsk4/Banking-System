import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import userModel from "../models/user.model";
import tokenBlackListModel from "../models/blacklist.model";

/**
 * - Read the caller's JWT
 * The token is read from the `token` cookie first (set on login/register) and
 * falls back to a standard `Authorization: Bearer <token>` header.
 *
 * @param req - the incoming request
 * @returns the raw JWT, or `undefined` when the caller sent none
 */
function extractToken(req: Request): string | undefined {
  return req.cookies?.token || req.headers.authorization?.split(" ")[1];
}

/**
 * - Verify a token and resolve its payload
 * @param token - the raw JWT
 * @returns the decoded payload, or `null` when the token is invalid/expired
 */
function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET as string) as jwt.JwtPayload;
  } catch {
    // invalid signature, expired token, malformed payload, etc.
    return null;
  }
}

/**
 * - Check whether a token has been revoked
 * @param token - the raw JWT
 * @returns `true` when the token is on the blacklist (i.e. logged out)
 */
async function isTokenBlacklisted(token: string): Promise<boolean> {
  const blacklisted = await tokenBlackListModel.findOne({ token });
  return blacklisted !== null;
}

/**
 * - Authentication middleware
 * Checks if the user is authenticated by verifying the JWT token on the
 * request. If the token is valid the user is attached to `req.user`,
 * otherwise a 401 Unauthorized response is sent.
 *
 * FLOW:
 * 1. Extract the token (cookie, then `Authorization` header)
 * 2. Reject the request when no token is present
 * 3. Reject the request when the token has been blacklisted (logged out)
 * 4. Verify the token and load the user
 * 5. Reject the request when the user no longer exists
 * 6. Attach the user to the request and continue
 *
 * @param req - the request object
 * @param res - the response object
 * @param next - the next middleware function
 * @returns {Promise<void>} - resolves once the request is either rejected or passed on
 */
async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // 1 + 2. no token means the request is unauthenticated
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // 3. a blacklisted token was revoked by logout
  if (await isTokenBlacklisted(token)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // 4. verify the token and load the matching user
  const decoded = verifyToken(token);
  const user = decoded ? await userModel.findById(decoded.id).select("-password") : null;

  // 5. the token may be valid while the user has since been deleted
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  /**
   * 5b. "sign out everywhere" retires older tokens
   * Every token carries the version it was issued with; a bump makes this
   * mismatch, which is what logs out a device the owner no longer has.
   * Tokens issued before the field existed have no `tv`, so they are read as 0
   * and stay valid until the first sign-out-everywhere.
   */
  if ((decoded?.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // 6. attach the authenticated user for downstream controllers
  req.user = user;
  next();
}

/**
 * - System user middleware
 * Same checks as {@link authMiddleware}, plus a requirement that the caller
 * is flagged as a system user. Used for privileged, internal-only endpoints
 * such as seeding an account with initial funds.
 *
 * FLOW:
 * 1. Extract the token (cookie, then `Authorization` header)
 * 2. Reject the request when no token is present
 * 3. Reject the request when the token has been blacklisted (logged out)
 * 4. Verify the token and load the user
 * 5. Reject with 401 when the user is missing, and 403 when the user is
 *    valid but is not a system user (a permission problem, not a session one)
 * 6. Attach the user to the request and continue
 *
 * @param req - the request object
 * @param res - the response object
 * @param next - the next middleware function
 * @returns {Promise<void>} - resolves once the request is either rejected or passed on
 */
async function authSystemUserMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // 1 + 2. no token means the request is unauthenticated
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // 3. a blacklisted token was revoked by logout
  if (await isTokenBlacklisted(token)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // 4. verify the token and load the matching user
  const decoded = verifyToken(token);
  const user = decoded
    ? await userModel.findById(decoded.id).select("systemUser tokenVersion")
    : null;

  // 5a. the token may be valid while the user has since been deleted
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // a retired token from before "sign out everywhere" is no longer a session
  if ((decoded?.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // 5b. a real user without the flag is authenticated but not allowed here
  if (!user.systemUser) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  // 6. attach the authenticated user for downstream controllers
  req.user = user;
  next();
}

/**
 * - Auth middleware
 * Public surface of the auth middleware module, consumed by the route files.
 */
export default {
  authMiddleware,
  authSystemUserMiddleware,
};
