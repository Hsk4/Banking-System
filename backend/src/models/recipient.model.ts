import mongoose from "mongoose";

/**
 * - Saved recipient document shape
 * A payee a customer has chosen to keep, so the next transfer only needs an
 * amount. The recipient is referenced by account and its human account number
 * is copied in, so the list still reads if the account is later closed.
 */
export interface IRecipient {
  /** the customer who saved this payee */
  user: mongoose.Types.ObjectId;
  /** the payee's account */
  account: mongoose.Types.ObjectId;
  /** the payee's short human number at the time it was saved */
  accountNumber: string;
  /** what the owner calls this payee, e.g. "Ayesha K." */
  nickname: string;
  /** set automatically by `timestamps: true` */
  createdAt: Date;
  /** set automatically by `timestamps: true` */
  updatedAt: Date;
}

/**
 * - Saved recipient schema
 * One row per (owner, payee account).
 */
const recipientSchema = new mongoose.Schema<IRecipient>(
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
    },

    accountNumber: {
      type: String,
      required: [true, "Account number is required"],
      trim: true,
    },

    nickname: {
      type: String,
      required: [true, "Nickname is required"],
      trim: true,
      maxlength: [60, "Nickname is too long"],
    },
  },
  {
    // adds `createdAt` and `updatedAt` automatically
    timestamps: true,
  },
);

/**
 * - One saved row per payee
 * Saving the same account twice updates the nickname instead of duplicating
 * the row.
 */
recipientSchema.index({ user: 1, account: 1 }, { unique: true });

/**
 * - Most recent first
 * The transfer form shows the newest saved payees as chips.
 */
recipientSchema.index({ user: 1, updatedAt: -1 });

/**
 * - Saved recipient model
 * Compiled Mongoose model for the `recipients` collection.
 */
const recipientModel = mongoose.model<IRecipient>("Recipient", recipientSchema);
export default recipientModel;
