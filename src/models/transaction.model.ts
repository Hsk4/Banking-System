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
  /**
   * what produced the movement: a customer TRANSFER, or FUNDING issued by an
   * administrator out of the treasury. Optional so rows written before the
   * field existed stay valid.
   */
  kind?: "TRANSFER" | "FUNDING";
  /** the user who asked for it (a customer, or the administrator funding) */
  initiatedBy?: mongoose.Types.ObjectId;
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

    // what produced the movement - old rows have no value and default to a
    // transfer when read
    kind: {
      type: String,
      enum: {
        values: ["TRANSFER", "FUNDING"],
        message: "Kind must be TRANSFER or FUNDING",
      },
      default: "TRANSFER",
    },

    // the user who initiated the movement
    initiatedBy: {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
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
/**
 * - Recent-first history per kind
 * Supports the admin history screen: "the newest FUNDING transactions", and
 * the same for transfers, without scanning the collection.
 */
transactionSchema.index({ kind: 1, createdAt: -1 });

const transactionModel = mongoose.model<ITransaction>("Transaction", transactionSchema);
export default transactionModel;
