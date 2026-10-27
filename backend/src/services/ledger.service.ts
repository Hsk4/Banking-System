import mongoose from "mongoose";
import ledgerModel from "../models/ledger.model";

/**
 * - One side of a double entry
 * A positive `amount` on the account named here, on the side named by `type`.
 */
export interface LedgerEntry {
  /** the account the entry applies to */
  account: mongoose.Types.ObjectId | string;
  /** how much moves - always greater than zero */
  amount: number;
  /** DEBIT takes the money out of the account, CREDIT puts it in */
  type: "DEBIT" | "CREDIT";
}

/**
 * - Write the balanced entries for a transaction
 * The single place in the codebase that inserts into the ledger. Nothing else
 * calls `ledgerModel.create`, so every posting goes through this check.
 *
 * The entries are rejected unless total debits equal total credits: a booking
 * that does not balance means money was created or destroyed, and no such
 * write may reach the database.
 *
 * @param session - the session the caller's transaction is already running in
 * @param transactionId - the transaction header these entries belong to
 * @param entries - the two or more sides of the movement
 * @returns the inserted ledger documents
 * @throws {Error} when the entries do not balance, when any amount is not
 *   greater than zero, or when fewer than two entries are supplied
 */
export async function postEntries(
  session: mongoose.ClientSession,
  transactionId: mongoose.Types.ObjectId | string,
  entries: LedgerEntry[],
) {
  if (entries.length < 2) {
    throw new Error(
      `A posting needs at least two entries, received ${entries.length}`,
    );
  }

  let debits = 0;
  let credits = 0;

  for (const entry of entries) {
    // zero or negative amounts would let a posting "balance" while moving
    // nothing, or move money in the wrong direction
    if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
      throw new Error(
        `Ledger amounts must be greater than zero, received ${entry.amount}`,
      );
    }
    if (entry.type === "DEBIT") {
      debits += entry.amount;
    } else if (entry.type === "CREDIT") {
      credits += entry.amount;
    } else {
      throw new Error(`Unknown ledger entry type: ${String(entry.type)}`);
    }
  }

  // to the cent: floating point sums of money are not exact
  if (Math.round(debits * 100) !== Math.round(credits * 100)) {
    throw new Error(
      `Unbalanced posting: debits ${debits} do not equal credits ${credits}`,
    );
  }

  // A posting is always two documents, and Mongoose 9 refuses `create()` with
  // a session and multiple documents unless `ordered` is set. Ordered is also
  // what we want: the entries belong to one transaction, so if the second
  // insert fails the whole session is rolled back by the caller.
  return ledgerModel.create(
    entries.map((entry) => ({
      account: entry.account,
      amount: entry.amount,
      transaction: transactionId,
      type: entry.type,
    })),
    { session, ordered: true },
  );
}

export default { postEntries };
