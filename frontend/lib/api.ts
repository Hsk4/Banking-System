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

/** Options accepted by {@link api} and {@link apiWithStatus}. */
interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** abort the request after this many milliseconds (cold starts need a long one) */
  timeoutMs?: number;
}

/**
 * - Response with its HTTP status
 * Some replies carry meaning in the status code itself: a 202 from a transfer
 * means "accepted, still processing", which is a success for `fetch` but must
 * not be shown as complete.
 */
export interface ApiResult<T> {
  status: number;
  data: T;
}

/** How long to wait for a transfer before giving up (Render cold start + commit). */
export const TRANSFER_TIMEOUT_MS = 45_000;

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Where the API lives when it is not reachable same-origin.
 *
 * On the web this is empty and every call goes to `/api/*`, which the Next
 * proxy route forwards to the backend - the httpOnly cookie is set on our own
 * origin that way. A Capacitor build has no server routes (the Android shell
 * loads a static export), so the app has to talk to the backend directly and
 * the base URL must be absolute.
 */
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** Where the bearer token is kept when cookies cannot cross origins. */
export const AUTH_TOKEN_KEY = "banking-ui-token";

/**
 * - Read the stored token
 * Only used off-origin: there the login cookie belongs to the backend's
 * domain and is subject to third-party cookie rules, so the token the API
 * returns is kept and replayed as a bearer header instead.
 */
function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * - Store or clear the session token
 * @param token - the token from login/register, or `null` on sign out
 */
export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    else window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // private mode / storage disabled - cookies still work on the web
  }
}

/**
 * - Fetch wrapper, keeping the status
 * Calls the API through the same-origin `/api/*` proxy route (see
 * `app/api/[...path]/route.ts`), so the httpOnly auth cookie is sent
 * automatically. Every path here is relative: never hard-code the backend URL
 * in client code.
 *
 * @param path - path under `/api`, e.g. `"/accounts"`
 * @param options - method, JSON body, timeout
 * @returns the parsed JSON body together with the HTTP status
 * @throws {ApiError} for non-2xx responses, and for network/timeout failures
 */
export async function apiWithStatus<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers();
  // Only announce a JSON body when there is one: Express's JSON parser
  // rejects `Content-Type: application/json` with an empty body, which broke
  // bodyless POSTs like opening an account and logging out.
  if (body !== undefined) headers.set("Content-Type", "application/json");

  // Off-origin builds send the token explicitly: the httpOnly cookie is set
  // on the backend's domain there, where it may be blocked as third-party.
  const token = API_BASE_URL ? readToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      method,
      credentials: "include",
      headers,
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

  return { status: response.status, data: data as T };
}

/**
 * - Fetch wrapper
 * The common case: callers that only care about the body.
 * @param path - path under `/api`
 * @param options - method, JSON body, timeout
 * @returns the parsed JSON body
 * @throws {ApiError} for non-2xx responses, and for network/timeout failures
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { data } = await apiWithStatus<T>(path, options);
  return data;
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
 *
 * Returns the status alongside the body: 201 is a fresh commit, 200 is a
 * key that had already been processed, and 202 means the server accepted it
 * but is still committing.
 *
 * @param input - source, destination, amount and a stable idempotency key
 */
export function createTransfer(
  input: TransferInput,
): Promise<ApiResult<TransferResponse>> {
  return apiWithStatus<TransferResponse>("/transactions", {
    method: "POST",
    body: input,
    timeoutMs: TRANSFER_TIMEOUT_MS,
  });
}

/**
 * Seed an account with funds. System users only.
 *
 * The money comes out of the system treasury, so the treasury balance is the
 * total issued. Same status meanings as {@link createTransfer}.
 *
 * @param input - destination, amount and idempotency key
 */
export function createInitialFunds(input: {
  toAccount: string;
  amount: number;
  idempotencyKey: string;
}): Promise<ApiResult<TransferResponse>> {
  return apiWithStatus<TransferResponse>(
    "/transactions/system/initial-funds",
    {
      method: "POST",
      body: input,
      timeoutMs: TRANSFER_TIMEOUT_MS,
    },
  );
}
