Banking System · frontend plan

# Build the UI for your banking API

Based on a read of `Hsk4/Banking-System` as of 25 Oct 2026. It covers what the API actually exposes, what to fix before a UI sits on top of it, and the order to build the Next.js side in. You write the code; each tab says what to build and why.

Next.js 16shadcn/uiVercelBun + Express 5Render

## What the backend exposes

Eight endpoints. Auth works through an httpOnly `token` cookie, with an `Authorization: Bearer` fallback.

| Endpoint | Access | Body | Returns |
| --- | --- | --- | --- |
| POST/api/auth/register | public | `name, email, password, confirmPassword` | 201 `{ user, token }`; 400 with `message` |
| POST/api/auth/login | public | `email, password` | 200 `{ user, token }`; 400 with `message` |
| POST/api/auth/logout | cookie | none | 200; 400 if no token |
| GET/api/accounts | user | none | `{ accounts: [{ _id, status, currency, createdAt }] }` |
| POST/api/accounts | system user | none | 201 the new account (PKR, ACTIVE) |
| GET/api/accounts/balance/:accountId | user | none | `{ accountId, balance }`; 404 if not yours |
| POST/api/transactions | user | `fromAccount, toAccount, amount (number), idempotencyKey` | 201 / 200 / 202 / 409 / 400 / 500, see Transfers tab |
| POST/api/transactions/system/initial-funds | system user | `toAccount, amount, idempotencyKey` | 201 with the transaction |
| GET/ | public | none | `{ status: "ok" }` (confirmed live on Render) |

### What is missing

### No "who am I" route

The UI cannot ask the server for the current user. Login and register return `user` once; keep it in client state and treat a 401 on `GET /api/accounts` as "logged out".

### No transaction history

There is no list endpoint for transactions or ledger rows. A statement page needs a new `GET` route first.

### No recipient lookup

Transfers need the destination account's raw ObjectId. Until you add a lookup, the form takes a pasted account ID.

## Backend problems that will surface in the UI

Found while reading the controllers and middleware. The first three decide whether the app can work at all.

### blockerNormal users cannot create an account

`POST /api/accounts` is wired to `authSystemUserMiddleware`, which only lets users with `systemUser: true` through. Everyone else gets 401. The route comment says "authenticated user", so this looks like the wrong middleware.

**Fix:** in `account.routes.ts`, use `authMiddleware.authMiddleware` for the create route.

### securityTransfers do not check who owns the source account

`createTransaction` loads `fromAccount` by ID and never compares its `users` to `req.user._id`. Any logged-in user can move money out of any account they know the ID of. Balance lookups do check ownership; transfers do not.

**Fix:** reject with 403 unless the source account's `users` includes the caller. Do this before the UI is public.

### limitOne account per user

The account schema has a unique index on `{ users, status }`. A second ACTIVE account for the same owner fails with a duplicate-key error, which nothing catches, so the client sees a bare 500. Decide whether one account is intended. If not, drop the unique index; if so, return a clear 409 and hide the "new account" button once one exists.

### corsNo CORS and a lax cookie

The API sends no CORS headers, and the cookie is `sameSite: "lax"`, which browsers will not attach to cross-site `fetch` calls from your Vercel domain. The simple route is to avoid cross-origin entirely: the Next.js app proxies `/api/*` to Render (see Auth tab).

### uxEvery transfer waits 15 seconds

There is a hard-coded `setTimeout` of 15 s between the debit and credit entries. Fine as a demo of the transaction window, but the form needs a long pending state. Remove it if it was only for testing.

### setupYou need a system user to see any money

New accounts start at 0, and the only way to add funds is the system-only initial-funds route. `systemUser` is immutable and defaults to false, so flip it in Atlas for one seed user, then call initial-funds to fund test accounts.

### noteMoney is a plain JS number

Amounts and balances are floats in PKR, with no minor units. Fine for a learning project; format with `Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" })` and restrict the input to two decimals.

## Create the Next.js project

Next.js 16 renamed `middleware.ts` to `proxy.ts` (function name `proxy`), and it runs on the Node.js runtime by default. Use that name from the start.

terminal

```
bunx create-next-app@latest banking-ui --ts --app --src-dir --eslint --tailwind
cd banking-ui
bunx --bun shadcn@latest init
```

The shadcn docs also show `shadcn@latest init -t next` to create the project and init in one step. Either works; the create-next-app route keeps you in control of the options.

### Components to add up front

terminal

```
bunx --bun shadcn@latest add button input label card form sonner skeleton badge table dialog alert
```

### Suggested structure

- `src/lib/api.ts`: one `fetch` wrapper that sends `credentials: "include"`, parses `message` from error bodies, and throws a typed error carrying the status.
- `src/lib/types.ts`: `Account`, `Transaction` and `ApiError` matching the shapes in the API tab.
- `src/app/(auth)/login` and `register`, `src/app/(app)/dashboard` and `transfer`.
- `src/proxy.ts`: redirect between the two groups based on whether the `token` cookie exists.

### Data fetching

TanStack Query fits well here: balances are per-account queries, transfers are a mutation with a long pending state, and a 401 handler in the query client can send the user back to login in one place. Plain server components also work for the account list, but the transfer flow needs client state either way.

## Same-origin proxy, cookie auth

The browser only ever talks to your Vercel domain. Next.js forwards `/api/*` to Render, so the `Set-Cookie` from login lands on your own domain and is sent back automatically.

### 1. Rewrite to the backend

next.config.ts

```
async rewrites() {
  return [{
    source: "/api/:path*",
    destination: `${process.env.BACKEND_URL}/api/:path*`,
  }];
}
```

Set `BACKEND_URL=https://banking-system-r8bq.onrender.com` in `.env.local` and in Vercel's project settings. Client code then calls relative paths such as `/api/accounts`, which also avoids hard-coding the Render URL in the bundle.

### 2. Ignore the token in the response body

Login and register return the JWT in JSON as well as in the cookie. Do not store it in `localStorage`. The httpOnly cookie is the safer copy and the one the API reads first.

### 3. Gate routes in `proxy.ts`

- Check only that the `token` cookie exists. The proxy cannot cheaply verify the JWT because the secret lives on the backend.
- No cookie on `/dashboard` or `/transfer`: redirect to `/login`. Cookie present on `/login`: redirect to `/dashboard`.
- Set the `matcher` to skip `api`, `_next/static`, `_next/image` and the favicon. The Next.js docs show this exact negative pattern, and without it the proxy runs on assets too.

An expired or blacklisted token still has a cookie, so the proxy lets the page through. The real check is the API: any 401 should clear client state and push to `/login`.

### 4. Login and logout behavior

- Register and login both set the cookie, so after success go straight to `/dashboard`. No second login step.
- Show the server's `message` field on failures ("User already exists", "Passwords do not match", "Invalid credentials"). Validate the same rules client-side first: password at least 6 characters, matching confirmation, valid email.
- Logout calls `POST /api/auth/logout`, then clears query cache and routes to `/login`. The backend blacklists the token for three days.

## Screens, in build order

Each one is useful on its own, so you can deploy after every step.

### 1. Register and login

Two cards with shadcn `Form`. Disable the button while pending; surface server messages inline.

- Fields match the API tab exactly
- Toast on success via Sonner

### 2. Dashboard

List accounts from `GET /api/accounts`, one card each, with a skeleton while balances load.

- One balance query per account ID
- Status badge: ACTIVE, FROZEN, CLOSED
- Copy-account-ID button, since recipients need it

### 3. Open account

A single button posting to `/api/accounts`. Only works after the route fix; handle 401 and 500 with a readable message.

### 4. Transfer

From-account select, recipient ID, amount, submit. This is the hard screen; see the Transfers tab.

### 5. Admin: fund an account

A separate `/admin/fund` page for the system user, posting to initial-funds. Because there is no "me" route, show it behind a direct URL and let a 401 explain itself. Keep it out of the main nav.

### 6. History (later)

Needs a new backend endpoint listing transactions where the account is source or destination. Build the API first.

### Empty and error states worth designing

- New user, no account yet: one clear call to action.
- Balance request returns 404: the account is not yours; do not retry.
- Render is waking up: the first request after idle can take a long time on a free instance, so show a "waking the server" message after a few seconds instead of a blank page.

## Making the transfer form safe

The endpoint is idempotent by `idempotencyKey`, which is what lets the UI retry without double-paying.

### Idempotency key rules

- Generate the key with `crypto.randomUUID()` when the user opens the form, not on each click.
- Keep the same key if the user retries after a network error or timeout. The server will answer with the stored result.
- Generate a new key after the user edits amount or accounts, and after a 409 (the server tells you to).

### Response handling

| Status | Meaning | What the UI does |
| --- | --- | --- |
| `201` | Completed now | Success state, invalidate account and balance queries |
| `200` | Same key already completed | Treat as success; say "already processed" |
| `202` | Same key still processing | Keep the pending state; poll by re-submitting the same key every few seconds |
| `409` | Key previously FAILED or REVERSED | New key, let the user retry |
| `400` | Validation, insufficient balance, inactive account | Show `message` inline; it includes the current balance |
| `500` | Rolled back | Safe to retry; keep the same key |
| `401` | Session ended | Redirect to login |

### The 15-second wait

- Disable the form on submit, show a progress state with elapsed seconds, and block navigating away without a warning.
- Do not use a plain request timeout shorter than 30 seconds, or the UI will report failure for a transfer that then completes.
- Check the current limit for proxied rewrites on your Vercel plan. If a long request gets cut off, the 202 and 200 paths above let you recover with the same key.

### Client-side checks before sending

- Amount is a number greater than 0, sent as a JSON number and not a string (the server rejects strings).
- From and to accounts differ.
- Recipient is a 24-character hex ID. The server rejects anything else with "Invalid fromAccount or toAccount".
- Amount does not exceed the displayed balance. This is only a convenience; the server stays the authority.

## Ship to Vercel

Because of the proxy, the backend needs almost no changes for deployment.

1. Push the UI to its own GitHub repo, separate from the API.
2. Import it in Vercel. The framework preset detects Next.js; no custom build settings are needed.
3. Add `BACKEND_URL` under Environment Variables for Production and Preview.
4. On Render, confirm `NODE_ENV=production` is set. The cookie's `secure` flag follows it, and your Vercel domain is HTTPS.
5. Deploy, then test in order: register, login, open account, fund via the system user, transfer, logout.

### If login works but the next page says unauthorized

- Open the browser's network tab and check that the response to `/api/auth/login` has a `Set-Cookie` header.
- Check the cookie appears under your Vercel domain, not the Render one. If it is on Render, the code is calling Render directly instead of the relative `/api` path.
- Check that `credentials: "include"` is on every fetch. Same-origin requests send cookies by default, so this mainly matters if you ever switch to cross-origin.

Preview deployments get their own URLs, but with the rewrite approach they all work without touching CORS, which is the main reason to prefer it here.

## Build checklist

Ticks are saved in this browser only.

0 of 0

Sources: [Next.js proxy.js reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) · [shadcn/ui Next.js install](https://ui.shadcn.com/docs/installation/next) · repo [Hsk4/Banking-System](https://github.com/Hsk4/Banking-System)