# API notes

Behaviour that callers depend on and that is easy to get wrong. The full
reference lives in `banking_system.mdx`; this file records the rules that were
added after the first version.

## Idempotency — the 409 contract

Every money-moving POST carries a client-generated `idempotencyKey`.

| Key state on the server | Response |
| --- | --- |
| Never seen | the transfer runs; `201` on commit, `202` when held for a code |
| Already `COMPLETED` | `200` with the original `transaction` — nothing moves again |
| Still `PENDING` | `202`, "Transaction is still processing" |
| `FAILED` / `REVERSED` | `409`, "retry with a new idempotencyKey" |

Two rules follow:

- A **timeout is not a failure**. A `408` from the client's own abort, or a
  dropped connection, may still have committed on the server, so the retry must
  reuse the **same** key.
- A **409 means the key is spent**. The next attempt must use a **new** key or
  it replays the same failure forever.

Keys are scoped per sending account. Two customers may use the same key
string; the uniqueness that prevents double-booking is
`(fromAccount, idempotencyKey)`.

## Addresses: id or account number

Account references accept either form:

- the internal 24-character id (what the admin page and older clients send)
- the short 8-digit account number, with or without the space — `4821 7360`,
  `48217360`

Only the number is shown to a person. It is assigned at account creation and
backfilled on boot for older accounts.

## Recipient lookup

`GET /api/recipients/lookup/:accountNumber` returns **only** a masked name and
a status:

```json
{
  "accountNumber": "4821 7360",
  "name": "Ayesha K.",
  "status": "ACTIVE",
  "canReceive": true,
  "isSelf": false
}
```

Never the balance, the email, the full name, or the internal id. It is
rate-limited per user, because without a limit it would be a way to walk
through account numbers and list customers.

## Limits, in order

1. `amount` must be positive, at most two decimal places.
2. `amount` ≤ `LIMIT_PER_TRANSFER` (default 100,000), else `400`.
3. `sentToday + amount` ≤ `LIMIT_DAILY_PER_ACCOUNT` (default 250,000), else
   `400` with the amount still available today.
4. `amount` > `LIMIT_STEP_UP_THRESHOLD` (default 50,000) → **step-up**.

## Step-up (large transfers)

The transfer and its two ledger entries are written in one session, then the
header is stored as `PENDING` with `holdExpiresAt`. The response is `202` with
`requiresCode: true`. A six-digit code is emailed; only its hash is stored.

`POST /api/transactions/:id/confirm { code }` releases the hold:

| Case | Response |
| --- | --- |
| correct code, amount unchanged | `200`, status `COMPLETED` |
| wrong code | `400`; five wrong guesses burn the code |
| expired hold | `409`; the transfer must be started again |
| code already used | `400` |

Nothing is posted until the hold is released, so an abandoned hold moves no
money. `GET /api/transactions/:id` shows it as `PENDING`.

## History

`GET /api/transactions/history/:accountId`

- Cursor paging, not offsets: pass `cursor` back for the next page.
- `limit` defaults to 25, capped at 100.
- `direction` is `all` (default), `in` or `out`.
- `from` / `to` accept `YYYY-MM-DD` or a full ISO timestamp, inclusive.
- Every row carries `balanceAfter`, computed as the running ledger total up to
  that entry.

CSV export: `GET /api/accounts/:accountId/history.csv` with the same filters,
capped at 5,000 rows.

## Session

- Tokens carry the user's `tokenVersion`. `POST /api/auth/logout-all` bumps it,
  which retires every token issued before the call, on every device.
- `GET /api/auth/me` confirms a stored session is still valid.
- Signing in from a different device than the last one emails an alert.
- Five failed sign-ins pause that email for 15 minutes and email the owner.
  Login rate limiting is per IP; the lockout is per email.

## Admin

Everything under `/api/admin` requires `systemUser`; a customer gets `403`.

- `GET /overview`, `GET /users`, `GET /accounts?q=&status=&page=`
- `PATCH /accounts/:id/status { status, reason? }` — `ACTIVE`, `FROZEN`,
  `CLOSED`. The treasury is refused.
- `GET /transactions?q=&from=&to=&page=` — with both ledger entries per row.
- `GET /audit` — read-only; the model rejects every update and delete.

An administrator never edits the ledger. A mistake is corrected by writing a
reversing entry that points at the original.
