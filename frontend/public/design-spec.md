# Banking UI: Layout and Theme Spec

Stack: Next.js 16 (App Router) + shadcn/ui + Tailwind, deployed on Vercel.
Backend: Express API on Render, proxied through `/api/*`.

This file describes what each page looks like and how it behaves. It does not contain component code.

---

## 1. Design direction

A calm, trustworthy money app. Quiet surfaces, one deep teal accent, and large clear numbers. Nothing decorative competes with balances and the transfer form.

Principles:

- **Numbers come first.** Balances are the largest text on the dashboard.
- **One accent.** Teal marks the primary action on each screen. Everything else is neutral.
- **State is visible.** Status, pending and error states use color plus a label or icon, never color alone.
- **Same layout everywhere.** Auth pages share one centered card; app pages share one shell.

---

## 2. Theme tokens

Map these onto shadcn's CSS variables in `globals.css`. Define light in `:root` and dark under `.dark`. Hex values are fine in Tailwind v4; convert to oklch if you want to match the shadcn defaults.

### Light

| Token (shadcn variable) | Hex | Use |
|---|---|---|
| `--background` | `#F4F7F8` | Page background (cool grey with a teal tint) |
| `--foreground` | `#122026` | Body text |
| `--card` | `#FFFFFF` | Cards, dialogs, table surface |
| `--card-foreground` | `#122026` | Text on cards |
| `--primary` | `#0B6E69` | Primary buttons, links, focus ring |
| `--primary-foreground` | `#FFFFFF` | Text on primary |
| `--secondary` | `#DFF1EF` | Soft teal fills, selected rows |
| `--secondary-foreground` | `#0B4F4B` | Text on secondary |
| `--muted` | `#E8EEF0` | Skeletons, disabled fields |
| `--muted-foreground` | `#52646C` | Captions, helper text, labels |
| `--accent` | `#DFF1EF` | Hover background on menu items |
| `--border` | `#D6E0E4` | Card and input borders |
| `--input` | `#C3D0D5` | Input border (slightly stronger than `--border`) |
| `--ring` | `#0B6E69` | Focus ring |
| `--destructive` | `#A3262A` | Errors, failed states, destructive buttons |

### Dark

| Token | Hex |
|---|---|
| `--background` | `#0E1519` |
| `--foreground` | `#E6EEF1` |
| `--card` | `#151E24` |
| `--card-foreground` | `#E6EEF1` |
| `--primary` | `#4FC7BF` |
| `--primary-foreground` | `#06201E` |
| `--secondary` | `#12302F` |
| `--secondary-foreground` | `#BDEFEA` |
| `--muted` | `#1C2830` |
| `--muted-foreground` | `#9DB0B8` |
| `--accent` | `#1C2830` |
| `--border` | `#26343C` |
| `--input` | `#31424B` |
| `--ring` | `#4FC7BF` |
| `--destructive` | `#FF8A8D` |

### Semantic status colors (add as extra variables)

These are separate from the accent so status never reads as "brand".

| Meaning | Light text / fill | Dark text / fill | Used for |
|---|---|---|---|
| Success | `#1F6F3F` / `#DFF3E6` | `#6FD49A` / `#14301F` | ACTIVE badge, completed transfer |
| Warning | `#8A5A00` / `#FBF0D6` | `#F0C15A` / `#2E2510` | FROZEN badge, pending, waking server |
| Danger | `#A3262A` / `#FBE3E3` | `#FF8A8D` / `#3A1A1C` | CLOSED badge, failed, errors |
| Info | `#0B6E69` / `#DFF1EF` | `#4FC7BF` / `#12302F` | Neutral notices |

Check contrast: all text pairs above are intended to be at least 4.5:1. Verify any pair you change.

### Shape, spacing, type

- **Radius:** `--radius: 0.625rem` (10px). Inputs and buttons use the base radius; cards use one step up. Badges are fully rounded.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48. Page padding is 16px on mobile, 24px from `md`, 32px from `lg`.
- **Font:** Geist Sans for UI (the `create-next-app` default) and Geist Mono for account IDs and amounts in the transfer receipt.
- **Type scale:**

| Role | Size / weight | Where |
|---|---|---|
| Balance | 36px / 600 (30px on mobile) | Dashboard account cards |
| Page title | 24px / 600 | Top of each page |
| Card title | 16px / 600 | Card headers |
| Body | 14px / 400 | Forms, tables |
| Caption | 12px / 400, muted | Helper text, timestamps |

- **Money formatting:** `Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" })`. Use `font-variant-numeric: tabular-nums` on every amount so digits line up.
- **Dark mode:** follow the system setting by default, with a toggle in the user menu. Use `next-themes` or the shadcn dark mode guide.

### Component styling rules

- **Primary button:** teal fill, white text (dark text in dark mode), 40px tall, full width inside auth cards.
- **Secondary button:** outline with `--border`, same height.
- **Inputs:** 40px tall, `--input` border, teal focus ring (2px), error state swaps the border to `--destructive` and shows a 12px message below.
- **Cards:** `--card` fill, 1px `--border`, no shadow. Use shadow only on dialogs.
- **Badges:** pill, 12px, 600 weight, semantic fill and text color from the table above.
- **Toasts (Sonner):** bottom-right on desktop, top-center on mobile.

---

## 3. App shell (all signed-in pages)

**Desktop (from 1024px)**

```
+----------------------------------------------------------+
| Logo / name      Dashboard   Transfer         [theme] [JS]|  <- 56px top bar
+----------------------------------------------------------+
|                                                          |
|        content, max width 960px, centered                |
|                                                          |
+----------------------------------------------------------+
```

- Top bar, 56px, `--card` fill, 1px bottom border. No sidebar; there are only two main destinations.
- Left: wordmark. Center-left: nav links with a teal underline on the active one.
- Right: theme toggle and a user avatar button (initials from `name`). The menu holds the user's name and email (kept from the login response), "Admin: fund account", and "Log out".
- Content area: `max-w-4xl`, centered, 24px vertical padding.

**Mobile (below 768px)**

- Top bar shrinks to the wordmark and the avatar menu.
- Navigation moves to a fixed bottom bar with two items (Dashboard, Transfer), 56px tall plus the safe-area inset. Active item uses the teal color and a 2px top indicator.
- Content gets 16px side padding and 72px bottom padding so nothing hides behind the bar.

---

## 4. Pages

### 4.1 Login (`/login`)

- Full-height page, background `--background`, content centered vertically and horizontally.
- One card, max width 400px, padding 24px.
- Order inside the card:
  1. Wordmark (centered, 20px)
  2. Title "Welcome back" (24px) and a muted line "Sign in to your accounts"
  3. Email field
  4. Password field with a show/hide icon button
  5. Primary button "Sign in", full width
  6. Muted line below: "No account? **Create one**" (link in teal)
- Error from the server ("Invalid credentials", "User does not exist") appears in a destructive Alert above the button, not as a toast.
- Pending: button shows a spinner and "Signing in…", fields disabled.
- Mobile: the card loses its border and shadow and fills the width with 16px padding; the page keeps the vertical centering.

### 4.2 Register (`/register`)

- Same layout and width as login.
- Fields in order: Full name, Email, Password, Confirm password.
- Helper text under Password: "At least 6 characters".
- Validation is inline, on blur: email format, 6-character minimum, confirmation must match.
- Button: "Create account". Link below: "Already registered? **Sign in**".
- Server errors ("User already exists", "Passwords do not match") appear in the top Alert.
- On success, go straight to the dashboard (registration already sets the cookie).

### 4.3 Dashboard (`/dashboard`)

Structure from top to bottom:

1. **Page header row:** title "Your accounts" on the left, button "Open account" on the right (outline style; hide it if you decide on one account per user and one exists).
2. **Account grid:** 1 column on mobile, 2 columns from `md`. Each account is a card.
3. **Empty state** (no accounts): one centered card with an icon, "No accounts yet", a muted explanation, and the primary button "Open your first account".

**Account card layout (top to bottom)**

- Row 1: "Account" label (caption, muted) on the left, status badge on the right.
- Row 2: balance, 36px, tabular numbers, `PKR` shown as a smaller muted prefix or as part of the formatted currency.
- Row 3: account ID in Geist Mono, 12px, truncated in the middle, with a copy icon button. Copy gives a "Copied" toast, since recipients need this ID.
- Row 4: footer with caption "Opened 12 Mar 2026" (from `createdAt`) and a text button "Transfer" that opens the transfer page with this account preselected.

**Loading:** card shows skeletons for the balance and ID while each balance request runs. The status badge and ID come from the account list, so they render immediately.

**Errors:** if a balance request fails, show "Could not load balance" in muted text with a small Retry link inside that card only.

**Cold-start notice:** if the first request takes more than 4 seconds, show a thin Info alert above the grid: "Waking up the server, this can take up to a minute."

### 4.4 Open account (dialog on the dashboard)

- A shadcn Dialog, max width 420px, opened by "Open account".
- Content: title "Open a new account", a muted line "A PKR account will be created and activated immediately", then Cancel and "Open account" buttons.
- Errors (401, 500) show in an Alert inside the dialog. On success the dialog closes, the list refreshes and a toast says "Account opened".
- No separate page is needed.

### 4.5 Transfer (`/transfer`)

Layout: a single centered card, max width 560px, below the page title "Send money".

**Form (top to bottom)**

1. **From account:** Select listing the user's accounts. Each option shows the last 6 characters of the ID, status and balance. Only ACTIVE accounts are selectable.
2. **Available balance:** caption under the select, tabular numbers, updates with the selection.
3. **To account:** text input in Geist Mono, placeholder "Recipient account ID", with a paste icon button. Inline error if it is not 24 hex characters or equals the From account.
4. **Amount:** large input (24px), `PKR` as a fixed prefix, numeric keypad on mobile. Error if zero, negative, or over the balance.
5. **Summary row:** muted line "You will send PKR 2,500.00" updating live.
6. **Primary button:** "Send money", full width.

**States of the card**

- **Idle:** as above.
- **Submitting (up to about 15 seconds):** the form fields disable. The button becomes "Sending…" with a spinner. Under it, a muted line "This can take up to 15 seconds. Please keep this page open." and an elapsed-seconds counter. A thin indeterminate progress bar sits at the top of the card.
- **Success:** the form is replaced by a result panel: a green check icon, "Transfer complete", the amount in 30px, a two-row detail list (To account in mono, Transaction status), and two buttons: "Back to dashboard" (primary) and "Send another" (outline). A "Send another" resets the form and creates a new idempotency key.
- **Already processed (200):** same panel with the title "Already processed".
- **Still processing (202):** warning panel "Your transfer is still being processed" with a "Check again" button that resubmits the same key.
- **Failed (400, 409, 500):** a destructive Alert above the form with the server message; the form stays filled and editable. A 500 message adds "You can safely try again".

**Mobile:** the card becomes full-bleed under the title with 16px padding. The Send button is sticky above the bottom nav while the amount input has focus.

### 4.6 Admin: fund an account (`/admin/fund`)

- Same single-card layout as the transfer page, max width 480px.
- A warning Alert at the top: "System users only. Funds are created from the system account."
- Fields: To account (mono, 24 hex characters) and Amount, then the button "Add funds".
- Result panel matches the transfer success panel.
- Not shown in the main navigation; it is reachable from the avatar menu. A 401 renders a full-card message: "This page is for system users."

### 4.7 Not found and error pages

- `not-found`: centered, large "404" in muted text, one line of copy, and a "Back to dashboard" button.
- `error.tsx`: centered card with "Something went wrong", a "Try again" button and, in development only, the error message.
- Session expired (a 401 anywhere): redirect to `/login` with a toast "Your session ended. Please sign in again."

---

## 5. Cross-page behavior

| Concern | Rule |
|---|---|
| Loading | Skeletons for data; spinners only inside buttons |
| Focus | Visible 2px teal ring on every interactive element |
| Touch targets | At least 44px tall on mobile |
| Motion | 150ms fades and transitions only; respect reduced motion |
| Icons | `lucide-react` (ships with shadcn), 16px in buttons, 20px elsewhere |
| Copy tone | Plain and specific: "Transfer complete", not "Success!" |
| Language | Currency is always PKR; dates use `en-GB` format ("12 Mar 2026") |

## 6. Responsive breakpoints

| Width | Changes |
|---|---|
| below 640px | Single column, bottom navigation, sticky Send button |
| 640 to 1023px | Account grid becomes two columns; top bar holds the nav links |
| 1024px and up | Content max width 960px, centered; extra whitespace on the sides |

## 7. Build order for the visuals

1. Paste the light and dark tokens into `globals.css` and confirm shadcn components pick them up.
2. Build the auth card once and reuse it for login and register.
3. Build the app shell with the top bar and mobile bottom bar.
4. Dashboard account card, then the empty state.
5. Transfer card with all five states.
6. Admin card, then not-found and error pages.
