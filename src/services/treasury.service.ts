import accountModel from "../models/account.model";

/** The stable code that identifies the bank's treasury account. */
export const TREASURY_CODE = "TREASURY";

/**
 * - Make sure the treasury account exists
 * Called once at startup. Every PKR the system issues is paid out of this
 * account, so it deliberately has no spending limit: its balance is always
 * negative and equals the total money created. Balances are derived from the
 * ledger, so that holds without any extra bookkeeping.
 *
 * `findOneAndUpdate` with `upsert` is safe to run on every boot and safe when
 * two instances start together: the unique partial index on `code` lets the
 * loser of the race fail instead of creating a second treasury.
 *
 * @returns the treasury account document
 */
export async function ensureTreasury() {
  return accountModel.findOneAndUpdate(
    { code: TREASURY_CODE },
    {
      $setOnInsert: {
        type: "SYSTEM",
        code: TREASURY_CODE,
        // no owners - `users` is only required for CUSTOMER accounts
        users: [],
        status: "ACTIVE",
        currency: "PKR",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * - Read the treasury account
 * @returns the treasury account document
 * @throws {Error} when it is missing - funding must not fall back to some
 *   other account, because the treasury balance is the money supply
 */
export async function getTreasury() {
  const treasury = await accountModel.findOne({ code: TREASURY_CODE });

  if (!treasury) {
    throw new Error(
      "Treasury account is missing; it should be created at startup by ensureTreasury()",
    );
  }

  return treasury;
}

export default { ensureTreasury, getTreasury, TREASURY_CODE };
