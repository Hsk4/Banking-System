# banking-system

One repository, three branches, no overlap.

| Branch     | Contents                                | Deploys to                 |
| ---------- | --------------------------------------- | -------------------------- |
| `main`     | `backend/`, `frontend/`, root files, CI | Nothing. CI only           |
| `backend`  | `backend/` and nothing else             | Render                     |
| `frontend` | `frontend/` and nothing else            | Vercel, Android APK builds |

All three descend from one empty root commit, so merging `backend` and
`frontend` back into `main` touches disjoint paths and never conflicts.

## Layout

- `backend/` — Express + MongoDB API (Bun, TypeScript). See `backend/README.md`.
- `frontend/` — Next.js static export + Capacitor shell. See `frontend/README.md`.
- `.github/workflows/` — CI on `main`, plus an on-demand APK build.

## Day-to-day

```bash
git switch backend && git pull
git switch -c feat/admin-dashboard     # cut from backend, never from main
# ...work, commit, push, open a PR into backend...
# Render redeploys when the PR merges into backend

git switch main && git pull
git merge --no-ff backend              # or a PR backend -> main
git push
```

Same shape for `frontend` (Vercel deploys on merge into `frontend`).

Rules:

- Cut `feat/*` branches from `backend` or `frontend`, never from `main`.
- Never merge `main` into either branch.
- Edit root-only files (`README.md`, `.gitignore`, `.github/`) on `main` only.
- A change touching both halves ships as two PRs, backend side first.

## Run locally

Both halves at once, in two terminals:

```bash
cd backend && bun install && bun run dev    # http://localhost:3000
cd frontend && bun install && bun run dev   # http://localhost:3000 -> see below
```

The frontend reads the API base URL from `NEXT_PUBLIC_API_URL` (inlined at
build time). Copy `frontend/.env.example` to `frontend/.env.local` and set it to
`http://localhost:<PORT>` of the backend. The backend's `CORS_ORIGIN` must list
the frontend's origin.

## History

The pre-split repository is preserved as the `legacy-main` branch and the
`pre-split` tag. The first commit of the split is tagged `split-root-commit`.
