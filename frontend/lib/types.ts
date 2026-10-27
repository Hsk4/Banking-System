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
  /** the short number a payer types, e.g. "48217360"; absent on very old rows */
  accountNumber?: string;
  /** the owner's own name for the account ("Savings") */
  label?: string;
  type?: "CUSTOMER" | "SYSTEM";
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

/** Body of `GET /api/auth/me`. */
export interface MeResponse {
  user: User;
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
  /** the receipt reference, e.g. "TRX-7K2M9QP4" */
  reference?: string;
  /** the fee recorded on the transfer (0 today) */
  fee?: number;
  /** an optional note from the payer */
  note?: string;
  kind?: "TRANSFER" | "FUNDING";
  /** when a held large transfer expires, if it is waiting for a code */
  holdExpiresAt?: string | null;
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
  /** true when the transfer is held until an emailed code is confirmed */
  requiresCode?: boolean;
  /** when the hold expires */
  holdExpiresAt?: string;
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

/** One side of a movement, as seen from the account being viewed. */
export interface Counterparty {
  /** the other account's short number, e.g. "4821 7360" */
  accountNumber: string | null;
  /** the other side's masked name ("Ayesha K.") or "TREASURY (system)" */
  name: string;
  status: AccountStatus | string;
  /** whether money came in or went out relative to the account */
  direction: "in" | "out";
}

/** One row of an account's history. */
export interface HistoryEntry {
  id: string;
  transactionId: string;
  reference: string | null;
  createdAt: string;
  direction: "CREDIT" | "DEBIT";
  /** signed: negative when money left the account */
  amount: number;
  balanceAfter: number;
  status: TransactionStatus | string;
  kind: string;
  note: string | null;
  counterparty: Counterparty | null;
}

/** Body of `GET /api/transactions/history/:accountId`. */
export interface HistoryResponse {
  account: {
    _id: string;
    accountNumber: string | null;
    label: string | null;
    currency: string;
    status: AccountStatus;
  };
  entries: HistoryEntry[];
  /** pass back as `cursor` for the next page; null on the last page */
  nextCursor: string | null;
}

/** Options for a history request. */
export interface HistoryQuery {
  cursor?: string | null;
  limit?: number;
  direction?: "all" | "in" | "out";
  from?: string;
  to?: string;
}

/* ------------------------------------------------------------------ */
/* Recipients and limits                                               */
/* ------------------------------------------------------------------ */

/** What a name check returns: a masked name and a status, nothing more. */
export interface RecipientLookup {
  accountNumber: string;
  name: string;
  status: AccountStatus;
  canReceive: boolean;
  isSelf: boolean;
}

/** A payee the customer has saved. */
export interface SavedRecipient {
  _id: string;
  accountNumber: string;
  nickname: string;
  status: AccountStatus | string;
  createdAt: string;
}

/** A payee derived from past transfers. */
export interface RecentRecipient {
  accountNumber: string;
  name: string;
  lastSentAt: string;
}

/** The caps the transfer form must respect. */
export interface TransferLimits {
  currency: string;
  perTransfer: number;
  dailyPerAccount: number;
  stepUpThreshold: number;
  stepUpCodeTtlMinutes: number;
}

/** How much of today's limit one account has used. */
export interface AccountLimit {
  accountId: string;
  perTransfer: number;
  dailyPerAccount: number;
  sentToday: number;
  remainingToday: number;
  stepUpThreshold: number;
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

/** Body of `GET /api/admin/overview`. */
export interface AdminOverview {
  moneyMinted: number;
  users: number;
  systemUsers: number;
  accounts: number;
  activeAccounts: number;
  frozenAccounts: number;
  closedAccounts: number;
  transfersToday: number;
  fundingsToday: number;
  treasuryAccountId: string;
}

/** One row of the admin account list. */
export interface AdminAccount {
  _id: string;
  accountNumber: string | null;
  label: string | null;
  status: AccountStatus;
  currency: string;
  balance: number;
  createdAt: string;
  owners: { _id: string; name: string; email: string }[];
}

/** Body of `GET /api/admin/accounts`. */
export interface AdminAccountsResponse {
  page: number;
  pages: number;
  total: number;
  accounts: AdminAccount[];
}

/** A ledger entry behind an admin transaction row. */
export interface AdminLedgerEntry {
  _id: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  createdAt: string;
}

/** One row of the admin transaction search. */
export interface AdminTransaction {
  _id: string;
  fromAccount: { _id: string; accountNumber: string | null; label: string | null; status: string | null };
  toAccount: { _id: string; accountNumber: string | null; label: string | null; status: string | null };
  amount: number;
  status: TransactionStatus;
  kind?: string;
  note?: string;
  reference?: string;
  createdAt: string;
  entries: AdminLedgerEntry[];
}

/** Body of `GET /api/admin/transactions`. */
export interface AdminTransactionsResponse {
  page: number;
  pages: number;
  total: number;
  transactions: AdminTransaction[];
}

/** One row of the audit log. */
export interface AuditEntry {
  _id: string;
  actor: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

/** Body of `GET /api/admin/audit`. */
export interface AuditResponse {
  page: number;
  pages: number;
  total: number;
  entries: AuditEntry[];
}

/** Body of `GET /api/admin/users`. */
export interface AdminUsersResponse {
  users: {
    _id: string;
    name: string;
    email: string;
    createdAt: string;
    lastLoginAt?: string | null;
    accountCount: number;
  }[];
}
