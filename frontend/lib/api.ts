import type {
  Account,
  AccountsResponse,
  AuthResponse,
  BalanceResponse,
  TransferResponse,
} from "./types";

/**
 * - API error
 * Thrown by {@link api} for any non-2xx response. Carries the HTTP status so
 * callers can branch on 401 (session ended), 202 (still processing) and 409
 * (idempotency key used by a failed transfer).
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Options accepted by {@link api}. */
interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** abort the request after this many milliseconds (cold starts need a long one) */
  timeoutMs?: number;
}

/** How long to wait for a transfer before giving up (Render cold start + commit). */
export const TRANSFER_TIMEOUT_MS = 45_000;

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * - Fetch wrapper
 * Calls the API through the same-origin `/api/*` rewrite (see `next.config.ts`),
 * so the httpOnly auth cookie is sent automatically. Every path here is
 * relative: never hard-code the backend URL in client code.
 *
 * @param path - path under `/api`, e.g. `"/accounts"`
 * @param options - method, JSON body, timeout
 * @returns the parsed JSON body
 * @throws {ApiError} for non-2xx responses, and for network/timeout failures
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      // balances change constantly - never serve a cached copy
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(408, "The request took too long. Please try again.");
    }
    throw new ApiError(0, "Could not reach the server. Please try again.");
  } finally {
    clearTimeout(timer);
  }

  // 204 and empty bodies must not be parsed
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return data as T;
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

/**
 * Register a new user. The API sets the session cookie on success.
 * @param input - name, email, password and its confirmation
 */
export function register(input: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthResponse> {
  return api<AuthResponse>("/auth/register", { method: "POST", body: input });
}

/**
 * Sign in. The API sets the session cookie on success.
 * @param input - email and password
 */
export function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return api<AuthResponse>("/auth/login", { method: "POST", body: input });
}

/** Revoke the current token and clear the cookie. */
export function logout(): Promise<void> {
  return api<void>("/auth/logout", { method: "POST" });
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

/** List every account the signed-in user owns. */
export async function getAccounts(): Promise<Account[]> {
  const data = await api<AccountsResponse>("/accounts");
  return data.accounts;
}

/** Open a new PKR account for the signed-in user. */
export function openAccount(): Promise<Account> {
  return api<Account>("/accounts", { method: "POST" });
}

/** Derive one account's balance from the ledger. */
export function getBalance(accountId: string): Promise<BalanceResponse> {
  return api<BalanceResponse>(`/accounts/balance/${accountId}`);
}

/* ------------------------------------------------------------------ */
/* Transfers                                                           */
/* ------------------------------------------------------------------ */

/** Body of a transfer request. */
export interface TransferInput {
  fromAccount: string;
  toAccount: string;
  amount: number;
  idempotencyKey: string;
}

/**
 * Move money between accounts.
 * @param input - source, destination, amount and a stable idempotency key
 */
export function createTransfer(
  input: TransferInput,
): Promise<TransferResponse> {
  return api<TransferResponse>("/transactions", {
    method: "POST",
    body: input,
    timeoutMs: TRANSFER_TIMEOUT_MS,
  });
}

/**
 * Seed an account with funds. System users only.
 * @param input - destination, amount and idempotency key
 */
export function createInitialFunds(input: {
  toAccount: string;
  amount: number;
  idempotencyKey: string;
}): Promise<TransferResponse> {
  return api<TransferResponse>("/transactions/system/initial-funds", {
    method: "POST",
    body: input,
    timeoutMs: TRANSFER_TIMEOUT_MS,
  });
}
