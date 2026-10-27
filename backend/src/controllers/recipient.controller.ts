import type { Request, Response } from "express";
import accountModel from "../models/account.model";
import recipientModel from "../models/recipient.model";
import userModel from "../models/user.model";
import transactionModel from "../models/transaction.model";
import {
  formatAccountNumber,
  maskName,
  normaliseAccountNumber,
} from "../services/accountNumber.service";

/**
 * - Recipient lookups and saved payees
 * These routes exist so a payer can type a short number and see who it
 * belongs to before money moves. The lookup is deliberately narrow: a masked
 * name and a status, never a balance, an email or a full name.
 */

/**
 * - Who does this account number belong to?
 * One row, so the transfer form can show "Ayesha K. - ACTIVE" as soon as the
 * payer finishes typing.
 *
 * @param req - request with `:accountNumber` in the params
 * @param res - `{ accountNumber, name, status, canReceive }`, or 404
 * @GET - /api/recipients/lookup/:accountNumber
 */
async function lookupRecipient(req: Request, res: Response): Promise<void> {
  const raw = req.params.accountNumber;
  const accountNumber = normaliseAccountNumber(raw);

  if (!accountNumber) {
    res.status(400).json({ message: "Enter an 8-digit account number" });
    return;
  }

  const account = await accountModel.findOne({ accountNumber }).lean();

  // an unknown number and a system account both simply do not exist as a payee
  if (!account || account.type !== "CUSTOMER") {
    res.status(404).json({ message: "No account with that number" });
    return;
  }

  // the account's own name is an internal handle, never a person's name, so
  // it is resolved from the owner record and then masked
  const owner = await userModel
    .findOne({ _id: { $in: account.users } })
    .select("name")
    .lean();

  // a CLOSED account can never receive money; a FROZEN one cannot be credited
  // either, so both are reported as not receivable but still name-checkable -
  // this is what lets a payer see "Ayesha K. - FROZEN" instead of a typo pass
  const canReceive = account.status === "ACTIVE";

  res.status(200).json({
    accountNumber: formatAccountNumber(accountNumber),
    name: maskName(owner?.name ?? "Account holder"),
    status: account.status,
    canReceive,
    /** true when this is the caller's own account, so the form can refuse it early */
    isSelf: account.users.some((id) => id.equals(req.user._id)),
  });
}

/**
 * - List the caller's saved recipients
 * @param req - the authenticated request
 * @param res - `{ recipients: [...] }`, newest first
 * @GET - /api/recipients
 */
async function listRecipients(req: Request, res: Response): Promise<void> {
  const saved = await recipientModel
    .find({ user: req.user._id })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  // the live status is read from the account, so a payee who was frozen after
  // being saved shows as frozen instead of silently failing later
  const accounts = await accountModel
    .find({ _id: { $in: saved.map((row) => row.account) } })
    .select("status accountNumber")
    .lean();
  const accountById = new Map(
    accounts.map((account) => [account._id.toString(), account]),
  );

  res.status(200).json({
    recipients: saved.map((row) => {
      const account = accountById.get(row.account.toString());
      return {
        _id: row._id,
        accountNumber: row.accountNumber,
        nickname: row.nickname,
        status: account?.status ?? "CLOSED",
        createdAt: row.createdAt,
      };
    }),
  });
}

/**
 * - Save a recipient
 * Saving the same account twice just renames it, so the list never grows
 * duplicates.
 *
 * @param req - `{ accountNumber, nickname? }`
 * @param res - the saved row, or 400/404
 * @POST - /api/recipients
 */
async function saveRecipient(req: Request, res: Response): Promise<void> {
  const { accountNumber: rawNumber, nickname } = req.body ?? {};
  const accountNumber = normaliseAccountNumber(rawNumber);

  if (!accountNumber) {
    res.status(400).json({ message: "Enter an 8-digit account number" });
    return;
  }

  const account = await accountModel.findOne({ accountNumber }).lean();

  if (!account || account.type !== "CUSTOMER") {
    res.status(404).json({ message: "No account with that number" });
    return;
  }

  if (account.users.some((id) => id.equals(req.user._id))) {
    res.status(400).json({ message: "That is your own account" });
    return;
  }

  const owner = await userModel
    .findOne({ _id: { $in: account.users } })
    .select("name")
    .lean();

  const label =
    typeof nickname === "string" && nickname.trim()
      ? nickname.trim().slice(0, 60)
      : maskName(owner?.name ?? "Account holder");

  // `upsert` on the (user, account) index: a repeat save is a rename
  const saved = await recipientModel.findOneAndUpdate(
    { user: req.user._id, account: account._id },
    {
      $set: {
        nickname: label,
        accountNumber,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.status(201).json({
    recipient: {
      _id: saved._id,
      accountNumber: formatAccountNumber(accountNumber),
      nickname: saved.nickname,
      status: account.status,
      createdAt: saved.createdAt,
    },
  });
}

/**
 * - Remove a saved recipient
 * @param req - `:recipientId` in the params
 * @param res - 204, or 404 when it was not the caller's row
 * @DELETE - /api/recipients/:recipientId
 */
async function deleteRecipient(req: Request, res: Response): Promise<void> {
  // scoping by user means somebody else's row is a 404, not a 403
  const result = await recipientModel.deleteOne({
    _id: req.params.recipientId,
    user: req.user._id,
  });

  if (result.deletedCount === 0) {
    res.status(404).json({ message: "Recipient not found" });
    return;
  }

  res.status(204).send();
}

/**
 * - Recent payees, derived from the ledger
 * The transfer form shows these as chips before anything has been saved: the
 * people this customer actually paid, newest first.
 *
 * @param req - the authenticated request
 * @param res - `{ recipients: [{ accountNumber, name, lastSentAt }] }`
 * @GET - /api/recipients/recent
 */
async function recentRecipients(req: Request, res: Response): Promise<void> {
  const ownAccounts = await accountModel
    .find({ users: req.user._id })
    .select("_id")
    .lean();

  const ownIds = ownAccounts.map((account) => account._id);

  const recent = await transactionModel.aggregate<{
    _id: unknown;
    lastSentAt: Date;
  }>([
    { $match: { fromAccount: { $in: ownIds }, status: "COMPLETED" } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$toAccount", lastSentAt: { $first: "$createdAt" } } },
    { $sort: { lastSentAt: -1 } },
    { $limit: 6 },
  ]);

  const accountIds = recent.map((row) => row._id);
  const accounts = await accountModel
    .find({ _id: { $in: accountIds } })
    .select("accountNumber users")
    .lean();
  const accountById = new Map(
    accounts.map((account) => [account._id.toString(), account]),
  );

  const ownerIds = accounts.flatMap((account) => account.users);
  const owners = await userModel
    .find({ _id: { $in: ownerIds } })
    .select("name")
    .lean();
  const nameById = new Map(
    owners.map((owner) => [owner._id.toString(), owner.name]),
  );

  res.status(200).json({
    recipients: recent.flatMap((row) => {
      const account = accountById.get(String(row._id));
      if (!account?.accountNumber) return [];
      const ownerName = account.users
        .map((id) => nameById.get(id.toString()))
        .find((name): name is string => typeof name === "string");
      return [
        {
          accountNumber: formatAccountNumber(account.accountNumber),
          name: maskName(ownerName ?? "Account holder"),
          lastSentAt: row.lastSentAt,
        },
      ];
    }),
  });
}

/**
 * - Recipient controller
 * Public surface of the recipient module, wired up by {@link recipientRoutes}.
 */
export default {
  lookupRecipient,
  listRecipients,
  saveRecipient,
  deleteRecipient,
  recentRecipients,
};
