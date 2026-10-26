import mongoose from "mongoose";

/**
 * - Ledger document shape
 * An append-only record of every balance-changing event. Each transaction
 * produces two entries: a DEBIT on the sender's account and a matching
 * CREDIT on the receiver's account. Balances are calculated by summing
 * these entries, so this collection is the source of truth for money.
 */
export interface ILedger {
  /** the account this entry applies to */
  account: mongoose.Types.ObjectId;
  /** the value moved by this entry */
  amount: number;
  /** the transaction that produced this entry */
  transaction: mongoose.Types.ObjectId;
  /** which side of the double-entry the entry represents */
  type: "DEBIT" | "CREDIT";
  /** set automatically by `timestamps: true` */
  createdAt: Date;
  /** set automatically by `timestamps: true` */
  updatedAt: Date;
}

/**
 * - Ledger schema definition
 * Declares the append-only ledger entries.
 */
const ledgerSchema = new mongoose.Schema<ILedger>(
  {
    // the account this entry applies to
    account: {
      ref: "Account",
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Account is required"],
      index: true,
      // ledger entries must never be rewritten once written
      immutable: true,
    },

    // the value moved by this entry
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount must be a positive number"],
    },

    // the transaction that produced this entry
    transaction: {
      ref: "Transaction",
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Transaction is required"],
      index: true,
      immutable: true,
    },

    // which side of the double-entry the entry represents
    type: {
      type: String,
      enum: ["DEBIT", "CREDIT"],
      required: [true, "Type is required"],
    },
  },
  {
    // adds `createdAt` and `updatedAt` automatically
    timestamps: true,
  },
);

/**
 * - One entry per (account, transaction, type)
 * A transaction may debit an account at most once per entry type, which is
 * the database-level guard against a retried transfer booking twice.
 */
ledgerSchema.index({ account: 1, transaction: 1, type: 1 }, { unique: true });

/**
 * - Block ledger mutations
 * Rejects any update, replace, or delete on the ledger. Entries may only be
 * inserted, which keeps the ledger strictly append-only: a mistake is
 * corrected by writing a reversing entry, never by editing history.
 *
 * @throws {Error} always - the mutation is never allowed to proceed
 */
function preventLedgerMutation(): never {
  throw new Error(
    "Ledger entries are immutable and cannot be modified or deleted",
  );
}

// block every update/replace/delete path - ledger entries may only be inserted
ledgerSchema.pre("findOneAndUpdate", preventLedgerMutation);
ledgerSchema.pre("updateOne", preventLedgerMutation);
ledgerSchema.pre("updateMany", preventLedgerMutation);
ledgerSchema.pre("deleteOne", preventLedgerMutation);
ledgerSchema.pre("deleteMany", preventLedgerMutation);
ledgerSchema.pre("findOneAndDelete", preventLedgerMutation);
// NOTE: the "findOneAndRemove" and "remove" hooks were dropped - they no longer
// exist in Mongoose 9 and registering them is a type error.
ledgerSchema.pre("findOneAndReplace", preventLedgerMutation);
ledgerSchema.pre("replaceOne", preventLedgerMutation);

/**
 * - Ledger model
 * Compiled Mongoose model for the `ledgers` collection.
 */
const ledgerModel = mongoose.model<ILedger>("Ledger", ledgerSchema);
export default ledgerModel;
