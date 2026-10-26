/**
 * - Response shapes of the Express API
 * Mirrors the controllers under `backend/src/controllers`.
 */

/** A bank account as returned by `/api/accounts`. */
export type AccountStatus = "ACTIVE" | "FROZEN" | "CLOSED";

/** A bank account as returned by `/api/accounts`. */
export interface Account {
  _id: string;
  users: string[];
  status: AccountStatus;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

/** The authenticated user, returned by login/register. */
export interface User {
  _id: string;
  email: string;
  name: string;
  /** only a system user may call the initial-funds endpoint */
  systemUser?: boolean;
}

/** Body returned by `POST /api/auth/login` and `POST /api/auth/register`. */
export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export type TransactionStatus = "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";

/** The transaction header returned by the transfer endpoints. */
export interface Transaction {
  _id: string;
  fromAccount: string;
  toAccount: string;
  amount: number;
  status: TransactionStatus;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

/** Body of `GET /api/accounts`. */
export interface AccountsResponse {
  accounts: Account[];
}

/** Body of `GET /api/accounts/balance/:accountId`. */
export interface BalanceResponse {
  accountId: string;
  balance: number;
}

/** Body of a successful transfer / initial-funds call. */
export interface TransferResponse {
  message: string;
  transaction?: Transaction;
}
