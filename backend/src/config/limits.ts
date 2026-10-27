/**
 * - Money and abuse limits
 * Every number a customer is held to lives here, read once at startup, so the
 * transfer controller, the admin routes and the `/api/transactions/limits`
 * endpoint all quote the same figures. Each one can be overridden from the
 * environment without a code change.
 */

/**
 * Read a positive number from the environment.
 * @param name - the variable name
 * @param fallback - the value used when it is unset or not a number
 */
function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const LIMITS = {
  /** the most a single transfer may move */
  perTransfer: numberFromEnv("LIMIT_PER_TRANSFER", 100_000),

  /**
   * the most one account may send across a rolling 24 hours, which protects
   * the account even when each individual transfer looks ordinary
   */
  dailyPerAccount: numberFromEnv("LIMIT_DAILY_PER_ACCOUNT", 250_000),

  /**
   * above this, a transfer needs a code emailed to the account owner. Held
   * below the daily cap, so a large transfer is possible but deliberate
   */
  stepUpThreshold: numberFromEnv("LIMIT_STEP_UP_THRESHOLD", 50_000),

  /** how long an emailed code stays valid */
  stepUpCodeTtlMinutes: numberFromEnv("STEP_UP_CODE_TTL_MINUTES", 10),

  /** how many wrong codes may be tried before the code is burned */
  stepUpCodeAttempts: numberFromEnv("STEP_UP_CODE_ATTEMPTS", 5),

  /** failed logins allowed before the email is paused */
  loginFailures: numberFromEnv("LOGIN_MAX_FAILURES", 5),
  /** how long the pause lasts */
  loginLockMinutes: numberFromEnv("LOGIN_LOCK_MINUTES", 15),
  /** failures older than this no longer count towards a lockout */
  loginWindowMinutes: numberFromEnv("LOGIN_WINDOW_MINUTES", 15),

  /** requests allowed per window, per IP, on each public auth route */
  authRequestsPerWindow: numberFromEnv("RATE_AUTH_MAX", 10),
  /** window length for the auth routes */
  authWindowMinutes: numberFromEnv("RATE_AUTH_WINDOW_MINUTES", 10),

  /** transfers and recipient lookups, per signed-in user */
  userRequestsPerWindow: numberFromEnv("RATE_USER_MAX", 30),
  /** window length for the per-user routes */
  userWindowMinutes: numberFromEnv("RATE_USER_WINDOW_MINUTES", 10),
} as const;

/** The rolling window the daily cap is measured over. */
export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

export default LIMITS;
