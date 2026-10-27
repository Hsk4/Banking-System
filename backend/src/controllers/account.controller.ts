import type { Request, Response } from "express";
import accountModel from "../models/account.model";

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
  });

  // 5. persist and return the created account with a 201 Created
  const savedAccount = await account.save();
  res.status(201).json(savedAccount);
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
 * - Account controller
 * Public surface of the account module, wired up by {@link accountRoutes}.
 */
export default {
  createAccount: createAccountController,
  getAccountBalance: getAccountBalanceController,
  getUserAccounts: getUserAccountsController,
};
