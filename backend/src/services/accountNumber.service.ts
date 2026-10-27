import { randomInt } from "node:crypto";
import type mongoose from "mongoose";
import accountModel from "../models/account.model";

/**
 * - Short account numbers
 * A payer should never have to handle a 24-character database id. Every
 * account gets an eight-digit number, shown in two groups ("4821 7360") and
 * stored without the space, so it can be read over the phone or pasted.
 *
 * The Mongo `_id` stays the internal handle: the number is only a routing
 * key, which is why the name-check endpoint returns nothing but a masked
 * name and a status.
 */

/** How many digits a customer account number has. */
const ACCOUNT_NUMBER_LENGTH = 8;

/** How many times to retry when a generated number is already taken. */
const MAX_ATTEMPTS = 10;

/**
 * - Generate a random account number
 * The first digit is 1-9 so it can never be mistaken for a short id or a
 * left-padded amount, and the rest are uniform.
 */
function randomAccountNumber(): string {
  const first = randomInt(1, 10);
  let rest = "";
  for (let index = 1; index < ACCOUNT_NUMBER_LENGTH; index += 1) {
    rest += String(randomInt(0, 10));
  }
  return `${first}${rest}`;
}

/**
 * - Format an account number for display
 * @param accountNumber - the stored digits, e.g. "48217360"
 * @returns the grouped form, e.g. "4821 7360"
 */
export function formatAccountNumber(accountNumber: string): string {
  if (accountNumber.length === ACCOUNT_NUMBER_LENGTH) {
    return `${accountNumber.slice(0, 4)} ${accountNumber.slice(4)}`;
  }
  return accountNumber;
}

/**
 * - Normalise what a payer typed
 * Accepts "4821 7360", "4821-7360" and "48217360"; strips everything that is
 * not a digit.
 *
 * @param input - the raw value from a form or a URL
 * @returns the digits, or `null` when it is not a plausible account number
 */
export function normaliseAccountNumber(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length !== ACCOUNT_NUMBER_LENGTH) return null;
  return digits;
}

/**
 * - Mask a person's name
 * The name-check endpoint must reveal enough to catch a typo and nothing more:
 * the first word plus an initial ("Ayesha K."), or just an initial when the
 * name is a single word.
 *
 * @param name - the full name from the user record
 * @returns the masked name, never the full one
 */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Account holder";
  const first = parts[0] ?? "";
  if (parts.length === 1) {
    return `${first.slice(0, 1).toUpperCase()}.`;
  }
  const lastInitial = (parts[parts.length - 1] ?? "").slice(0, 1).toUpperCase();
  return `${first} ${lastInitial}.`;
}

/**
 * - Assign an account number
 * Retries on a duplicate key, which is what the unique index is for. Safe to
 * call on an existing document: it only fills the field when it is missing.
 *
 * @param account - the account document to save
 * @throws {Error} when ten generated numbers in a row were already taken
 */
export async function assignAccountNumber(account: {
  accountNumber?: string;
  save: () => Promise<unknown>;
}): Promise<void> {
  if (account.accountNumber) {
    await account.save();
    return;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    account.accountNumber = randomAccountNumber();
    try {
      await account.save();
      return;
    } catch (error) {
      const duplicate =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: number }).code === 11000;
      if (!duplicate) throw error;
      // the number was taken between the check and the write - try another
      account.accountNumber = undefined;
    }
  }

  throw new Error("Could not allocate a unique account number");
}

/**
 * - Backfill account numbers
 * Called once at startup. Rows created before the field existed get a number
 * here, so the change needs no manual migration. Uses a lean cursor rather
 * than `updateMany` because each number has to be unique.
 *
 * @returns how many accounts were given a number
 */
export async function backfillAccountNumbers(): Promise<number> {
  const missing = await accountModel.find({
    $or: [
      { accountNumber: { $exists: false } },
      { accountNumber: null },
      { accountNumber: "" },
    ],
  });

  let assigned = 0;
  for (const account of missing) {
    try {
      await assignAccountNumber(account);
      assigned += 1;
    } catch (error) {
      // one stubborn row must not stop the server from booting; it will be
      // retried on the next start
      console.error("Could not assign an account number", {
        accountId: (account as unknown as { _id: mongoose.Types.ObjectId })._id,
        error,
      });
    }
  }

  return assigned;
}

export default {
  assignAccountNumber,
  backfillAccountNumbers,
  formatAccountNumber,
  normaliseAccountNumber,
  maskName,
};
