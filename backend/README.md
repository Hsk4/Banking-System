# banking-system — backend

Express + MongoDB API for the banking system. This folder is the `backend`
branch and the root directory Render builds from.

## Install

```bash
bun install
```

## Configure

Copy `.env.example` to `.env.local` and fill it in. Bun loads `.env.local`
automatically.

| Variable                 | Purpose                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`            | Atlas connection string                                                                                                                                                                                   |
| `JWT_SECRET`             | Signing key for auth tokens                                                                                                                                                                               |
| `EMAIL_USER`, `GOOGLE_*` | Nodemailer / Google mail credentials                                                                                                                                                                      |
| `PORT`                   | Port to listen on (Render sets this for you)                                                                                                                                                              |
| `CORS_ORIGIN`            | Comma-separated browser origins allowed to call the API, e.g. `http://localhost:3000,https://your-ui.vercel.app`. The Capacitor origins (`https://localhost`, `capacitor://localhost`) are always allowed |
| `NODE_ENV`               | `production` on Render; the login cookie then becomes `SameSite=None; Secure`                                                                                                                             |

## Run

```bash
bun run dev      # watch mode
bun run start    # plain start
```

The API listens on `PORT` (default `3000`). `GET /` returns
`{"status":"ok"}` and is the Render health check path.

## Type check

```bash
bun run typecheck   # tsc --noEmit
```

## Layout

| Folder                         | Role                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `src/models`                   | Mongoose schemas. No request handling                                                       |
| `src/controllers`              | Read the request, call a model or service, send JSON                                        |
| `src/routes`                   | Map URL + method to a controller, plus auth middleware                                      |
| `src/services`                 | Ledger, treasury and email logic shared by controllers                                      |
| `src/middleware`, `src/config` | Auth guard, database connection                                                             |
| `scripts`                      | One-off utilities (`create-system-user.ts`, `inspect.ts`), run with `bun scripts/<file>.ts` |
| `docs`                         | API reference (`banking_system.mdx`) and mail setup (`nodemailer.md`)                       |
| `postman`, `.postman`          | Request collections                                                                         |
