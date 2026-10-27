import mongoose from "mongoose";
import ledgerModel from "./ledger.model";

/**
 * - Account document shape
 * An account is the container that owns a balance and belongs to one or more
 * users (joint accounts). Balances are never stored here - they are derived
 * from the immutable ledger entries so the two can never drift apart.
 */
export interface IAccount {
  /** the user(s) that own this account - empty for a SYSTEM account */
  users: mongoose.Types.ObjectId[];
  /**
   * who the account belongs to: a customer holds their own money, a SYSTEM
   * account is owned by the bank (the treasury) and cannot be touched by
   * customer transfers.
   */
  type: "CUSTOMER" | "SYSTEM";
  /** stable name for a system account, e.g. "TREASURY"; unique when set */
  code?: string;
  /** lifecycle state of the account - only ACTIVE accounts can transact */
  status: "ACTIVE" | "CLOSED" | "FROZEN";
  /** the currency this account is denominated in */
  currency: string;
  /** set automatically by `timestamps: true` */
  createdAt: Date;
  /** set automatically by `timestamps: true` */
  updatedAt: Date;
}

/**
 * - Account instance methods
 * Custom methods attached to every account document.
 */
export interface IAccountMethods {
  /**
   * Derive the current balance of this account from the ledger.
   * Credits minus debits across all ledger entries for the account.
   *
   * @returns the account balance, or `0` when the account has no entries
   */
  getBalance(): Promise<number>;
}

/**
 * - Account schema definition
 * Declares the persisted fields and attaches the `getBalance` instance method.
 */
const accountSchema = new mongoose.Schema<
  IAccount,
  mongoose.Model<IAccount, {}, IAccountMethods>,
  IAccountMethods
>(
  {
    // the user(s) that own this account. A SYSTEM account has no owners, and
    // Mongoose treats an empty array as a missing value, so `required` has to
    // be conditional on the type or the treasury could never be saved.
    users: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      required: [
        function (this: IAccount) {
          return this.type !== "SYSTEM";
        },
        "At least one user is required",
      ],
      index: true,
    },

    // customer accounts hold a person's money; SYSTEM accounts are the bank's
    type: {
      type: String,
      enum: {
        values: ["CUSTOMER", "SYSTEM"],
        message: "Type must be CUSTOMER or SYSTEM",
      },
      default: "CUSTOMER",
      required: [true, "Type is required"],
    },

    // a stable handle for system accounts; unset for every customer account
    code: {
      type: String,
      trim: true,
    },
    // lifecycle state of the account - only ACTIVE accounts can transact
    status: {
      type: String,
      enum: ["ACTIVE", "CLOSED", "FROZEN"],
      default: "ACTIVE",
      required: [true, "Status is required"],
    },

    // the currency this account is denominated in
    currency: {
      type: String,
      required: [true, "Currency is required"],
      default: "PKR",
    },
  },
  {
    // adds `createdAt` and `updatedAt` automatically
    timestamps: true,
  },
);

/**
 * - Owner lookup
 * A user may hold several accounts (one per currency, plus closed/frozen
 * ones they can still read), so this is deliberately NOT unique: only one
 * ACTIVE account per owner is enforced in the controller, with a clear 409.
 */
accountSchema.index({ users: 1, status: 1 });

/**
 * - One account per code
 * A partial index, so the many customer accounts with no `code` do not
 * collide. This is what makes the treasury upsert safe when two instances
 * start at the same time: the loser of the race hits a duplicate key instead
 * of creating a second treasury.
 */
accountSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string" } } },
);

/**
 * - getBalance implementation
 * Aggregates the ledger in a single round-trip: every CREDIT adds to the
 * balance and every DEBIT subtracts from it.
 * See {@link IAccountMethods.getBalance}.
 */
accountSchema.methods.getBalance = async function (this: IAccount &
  mongoose.Document): Promise<number> {
  const balanceData: { balance: number }[] = await ledgerModel.aggregate([
    { $match: { account: this._id } },
    {
      $group: {
        _id: null,
        totalDebit: {
          $sum: {
            $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0],
          },
        },
        totalCredit: {
          $sum: {
            $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        balance: { $subtract: ["$totalCredit", "$totalDebit"] },
      },
    },
  ]);

  // no ledger entries yet - the account has never been funded
  return balanceData[0]?.balance ?? 0;
};

/**
 * - Account model
 * Compiled Mongoose model for the `accounts` collection. The explicit
 * generics keep `getBalance()` on the type of query results.
 */
const accountModel = mongoose.model<
  IAccount,
  mongoose.Model<IAccount, {}, IAccountMethods>
>("Account", accountSchema);

export default accountModel;
