# Adding Capacitor to `frontend/` — plan, options and risks

Status: implementing **Option A**. Written 26 Oct 2026.

This document records the plan, every option that was on the table, the risk
of each, and the one that was chosen. It exists so the decision can be
reviewed later without re-deriving it.

---

## 1. Goal

Ship the Next.js banking UI as an Android (and later iOS) app with Capacitor,
reusing the same React code and the same Render API.

## 2. The constraint that shapes every option

The web app authenticates with an **httpOnly cookie** set by the Express API.
That only works without friction when the browser talks to the API
**same-origin**, which today is achieved by a Next.js route handler that
proxies `/api/*` to Render:

```
frontend/app/api/[...path]/route.ts
```

Capacitor changes two things at once:

1. The app is served by the WebView from `https://localhost` (Android) or
   `capacitor://localhost` (iOS) — **not** from the Vercel domain.
2. A Capacitor build has **no Node server**, only static files. Any
   `/api/*` route handler cannot exist in the bundle.

And the backend only reflects origins listed in `CORS_ORIGIN`
(`src/app.ts`, defaults to `http://localhost:3000`):

```ts
const allowedOrigins = process.env.CORS_ORIGIN ?? "http://localhost:3000";
```

`https://localhost` and `capacitor://localhost` are **not** in that default.
There is no wildcard, and `Access-Control-Allow-Credentials: true` forbids one.

## 3. Options considered

### Option A — Static export, no proxy, absolute API URL ✅ **chosen**

Delete the proxy route, keep `output: "export"`, point the app at Render with
`NEXT_PUBLIC_API_URL`, and authenticate with a bearer token because cookies
are third-party there.

- **Pros**: one build for web and native; no server needed; the only option
  that works inside Capacitor without embedding a server.
- **Cons**: the Vercel web app also stops being same-origin. Web sign-in then
  depends on `CORS_ORIGIN` including the Vercel domain **and** on the token
  fallback (Safari/Chrome block third-party cookies by default).
- **Risk**: **High** for the existing web deployment, Medium for native.

### Option B — Keep the proxy for web, separate mobile config

Leave `next.config.ts` and the proxy untouched; add a second config
(e.g. `next.mobile.config.ts`) with `output: "export"` and no API route, and
build mobile from that.

- **Pros**: zero change to the working web deployment.
- **Cons**: two build pipelines; the shared `app/` tree must not contain server
  routes for the mobile build, so the API route has to move or be excluded;
  more machinery to maintain.
- **Risk**: **Low** for web, Low–Medium for native. Not chosen because you
  asked for A.

### Option C — Embed the backend in the app

Bundle the Express server and run it on the device.

- **Pros**: full same-origin, cookies behave.
- **Cons**: the app would be offline-only; it cannot reach Atlas without
  shipping database credentials on the device. Not viable.
- **Risk**: **Unacceptable** (secret leakage).

### Option D — Point the WebView at the deployed Vercel URL

Keep everything as-is and load `https://<vercel-app>` inside Capacitor via
`server.url`.

- **Pros**: no code change at all.
- **Cons**: it is a browser in a window, not an app; store review rejects it;
  loses native benefits.
- **Risk**: **High** (store rejection), and it hides the real work.

---

## 4. Chosen option: A — decision and consequences

Chosen for: one codebase, one build, no server on the device.

Accepted consequences, in order of how likely they are to bite:

| #   | Consequence                                                                           | Severity | Mitigation                                                                    |
| --- | ------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| 1   | Web app stops using the same-origin proxy                                             | **High** | Set `CORS_ORIGIN` on Render to include the Vercel domain **before** deploying |
| 2   | Web login may fall back to bearer tokens if third-party cookies are blocked           | Medium   | Token fallback is implemented; cookie is still attempted first                |
| 3   | Native requires `CORS_ORIGIN` to list `https://localhost` and `capacitor://localhost` | **High** | Render env change, verified by reading the `Origin` header                    |
| 4   | `proxy.ts` gate reads the `token` cookie, which no longer gets set                    | **High** | Rewritten to check the same key that stores the signed-in user                |
| 5   | `webDir: "public"` packages the wrong folder (blank app)                              | High     | Fixed to `out`                                                                |
| 6   | No deep-link/back-button handling in the WebView                                      | Low      | Out of scope; document it                                                     |

---

## 5. Implementation steps

1. **Dependencies** — `@capacitor/core`, `@capacitor/cli`, plus the
   `@capacitor/android` / `@capacitor/ios` platforms already in
   `dependencies`. Requires Node ≥ 22 (Capacitor 8).
2. **`capacitor.config.ts`** — `webDir: "out"`, app id
   `com.bankingsystem.app`, app name “Banking System”.
3. **API base URL** — `lib/api.ts` reads `NEXT_PUBLIC_API_URL`; empty means
   same-origin (unchanged behaviour for web dev), set means absolute.
4. **Bearer fallback** — store the token returned by login/register and send
   `Authorization: Bearer …` when a base URL is configured.
5. **Remove the proxy** — delete `app/api/[...path]/route.ts` and its
   `next.config.ts` rewrite, so the static export can build.
6. **Route gate** — `proxy.ts` must not rely on a cookie that no longer
   exists cross-origin.
7. **Scripts** — `build:mobile`, `cap:sync`, `cap:copy`, `android:open`,
   `android:run`.
8. **Platform** — `npx cap add android`, `npx cap sync android`.
9. **Verify** — build, sync, inspect the packaged assets, run in an emulator
   and read the console/network.

## 6. Outcomes and how each is handled

| Outcome                         | Symptom                                        | Handling                                                                        |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Build passes, app loads         | UI renders in emulator                         | Proceed to API checks                                                           |
| Login blocked by CORS           | `TypeError: Failed to fetch`, no response body | Read the failing `Origin` in `chrome://inspect`; add it to Render `CORS_ORIGIN` |
| Login 401 with token present    | Session not persisted                          | Confirm `setAuthToken` ran; check `banking-ui-token` in WebView storage         |
| Blank/white screen              | No assets in APK                               | `webDir` wrong or `cap sync` not run after build                                |
| Web app breaks on Vercel        | Sign-in fails same-origin                      | `CORS_ORIGIN` missing the Vercel domain — this is the main risk of A            |
| Cookie works on web, not native | Third-party cookie blocked                     | Expected; bearer fallback covers it                                             |

## 7. What cannot be fixed from this repository

The Render environment variable `CORS_ORIGIN`. It is a dashboard setting, not
code, and without it every native request fails regardless of the frontend.
The frontend will be made correct; the origin list is an operator step.

## 8. Implementation log (what actually happened)

Two obstacles appeared that step 5 did not predict, both caused by
`output: "export"`:

1. **`cacheComponents: true` blocks the export.** It implies Partial
   Prerendering, which the build rejects with _“PPR cannot be enabled in
   export mode”_. Both `cacheComponents` and `partialPrefetching` are now
   `false`; they only affect server rendering, which this build no longer has.
2. **The edge gate lost its signal.** `proxy.ts` read the `token` cookie, which
   is no longer set on this origin; worse, Next.js refuses to start at all with
   `Middleware cannot be used with "output: export"`. The gate was replaced by
   `components/auth-guard.tsx` inside `(app)/layout.tsx` and `proxy.ts` was
   removed.

3. **`JSON.parse` was handed HTML.** With `NEXT_PUBLIC_API_URL` unset, `/api/*`
   hit the static host, which answers with `index.html` **and status 200**. The
   non-2xx check never fired and the raw body was parsed, producing
   `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`. Two fixes:
   the base URL now falls back to the Render URL when the variable is missing,
   and `parseBody()` in `lib/api.ts` turns any HTML body into an `ApiError`
   regardless of status.

Verified: `next build` succeeds and writes all 7 routes to `out/`; `cap add`
and `cap sync android` succeed; `out/` is copied to
`android/app/src/main/assets/public`; `tsc --noEmit` exits 0 in `frontend/`;
both login failure modes now show a readable message instead of a parse error.

### Toolchain: JDK, Gradle and AGP

- **JDK 25 LTS (Zulu 25.0.5)** is installed at `F:\Java\jdk-25`, with
  `JAVA_HOME` set machine-wide and `F:\Java\jdk-25\bin` first on PATH. The
  previous JDK 22 install was removed.
- **Gradle and AGP had to move.** Gradle 8.14.3 cannot run on Java 25 - support
  starts at Gradle 9.1 - so the wrapper is **Gradle 9.6.0** and the plugin is
  **AGP 9.4.0**, which is what 9.6 requires. Both are in `android/`.
- AGP 9 also removed `proguard-android.txt`, so `app/build.gradle` now uses
  `proguard-android-optimize.txt` and `proguard-rules.pro` carries
  `-dontoptimize` to preserve the old behaviour. This was verified by a
  successful `assembleRelease`.
- **`cap sync` regenerates Android files.** Re-running `cap add android`
  restores Gradle 8.14.3 / AGP 8.13.0 and re-breaks the build on JDK 25.
- The release variant signs with `app/keystore/debug.keystore`, generated
  locally and **git-ignored**. Replace it with a real `signingConfig` before
  publishing.

### Building the APK

```bash
bun run android:apk    # debug APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Set `NEXT_PUBLIC_API_URL` before that build. `bun run build:mobile` reads
`frontend/.env.local`, so a local value (`http://localhost:3001`) bakes a URL
the phone cannot reach:

```bash
NEXT_PUBLIC_API_URL=https://banking-system-r8bq.onrender.com bun run android:apk
```

### Remaining operator steps (not code)

- Render `CORS_ORIGIN` must include: the Vercel domain,
  `https://localhost`, `capacitor://localhost`.
- Vercel build needs `NEXT_PUBLIC_API_URL=https://banking-system-r8bq.onrender.com`.
- Login has not been exercised on a device, so the CORS outcome is unproven.
  The first failure will be a fetch rejection with no body; `chrome://inspect`
  shows the exact `Origin` to add on Render.
