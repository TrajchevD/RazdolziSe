# RazdolziSe mobile — identity, verification & feature build

Paste this whole file as your first message in a new session, with the
`RazdolziSe` folder connected.

## Project context

RazdolziSe is a trip-expense-splitting app. Backend: ASP.NET Core 9 + EF Core
(Pomelo.EntityFrameworkCore.MySql) against TiDB Cloud (MySQL-compatible).
Frontend: Angular 22, standalone components, signals, new `@if`/`@for` syntax.

There are two parallel copies in this repo:

- `RazdolziSe/backend/` and `RazdolziSe/frontend/` — the **original, live, web
  version**. Deployed on Vercel (frontend) + Render (backend) + TiDB Cloud
  (database). **Do not modify these.** They're the reference for how existing
  patterns work (auth, EF Core query shapes, etc.) — read them, don't change
  them.
- `RazdolziSe/mobile/backend/` and `RazdolziSe/mobile/frontend/` — a
  **Capacitor-wrapped native mobile version**, forked from the original and
  already substantially built out. **This is where all new work happens.**
  Do not create a third copy or a new top-level folder — keep building here.

Read `RazdolziSe/mobile/MOBILE_SETUP.md`, `RazdolziSe/mobile/PRODUCTION_REVIEW.md`,
and `RazdolziSe/mobile/DESIGN_IMPLEMENTATION.md` first — they document
everything already done and why, and will save you from re-deriving context.

## What's already built in `mobile/`

- Capacitor scaffold (`capacitor.config.ts`, native back button, status bar,
  splash screen, haptics, safe-area CSS vars) — app id
  `com.davidtrajchev.razdolzise`.
- CORS fixed to allow native origins (`capacitor://localhost`,
  `https://localhost`) alongside the web origin.
- Full visual redesign to the **"Tally" / Organic design system** (imported
  from a claude.ai/design project) — Caprasimo/Figtree fonts, cream/terracotta/
  sage palette, pill buttons, soft shadows. Applied globally via
  `styles.scss`, so it cascades even to screens not individually redesigned.
  Login/Register, Trips (home), and Profile got full bespoke layouts matching
  the design; trip-detail/add-expense/settlement inherit the theme but haven't
  been individually redesigned to match those specific prototype screens yet —
  worth doing as a later pass if you want full visual parity everywhere, but
  it's not blocking anything below.
- iOS/Android responsiveness fixes: `100dvh`, safe-area insets, 16px input
  font-size (prevents iOS auto-zoom), `overscroll-behavior`, landscape phones
  forced into mobile layout via `Capacitor.isNativePlatform()`.
- `TripInvite` feature (consent-based add-to-trip: invite → accept/decline,
  replacing the old instant-add). Backend model/service/controller, frontend
  `invites/` screen, wired into a 4-tab bottom nav (Trips/Invites/Analytics/
  Profile).
- Haptics, hand-built pull-to-refresh, staggered trip-card entrance animation.
- `Analytics` screen is still an honest "not built yet" placeholder.

Known loose end: `mobile/frontend/src/app/friends/` is dead code (superseded
by `invites/`) that a previous sandbox couldn't delete due to a permissions
quirk — delete it if you're in there and it's still present.

## Standing constraints (carried over, don't relitigate these)

- **Never handle credentials yourself.** Don't write passwords, connection
  strings with real secrets, or API keys into any file, even local config,
  even if the user pastes them into chat. Tell the user which file and which
  key to fill in, and have them do it themselves. This includes SMTP
  passwords/app passwords and any third-party API keys from Phase 3 below.
- **Never create third-party accounts on the user's behalf** (e.g. a SendGrid/
  Resend/Mailgun account, if you go that route instead of Gmail SMTP — see
  Phase 3). Ask the user to sign up themselves and hand you the resulting key.
- **`EnsureCreated()`, not real migrations.** Any schema change (new columns/
  tables) requires the user to drop and recreate the database against TiDB
  Cloud (documented in `DEPLOYMENT_GUIDE.md` and `DESIGN_IMPLEMENTATION.md` —
  same drill each time). Flag this clearly and tell them exactly what data
  they'll lose before they run it. If they don't want to lose existing test
  data, offer to write the raw `ALTER TABLE`/`CREATE TABLE` SQL by hand instead
  of a full drop.
- **No live build/run access.** This sandbox typically can't run `dotnet run`/
  `ng build`/`npm install` reliably (time limits, no root). Verify by close
  manual reading — tracing each new code path against the exact patterns
  already used elsewhere in the codebase — rather than assuming a live compile
  would catch issues. Ask the user to run and report back after each phase.
- **Ask before big schema/infra decisions**, don't just plow through all four
  phases below in one shot. Natural checkpoints: before the DB drop in Phase 1,
  before picking an email provider in Phase 3, before starting Phase 4 at all
  (confirm the user still wants it after 1-3 land).

## The actual work, in phases

### Phase 1 — Device-bound guest identity

Goal: opening the app for the first time should be usable immediately, no
registration screen blocking the way in.

- Backend: make `User.Email`/`PasswordHash` nullable. Add `DeviceId` (string,
  unique, nullable) and `IsGuest` (bool) to `User`. New endpoint
  `POST /api/auth/guest` — takes a client-generated device ID, creates a guest
  `User` row if one doesn't already exist for that ID (or reuses it), returns
  a JWT exactly like login does. No email, no password, no verification
  needed to call this.
- Frontend: on app start (native only — leave the web app's login-first flow
  alone), check local storage for a saved device ID; generate one via
  `crypto.randomUUID()` if missing and persist it with `@capacitor/preferences`;
  call `/api/auth/guest` automatically before the router even shows a login
  screen. The user lands straight in the Trips tab as a guest.
- This is additive — the existing email/password register/login flow keeps
  working unchanged for anyone who wants to type in credentials directly
  instead of starting as a guest.

### Phase 2 — Progressive account linking

Goal: let a guest "save"/"claim" their account without losing their data,
turning a device-bound identity into a portable, recoverable one.

- Backend: new endpoint, something like `POST /api/auth/link-account` (auth
  required, current user must have `IsGuest = true`) — takes email + password,
  validates the email isn't already in use, sets them on the *existing* user
  row (not a new row — this is the critical bit, it must preserve their trips/
  expenses), flips `IsGuest` to false.
- Frontend: a "Save your account" card in Profile for guest users (check
  `IsGuest` on the current-user response), explaining in one line why it
  matters (new phone, reinstall, don't lose your trips) rather than nagging.
  Reuses the register form's validation.
- This is also where Google/Apple sign-in would eventually plug in as an
  alternative to email/password linking, if you want it later — not in scope
  for this pass, flag it for the user rather than building it now.

### Phase 3 — Email verification + password reset

Both were already flagged as real gaps in `PRODUCTION_REVIEW.md` (no email
verification at all today — `asdf` currently passes as a valid email; no
password reset exists anywhere) and Phase 2 makes them more urgent, since a
linked account with a typo'd email is now the *only* recovery path for
someone's real trip data.

- Backend: add an `IEmailService` abstraction with one concrete implementation
  to start. Recommend **Gmail SMTP with an App Password** as the default for a
  project at this scale — free, no third-party account signup needed beyond
  the Gmail account the user already has (they generate the App Password
  themselves in their Google Account security settings and paste it into
  config, same as the DB credentials earlier — you don't touch it). Mention
  a transactional provider (Resend/SendGrid free tier) as a better long-term
  option if deliverability becomes an issue, but don't default to it since
  it requires the user to create a new account.
- Add a verification-code/expiry field (or small separate table) tied to
  `User`. Endpoints: `POST /api/auth/send-verification`,
  `POST /api/auth/verify-email`. Reuse the exact same mechanism for
  `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` — it's
  the same "prove you own this inbox" primitive both times.
- Decide and confirm with the user: does an unverified linked account keep
  full app access with just a nagging banner, or does it get restricted
  (e.g. can't be found/invited by other people's `Send Invite` email search
  until verified, since that's exactly the typo/impersonation risk being
  guarded against)? Recommend the banner approach — don't lock people out of
  their own data over an unverified email.

### Phase 4 — carried over from the earlier feature brainstorm

Already agreed in principle (items 1-5 from that earlier list; item 6 —
Google/Apple sign-in, push notifications — stays explicitly deferred). Do this
phase only after 1-3 are live and the user has confirmed they still want it:

1. Add Expense flow redesign — the current form requires scrolling to see all
   fields, confusing for new users; needs a more guided/stepped layout.
2. Group join codes + QR generate/scan, layered on top of the existing
   `TripInvite` system rather than replacing it — a code/QR is just another
   way to create the same pending invite.
3. Refresh tokens (JWT is currently a hard 120-minute wall, no refresh) plus
   biometric unlock (Face ID/fingerprint) for reopening the app — this now
   composes naturally with Phases 1-2: unlock gates access to whatever
   session (guest or linked) is already stored on the device.
4. In-app notifications (not push — that's deferred item 6): "X paid you
   back", and a lazy inactivity nudge for trips with money still owed after
   ~7 days. In-app only, no backend job scheduler needed given Render's free
   tier isn't reliable for cron-style background work.
5. Discord-style profile identity (username + short ID, optionally a QR code)
   — lower priority than the above, do last if time allows.

## How to start

Read the three `mobile/*.md` docs and skim the current `mobile/backend/` auth
code (`Services/AuthService.cs`, `Controllers/AuthController.cs`) and
`mobile/frontend/src/app/auth/` before writing anything, so Phase 1's guest
flow matches existing patterns rather than inventing new ones. Then propose
the exact schema change for Phase 1 and confirm the DB-drop tradeoff with the
user before touching the database.
