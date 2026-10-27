import { createHash, randomInt } from "node:crypto";
import type mongoose from "mongoose";
import LIMITS from "../config/limits";
import verificationCodeModel from "../models/verificationCode.model";
import emailService from "./email.service";

/**
 * - Step-up verification for large transfers
 * A transfer above {@link LIMITS.stepUpThreshold} is written as COMPLETED but
 * held (`holdExpiresAt`), and a six-digit code goes to the account owner's
 * email. Only the hash of the code is stored. Redeeming it releases the hold;
 * letting it expire leaves the transaction PENDING and the money untouched,
 * because nothing is posted until it is released.
 */

/** The letters and digits a reference is built from - no look-alikes. */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * - Build a receipt reference from a transaction id
 * Deterministic, so a receipt can show the same reference without storing
 * anything extra, and short enough to read out over the phone.
 *
 * @param id - the transaction id
 */
export function referenceFor(id: mongoose.Types.ObjectId | string): string {
  const hex = id.toString();
  let value = BigInt(`0x${hex}`);
  const base = BigInt(REFERENCE_ALPHABET.length);
  let out = "";

  while (out.length < 8 && value > 0n) {
    out = REFERENCE_ALPHABET[Number(value % base)] + out;
    value /= base;
  }

  // pad short ids so every reference is the same width
  return `TRX-${out.padStart(8, "2")}`;
}

/**
 * - Hash a code
 * Only the hash is ever stored, so a database leak does not reveal codes.
 *
 * @param code - the plain six-digit code
 */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * - Issue a code for a held transfer
 * Replaces any older unsettled code for the same account, so only the newest
 * email works.
 *
 * @param input - who, which account, and the amount being confirmed
 * @returns the expiry, so the response can tell the customer how long it lasts
 */
export async function issueCode(input: {
  userId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  amount: number;
  email: string;
  name: string;
  /** the amount as written in the email, e.g. "PKR 75,000.00" */
  amountLabel: string;
}): Promise<{ expiresAt: Date }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(
    Date.now() + LIMITS.stepUpCodeTtlMinutes * 60 * 1000,
  );

  // one live code per account: an earlier email must not stay valid
  await verificationCodeModel.deleteMany({
    account: input.accountId,
    purpose: "LARGE_TRANSFER",
  });

  await verificationCodeModel.create({
    user: input.userId,
    account: input.accountId,
    purpose: "LARGE_TRANSFER",
    codeHash: hashCode(code),
    amount: input.amount,
    expiresAt,
  });

  // the mail must not turn a successful issue into an error response
  try {
    await emailService.sendStepUpCodeEmail(
      input.email,
      input.name,
      code,
      input.amountLabel,
      LIMITS.stepUpCodeTtlMinutes,
    );
  } catch {
    // logged by the mail service; the code is still stored and can be resent
  }

  return { expiresAt };
}

/** Why a code was rejected, so the controller can answer precisely. */
export type CodeFailure =
  | "NO_CODE"
  | "EXPIRED"
  | "BAD_CODE"
  | "TOO_MANY_ATTEMPTS"
  | "ALREADY_USED";

/**
 * - Redeem a code
 * A code works once, only for the amount it was issued for, and only for a
 * few wrong guesses.
 *
 * @param input - the account, the amount and the code the customer typed
 * @returns `{ ok: true }` or the reason it was refused
 */
export async function redeemCode(input: {
  accountId: mongoose.Types.ObjectId;
  amount: number;
  code: string;
}): Promise<{ ok: true } | { ok: false; reason: CodeFailure }> {
  const record = await verificationCodeModel.findOne({
    account: input.accountId,
    purpose: "LARGE_TRANSFER",
    usedAt: null,
  });

  if (!record) return { ok: false, reason: "NO_CODE" };
  if (record.usedAt) return { ok: false, reason: "ALREADY_USED" };
  if (record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (record.attempts >= LIMITS.stepUpCodeAttempts) {
    return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
  }

  // an amount that changed after the code was sent needs a fresh code
  if (Math.round(record.amount * 100) !== Math.round(input.amount * 100)) {
    return { ok: false, reason: "BAD_CODE" };
  }

  if (hashCode(input.code.trim()) !== record.codeHash) {
    await verificationCodeModel.updateOne(
      { _id: record._id },
      { $inc: { attempts: 1 } },
    );
    return { ok: false, reason: "BAD_CODE" };
  }

  record.usedAt = new Date();
  await record.save();
  return { ok: true };
}

export default { issueCode, redeemCode, referenceFor };
