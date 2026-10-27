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
 * - Format a date and time, e.g. `12 Mar 2026, 14:05`
 * Receipts and history rows need more than the day: two transfers on the same
 * day are otherwise indistinguishable.
 * @param value - an ISO string or Date
 */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * - Group a short account number for display
 * `48217360` reads as `4821 7360`, which is easier to check character by
 * character than a run of eight digits.
 * @param value - the digits, with or without a space
 */
export function formatAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return value;
}

/**
 * - The digits of a typed account number
 * Lets a payer type or paste "4821 7360" or "4821-7360".
 * @param value - whatever was typed
 */
export function accountNumberDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Whether a typed value could be an eight-digit account number. */
export function isAccountNumber(value: string): boolean {
  return accountNumberDigits(value).length === 8;
}

/**
 * - Signed amount for a history row
 * Money in is prefixed `+`, money out `-`, so direction never depends on
 * colour alone.
 * @param amount - the signed amount from the API
 */
export function formatSignedAmount(amount: number): string {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}${formatMoney(Math.abs(amount))}`;
}

/**
 * - Local calendar date as `YYYY-MM-DD`
 * The value an `<input type="date">` holds, and what the history endpoint
 * accepts.
 * @param date - the day
 */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * - Initials for an avatar
 * @param name - a person's full name
 */
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
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
