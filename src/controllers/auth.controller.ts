import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import userModel from "../models/user.model";
import tokenBlackListModel from "../models/blacklist.model";
import emailService from "../services/email.service";

/** how long an issued JWT stays valid */
const TOKEN_EXPIRES_IN = "3d";

/**
 * - Sign a session token
 * @param userId - the id of the user the token belongs to
 * @returns a signed JWT carrying the user id
 * @throws {Error} when `JWT_SECRET` is not configured
 */
function signToken(userId: unknown): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return jwt.sign({ id: userId }, secret, { expiresIn: TOKEN_EXPIRES_IN });
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
  const token = signToken(user._id);
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

  // 3. if the user does not exist, return an error
  if (!user) {
    res.status(400).json({ message: "User does not exist", status: "failed" });
    return;
  }

  // 4. check the password against the stored hash
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    res.status(400).json({ message: "Invalid credentials", status: "failed" });
    return;
  }

  // 5. sign a token, set the cookie, and return the user data
  const token = signToken(user._id);
  setAuthCookie(res, token);

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
 * - Auth controller
 * Public surface of the auth module, wired up by {@link authRoutes}.
 */
export default {
  userRegister,
  userLogin,
  userLogout,
};
