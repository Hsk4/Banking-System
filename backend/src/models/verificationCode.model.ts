import mongoose from "mongoose";

/**
 * - Verification code document shape
 * A short-lived, single-use code emailed to an account owner to confirm a
 * transfer above the step-up threshold. Only the hash of the code is stored,
 * never the code itself, and Mongo deletes the row when it expires.
 */
export interface IVerificationCode {
  /** the user who owns the account the money is leaving */
  user: mongoose.Types.ObjectId;
  /** the account the code authorises a debit from */
  account: mongoose.Types.ObjectId;
  /** the purpose, so one table can serve later flows (password reset, ...) */
  purpose: "LARGE_TRANSFER";
  /** sha-256 of the code - the plain code is only ever in the email */
  codeHash: string;
  /** the amount the code was issued for; a different amount needs a new code */
  amount: number;
  /** when this code stops being accepted */
  expiresAt: Date;
  /** how many wrong guesses were made, so the code can be burned */
  attempts: number;
  /** set once the code has been redeemed - a code works exactly once */
  usedAt: Date | null;
  /** set automatically by `timestamps: true` */
  createdAt: Date;
  /** set automatically by `timestamps: true` */
  updatedAt: Date;
}

/**
 * - Verification code schema
 * Stores the hashed code together with what it authorises.
 */
const verificationCodeSchema = new mongoose.Schema<IVerificationCode>(
  {
    user: {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "User is required"],
      index: true,
    },

    account: {
      ref: "Account",
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Account is required"],
      index: true,
    },

    purpose: {
      type: String,
      enum: ["LARGE_TRANSFER"],
      default: "LARGE_TRANSFER",
      required: true,
    },

    codeHash: {
      type: String,
      required: [true, "Code hash is required"],
    },

    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: 0,
    },

    expiresAt: {
      type: Date,
      required: [true, "Expiry is required"],
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    usedAt: {
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
 * - TTL index
 * An expired code can never be redeemed, so Mongo removes it on its own.
 */
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * - Verification code model
 * Compiled Mongoose model for the `verificationcodes` collection.
 */
const verificationCodeModel = mongoose.model<IVerificationCode>(
  "VerificationCode",
  verificationCodeSchema,
);
export default verificationCodeModel;
