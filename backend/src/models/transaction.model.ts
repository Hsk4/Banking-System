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
  /**
   * the fee charged on top of the amount. Kept at 0 for now - there is no fee
   * rule yet - but it is part of the record, so a receipt can show it and a
   * later fee never has to be inferred from the ledger.
   */
  fee?: number;
  /**
   * an optional note the payer attached ("Rent, March"). Shown in the history
   * of both sides, so both parties see the same words.
   */
  note?: string;
  /**
   * the reference printed on the receipt, e.g. "TRX-7K2M9QP4". Derived from
   * the id, unique, and cheap for a support agent to read out loud.
   */
  reference?: string;
  /** client-supplied key that makes retried requests safe to repeat */
  idempotencyKey: string;
  /**
   * the moment a completed transfer is held back so the owner can confirm it
   * with an emailed code. Null (or absent) on every row written before the
   * step-up check existed, so old data stays valid.
   */
  holdExpiresAt?: Date | null;
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

    // the fee charged on top of the amount (0 when there is no fee)
    fee: {
      type: Number,
      default: 0,
      min: 0,
    },

    // an optional note attached by the payer, shown to both sides
    note: {
      type: String,
      trim: true,
      maxlength: [140, "Note must be 140 characters or fewer"],
    },

    // the receipt reference, e.g. "TRX-7K2M9QP4"
    reference: {
      type: String,
      trim: true,
      index: true,
    },

    // client-supplied key that makes retried requests safe to repeat.
    // Deliberately NOT unique on its own: the key is only meaningful together
    // with the account it was issued for, and a global unique index let any
    // user burn someone else's key. See the compound index below.
    idempotencyKey: {
      type: String,
      required: [true, "Idempotency key is required"],
      index: true,
    },

    /**
     * the moment a completed transfer is held back so the owner can confirm it
     * with an emailed code. Null (or absent) on every row written before the
     * step-up check existed, so old data stays valid.
     */
    holdExpiresAt: {
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

/**
 * - One key per sending account
 * A retried request carries the same key into the same account, so this is
 * what makes a replay impossible to double-book. Scoping it by
 * `fromAccount` stops one customer from claiming a key another customer
 * already used.
 */
transactionSchema.index({ fromAccount: 1, idempotencyKey: 1 }, { unique: true });

/**
 * - History per account, newest first
 * The history screen and the dashboard's "five latest" both read one side of
 * an account's movements in reverse chronological order.
 */
transactionSchema.index({ fromAccount: 1, createdAt: -1 });
transactionSchema.index({ toAccount: 1, createdAt: -1 });

const transactionModel = mongoose.model<ITransaction>("Transaction", transactionSchema);
export default transactionModel;
