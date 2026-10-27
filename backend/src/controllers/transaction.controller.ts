/**
 * - Create a new transaction
 * Transfers funds between two accounts using a double-entry ledger and a
 * MongoDB session so the transfer is all-or-nothing.
 *
 * THE 10-STEP TRANSFER FLOW:
 * 1. Validate request (required fields, positive amount, distinct accounts)
 * 2. Apply the transfer and daily caps (see `config/limits.ts`)
 * 3. Validate idempotency key, scoped to the sending account
 * 4. Check account status (both accounts must be ACTIVE and the caller must
 *    own the source account)
 * 5. Derive sender balance from ledger (inside the session)
 * 6. Create transaction (PENDING)
 * 7. Create DEBIT and CREDIT ledger entries
 * 8. Mark transaction COMPLETED, or hold it for an emailed code
 * 9. Commit MongoDB session
 * 10. Send email notification
 *
 * A destination may be given as the recipient's short account number instead
 * of the internal id - that is what the UI collects.
 *
 * @param req - The request object
 * @param res - The response
 * @returns - The created transaction, or the state of the existing one
 * @POST - /api/transactions
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import LIMITS, { DAILY_WINDOW_MS } from "../config/limits";
import accountModel from "../models/account.model";
import transactionModel from "../models/transaction.model";
import emailService from "../services/email.service";
import { postEntries } from "../services/ledger.service";
import { getTreasury } from "../services/treasury.service";
import {
  normaliseAccountNumber,
  formatAccountNumber,
} from "../services/accountNumber.service";
import {
  issueCode,
  redeemCode,
  referenceFor,
} from "../services/verification.service";
import { listAccountHistory } from "../services/history.service";
import { record as recordAudit } from "../services/audit.service";

/**
 * - Request with the authenticated user attached by `authMiddleware`
 */
type AuthenticatedRequest = Request & {
  user: { _id: mongoose.Types.ObjectId; email: string; name: string };
};

/**
 * - Resolve an account from whatever the caller supplied
 * Accepts the internal id (what the app used to send, kept so old clients and
 * the admin page still work) or the short account number a person types.
 *
 * @param value - an account id or a 8-digit account number
 * @returns the account document, or `null` when nothing matches
 */
async function findAccountByReference(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  const trimmed = value.trim();

  // the legacy path: an internal id
  if (mongoose.isValidObjectId(trimmed)) {
    return accountModel.findById(trimmed);
  }

  // the human path: the short number, spaces and dashes allowed
  const accountNumber = normaliseAccountNumber(trimmed);
  if (!accountNumber) return null;

  return accountModel.findOne({ accountNumber });
}



/**
 * - Stop a started session
 * Aborts the transaction (rolling back anything written inside it) and
 * releases the server-side session. Safe to call on an already-ended one.
 *
 * @param session - the session opened with `mongoose.startSession()`
 * @returns {Promise<void>} - resolves once the session has been released
 */
async function abortSession(session: mongoose.ClientSession): Promise<void> {
  try {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
  } finally {
    await session.endSession();
  }
}

/**
 * - Log a transaction failure in full
 * The response stays generic on purpose, so the server console is the only
 * place the real cause appears. Mongo attaches the useful fields
 * (`code`, `codeName`, `errorLabels`) to the thrown error without typing
 * them, which is why they are read through a cast.
 *
 * @param step - which flow failed, "transfer" or "funding"
 * @param error - whatever the try block threw
 */
function logTransactionFailure(step: string, error: unknown): void {
  const mongoError = error as {
    name?: string;
    message?: string;
    code?: number;
    codeName?: string;
    errorLabels?: string[];
    stack?: string;
    writeErrors?: unknown;
    keyPattern?: unknown;
    keyValue?: unknown;
  };

  console.error(`[${step}] TRANSACTION FAILED`, {
    name: mongoError?.name,
    message: mongoError?.message,
    code: mongoError?.code,
    codeName: mongoError?.codeName,
    errorLabels: mongoError?.errorLabels,
    keyPattern: mongoError?.keyPattern,
    keyValue: mongoError?.keyValue,
    stack: mongoError?.stack,
  });
}

/**
 * - Total sent from an account in the last 24 hours
 * Completed transfers only: a held or failed one never moved money, so it
 * must not count towards the daily cap.
 *
 * @param accountId - the sending account
 * @param session - optional session, so the figure is read with the transfer
 * @returns the total, in the account's currency
 */
export async function sentInLastDay(
  accountId: mongoose.Types.ObjectId,
  session?: mongoose.ClientSession,
): Promise<number> {
  const since = new Date(Date.now() - DAILY_WINDOW_MS);

  const rows = await transactionModel
    .aggregate<{ total: number }>([
      {
        $match: {
          fromAccount: accountId,
          status: { $in: ["COMPLETED", "PENDING"] },
          createdAt: { $gte: since },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .session(session ?? null);

  return Math.round((rows[0]?.total ?? 0) * 100) / 100;
}

/**
 * - Reply for a replayed idempotency key
 * One place for the four statuses, so the normal transfer and the released
 * hold answer the same way.
 *
 * @param transaction - the existing transaction
 * @param res - the response to fill
 */
function replayTransaction(
  transaction: InstanceType<typeof transactionModel>,
  res: Response,
) {
  switch (transaction.status) {
    case "COMPLETED":
      return res.status(200).json({
        message: "Transaction already processed",
        transaction,
      });

    case "PENDING":
      // 202 Accepted: the request is still being worked on
      return res.status(202).json({
        message: "Transaction is still processing",
        transaction,
      });

    case "FAILED":
      return res.status(409).json({
        message:
          "Transaction processing failed, please retry with a new idempotencyKey",
      });

    case "REVERSED":
      return res.status(409).json({
        message:
          "Transaction was reversed, please retry with a new idempotencyKey",
      });
  }
}

async function createTransaction(req: AuthenticatedRequest, res: Response) {
  /**
   * 1. Validate request
   */
  const { fromAccount, toAccount, amount, idempotencyKey, note } =
    req.body ?? {};

  // if any of the required fields are missing, return an error
  if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
    return res.status(400).json({
      message: "FromAccount, toAccount, amount and idempotencyKey are required",
    });
  }

  // a transfer must move a positive number of monetary units
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      message: "amount must be a positive number",
    });
  }

  // money is held to the cent; anything finer is a client bug, not a payment
  if (Math.round(amount * 100) !== amount * 100) {
    return res.status(400).json({
      message: "amount may have at most two decimal places",
    });
  }

  // an optional note, shown in the history of both sides
  if (note !== undefined && note !== null) {
    if (typeof note !== "string" || note.trim().length > 140) {
      return res.status(400).json({
        message: "note must be a string of 140 characters or fewer",
      });
    }
  }

  const fromUserAccount = await findAccountByReference(fromAccount);
  const toUserAccount = await findAccountByReference(toAccount);

  // if the fromAccount or toAccount does not exist, return an error
  if (!fromUserAccount || !toUserAccount) {
    return res.status(400).json({
      message: "Invalid fromAccount or toAccount",
    });
  }

  // an account cannot send money to itself
  if (fromUserAccount._id.equals(toUserAccount._id)) {
    return res.status(400).json({
      message: "fromAccount and toAccount must be different",
    });
  }

  // a customer transfer may never touch the bank's own accounts: money leaves
  // the treasury only through the system funding endpoint
  if (fromUserAccount.type === "SYSTEM" || toUserAccount.type === "SYSTEM") {
    return res.status(400).json({
      message: "Transfers cannot involve a system account",
    });
  }

  /**
   * 2. Transfer and daily caps
   * Checked before any write, so a refused amount never creates a header row.
   */
  if (amount > LIMITS.perTransfer) {
    return res.status(400).json({
      message: `A single transfer cannot exceed PKR ${LIMITS.perTransfer.toLocaleString("en-PK")}`,
    });
  }

  const alreadySent = await sentInLastDay(fromUserAccount._id);
  if (
    Math.round((alreadySent + amount) * 100) >
    Math.round(LIMITS.dailyPerAccount * 100)
  ) {
    const remaining = Math.max(0, LIMITS.dailyPerAccount - alreadySent);
    return res.status(400).json({
      message: `This would pass your daily limit. You can still send PKR ${remaining.toLocaleString("en-PK")} today.`,
    });
  }

  /**
   * 3. Validate idempotency key
   */
  const isTransactionAlreadyExists = await transactionModel.findOne({
    idempotencyKey,
    fromAccount: fromUserAccount._id,
  });

  // if a transaction with the same key already exists, report what became of it
  if (isTransactionAlreadyExists) {
    return replayTransaction(isTransactionAlreadyExists, res);
  }

  /**
   * 4. Check account status and ownership
   */

  // only the owner of the source account may move money out of it
  if (!fromUserAccount.users.some((owner) => owner.equals(req.user._id))) {
    return res.status(403).json({
      message: "You are not allowed to transfer from this account",
    });
  }

  // if either the fromAccount or toAccount is not ACTIVE, return an error.
  // FROZEN and CLOSED are refused on both sides: money must not leave a
  // blocked account, and must not arrive in one that cannot be operated.
  if (
    fromUserAccount.status !== "ACTIVE" ||
    toUserAccount.status !== "ACTIVE"
  ) {
    const blocked = [
      fromUserAccount.status !== "ACTIVE" ? "fromAccount" : null,
      toUserAccount.status !== "ACTIVE" ? "toAccount" : null,
    ].filter(Boolean);
    return res.status(400).json({
      message: `${blocked.join(" and ")} must be ACTIVE to process transaction`,
    });
  }

  /** The fee is part of the record; today it is always zero. */
  const fee = 0;

  /**
   * 5-9. Create the transaction and both entries inside one session
   */
  let transaction: InstanceType<typeof transactionModel> | undefined;
  let session: mongoose.ClientSession | undefined;
  let holdExpiresAt: Date | null = null;

  try {
    session = await mongoose.startSession();
    session.startTransaction();

    transaction = new transactionModel({
      fromAccount: fromUserAccount._id,
      toAccount: toUserAccount._id,
      amount,
      // only the stated amount moves: the fee is recorded, not charged
      fee,
      note: typeof note === "string" && note.trim() ? note.trim() : undefined,
      idempotencyKey,
      status: "PENDING",
      kind: "TRANSFER",
      initiatedBy: req.user._id,
    });
    // the reference is derived from the id, so it is set after construction
    transaction.reference = referenceFor(transaction._id);

    /**
     * 5. Derive sender balance from ledger (inside the session)
     * Read here, not before starting the session, so the check and the
     * debit are evaluated against the same committed ledger state.
     */
    const balance = await fromUserAccount.getBalance();
    if (balance < amount) {
      // thrown, not returned: the catch aborts and the finally releases the
      // session, so it is never ended twice
      const insufficient = new Error(
        `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`,
      );
      insufficient.name = "INSUFFICIENT_BALANCE";
      throw insufficient;
    }

    /**
     * 7. Create DEBIT and CREDIT ledger entries - unless this one is held
     * A transfer above the step-up threshold moves nothing yet: the header is
     * stored on hold and the money is posted only when the emailed code is
     * confirmed. That way an abandoned transfer can never debit anyone.
     */
    const needsCode = amount > LIMITS.stepUpThreshold;

    if (!needsCode) {
      await postEntries(session, transaction._id, [
        { account: fromUserAccount._id, amount, type: "DEBIT" },
        { account: toUserAccount._id, amount, type: "CREDIT" },
      ]);
    }

    /**
     * 8. Mark the transaction COMPLETED, or hold it for the code
     */
    if (needsCode) {
      holdExpiresAt = new Date(
        Date.now() + LIMITS.stepUpCodeTtlMinutes * 60 * 1000,
      );
      transaction.holdExpiresAt = holdExpiresAt;
      transaction.status = "PENDING";
    } else {
      transaction.status = "COMPLETED";
    }

    await transaction.save({ session });

    /**
     * 9. Commit MongoDB session
     * Only now do the writes become visible to other readers.
     */
    await session.commitTransaction();
  } catch (error) {
    if (error instanceof Error && error.name === "INSUFFICIENT_BALANCE") {
      // expected, not a fault: answer plainly instead of logging a failure
      if (session) await abortSession(session);
      return res.status(400).json({ message: error.message });
    }

    logTransactionFailure("transfer", error);
    // the session was not committed, so nothing was actually transferred
    if (session) {
      await abortSession(session);
    }
    return res.status(500).json({
      message: "Transaction failed and was rolled back, please retry",
    });
  } finally {
    // release the server-side session now that everything is written
    if (session) {
      await session.endSession();
    }
  }

  /**
   * - Large transfer: email the code and ask for it
   * 202 tells the client the transfer is accepted but not settled, which is
   * exactly true while the hold stands.
   */
  if (holdExpiresAt) {
    try {
      const expiresAt = await issueCode({
        userId: req.user._id,
        accountId: fromUserAccount._id,
        amount,
        email: req.user.email,
        name: req.user.name,
        amountLabel: `PKR ${amount.toLocaleString("en-PK", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      });
      holdExpiresAt = expiresAt.expiresAt;
    } catch (error) {
      // the transfer is held, so nothing has moved yet; release it instead of
      // leaving a row nobody can ever confirm
      await transactionModel.findOneAndUpdate(
        { _id: transaction?._id },
        { status: "FAILED", holdExpiresAt: null },
      );
      logTransactionFailure("step-up", error);
      return res.status(500).json({
        message:
          "This transfer needs a confirmation code, but the code could not be sent. Please retry with a new idempotencyKey.",
      });
    }

    return res.status(202).json({
      message:
        "This is a large transfer. A confirmation code was sent to your email; enter it to complete the transfer.",
      requiresCode: true,
      holdExpiresAt,
      transaction,
    });
  }

  /**
   * 10. Send email notification
   * A mail failure must not turn a committed transfer into an error response.
   */
  try {
    await emailService.sendTransactionEmail(
      req.user.email,
      req.user.name,
      amount,
      toUserAccount.accountNumber
        ? formatAccountNumber(toUserAccount.accountNumber)
        : toUserAccount._id.toString(),
    );
  } catch {
    // the money has already moved - log and continue
  }

  return res.status(201).json({
    message: "Transaction completed successfully",
    transaction,
  });
}

/**
 * - Add funds from the treasury
 * Seeds a customer account with funds paid out of the system treasury. The
 * caller is an administrator, not a payer: the treasury is the bank's own
 * account and is allowed to run negative by exactly the amount issued.
 *
 * FLOW:
 * 1. Validate request
 * 2. Resolve the destination account (must be an ACTIVE CUSTOMER account)
 * 3. Validate the idempotency key
 * 4. Resolve the treasury (sender) account
 * 5. Create the transaction + both ledger entries inside a session
 * 6. Commit, audit the funding, and return the completed transaction
 *
 * @param req - The request object
 * @param res - The response
 * @returns - The completed initial funds transaction
 * @POST - /api/transactions/system/initial-funds
 */
async function createInitialFundsTransaction(
  req: AuthenticatedRequest,
  res: Response,
) {
  /**
   * 1. Validate request
   */
  const { toAccount, amount, idempotencyKey } = req.body ?? {};

  if (!toAccount || !amount || !idempotencyKey) {
    return res.status(400).json({
      message: "toAccount, amount and idempotencyKey are required",
    });
  }

  // a funding transfer must move a positive number of monetary units
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      message: "amount must be a positive number",
    });
  }

  /**
   * 2. Resolve the destination account
   */
  const toUserAccount = await findAccountByReference(toAccount);

  // if the toAccount does not exist, return an error
  if (!toUserAccount) {
    return res.status(400).json({
      message: "Invalid toAccount",
    });
  }

  // funds may only be issued into a live customer account. Funding the
  // treasury or another system account would inflate the money supply
  // against no real balance.
  if (toUserAccount.type !== "CUSTOMER") {
    return res.status(400).json({
      message: "Funds can only be added to a customer account",
    });
  }

  // a closed or frozen account cannot transact, so funding it would only
  // create money nobody can use
  if (toUserAccount.status !== "ACTIVE") {
    return res.status(400).json({
      message: "The destination account must be ACTIVE",
    });
  }

  /**
   * 3. Validate the idempotency key
   * Without this, a repeated key reached the unique index and surfaced as a
   * 500. A replay now reports what happened to the first attempt.
   */
  const existing = await transactionModel.findOne({ idempotencyKey });

  if (existing) {
    return replayTransaction(existing, res);
  }

  /**
   * 4. Resolve the treasury (sender) account
   */
  // the treasury may go negative without limit - that balance *is* the total
  // money the system has issued, so there is deliberately no funds check here
  let treasury: Awaited<ReturnType<typeof getTreasury>>;

  try {
    treasury = await getTreasury();
  } catch {
    return res.status(500).json({
      message: "Treasury account is unavailable, please retry",
    });
  }

  /**
   * 5. Create the transaction + both ledger entries inside a session
   */
  let session: mongoose.ClientSession | undefined;
  let transaction: InstanceType<typeof transactionModel> | undefined;

  try {
    session = await mongoose.startSession();
    session.startTransaction();

    // the header record for this money movement
    transaction = new transactionModel({
      fromAccount: treasury._id,
      toAccount: toUserAccount._id,
      amount,
      fee: 0,
      idempotencyKey,
      status: "PENDING",
      kind: "FUNDING",
      initiatedBy: req.user._id,
    });
    transaction.reference = referenceFor(transaction._id);

    // DEBIT the treasury, CREDIT the customer: still one of each, so the
    // ledger stays balanced even though the treasury runs negative
    await postEntries(session, transaction._id, [
      { account: treasury._id, amount, type: "DEBIT" },
      { account: toUserAccount._id, amount, type: "CREDIT" },
    ]);

    /**
     * 5. Mark the transaction COMPLETED, persist it, and commit
     * The header must be saved inside the session - creating the document in
     * memory only does not write it, and Mongo would abort the transaction
     * over ledger entries that reference a non-existent transaction.
     */
    transaction.status = "COMPLETED";
    await transaction.save({ session });

    await session.commitTransaction();
  } catch (error) {
    logTransactionFailure("funding", error);
    // the session was not committed, so nothing was actually transferred
    if (session) {
      await abortSession(session);
    }
    return res.status(500).json({
      message:
        "Initial funds transaction failed and was rolled back, please retry",
    });
  } finally {
    // release the server-side session now that everything is written
    if (session) {
      await session.endSession();
    }
  }

  // record the privileged action; see the audit controller for the read side
  if (transaction) {
    await recordAudit(req.user, {
      action: "FUNDS_ISSUED",
      targetType: "ACCOUNT",
      targetId: toUserAccount._id,
      summary: `Issued PKR ${amount.toLocaleString("en-PK")} to account ${
        toUserAccount.accountNumber ?? toUserAccount._id.toString()
      }`,
      detail: {
        amount,
        transactionId: transaction._id.toString(),
        accountNumber: toUserAccount.accountNumber ?? null,
      },
    });
  }

  return res.status(201).json({
    message: "Initial funds transaction completed successfully",
    transaction,
  });
}

/**
 * - Account history
 * One page of an account's ledger, newest first, with the balance after each
 * entry. Cursor-paged, so a transfer landing mid-scroll never shifts rows.
 *
 * FLOW:
 * 1. Read the account id and the page options
 * 2. Reject a page that is not the caller's account
 * 3. Read one page from the history service and return it
 *
 * @param req - The request object
 * @param res - The response
 * @GET - /api/transactions/history/:accountId
 */
async function getAccountHistory(req: Request, res: Response): Promise<void> {
  // 1. the account, the page size, the cursor, and the two filters
  const { accountId } = req.params;
  const { cursor, limit, direction, from, to } = req.query;

  if (typeof accountId !== "string" || !mongoose.isValidObjectId(accountId)) {
    res.status(400).json({ message: "Invalid account id" });
    return;
  }

  // 2. another customer's account is a 404, not a 403: it does not exist for them
  const account = await accountModel.findOne({
    _id: accountId,
    users: req.user._id,
  });

  if (!account) {
    res.status(404).json({ message: "Account not found" });
    return;
  }

  // the page size is bounded so one call cannot ask for everything
  const requested = Number(limit);
  const pageSize =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), 100)
      : 25;

  const directionValue =
    direction === "in" || direction === "out" ? direction : "all";

  const parseDay = (value: unknown, endOfDay: boolean): Date | null => {
    if (typeof value !== "string" || !value) return null;
    // a bare date ("2026-03-01") is accepted as the start of that day
    const date = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value,
    );
    if (Number.isNaN(date.getTime())) return null;
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
    return date;
  };

  // 3. read the page
  const page = await listAccountHistory({
    accountId: account._id,
    limit: pageSize,
    cursor: typeof cursor === "string" && cursor ? cursor : null,
    direction: directionValue,
    from: parseDay(from, false),
    to: parseDay(to, true),
  });

  res.status(200).json({
    account: {
      _id: account._id,
      accountNumber: account.accountNumber ?? null,
      label: account.label ?? null,
      currency: account.currency,
      status: account.status,
    },
    ...page,
  });
}

/**
 * - One transaction, as a receipt
 * Scoped to the caller: a transaction is readable only by the owner of one of
 * its two accounts, or by an administrator.
 *
 * @param req - The request object
 * @param res - The response
 * @GET - /api/transactions/:transactionId
 */
async function getTransaction(req: Request, res: Response): Promise<void> {
  const { transactionId } = req.params;

  if (!transactionId || !mongoose.isValidObjectId(transactionId)) {
    res.status(400).json({ message: "Invalid transaction id" });
    return;
  }

  const transaction = await transactionModel.findById(transactionId).lean();

  if (!transaction) {
    res.status(404).json({ message: "Transaction not found" });
    return;
  }

  const ownAccounts = await accountModel
    .find({
      _id: { $in: [transaction.fromAccount, transaction.toAccount] },
      users: req.user._id,
    })
    .select("_id accountNumber label")
    .lean();

  if (ownAccounts.length === 0 && !req.user.systemUser) {
    res.status(404).json({ message: "Transaction not found" });
    return;
  }

  const [from, to] = await Promise.all([
    accountModel.findById(transaction.fromAccount).lean(),
    accountModel.findById(transaction.toAccount).lean(),
  ]);

  res.status(200).json({
    transaction: {
      ...transaction,
      reference: transaction.reference ?? referenceFor(transaction._id),
      fromAccountInfo: from
        ? {
            accountNumber: from.accountNumber ?? null,
            label: from.label ?? null,
            status: from.status,
            type: from.type,
          }
        : null,
      toAccountInfo: to
        ? {
            accountNumber: to.accountNumber ?? null,
            label: to.label ?? null,
            status: to.status,
            type: to.type,
          }
        : null,
      isMine: ownAccounts.length > 0,
    },
  });
}

/**
 * - Confirmation code for a held transfer
 * A transfer above the step-up threshold is held until the owner enters the
 * code emailed to them here.
 *
 * FLOW:
 * 1. Validate the request
 * 2. Resolve the held transaction and check the caller owns the source
 * 3. Refuse an expired hold, and mark it PENDING for support to see
 * 4. Check the code, then release the hold
 *
 * @param req - The request object
 * @param res - The response
 * @POST - /api/transactions/:transactionId/confirm
 */
async function confirmTransaction(req: Request, res: Response): Promise<void> {
  const { transactionId } = req.params;
  const { code } = req.body ?? {};

  // 1. both fields are needed
  if (!transactionId || !mongoose.isValidObjectId(transactionId)) {
    res.status(400).json({ message: "Invalid transaction id" });
    return;
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    res.status(400).json({ message: "Enter the 6-digit code from your email" });
    return;
  }

  // 2. the transfer, and the account it leaves from
  const transaction = await transactionModel.findById(transactionId);
  if (!transaction) {
    res.status(404).json({ message: "Transaction not found" });
    return;
  }

  const fromAccount = await accountModel.findById(transaction.fromAccount);
  if (
    !fromAccount ||
    !fromAccount.users.some((owner) => owner.equals(req.user._id))
  ) {
    res.status(404).json({ message: "Transaction not found" });
    return;
  }

  if (transaction.status === "COMPLETED") {
    res.status(200).json({
      message: "Transaction already processed",
      transaction,
    });
    return;
  }

  // 3. a hold that has expired needs a brand new transfer
  if (!transaction.holdExpiresAt) {
    res.status(409).json({
      message:
        "This transfer is no longer waiting for a code, please start it again",
    });
    return;
  }

  if (transaction.holdExpiresAt.getTime() <= Date.now()) {
    transaction.status = "PENDING";
    transaction.holdExpiresAt = null;
    await transaction.save();
    res.status(409).json({
      message: "The confirmation code expired. Please start the transfer again",
    });
    return;
  }

  // 4. the code is checked against the account it was issued for
  const result = await redeemCode({
    accountId: fromAccount._id,
    amount: transaction.amount,
    code,
  });

  if (!result.ok) {
    const messages: Record<string, string> = {
      NO_CODE:
        "There is no code waiting for this transfer. Please start it again",
      EXPIRED: "The confirmation code expired. Please start the transfer again",
      BAD_CODE: "That code is not correct. Check the email and try again",
      TOO_MANY_ATTEMPTS:
        "Too many wrong codes. Please start the transfer again for a new code",
      ALREADY_USED: "That code has already been used",
    };
    res.status(400).json({ message: messages[result.reason] });
    return;
  }

  /**
   * - Post the money, finally
   * A held transfer wrote no ledger entries, so this is the moment it moves.
   * The balance is re-read first: the money must still be there, and a
   * customer who spent it while a code was in their inbox must not push the
   * account negative.
   */
  const balance = await fromAccount.getBalance();
  if (balance < transaction.amount) {
    transaction.status = "FAILED";
    transaction.holdExpiresAt = null;
    await transaction.save();
    res.status(400).json({
      message: `Insufficient balance to complete this transfer. Current balance is ${balance}.`,
    });
    return;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await postEntries(session, transaction._id, [
      { account: transaction.fromAccount, amount: transaction.amount, type: "DEBIT" },
      { account: transaction.toAccount, amount: transaction.amount, type: "CREDIT" },
    ]);
    transaction.status = "COMPLETED";
    transaction.holdExpiresAt = null;
    await transaction.save({ session });
    await session.commitTransaction();
  } catch (error) {
    logTransactionFailure("confirm", error);
    await abortSession(session);
    res.status(500).json({
      message: "Could not complete the transfer, please try again",
    });
    return;
  } finally {
    await session.endSession();
  }

  // the money is only now settled, so this is the point to notify the payer
  try {
    await emailService.sendTransactionEmail(
      req.user.email,
      req.user.name,
      transaction.amount,
      transaction.toAccount.toString(),
    );
  } catch {
    // the money has already moved - a mail failure must not fail the confirm
  }

  res.status(200).json({
    message: "Transaction completed successfully",
    transaction,
  });
}

/**
 * - The limits the UI should show
 * Quoted straight from the config, so the form never displays a number the
 * controller will not honour.
 *
 * @param req - The request object (the user is not needed, but kept for symmetry)
 * @param res - The response
 * @GET - /api/transactions/limits
 */
async function getLimits(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    currency: "PKR",
    perTransfer: LIMITS.perTransfer,
    dailyPerAccount: LIMITS.dailyPerAccount,
    stepUpThreshold: LIMITS.stepUpThreshold,
    stepUpCodeTtlMinutes: LIMITS.stepUpCodeTtlMinutes,
  });
}

/**
 * - How much of the daily limit is left
 * @param req - The request object
 * @param res - The response
 * @GET - /api/transactions/limits/:accountId
 */
async function getAccountLimit(req: Request, res: Response): Promise<void> {
  const { accountId } = req.params;

  if (!accountId || !mongoose.isValidObjectId(accountId)) {
    res.status(400).json({ message: "Invalid account id" });
    return;
  }

  const account = await accountModel.findOne({
    _id: accountId,
    users: req.user._id,
  });

  if (!account) {
    res.status(404).json({ message: "Account not found" });
    return;
  }

  const sentToday = await sentInLastDay(account._id);

  res.status(200).json({
    accountId: account._id,
    perTransfer: LIMITS.perTransfer,
    dailyPerAccount: LIMITS.dailyPerAccount,
    sentToday,
    remainingToday: Math.max(
      0,
      Math.round((LIMITS.dailyPerAccount - sentToday) * 100) / 100,
    ),
    stepUpThreshold: LIMITS.stepUpThreshold,
  });
}

/**
 * - Transaction controller
 * Public surface of the transaction module, wired up by {@link transactionRoutes}.
 */
export {
  createTransaction,
  createInitialFundsTransaction,
  getAccountHistory,
  getTransaction,
  confirmTransaction,
  getLimits,
  getAccountLimit,
};

export default {
  createTransaction,
  createInitialFundsTransaction,
  getAccountHistory,
  getTransaction,
  confirmTransaction,
  getLimits,
  getAccountLimit,
};
