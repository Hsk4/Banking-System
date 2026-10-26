/**
 * - Create a new transaction
 * Transfers funds between two accounts using a double-entry ledger and a
 * MongoDB session so the transfer is all-or-nothing.
 *
 * THE 10-STEP TRANSFER FLOW:
 * 1. Validate request (required fields, positive amount, distinct accounts)
 * 2. Validate idempotency key (replay an earlier result if one exists)
 * 3. Check account status (both accounts must be ACTIVE and the caller must
 *    own the source account)
 * 4. Derive sender balance from ledger (inside the session)
 * 5. Create transaction (PENDING)
 * 6. Create DEBIT ledger entry
 * 7. Create CREDIT ledger entry
 * 8. Mark transaction COMPLETED
 * 9. Commit MongoDB session
 * 10. Send email notification
 *
 * @param req - The request object
 * @param res - The response
 * @returns - The created transaction, or the state of the existing one
 * @POST - /api/transactions
 */

import type { Request, Response } from "express";
import mongoose from "mongoose";
import accountModel from "../models/account.model";
import transactionModel from "../models/transaction.model";
import emailService from "../services/email.service";
import { postEntries } from "../services/ledger.service";
import { getTreasury } from "../services/treasury.service";

/**
 * - Request with the authenticated user attached by `authMiddleware`
 */
type AuthenticatedRequest = Request & {
  user: { _id: mongoose.Types.ObjectId; email: string; name: string };
};

/**
 * - Resolve an account by id
 * @param accountId - the account id supplied by the caller
 * @returns the account document, or `null` when the id is invalid/unknown
 */
async function findAccount(accountId: string) {
  // a malformed id would otherwise throw a CastError
  if (!mongoose.isValidObjectId(accountId)) {
    return null;
  }
  return accountModel.findById(accountId);
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

async function createTransaction(req: AuthenticatedRequest, res: Response) {
  /**
   * 1. Validate reques t
   */
  const { fromAccount, toAccount, amount, idempotencyKey } = req.body ?? {};

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

  // an account cannot send money to itself
  if (fromAccount === toAccount) {
    return res.status(400).json({
      message: "fromAccount and toAccount must be different",
    });
  }

  const fromUserAccount = await findAccount(fromAccount);

  // look up the receiver's account
  const toUserAccount = await findAccount(toAccount);

  // if the fromAccount or toAccount does not exist, return an error
  if (!fromUserAccount || !toUserAccount) {
    return res.status(400).json({
      message: "Invalid fromAccount or toAccount",
    });
  }

  // a customer transfer may never touch the bank's own accounts: money leaves
  // the treasury only through the system funding endpoint
  if (
    fromUserAccount.type === "SYSTEM" ||
    toUserAccount.type === "SYSTEM"
  ) {
    return res.status(400).json({
      message: "Transfers cannot involve a system account",
    });
  }

  /**
   * 2. Validate idempotency key
   */

  // check if a transaction with the same idempotency key already exists
  const isTransactionAlreadyExists = await transactionModel.findOne({
    idempotencyKey: idempotencyKey,
  });

  // if a transaction with the same idempotency key already exists, return the status of that transaction
  if (isTransactionAlreadyExists) {
    switch (isTransactionAlreadyExists.status) {
      case "COMPLETED":
        return res.status(200).json({
          message: "Transaction already processed",
          transaction: isTransactionAlreadyExists,
        });

      case "PENDING":
        // 202 Accepted: the request is still being worked on
        return res.status(202).json({
          message: "Transaction is still processing",
        });

      case "FAILED":
        return res.status(409).json({
          message: "Transaction processing failed, please retry with a new idempotencyKey",
        });

      case "REVERSED":
        return res.status(409).json({
          message: "Transaction was reversed, please retry with a new idempotencyKey",
        });
    }
  }

  /**
   * 3. Check account status and ownership
   */

  // only the owner of the source account may move money out of it
  if (!fromUserAccount.users.some((owner) => owner.equals(req.user._id))) {
    return res.status(403).json({
      message: "You are not allowed to transfer from this account",
    });
  }

  // if either the fromAccount or toAccount is not ACTIVE, return an error
  if (
    fromUserAccount.status !== "ACTIVE" ||
    toUserAccount.status !== "ACTIVE"
  ) {
    return res.status(400).json({
      message:
        "Both fromAccount and toAccount must be ACTIVE to process transaction",
    });
  }

  /**
   * 4. Derive sender balance from ledger
   * (runs inside the session below; see step 4 there)
   */

  // 5. Create transaction (PENDING)
  let transaction: InstanceType<typeof transactionModel> | undefined;

  // 6. Create DEBIT ledger entry
  let session: mongoose.ClientSession | undefined;
  try {
    /**
     * 5. Create transaction (PENDING)
     * Everything from here on runs inside one MongoDB session, so if any
     * write fails the whole block is rolled back by the server.
     */
    session = await mongoose.startSession();
    session.startTransaction();

    const [createdTransaction] = await transactionModel.create(
      [
        {
          fromAccount,
          toAccount,
          amount,
          idempotencyKey,
          status: "PENDING",
          kind: "TRANSFER",
          initiatedBy: req.user._id,
        },
      ],
      { session },
    );
    transaction = createdTransaction;
    if (!transaction) {
      throw new Error("Transaction was not created");
    }

    /**
     * 4. Derive sender balance from ledger (inside the session)
     * Read here, not before starting the session, so the check and the
     * debit are evaluated against the same committed ledger state.
     */
    const balance = await fromUserAccount.getBalance();
    if (balance < amount) {
      return res.status(400).json({
        message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`,
      });
    }

    /**
     * 6. Create DEBIT ledger entry
     * Removes the amount from the sender's account.
     * why debit though? Because the sender's account is losing money, so it is a debit. The receiver's account is gaining money, so it is a credit.
     * In accounting terms, a debit is an entry that increases an asset or expense account, or decreases a liability or equity account. A credit is an entry that increases a liability or equity account, or decreases an asset or expense account.
     * Confusing, right? since we just made debit as deducting the amount fron the sender and credit as adding the amount to the receiver. But we are considering this entry as a business entity for it's customer so the sender is losing money so it is a debit and the receiver is gaining money so it is a credit. We are viewing it from banks view and for a bank Your account balance is money the bank owes you, so it’s a liability for the bank. For liabilities, a credit increases and a debit decreases. So when money leaves your account, the bank debits your account (the liability shrinks), and when money arrives, it credits it (the liability grows). The same balance is an asset (cash you hold). Your bank statement would show a withdrawal as a decrease, but in your own books you’d credit cash when you spend it.
     *
     * TL:DR : Debit means to decrease an asset or increase a liability, while credit means to increase an asset or decrease a liabilityf for a bank and reverse for the customers perspective.
     */

    await postEntries(session, transaction._id, [
      { account: fromAccount, amount, type: "DEBIT" },
      { account: toAccount, amount, type: "CREDIT" },
    ]);

    /**
     * 8. Mark transaction COMPLETED
     */
    await transactionModel.findOneAndUpdate(
      { _id: transaction._id },
      { status: "COMPLETED" },
      { session },
    );

    /**
     * 9. Commit MongoDB session
     * Only now do the writes become visible to other readers.
     */
    await session.commitTransaction();
  } catch (error) {
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
   * 10. Send email notification
   * A mail failure must not turn a committed transfer into an error response.
   */
  try {
    await emailService.sendTransactionEmail(
      req.user.email,
      req.user.name,
      amount,
      toAccount,
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
 * - Create an initial funds transaction
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
 * 6. Commit and return the completed transaction
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
  const toUserAccount = await findAccount(toAccount);

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
    switch (existing.status) {
      case "COMPLETED":
        return res.status(200).json({
          message: "Transaction already processed",
          transaction: existing,
        });

      case "PENDING":
        // 202 Accepted: the request is still being worked on
        return res.status(202).json({
          message: "Transaction is still processing",
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
      toAccount,
      amount,
      idempotencyKey,
      status: "PENDING",
      kind: "FUNDING",
      initiatedBy: req.user._id,
    });

    // DEBIT the treasury, CREDIT the customer: still one of each, so the
    // ledger stays balanced even though the treasury runs negative
    await postEntries(session, transaction._id, [
      { account: treasury._id, amount, type: "DEBIT" },
      { account: toAccount, amount, type: "CREDIT" },
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
    // the session was not committed, so nothing was actually transferred
    if (session) {
      await abortSession(session);
    }
    return res.status(500).json({
      message: "Initial funds transaction failed and was rolled back, please retry",
    });
  } finally {
    // release the server-side session now that everything is written
    if (session) {
      await session.endSession();
    }
  }

  return res.status(201).json({
    message: "Initial funds transaction completed successfully",
    transaction,
  });
}

/**
 * - Transaction controller
 * Public surface of the transaction module, wired up by {@link transactionRoutes}.
 */
export { createTransaction, createInitialFundsTransaction };

export default {
  createTransaction,
  createInitialFundsTransaction,
};
