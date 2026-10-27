import mongoose, { type QueryFilter } from "mongoose";
import accountModel from "../models/account.model";
import ledgerModel, { type ILedger } from "../models/ledger.model";
import transactionModel from "../models/transaction.model";
import userModel from "../models/user.model";
import { formatAccountNumber } from "./accountNumber.service";

/**
 * - Account history
 * Builds the list a customer reads: one row per ledger entry on their
 * account, newest first, with the counterparty, the signed amount, the status
 * and the balance immediately after that entry.
 *
 * The ledger is append-only, so "balance after" is exact: it is the running
 * total of every entry up to and including this one. Pages use a keyset cursor
 * (`createdAt` + `_id`) rather than an offset, so a transfer landing while a
 * customer pages through does not shuffle rows or duplicate them.
 */

/** Which entries to include. */
export type Direction = "all" | "in" | "out";

/** One row of history, as the API returns it. */
export interface HistoryEntry {
  /** the ledger entry id, used as its stable key */
  id: string;
  /** the transaction header this entry belongs to */
  transactionId: string;
  /** the reference printed on the receipt */
  reference: string | null;
  /** when the money moved */
  createdAt: string;
  /** CREDIT is money in, DEBIT is money out */
  direction: "CREDIT" | "DEBIT";
  /** the signed amount: negative for money out */
  amount: number;
  /** the balance of this account right after the entry */
  balanceAfter: number;
  /** the transaction status */
  status: string;
  /** TRANSFER or FUNDING */
  kind: string;
  /** an optional note from the payer */
  note: string | null;
  /** the account on the other side */
  counterparty: {
    /** the other account's short number, e.g. "4821 7360" */
    accountNumber: string | null;
    /** the other side's masked human name ("Ayesha K.") or "Treasury" */
    name: string;
    /** the other account's status, so a frozen payee is visible */
    status: string;
    /** whether the money came in or went out relative to this account */
    direction: "in" | "out";
  } | null;
}

/** What {@link listAccountHistory} is asked for. */
export interface HistoryQuery {
  accountId: mongoose.Types.ObjectId;
  /** how many rows to return */
  limit: number;
  /** opaque cursor from the previous page, or null for the first */
  cursor: string | null;
  /** all, money in, or money out */
  direction: Direction;
  /** ISO date, inclusive - only entries on or after this day */
  from: Date | null;
  /** ISO date, inclusive - only entries on or before this day */
  to: Date | null;
}

/** A page of history plus what the next page needs. */
export interface HistoryPage {
  entries: HistoryEntry[];
  /** pass as `cursor` to get the next page; null when this was the last */
  nextCursor: string | null;
}

/** The internal shape of a cursor. */
interface CursorPayload {
  t: string;
  i: string;
}

/**
 * - Encode a cursor
 * Opaque to the client, so the paging strategy can change without a new API
 * version. Base64url keeps it safe in a query string.
 *
 * @param createdAt - the entry's timestamp
 * @param id - the entry's id
 */
export function encodeCursor(
  createdAt: Date,
  id: mongoose.Types.ObjectId,
): string {
  const payload: CursorPayload = {
    t: createdAt.toISOString(),
    i: id.toString(),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * - Decode a cursor
 * @param cursor - the string the client sent back
 * @returns the timestamp and id to page after, or `null` when it is malformed
 */
export function decodeCursor(
  cursor: string,
): { createdAt: Date; id: mongoose.Types.ObjectId } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<CursorPayload>;

    if (typeof parsed.t !== "string" || typeof parsed.i !== "string") {
      return null;
    }

    const createdAt = new Date(parsed.t);
    if (
      Number.isNaN(createdAt.getTime()) ||
      !mongoose.isValidObjectId(parsed.i)
    ) {
      return null;
    }

    return { createdAt, id: new mongoose.Types.ObjectId(parsed.i) };
  } catch {
    return null;
  }
}

/**
 * - Mask a person's name for the counterparty line
 * Reuses the same rule as the lookup endpoint so both screens read alike.
 *
 * @param name - the full name
 */
function maskCounterparty(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Account holder";
  const first = parts[0] ?? "";
  if (parts.length === 1) return `${first.slice(0, 1).toUpperCase()}.`;
  return `${first} ${(parts[parts.length - 1] ?? "").slice(0, 1).toUpperCase()}.`;
}

/**
 * - Fetch one page of an account's history
 * Reads the ledger for the account (the source of truth for money), joins the
 * transaction headers, then resolves the counterparty for each row.
 *
 * @param query - the account, page size, cursor and filters
 * @returns the rows with their balance after, plus the next cursor
 */
export async function listAccountHistory(
  query: HistoryQuery,
): Promise<HistoryPage> {
  const { accountId, limit, cursor, direction, from, to } = query;

  // base filter: one account, optionally one side only
  const filter: QueryFilter<ILedger> = { account: accountId };

  if (direction === "in") filter.type = "CREDIT";
  if (direction === "out") filter.type = "DEBIT";

  // the date range is inclusive of both ends
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = from;
    if (to) {
      // the `to` date is a day: include all of it
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      range.$lte = end;
    }
    filter.createdAt = range;
  }

  // keyset paging: strictly after the last row of the previous page
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      filter.$or = [
        { createdAt: { $lt: decoded.createdAt } },
        { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
      ];
    }
  }

  // one extra row tells us whether there is another page
  const rows = await ledgerModel
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  if (page.length === 0) {
    return { entries: [], nextCursor: null };
  }

  const transactionIds = page.map((row) => row.transaction);
  const transactions = await transactionModel
    .find({ _id: { $in: transactionIds } })
    .lean();
  const transactionById = new Map(
    transactions.map((transaction) => [
      transaction._id.toString(),
      transaction,
    ]),
  );

  // the other side of each movement
  const otherAccountIds = new Set<string>();
  for (const transaction of transactions) {
    otherAccountIds.add(transaction.fromAccount.toString());
    otherAccountIds.add(transaction.toAccount.toString());
  }

  const otherAccounts = await accountModel
    .find({ _id: { $in: [...otherAccountIds] } })
    .lean();
  const otherAccountById = new Map(
    otherAccounts.map((account) => [account._id.toString(), account]),
  );

  // the owner's names, for a masked counterparty line
  const ownerIds = new Set<string>();
  for (const account of otherAccounts) {
    for (const owner of account.users) ownerIds.add(owner.toString());
  }

  const owners = await userModel
    .find({ _id: { $in: [...ownerIds] } })
    .select("name")
    .lean();
  const ownerNameById = new Map(
    owners.map((owner) => [owner._id.toString(), owner.name]),
  );

  /**
   * - Balance after each row
   * A window function over the account's ledger, computed by the database:
   * credits minus debits up to and including each entry. Summing forward from
   * the beginning is what makes the figure exact, even if the customer is
   * paging through thousands of rows; only the page's own rows come back.
   */
  const balances = await ledgerModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    balanceAfter: number;
  }>([
    { $match: { account: accountId } },
    {
      $set: {
        signed: {
          $cond: [
            { $eq: ["$type", "CREDIT"] },
            "$amount",
            { $multiply: ["$amount", -1] },
          ],
        },
      },
    },
    { $sort: { createdAt: 1, _id: 1 } },
    {
      $setWindowFields: {
        sortBy: { createdAt: 1, _id: 1 },
        output: {
          balanceAfter: {
            $sum: "$signed",
            window: { documents: ["unbounded", "current"] },
          },
        },
      },
    },
    { $match: { _id: { $in: page.map((row) => row._id) } } },
    { $project: { balanceAfter: { $round: ["$balanceAfter", 2] } } },
  ]);

  const balanceById = new Map(
    balances.map((row) => [row._id.toString(), row.balanceAfter]),
  );

  // a safety net: an entry the aggregation somehow missed still shows a number
  const fallbackBalance =
    balanceById.get(page[page.length - 1]!._id.toString()) ?? 0;

  const entries: HistoryEntry[] = page.map((row) => {
    // a CREDIT on this account means the account received the money
    const moneyIn = row.type === "CREDIT";
    const transaction = transactionById.get(row.transaction.toString());
    const otherId =
      transaction &&
      (transaction.fromAccount.toString() === accountId.toString()
        ? transaction.toAccount.toString()
        : transaction.fromAccount.toString());

    const other = otherId ? otherAccountById.get(otherId) : undefined;
    const otherOwnerName = other?.users
      .map((owner) => ownerNameById.get(owner.toString()))
      .find((name): name is string => typeof name === "string");

    return {
      id: row._id.toString(),
      transactionId: row.transaction.toString(),
      reference: transaction?.reference ?? null,
      createdAt: row.createdAt.toISOString(),
      direction: row.type,
      amount: moneyIn ? row.amount : -row.amount,
      balanceAfter: balanceById.get(row._id.toString()) ?? fallbackBalance,
      status: transaction?.status ?? "UNKNOWN",
      kind: transaction?.kind ?? "TRANSFER",
      note: transaction?.note ?? null,
      counterparty: other
        ? {
            accountNumber: other.accountNumber
              ? formatAccountNumber(other.accountNumber)
              : null,
            name:
              other.type === "SYSTEM"
                ? `${other.code ?? "System"} (system)`
                : maskCounterparty(otherOwnerName ?? "Account holder"),
            status: other.status,
            direction: moneyIn ? "out" : "in",
          }
        : null,
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt, last._id) : null;

  return { entries, nextCursor };
}

/**
 * - Read every entry on an account (for CSV export)
 * Deliberately unpaginated, but capped, so one export cannot walk a huge
 * history and exhaust the instance's memory.
 *
 * @param accountId - the account to export
 * @param direction - all, in or out
 * @param from - inclusive start date
 * @param to - inclusive end date
 * @param cap - the most rows to return
 */
export async function exportAccountHistory(
  accountId: mongoose.Types.ObjectId,
  direction: Direction,
  from: Date | null,
  to: Date | null,
  cap = 5_000,
): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  let cursor: string | null = null;

  // reuse the paged reader so the export and the screen can never disagree
  do {
    const page = await listAccountHistory({
      accountId,
      limit: Math.min(200, cap - entries.length),
      cursor,
      direction,
      from,
      to,
    });
    entries.push(...page.entries);
    cursor = page.nextCursor;
  } while (cursor && entries.length < cap);

  return entries.slice(0, cap);
}

export default { listAccountHistory, exportAccountHistory, encodeCursor };
