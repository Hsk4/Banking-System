import mongoose from "mongoose";

/**
 * - Transaction document shape
 * Represents a single money movement between two accounts. The transaction
 * is the "header" record; the actual balance changes are written as paired
 * DEBIT/CREDIT entries in the {@link ledgerModel}.
 */
export interface ITransaction {
  /** the account the money leaves from */
  fromAccount: mongoose.Types.ObjectId;
  /** the account the money arrives in */
  toAccount: mongoose.Types.ObjectId;
  /** lifecycle state of the transaction */
  status: "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";
  /** the amount being moved, stated in the account's currency */
  amount: number;
  /** client-supplied key that makes retried requests safe to repeat */
  idempotencyKey: string;
  /** set automatically by `timestamps: true` */
  createdAt: Date;
  /** set automatically by `timestamps: true` */
  updatedAt: Date;
}

/**
 * - Transaction schema definition
 * Declares the header record for a transfer.
 */
const transactionSchema = new mongoose.Schema<ITransaction>(
  {
    // the account the money leaves from
    fromAccount: {
      ref: "Account",
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "From account is required"],
      index: true,
    },
    // the account the money arrives in
    toAccount: {
      ref: "Account",
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "To account is required"],
      index: true,
    },

    // lifecycle state of the transaction
    status: {
      type: String,
      enum: {
        values: ["PENDING", "COMPLETED", "FAILED", "REVERSED"],
        message: "Status must be one of PENDING, COMPLETED, FAILED, or REVERSED",
      },
      default: "PENDING",
    },

    // the amount being moved, stated in the account's currency
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount must be a positive number"],
    },

    // client-supplied key that makes retried requests safe to repeat
    idempotencyKey: {
      type: String,
      required: [true, "Idempotency key is required"],
      index: true,
      unique: true,
    },
  },
  {
    // adds `createdAt` and `updatedAt` automatically
    timestamps: true,
  },
);

/**
 * - Transaction model
 * Compiled Mongoose model for the `transactions` collection.
 * The unique index on `idempotencyKey` is the last line of defence against
 * a duplicate transfer slipping through a concurrent request.
 */
const transactionModel = mongoose.model<ITransaction>("Transaction", transactionSchema);
export default transactionModel;
