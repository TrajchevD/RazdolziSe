# RazdolziSe — Mobile build

This folder is a copy of the web project, wrapped for a native mobile app via
[Capacitor](https://capacitorjs.com/) rather than a rewrite — it reuses 100% of the
existing Angular UI and the existing ASP.NET backend (same Render deployment, no
second backend to run). The original `frontend/`/`backend/` at the project root are
untouched.

## What was changed here vs. the original

**`frontend/`**
- `capacitor.config.ts` — new. App id, splash screen, status bar config.
- `package.json` — added `@capacitor/*` packages and three scripts: `cap:sync`,
  `cap:android`, `cap:ios`.
- `src/index.html` — added `viewport-fit=cover` (lets the app draw under the
  notch/status bar instead of leaving a dead grey bar) and theme-color meta tags.
- `src/styles.scss` — added `env(safe-area-inset-*)` CSS variables so content
  doesn't render underneath the notch, status bar, or gesture bar.
- `src/app/core/native.service.ts` — new. Handles the Android hardware/gesture back
  button (in-app back instead of instantly exiting), syncs the OS status bar color
  with the existing dark/light theme toggle, and dismisses the splash screen once
  Angular has actually painted. Every call in it is guarded by
  `Capacitor.isNativePlatform()`, so it's a complete no-op if this same build is
  ever opened in a regular browser.
- `src/app/app.ts` — one line added to inject `NativeService` at root, same pattern
  already used for `ThemeService`.

**`backend/`**
- `Program.cs` / `appsettings.json` — CORS now reads a comma-separated
  `Cors:AllowedOrigins` list instead of a single `Cors:AllowedOrigin` string, and
  always includes `capacitor://localhost` (iOS) and `https://localhost` (Android).
  A native app has no single "domain," so without this the packaged app's API
  calls would be silently blocked by CORS even though the same calls work fine
  from the Vercel-hosted web version.
  **If you deploy this backend to Render separately from the web one, the env var
  is now `Cors__AllowedOrigins`, not `Cors__AllowedOrigin` — update accordingly.**
  If you'd rather keep one backend serving both the web app and the mobile app
  (recommended — it's the same API either way), just add this origin change to
  your existing Render service instead of standing up a second one.

## Before your next deploy: apply the Phase 1-4 schema changes

Phases 1-4 (guest identity, account linking, email verification/password reset,
join codes, refresh tokens, notifications, profile tags) added several nullable
columns to `Users`/`Trips` and one new table (`AppNotifications`). The Friends
feature (search by Name#Tag, requests, a friends list) added a second new
table (`Friendships`) plus a `Type` column and nullable `TripId` on
`AppNotifications`. Mobile's backend currently points at the same live
`TripSplitDb` database as the original web app (see
`mobile/backend/appsettings.json`), and `EnsureCreated()` won't add any of
this to a database that already exists — only to a brand-new one. Run
`mobile/SCHEMA_UPDATE_PHASE_1-4.sql` and then
`mobile/SCHEMA_UPDATE_PHASE_6_FRIENDS.sql`, in that order, once against
TripSplitDb (TiDB Cloud's SQL Editor, or any MySQL client) before deploying
this backend. Both are additive-only — no existing trip/expense/user data is
touched.

## What you still need to do (needs Android Studio / Xcode, not available in this sandbox)

1. `cd mobile/frontend && npm install`
2. `npx cap add android` (and `npx cap add ios` if you have a Mac — iOS builds
   require Xcode and can't be produced on Windows/Linux at all, that's an Apple
   platform restriction, not a Capacitor limitation)
3. Replace the placeholder icon/splash: Capacitor's docs point to
   [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) to
   generate every required icon/splash size from one source PNG — do this once
   you have real branding (you mentioned working on design next).
4. `npm run cap:android` — builds Angular, syncs into the native project, opens
   Android Studio. Run from there onto an emulator or your own phone (USB
   debugging).
5. Before your first real Play Store / App Store submission: see the audit
   report for the account-recovery and CORS/session items flagged as blocking —
   worth fixing before real users, not after.
6. Biometric unlock (Phase 4.3) added `@aparajita/capacitor-biometric-auth` to
   `package.json` — after `npm install` and `npx cap sync ios`, open
   `ios/App/App/Info.plist` in Xcode and add an `NSFaceIDUsageDescription` key
   (e.g. "Used to unlock RazdolziSe"), or Face ID will silently fail on iOS.
   Android needs no manifest changes — the plugin merges its own permission.
7. Camera QR scanning (Friends + group join) added `@capacitor-mlkit/barcode-scanning`
   to `package.json`. After `npm install` and `npx cap sync`:
   - **iOS**: add `NSCameraUsageDescription` to `ios/App/App/Info.plist` (e.g.
     "Used to scan a friend's or trip's QR code"), and make sure
     `ios/App/Podfile`'s deployment target is at least `15.5`.
   - **Android**: add `<uses-permission android:name="android.permission.CAMERA" />`
     to `android/app/src/main/AndroidManifest.xml` before the `<application>`
     tag, and inside the `<application>` tag add
     `<meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui"/>`.
     Without the meta-data tag, ML Kit's barcode module won't be bundled and
     scanning will fail at runtime on first use.

## Why not fully scaffold `android/`/`ios/` here

`npx cap add android` needs to run somewhere with `npm install` already completed
and network access to Maven/Gradle's package registries, then opens Android Studio
directly — none of which this sandbox has (no Android/Java toolchain, no GUI). The
config above is everything that *can* be prepared without that toolchain; the
platform folders themselves need to be generated once on your own machine.
