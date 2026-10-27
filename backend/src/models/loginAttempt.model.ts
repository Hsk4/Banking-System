import mongoose from "mongoose";

/**
 * - Login attempt counter shape
 * One document per email that has recently failed to sign in. After a few
 * failures the email is paused for a few minutes, which stops a password
 * being guessed for long enough to try a list of them.
 *
 * Keyed by the email rather than the IP so a lockout follows the account even
 * when the attempts come from different addresses.
 */
export interface ILoginAttempt {
  /** the lower-cased email that is being tried */
  email: string;
  /** how many failures are inside the current window */
  failed: number;
  /** the first failure in the current window, used to expire it */
  firstFailedAt: Date;
  /** while this is in the future the email cannot sign in - null when unlocked */
  lockedUntil: Date | null;
  /** set automatically by `timestamps: true` */
  createdAt: Date;
  /** set automatically by `timestamps: true` */
  updatedAt: Date;
}

/**
 * - Login attempt schema
 * Stores the failure count and the lockout deadline for one email.
 */
const loginAttemptSchema = new mongoose.Schema<ILoginAttempt>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    failed: {
      type: Number,
      default: 0,
      min: 0,
    },

    firstFailedAt: {
      type: Date,
      required: [true, "First failure time is required"],
    },

    // null means "not locked", which is different from a lock that has expired
    lockedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    // adds `createdAt` and `updatedAt` automatically
    timestamps: true,
  },
);

/**
 * - Housekeeping index
 * A counter for an email that has not failed for a day is no longer useful -
 * Mongo drops it automatically so the collection stays small.
 */
loginAttemptSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 },
);

/**
 * - Login attempt model
 * Compiled Mongoose model for the `loginattempts` collection.
 */
const loginAttemptModel = mongoose.model<ILoginAttempt>(
  "LoginAttempt",
  loginAttemptSchema,
);
export default loginAttemptModel;
