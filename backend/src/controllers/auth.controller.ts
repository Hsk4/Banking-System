import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import LIMITS from "../config/limits";
import userModel from "../models/user.model";
import tokenBlackListModel from "../models/blacklist.model";
import emailService from "../services/email.service";
import {
  activeLock,
  clearFailures,
  recordFailure,
} from "../services/loginGuard.service";

/** how long an issued JWT stays valid */
const TOKEN_EXPIRES_IN = "3d";

/**
 * - Sign a session token
 * The user's `tokenVersion` is baked in, which is how "sign out everywhere"
 * retires every token that was issued before the bump.
 *
 * @param userId - the id of the user the token belongs to
 * @param tokenVersion - the user's current token version
 * @returns a signed JWT carrying the user id
 * @throws {Error} when `JWT_SECRET` is not configured
 */
function signToken(userId: unknown, tokenVersion = 0): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return jwt.sign({ id: userId, tv: tokenVersion }, secret, {
    expiresIn: TOKEN_EXPIRES_IN,
  });
}

/**
 * - Describe the device that is signing in
 * Not a fingerprint - just enough of the User-Agent for the alert email to be
 * recognisable ("Chrome on Windows", "the Banking app").
 *
 * @param userAgent - the request header
 * @returns a short human description
 */
function describeDevice(userAgent: string | undefined): string {
  if (!userAgent) return "an unknown device";
  if (/bankingsystem/i.test(userAgent)) return "the Banking app";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent) && !/Chromium/.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "a browser";

  const os = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iOS/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS X/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "an unknown system";

  return `${browser} on ${os}`;
}

/**
 * - Count a failed sign-in
 * Records the failure against the email, and emails the owner the first time
 * the limit is reached. Any error here is swallowed: locking is a defence, and
 * a database hiccup in it must not turn a "wrong password" into a 500.
 *
 * @param email - the address that was tried
 */
async function countFailure(email: string): Promise<void> {
  try {
    await recordFailure(email, async () => {
      // only mail an owner who exists: an unknown address is already a failure
      const owner = await userModel.findOne({ email }).select("email name");
      if (!owner) return;
      await emailService.sendLockoutEmail(
        owner.email,
        owner.name,
        LIMITS.loginLockMinutes,
      );
    });
  } catch (error) {
    console.error("Could not record a failed login", { email, error });
  }
}

/**
 * - Set the session cookie
 * Stores the JWT in an httpOnly cookie so it cannot be read by scripts and
 * is sent automatically on subsequent requests.
 *
 * @param res - the response to set the cookie on
 * @param token - the signed JWT
 */
function setAuthCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,
    // the cookie is set on the API origin and read back by the UI origin
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days, matching the JWT lifetime
  });
}

/**
 * - Register a new user
 * Creates a new user account and issues a JWT for the fresh session.
 *
 * FLOW:
 * 1. Validate the request body
 * 2. Check the email is not already taken
 * 3. Check the two passwords match
 * 4. Create the user (password is hashed by the model pre-save hook)
 * 5. Sign a token and set it as a cookie
 * 6. Respond, then send the welcome email
 *
 * @param req - The request object
 * @param res - The response
 * @returns - The created user and a session token
 * @POST - /api/auth/register
 */
async function userRegister(req: Request, res: Response): Promise<void> {
  /**
   * 1. Validate request
   */
  const { email, name, password, confirmPassword } = req.body ?? {};

  if (!email || !name || !password || !confirmPassword) {
    res.status(400).json({
      message: "email, name, password and confirmPassword are required",
    });
    return;
  }

  /**
   * 2. Check if the user already exists in the database
   */
  const isExists = await userModel.findOne({ email });
  if (isExists) {
    res.status(400).json({ message: "User already exists", status: "failed" });
    return;
  }

  // 3. if the two passwords do not match, return an error
  if (password !== confirmPassword) {
    res.status(400).json({ message: "Passwords do not match" });
    return;
  }

  // 4. create the new user - hashing happens in the pre-save hook
  const user = new userModel({ email, name, password, confirmPassword });
  await user.save();

  // 5. sign a token and set it in a cookie so later requests are authenticated
  const token = signToken(user._id, user.tokenVersion ?? 0);
  setAuthCookie(res, token);

  // 6. respond before sending the mail so a slow mail server cannot delay it
  res.status(201).json({
    message: "User registered successfully",
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      systemUser: user.systemUser,
    },
    token,
  });

  try {
    await emailService.sendRegistrationEmail(user.email, user.name);
  } catch {
    // the account is already created - a mail failure must not fail registration
  }
}

/**
 * - Log a user in
 * Verifies the supplied credentials and issues a JWT for the session.
 *
 * FLOW:
 * 1. Validate the request body
 * 2. Find the user by email (explicitly selecting the hidden password)
 * 3. Reject when the user does not exist
 * 4. Compare the supplied password against the hash
 * 5. Sign a token and set it as a cookie
 *
 * @param req - The request object
 * @param res - The response
 * @returns - The user and a session token
 * @POST - /api/auth/login
 */
async function userLogin(req: Request, res: Response): Promise<void> {
  /**
   * 1. Validate request
   */
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ message: "email and password are required" });
    return;
  }

  /**
   * 2. Look the user up
   * (`+password` overrides the schema's `select: false`)
   */
  const user = await userModel.findOne({ email }).select("+password");

  // 3. a paused email is refused before any password work, so guessing keeps
  // costing time even when the password happens to be right
  const lock = await activeLock(email);
  if (lock) {
    res.setHeader("Retry-After", String(lock.retryAfterSeconds));
    res.status(429).json({
      message: `Too many failed attempts. Try again in ${Math.ceil(
        lock.retryAfterSeconds / 60,
      )} minute(s).`,
    });
    return;
  }

  // 4. if the user does not exist, return an error. The wording is the same
  // as a wrong password on purpose - see the failure path below.
  if (!user) {
    await countFailure(email);
    res.status(400).json({ message: "Invalid credentials", status: "failed" });
    return;
  }

  // 5. check the password against the stored hash
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await countFailure(email);
    res.status(400).json({ message: "Invalid credentials", status: "failed" });
    return;
  }

  // 6. a good sign-in clears the failure window
  await clearFailures(email);

  // 7. sign a token, set the cookie, and return the user data
  const token = signToken(user._id, user.tokenVersion ?? 0);
  setAuthCookie(res, token);

  /**
   * 8. new-device alert
   * Compared against the device recorded on the last sign-in. A first-ever
   * login is not "new": there is nothing to compare it with, and mailing a
   * welcome alert on every account's first day is noise.
   */
  const device = describeDevice(req.headers["user-agent"]);
  const isNewDevice =
    Boolean(user.lastLoginDevice) && user.lastLoginDevice !== device;

  // record this sign-in; a failure here must not block the login itself
  await userModel.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date(), lastLoginDevice: device } },
  );

  res.status(200).json({
    message: "User logged in successfully",
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      systemUser: user.systemUser,
    },
    token,
  });

  if (isNewDevice) {
    try {
      await emailService.sendNewDeviceEmail(
        user.email,
        user.name,
        device,
        new Date(),
      );
    } catch {
      // a mail failure must not fail a valid login
    }
  }
}

/**
 * - Log a user out
 * Revokes the caller's token so it stops working immediately, then clears
 * the cookie.
 *
 * FLOW:
 * 1. Extract the token from the cookie or the Authorization header
 * 2. Reject when there is no token to revoke
 * 3. Add the token to the blacklist and clear the cookie
 *
 * @param req - The request object
 * @param res - The response
 * @returns - A confirmation message
 * @POST - /api/auth/logout
 */
async function userLogout(req: Request, res: Response): Promise<void> {
  // 1. read the token the caller is presenting
  const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

  // 2. nothing to revoke
  if (!token) {
    res.status(400).json({ message: "No token found" });
    return;
  }

  // 3. blacklist the token - `upsert` keeps a repeated logout idempotent
  await tokenBlackListModel.updateOne(
    { token },
    { $setOnInsert: { token } },
    { upsert: true },
  );

  res.clearCookie("token");
  res.status(200).json({ message: "User logged out successfully" });
}

/**
 * - Sign out of every device
 * Bumps the user's `tokenVersion`, which every middleware compares against
 * the token it was handed. Every token issued before this call stops working
 * immediately, on every device - including one the owner no longer has.
 *
 * FLOW:
 * 1. Read the caller attached by `authMiddleware`
 * 2. Bump the version and blacklist the current token as well
 * 3. Clear the cookie and confirm
 *
 * @param req - The request object
 * @param res - The response
 * @returns - A confirmation message
 * @POST - /api/auth/logout-all
 */
async function userLogoutAll(req: Request, res: Response): Promise<void> {
  // 1. the caller was attached by the auth middleware
  const user = req.user;

  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // 2. retire every token at once
  await userModel.updateOne(
    { _id: user._id },
    { $inc: { tokenVersion: 1 } },
  );

  const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
  if (token) {
    await tokenBlackListModel.updateOne(
      { token },
      { $setOnInsert: { token } },
      { upsert: true },
    );
  }

  // 3. clear the cookie on this browser too
  res.clearCookie("token");
  res.status(200).json({ message: "Signed out of every device" });
}

/**
 * - Who is signed in
 * The UI used to cache the user from login and had no way to confirm the
 * session was still valid. This is the small "who am I" route that answers
 * that without exposing anything secret.
 *
 * @param req - The request object (the user was attached by the middleware)
 * @param res - The response
 * @GET - /api/auth/me
 */
async function currentUser(req: Request, res: Response): Promise<void> {
  const user = req.user;

  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.status(200).json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      systemUser: user.systemUser,
    },
  });
}

/**
 * - Auth controller
 * Public surface of the auth module, wired up by {@link authRoutes}.
 */
export default {
  userRegister,
  userLogin,
  userLogout,
  userLogoutAll,
  currentUser,
};
