import type { Request, Response } from "express";
import mongoose from "mongoose";
import accountModel from "../models/account.model";
import auditModel from "../models/audit.model";
import ledgerModel from "../models/ledger.model";
import transactionModel from "../models/transaction.model";
import userModel from "../models/user.model";
import {
  formatAccountNumber,
  normaliseAccountNumber,
} from "../services/accountNumber.service";
import { getTreasury, TREASURY_CODE } from "../services/treasury.service";
import { record as recordAudit } from "../services/audit.service";

/**
 * - Administrator surface
 * Read-mostly views over every customer, plus the one write that matters in
 * a hurry: freezing an account. Every privileged action is written to the
 * append-only audit log before the request finishes.
 *
 * The system user is the administrator and holds no account of its own, so
 * nothing here pretends an admin has a balance: "money minted" is read from
 * the treasury's own ledger, which is where funding takes it from.
 */

/** Escape user input before it goes into a regular expression. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * - Overview
 * Total money minted, users and accounts, and activity today.
 *
 * @param req - The request object
 * @param res - The response
 * @GET - /api/admin/overview
 */
async function getOverview(_req: Request, res: Response): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const treasury = await getTreasury();

  const [
    mintedRows,
    users,
    systemUsers,
    accounts,
    activeAccounts,
    frozenAccounts,
    closedAccounts,
    transfersToday,
    fundedToday,
  ] = await Promise.all([
    // the treasury is debited for every rupee issued, so its negative balance
    // is exactly the money supply
    ledgerModel.aggregate<{ total: number }>([
      { $match: { account: treasury._id } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [
                { $eq: ["$type", "DEBIT"] },
                "$amount",
                { $multiply: ["$amount", -1] },
              ],
            },
          },
        },
      },
    ]),
    userModel.countDocuments({ systemUser: { $ne: true } }),
    userModel.countDocuments({ systemUser: true }),
    accountModel.countDocuments({ type: "CUSTOMER" }),
    accountModel.countDocuments({ type: "CUSTOMER", status: "ACTIVE" }),
    accountModel.countDocuments({ type: "CUSTOMER", status: "FROZEN" }),
    accountModel.countDocuments({ type: "CUSTOMER", status: "CLOSED" }),
    transactionModel.countDocuments({
      kind: "TRANSFER",
      status: "COMPLETED",
      createdAt: { $gte: startOfDay },
    }),
    transactionModel.countDocuments({
      kind: "FUNDING",
      status: "COMPLETED",
      createdAt: { $gte: startOfDay },
    }),
  ]);

  res.status(200).json({
    moneyMinted: Math.round((mintedRows[0]?.total ?? 0) * 100) / 100,
    users,
    systemUsers,
    accounts,
    activeAccounts,
    frozenAccounts,
    closedAccounts,
    transfersToday,
    fundingsToday: fundedToday,
    treasuryAccountId: treasury._id,
  });
}

/**
 * - Users and accounts, searchable
 * One row per account, because that is what an administrator freezes. A
 * search matches the owner's name or email, the account number, or the id.
 *
 * @param req - The request (`?q=`, `?status=`, `?limit=`, `?page=`)
 * @param res - `{ accounts, total, page, pages }`
 * @GET - /api/admin/accounts
 */
async function listAccounts(req: Request, res: Response): Promise<void> {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  // build the account filter
  const filter: Record<string, unknown> = { type: "CUSTOMER" };
  if (status === "ACTIVE" || status === "FROZEN" || status === "CLOSED") {
    filter.status = status;
  }

  if (query) {
    const re = new RegExp(escapeRegex(query), "i");
    const digits = normaliseAccountNumber(query);

    // anyone whose name or email matches, so an account can be found by owner
    const matchingUsers = await userModel
      .find({ $or: [{ name: re }, { email: re }] })
      .select("_id")
      .limit(200)
      .lean();

    const or: Record<string, unknown>[] = [
      { users: { $in: matchingUsers.map((user) => user._id) } },
      { accountNumber: digits ? digits : undefined },
      { label: re },
    ];

    // an exact id is the fastest lookup there is
    if (mongoose.isValidObjectId(query))
      or.push({ _id: new mongoose.Types.ObjectId(query) });

    filter.$or = or.filter((clause) =>
      Object.values(clause).some((value) => value !== undefined),
    );
  }

  const [rows, total] = await Promise.all([
    accountModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{
        users: { _id: mongoose.Types.ObjectId; name: string; email: string }[];
      }>("users", "name email")
      .lean(),
    accountModel.countDocuments(filter),
  ]);

  // balances are derived, so they are read in one aggregate for the page
  const balances = await ledgerModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    balance: number;
  }>([
    { $match: { account: { $in: rows.map((row) => row._id) } } },
    {
      $group: {
        _id: "$account",
        balance: {
          $sum: {
            $cond: [
              { $eq: ["$type", "CREDIT"] },
              "$amount",
              { $multiply: ["$amount", -1] },
            ],
          },
        },
      },
    },
  ]);
  const balanceById = new Map(
    balances.map((row) => [
      row._id.toString(),
      Math.round(row.balance * 100) / 100,
    ]),
  );

  res.status(200).json({
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    total,
    accounts: rows.map((row) => ({
      _id: row._id,
      accountNumber: row.accountNumber
        ? formatAccountNumber(row.accountNumber)
        : null,
      label: row.label ?? null,
      status: row.status,
      currency: row.currency,
      balance: balanceById.get(row._id.toString()) ?? 0,
      createdAt: row.createdAt,
      owners: row.users.map((owner) => ({
        _id: owner._id,
        name: owner.name,
        email: owner.email,
      })),
    })),
  });
}

/** Which status change an administrator may ask for. */
const STATUS_ACTIONS = {
  FROZEN: { action: "ACCOUNT_FROZEN", verb: "Froze" },
  ACTIVE: { action: "ACCOUNT_UNFROZEN", verb: "Unfroze" },
  CLOSED: { action: "ACCOUNT_CLOSED", verb: "Closed" },
} as const;

/**
 * - Change an account's status
 * Freeze, unfreeze or close a customer account. The treasury is refused on
 * purpose: blocking it would stop every funding.
 *
 * FLOW:
 * 1. Validate the account id and the requested status
 * 2. Refuse the treasury and unknown accounts
 * 3. Apply the status, then write the audit entry
 *
 * @param req - `:accountId` and `{ status, reason? }`
 * @param res - the updated account
 * @PATCH - /api/admin/accounts/:accountId/status
 */
async function setAccountStatus(req: Request, res: Response): Promise<void> {
  // 1. the target and what it should become
  const accountId = String(req.params.accountId ?? "");
  const requested: unknown = req.body?.status;

  if (!mongoose.isValidObjectId(accountId)) {
    res.status(400).json({ message: "Invalid account id" });
    return;
  }

  // narrowed here, so the action map below is indexed by a known key
  if (
    requested !== "ACTIVE" &&
    requested !== "FROZEN" &&
    requested !== "CLOSED"
  ) {
    res
      .status(400)
      .json({ message: "status must be ACTIVE, FROZEN or CLOSED" });
    return;
  }

  const status = requested;

  // 2. the treasury may not be frozen or closed
  const treasury = await getTreasury();
  if (treasury._id.toString() === accountId) {
    res
      .status(400)
      .json({ message: `The ${TREASURY_CODE} account cannot be changed` });
    return;
  }

  const account = await accountModel.findById(accountId);
  if (!account) {
    res.status(404).json({ message: "Account not found" });
    return;
  }

  if (account.type === "SYSTEM") {
    res.status(400).json({ message: "System accounts cannot be changed" });
    return;
  }

  const previous = account.status;
  if (previous === status) {
    res.status(200).json({ account, changed: false });
    return;
  }

  // 3. apply, then record who did it and why
  account.status = status;
  await account.save();

  const meta = STATUS_ACTIONS[status];
  const reason =
    typeof req.body?.reason === "string"
      ? req.body.reason.trim().slice(0, 200)
      : "";

  await recordAudit(req.user, {
    action: meta.action,
    targetType: "ACCOUNT",
    targetId: account._id,
    summary: `${meta.verb} account ${
      account.accountNumber
        ? formatAccountNumber(account.accountNumber)
        : account._id.toString()
    }${reason ? ` - ${reason}` : ""}`,
    detail: { from: previous, to: status, reason: reason || null },
  });

  res.status(200).json({ account, changed: true });
}

/**
 * - Search transactions
 * By id, account number, or date range, with the ledger entries behind each
 * header so an administrator can see exactly what moved.
 *
 * @param req - The request (`?q=`, `?from=`, `?to=`, `?page=`)
 * @param res - `{ transactions, total, page, pages }`
 * @GET - /api/admin/transactions
 */
async function listTransactions(req: Request, res: Response): Promise<void> {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const filter: Record<string, unknown> = {};

  if (query) {
    const digits = normaliseAccountNumber(query);
    const or: Record<string, unknown>[] = [];

    if (mongoose.isValidObjectId(query)) {
      or.push({ _id: new mongoose.Types.ObjectId(query) });
    }

    // the receipt reference, matched case-insensitively
    or.push({ reference: new RegExp(escapeRegex(query), "i") });

    if (digits) {
      const account = await accountModel
        .findOne({ accountNumber: digits })
        .select("_id")
        .lean();
      if (account) {
        or.push({ fromAccount: account._id }, { toAccount: account._id });
      }
    }

    if (or.length > 0) filter.$or = or;
  }

  const from =
    typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  if (from && !Number.isNaN(from.getTime())) filter.createdAt = { $gte: from };
  if (to && !Number.isNaN(to.getTime())) {
    to.setUTCHours(23, 59, 59, 999);
    filter.createdAt = { ...(filter.createdAt as object), $lte: to };
  }

  const [rows, total] = await Promise.all([
    transactionModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("fromAccount", "accountNumber label status type")
      .populate("toAccount", "accountNumber label status type")
      .lean(),
    transactionModel.countDocuments(filter),
  ]);

  // the two ledger entries behind each header
  const entries = await ledgerModel
    .find({ transaction: { $in: rows.map((row) => row._id) } })
    .lean();

  const entriesByTransaction = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.transaction.toString();
    const list = entriesByTransaction.get(key) ?? [];
    list.push(entry);
    entriesByTransaction.set(key, list);
  }

  res.status(200).json({
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    total,
    transactions: rows.map((row) => ({
      ...row,
      fromAccount: describeAccount(row.fromAccount),
      toAccount: describeAccount(row.toAccount),
      entries: (entriesByTransaction.get(row._id.toString()) ?? []).map(
        (entry) => ({
          _id: entry._id,
          type: entry.type,
          amount: entry.amount,
          createdAt: entry.createdAt,
        }),
      ),
    })),
  });
}

/**
 * - Present an account reference from a populated row
 * @param value - the populated account, or a bare id when the account is gone
 */
function describeAccount(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    value instanceof mongoose.Types.ObjectId
  ) {
    return {
      _id: String(value),
      accountNumber: null,
      label: null,
      status: null,
    };
  }

  const account = value as {
    _id: mongoose.Types.ObjectId;
    accountNumber?: string;
    label?: string;
    status?: string;
  };

  return {
    _id: account._id,
    accountNumber: account.accountNumber
      ? formatAccountNumber(account.accountNumber)
      : null,
    label: account.label ?? null,
    status: account.status ?? null,
  };
}

/**
 * - The audit log
 * Newest first, optionally filtered by action. Read-only: the model refuses
 * every update and delete.
 *
 * @param req - The request (`?action=`, `?page=`)
 * @param res - `{ entries, total, page, pages }`
 * @GET - /api/admin/audit
 */
async function listAudit(req: Request, res: Response): Promise<void> {
  const action = typeof req.query.action === "string" ? req.query.action : "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;

  const [rows, total] = await Promise.all([
    auditModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    auditModel.countDocuments(filter),
  ]);

  res.status(200).json({
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    total,
    entries: rows,
  });
}

/**
 * - User directory
 * A lighter list than the account one: who exists, how many accounts they
 * hold, and when they were last seen.
 *
 * @param req - The request (`?q=`)
 * @param res - `{ users }`
 * @GET - /api/admin/users
 */
async function listUsers(req: Request, res: Response): Promise<void> {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const filter: Record<string, unknown> = { systemUser: { $ne: true } };

  if (query) {
    const re = new RegExp(escapeRegex(query), "i");
    filter.$or = [{ name: re }, { email: re }];
  }

  const users = await userModel
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .select("name email createdAt lastLoginAt")
    .lean();

  const counts = await accountModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    count: number;
  }>([
    { $match: { users: { $in: users.map((user) => user._id) } } },
    { $unwind: "$users" },
    { $group: { _id: "$users", count: { $sum: 1 } } },
  ]);
  const countById = new Map(
    counts.map((row) => [row._id.toString(), row.count]),
  );

  res.status(200).json({
    users: users.map((user) => ({
      ...user,
      accountCount: countById.get(user._id.toString()) ?? 0,
    })),
  });
}

export default {
  getOverview,
  listAccounts,
  setAccountStatus,
  listTransactions,
  listAudit,
  listUsers,
};
