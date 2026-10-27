import type { Request, Response } from "express";
import accountModel from "../models/account.model";
import {
  assignAccountNumber,
  formatAccountNumber,
} from "../services/accountNumber.service";
import {
  exportAccountHistory,
  type Direction,
} from "../services/history.service";

/**
 * - Create an account for the authenticated user
 * Creates a new account for the authenticated user.
 *
 * FLOW:
 * 1. Read the authenticated user attached by `authMiddleware`
 * 2. Reject a system user with 403 - an administrator holds no accounts
 * 3. Reject with 409 when the user already holds an ACTIVE account
 * 4. Create an ACTIVE customer account denominated in PKR owned by that user
 * 5. Return the created account
 *
 * @param req - The request object containing the authenticated user information.
 * @param res - The response object used to send back the created account or an error message.
 * @returns {Promise<void>} - resolves once the account has been created
 * @POST - /api/accounts
 */
async function createAccountController(req: Request, res: Response): Promise<void> {
  // 1. the user was attached by the auth middleware
  const user = req.user;

  // 2. a system user is a pure administrator with no personal money, so
  //    opening them a customer account would break that model
  if (user.systemUser) {
    res.status(403).json({
      message: "System users do not hold customer accounts",
    });
    return;
  }

  // 3. the UI offers "open account" exactly once - refuse a second one clearly
  const existingAccount = await accountModel.findOne({
    users: user._id,
    status: "ACTIVE",
  });

  if (existingAccount) {
    res.status(409).json({
      message: "You already have an active account",
      account: existingAccount,
    });
    return;
  }

  // 4. build the new account - owned by the current user and ACTIVE by default
  const account = new accountModel({
    users: [user._id],
    type: "CUSTOMER",
    status: "ACTIVE",
    currency: "PKR",
    // an optional name the owner chose ("Savings"); cosmetic only
    label:
      typeof req.body?.label === "string" && req.body.label.trim()
        ? req.body.label.trim().slice(0, 40)
        : undefined,
  });

  // 5. give it a short, shareable number and persist it
  await assignAccountNumber(account);

  // 6. return the created account with a 201 Created
  res.status(201).json(account);
}

/**
 * - Rename one of the caller's accounts
 * The label is the owner's own name for the account and has no effect on
 * routing: money still moves by account number.
 *
 * FLOW:
 * 1. Read the account id and the label
 * 2. Reject an empty or overlong label
 * 3. Update the account, scoped to the caller
 *
 * @param req - The request object containing the account id and the label.
 * @param res - The response carrying the updated account.
 * @returns {Promise<void>} - resolves once the account has been updated
 * @PATCH - /api/accounts/:accountId
 */
async function renameAccountController(
  req: Request,
  res: Response,
): Promise<void> {
  // 1. the account and the new label
  const { accountId } = req.params;
  const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";

  // 2. an empty label is a clear message, not a silent no-op
  if (!label) {
    res.status(400).json({ message: "Enter a name for this account" });
    return;
  }
  if (label.length > 40) {
    res.status(400).json({ message: "Name must be 40 characters or fewer" });
    return;
  }

  // 3. scoping by owner means another customer's account is a 404
  const account = await accountModel.findOneAndUpdate(
    { _id: accountId, users: req.user._id },
    { $set: { label } },
    { new: true },
  );

  if (!account) {
    res.status(404).json({ message: "Account not found" });
    return;
  }

  res.status(200).json(account);
}

/**
 * - List the authenticated user's accounts
 * Finds every account the caller is an owner of (joint accounts included).
 *
 * @param req - The request object containing the authenticated user information.
 * @param res - The response object used to send back the accounts.
 * @returns {Promise<void>} - resolves once the accounts have been sent
 * @GET - /api/accounts
 */
async function getUserAccountsController(req: Request, res: Response): Promise<void> {
  // `users` is the owners array on the account schema
  const accounts = await accountModel.find({ users: req.user._id });

  res.status(200).json({ accounts });
}

/**
 * - Get the balance of one account
 * Verifies the account belongs to the caller, then derives its balance from
 * the ledger.
 *
 * FLOW:
 * 1. Read the account id from the route params
 * 2. Look the account up, scoped to the caller so foreign accounts 404
 * 3. Derive the balance from the ledger and return it
 *
 * @param req - The request object containing the authenticated user and the account id.
 * @param res - The response object used to send back the balance.
 * @returns {Promise<void>} - resolves once the balance has been sent
 * @GET - /api/accounts/balance/:accountId
 */
async function getAccountBalanceController(req: Request, res: Response): Promise<void> {
  // 1. the account being queried
  const { accountId } = req.params;

  // 2. scoping the lookup by owner means someone else's account is a 404
  const account = await accountModel.findOne({
    _id: accountId,
    users: req.user._id,
  });

  if (!account) {
    res.status(404).json({ message: "Account not found" });
    return;
  }

  // 3. the balance is derived from the ledger, never stored
  const balance = await account.getBalance();

  res.status(200).json({
    accountId: account._id,
    balance,
  });
}

/**
 * - Quote a field for CSV
 * Wraps a value in quotes and doubles any quote inside it, which is what the
 * format requires. Excel executes a cell that starts with `=`, `+`, `-` or
 * `@`, so those are prefixed with an apostrophe.
 *
 * @param value - the raw cell value
 * @returns a safe, quoted CSV cell
 */
function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const risky = /^[=+\-@]/.test(text);
  const safe = risky ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * - Export one account's history as CSV
 * The same rows the history screen shows, in a file a person can open in a
 * spreadsheet. It reuses the paged reader, so the two can never disagree, and
 * the export is capped so one download cannot exhaust the instance.
 *
 * @param req - The request (account id, optional direction and date range)
 * @param res - The response, a `text/csv` attachment
 * @GET - /api/accounts/:accountId/history.csv
 */
async function exportAccountHistoryController(
  req: Request,
  res: Response,
): Promise<void> {
  // express 5 types a route param as string | string[]
  const accountId = String(req.params.accountId ?? "");
  const { direction, from, to } = req.query;

  if (!/^[0-9a-f]{24}$/i.test(accountId)) {
    res.status(400).json({ message: "Invalid account id" });
    return;
  }

  // scoping by owner means somebody else's account is a 404
  const account = await accountModel.findOne({
    _id: accountId,
    users: req.user._id,
  });

  if (!account) {
    res.status(404).json({ message: "Account not found" });
    return;
  }

  const directionValue: Direction =
    direction === "in" || direction === "out" ? direction : "all";

  const parseDay = (value: unknown): Date | null => {
    if (typeof value !== "string" || !value) return null;
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const entries = await exportAccountHistory(
    account._id,
    directionValue,
    parseDay(from),
    parseDay(to),
  );

  const header = [
    "Date",
    "Reference",
    "Direction",
    "Amount",
    "Balance after",
    "Status",
    "Counterparty",
    "Counterparty account",
    "Note",
  ];

  const lines = entries.map((entry) =>
    [
      csvCell(entry.createdAt),
      csvCell(entry.reference),
      csvCell(entry.direction === "CREDIT" ? "In" : "Out"),
      csvCell(entry.amount),
      csvCell(entry.balanceAfter),
      csvCell(entry.status),
      csvCell(entry.counterparty?.name ?? ""),
      csvCell(entry.counterparty?.accountNumber ?? ""),
      csvCell(entry.note),
    ].join(","),
  );

  const number = account.accountNumber
    ? formatAccountNumber(account.accountNumber).replace(/\s/g, "")
    : account._id.toString();

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="statement-${number}.csv"`,
  );
  // a BOM so Excel opens UTF-8 correctly instead of mangling non-ASCII names
  res.status(200).send(`\uFEFF${[header.join(","), ...lines].join("\r\n")}`);
}

/**
 * - Account controller
 * Public surface of the account module, wired up by {@link accountRoutes}.
 */
export default {
  createAccount: createAccountController,
  getAccountBalance: getAccountBalanceController,
  getUserAccounts: getUserAccountsController,
  renameAccount: renameAccountController,
  exportHistory: exportAccountHistoryController,
};
