import mongoose from "mongoose";

/**
 * - Blacklisted token document shape
 * A revoked JWT. Checked by the auth middleware so a logged-out token stops
 * working before its natural expiry.
 */
export interface IBlacklistedToken {
  /** the raw JWT string that has been revoked */
  token: string;
  /** set by `timestamps: true` */
  createdAt: Date;
  /** set automatically by `timestamps: true` */
  updatedAt: Date;
}

/**
 * - Blacklisted token schema
 * Stores one document per revoked token.
 */
const tokenBlacklistSchema = new mongoose.Schema<IBlacklistedToken>(
  {
    token: {
      type: String,
      required: [true, "Token is required to blacklist"],
      unique: [true, "Token is already blacklisted"],
    },
  },
  {
    // adds `createdAt` and `updatedAt` automatically
    timestamps: true,
  },
);

/**
 * - TTL index
 * Revoked tokens are dropped automatically after 3 days, which matches the
 * 3-day lifetime of issued JWTs - there is no reason to remember them longer.
 */
tokenBlacklistSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 3 },
);

/**
 * - Blacklisted token model
 * Compiled Mongoose model for the `tokenblacklists` collection.
 */
const tokenBlackListModel = mongoose.model<IBlacklistedToken>(
  "tokenBlackList",
  tokenBlacklistSchema,
);

export default tokenBlackListModel;
