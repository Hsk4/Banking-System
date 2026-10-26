/**
 * Formatting helpers shared by every screen.
 * Currency is always PKR and dates use `en-GB` ("12 Mar 2026"), per the spec.
 */

const decimalFormatter = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `en-PK` resolves to the ISO "PKR" code, so the spec's `PKR 2,500.00` is
 * rebuilt from the digit parts rather than taken from the currency symbol.
 */
const CURRENCY_PREFIX = "PKR";

/**
 * Fractions are dropped when zero (`PKR 2,750`), to keep cards calm.
 * Two decimals are kept otherwise, so `PKR 2,500.00`-style figures line up.
 */
function compactDigits(value: number): string {
  return Number.isInteger(value)
    ? new Intl.NumberFormat("en-PK").format(Math.abs(value))
    : decimalFormatter.format(Math.abs(value));
}

/** Negative numbers keep a minus in front of the prefix. */
function signOf(value: number): string {
  return value < 0 ? "-" : "";
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Format an amount as PKR, e.g. `2500` becomes `PKR 2,500.00`. Used where the
 * currency is part of the string: receipts, summaries, dropdown options.
 * @param amount - the monetary value
 * @returns the formatted currency string, always with two decimals
 */
export function formatMoney(amount: number): string {
  return `${signOf(amount)}${CURRENCY_PREFIX} ${decimalFormatter.format(Math.abs(amount))}`;
}

/**
 * The digits alone, grouped, with no currency prefix - used where `PKR` is
 * rendered as a separate muted label (large balances). Whole amounts drop the
 * decimals here so the balance stays readable.
 * @param amount - the monetary value
 * @returns e.g. `2,500` or `2,500.50`
 */
export function formatAmount(amount: number): string {
  return `${signOf(amount)}${compactDigits(amount)}`;
}

/**
 * Format a date for display, e.g. `2026-03-12T…` becomes `12 Mar 2026`.
 * @param value - an ISO date string or Date
 * @returns the formatted date
 */
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

/**
 * Shorten a long identifier, keeping both ends so two IDs are still easy to
 * tell apart at a glance.
 * @param id - the full identifier
 * @param visible - how many characters show at the end (at least 6)
 * @returns e.g. `…9f3a2b1c`, or `64b8…2b1c` for the long form on the dashboard
 */
export function shortId(id: string, visible = 6): string {
  if (id.length <= visible) return id;
  // the dashboard asks for 12: show a head as well, truncated in the middle
  if (visible >= 12) return `${id.slice(0, 4)}…${id.slice(-8)}`;
  return `…${id.slice(-visible)}`;
}

/** Whether a string looks like a Mongo ObjectId (24 hex characters). */
export function isObjectId(value: string): boolean {
  return /^[0-9a-f]{24}$/i.test(value);
}

/**
 * Turn a client error into a sentence worth showing to a user.
 * @param error - anything thrown by the API layer
 * @returns the message to render
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
