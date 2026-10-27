import LIMITS from "../config/limits";
import loginAttemptModel from "../models/loginAttempt.model";

/**
 * - Login lockout
 * Counts failed sign-ins per email. After {@link LIMITS.loginFailures}
 * failures inside the window the email is paused for
 * {@link LIMITS.loginLockMinutes}, and the owner is emailed once so a real
 * person learns someone is guessing their password.
 *
 * The pause follows the email rather than the IP: attempts from a hundred
 * addresses still stop at the same account.
 */

/** A lock that is in force right now. */
export interface ActiveLock {
  /** how many seconds the caller has to wait */
  retryAfterSeconds: number;
}

/**
 * - Is this email currently paused?
 * @param email - the address being signed into
 * @returns the lock when one is in force, otherwise `null`
 */
export async function activeLock(email: string): Promise<ActiveLock | null> {
  const record = await loginAttemptModel.findOne({
    email: email.toLowerCase().trim(),
  });

  if (!record?.lockedUntil) return null;

  const remainingMs = record.lockedUntil.getTime() - Date.now();
  if (remainingMs <= 0) return null;

  return { retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
}

/**
 * - Record a failed sign-in
 * Starts a window on the first failure, then locks the email once the count
 * reaches the limit.
 *
 * @param email - the address that was tried
 * @param onLock - called once, when this failure triggered the lockout
 * @returns the lock now in force, or `null` when the caller may still retry
 */
export async function recordFailure(
  email: string,
  onLock: () => Promise<void>,
): Promise<ActiveLock | null> {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const windowMs = LIMITS.loginWindowMinutes * 60 * 1000;
  const lockMs = LIMITS.loginLockMinutes * 60 * 1000;

  const existing = await loginAttemptModel.findOne({ email: key });

  // a window that has gone stale starts over, so yesterday's mistakes do not
  // count against a person signing in today
  const stale =
    !existing ||
    now - existing.firstFailedAt.getTime() > windowMs ||
    (existing.lockedUntil !== null && existing.lockedUntil.getTime() <= now);

  if (stale) {
    // a lock that has just expired is cleared so the next window is honest
    await loginAttemptModel.findOneAndUpdate(
      { email: key },
      {
        $set: {
          failed: 1,
          firstFailedAt: new Date(now),
          lockedUntil: null,
        },
      },
      { upsert: true },
    );
    return null;
  }

  const failed = existing.failed + 1;

  if (failed < LIMITS.loginFailures) {
    await loginAttemptModel.updateOne({ email: key }, { $set: { failed } });
    return null;
  }

  // the limit is reached: pause the email
  const lockedUntil = new Date(now + lockMs);
  await loginAttemptModel.updateOne(
    { email: key },
    { $set: { failed, lockedUntil } },
  );

  try {
    await onLock();
  } catch {
    // the mail is a courtesy - a mail failure must not unlock the account
  }

  return { retryAfterSeconds: Math.ceil(lockMs / 1000) };
}

/**
 * - Clear the counter after a good sign-in
 * A correct password resets the window, so a person who mistyped twice is not
 * one slip away from a lockout hours later.
 *
 * @param email - the address that signed in successfully
 */
export async function clearFailures(email: string): Promise<void> {
  await loginAttemptModel.deleteOne({ email: email.toLowerCase().trim() });
}

export default { activeLock, recordFailure, clearFailures };
