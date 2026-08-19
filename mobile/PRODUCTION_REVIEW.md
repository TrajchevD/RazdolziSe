# RazdolziSe — production/functionality review

## How this was done

This sandbox has no root access (can't `apt install` MySQL/MariaDB) and no .NET SDK
preinstalled, and installing one here hit the sandbox's per-command time limit
before finishing. So instead of a live end-to-end run, every feature below was
verified by manually tracing the full request path for real: frontend component →
service → HTTP call → backend controller → service → EF Core query → response
shape back to the frontend model, for every endpoint. That's slower than running
it, but it also surfaces logic bugs a live happy-path click-through often misses
(e.g. what happens when two people edit the same expense at once — the code
handles it, see below). I'd still run `dotnet build` and a real login/trip/expense
flow yourself once before shipping; static reading can't catch a typo that only a
compiler or a live 500 would.

**Overall**: this is unusually solid code for "internship scope" — real
transaction handling, real double-submit/race protection, real authorization
checks on every single endpoint (nothing trusts a client-supplied user id), a
correct minimum-transaction settlement algorithm, and comments that explain *why*
non-obvious decisions were made rather than just what the code does. The gaps
below are mostly *missing* features rather than *broken* ones.

---

## Blocking before real (non-test) users touch this

**No password reset / account recovery.** `AuthController` only has
`register`/`login` — there's no "forgot password" anywhere in the backend or the
frontend. Right now, a locked-out user's only fix is you manually touching the
database. For a finance-adjacent app people actually rely on, this needs to exist
before a real launch — at minimum an email-based reset link (which then also
requires standing up an email sender, currently absent entirely — the README
lists "email notifications" as deliberately out of scope, but reset emails are a
different, much smaller thing than notification emails).

**No email verification.** Registration accepts any string that isn't blank as an
email — `asdf` currently passes both frontend and backend validation. Combined
with no reset flow, a typo'd email at signup permanently locks that account.

**CORS is single-origin by design (fixed in the mobile copy, not yet in the
original).** The web backend only allows one exact origin string. This doesn't
block anything today, but if you ever run web + mobile against the same backend
without this fix, mobile API calls fail outright. Already patched in
`mobile/backend/Program.cs` — worth backporting to `backend/` too since a native
app will call the same API.

---

## Should fix soon (not launch-blocking, but real gaps)

- **JWT expiry is a hard 120-minute wall with no refresh token.** Fine for a web
  tab; on a phone, being logged out mid-week is exactly the kind of friction that
  makes people delete an app. Needs either a much longer expiry or (better) a
  refresh-token flow.
- **No rate limiting on `/api/auth/login`.** Nothing stops repeated password
  guesses against one account. Low urgency at current scale, real before wider use.
- **Adding someone to a trip requires zero consent from them.** Any current member
  can add anyone else by email and they're just... in, with their name visible to
  everyone, no notification, no way to decline. This is worth fixing — see the
  "group requests" section below, since it's the same gap you already noticed.
- **Only the person who originally added an expense can edit/delete it** — not the
  trip owner, not any other member. Reasonable default, but there's no escape
  hatch: if someone adds a wrong expense and then leaves the trip, nobody can ever
  fix or remove it. Worth giving the trip owner override permission.
- **No pagination anywhere** (trips list, expense list). Fine at 20 expenses,
  will get slow and eventually memory-heavy at 2,000. Not urgent, but retrofit
  pagination before it's a problem rather than after.
- **`EnsureCreated()` instead of real EF Core migrations** (already flagged in
  your own README) — any future schema change means dropping the whole database.
  Fine for test data, not fine once real trips/expenses exist that people care
  about.

## Minor / polish

- Render's free tier cold-starts in ~30-60s after 15 min idle — jarring on a
  native app launch specifically (see the earlier mobile-deploy conversation).
- No structured logging/monitoring beyond `ILogger` to Render's console — you'll
  be flying blind on errors once this has real users and you're not watching logs
  live.
- Currency suggestion silently defaults to EUR on IP-lookup failure — reasonable,
  just make sure that's an intentional default for your actual user base (MKD
  might make more sense as the fallback given the app's name/audience).

---

## Your feature ideas — my take

**Push/custom notifications.** Strong yes, and it's the single highest-leverage
addition for making this feel like a real app instead of a wrapped website. Right
now nothing tells a user "Alice added a €40 expense" or "Bob just paid you back" —
they only find out by opening the app. Concretely: `@capacitor/push-notifications`
(already worth adding to the mobile package.json) for the client side, plus a
notification-worthy event list on the backend — expense added, payment recorded,
added to a trip, settlement reminder. This needs a backend piece too (device token
storage + a push sender, e.g. Firebase Cloud Messaging), not just a frontend
plugin — flag this as its own mini-project, not a quick add-on.

**Animations.** Yes, but scope it: the highest-value spots are state transitions
that currently just snap — balance numbers updating after an expense, the
settlement plan recalculating, a new expense sliding into the list, pull-to-refresh
on the trip list. Skip decorative animation (page transitions, icon bounces) until
the functional stuff is solid — it's easy to add later and easy to get right once,
hard to fix consistently if bolted on everywhere ad hoc. The existing `.skeleton`
loading-pulse pattern in `styles.scss` is a good sign this was already half-thought
about.

**Group/member requests.** You're right, and the code confirms it: there is
currently no invite/accept flow at all — `AddMemberAsync` just unilaterally adds
someone by email, no consent step. I'd build this as: adding someone creates a
pending `TripInvite` row instead of a `TripMember` row directly, the invitee sees
a "Trip invites" section, accept converts it to a real membership, decline removes
it. This also naturally gives you the notification hook above ("Alice invited you
to Iceland Trip 2026") for free.

**Member avatars.** Also yes — `avatar-color.ts` already exists and (from the
name) is almost certainly assigning each member a deterministic color for
initials-based avatars already. If so, this is mostly a design pass, not new
engineering: circular initials chips are cheap to build well and immediately make
the trip member list, expense "paid by" tags, and settlement plan feel less like a
spreadsheet. Real photo uploads are a bigger lift (needs file storage, e.g. S3/R2,
which doesn't exist in this codebase yet) — I'd ship initials-avatars first,
consider real photos later only if it's clearly wanted.

**A few more, in rough priority order for "feels like a real app":**

1. **Offline-friendly reads.** Capacitor Preferences (already added to
   package.json) can cache the last-loaded trip/expense list so opening the app
   with no signal shows *something* instead of a blank error screen.
2. **Haptics on key actions** (`@capacitor/haptics`, also already added) — a
   short tap-buzz on "expense added" or "settled up" costs almost nothing to wire
   and reads as noticeably more native.
3. **Pull-to-refresh** on the trip/expense lists — standard mobile pattern,
   currently there's presumably just a manual reload.
4. **Share/export a settlement plan** — "send Bob a message with what he owes"
   via the native share sheet (`@capacitor/share`) is a very cheap, very visible
   win.
5. **Biometric unlock** (Face ID/fingerprint) for re-opening the app instead of
   re-typing a password every session — pairs naturally with fixing the JWT
   expiry issue above.

---

## Summary

Nothing here is broken in the sense of "will crash" — the core CRUD, splitting
math, currency conversion, and settlement algorithm all check out on a careful
read. The gaps are entirely in the "what does a real product need beyond its core
feature" category: account recovery, consent-based invites, and native-feeling
touches (notifications, animations, avatars) — which is exactly what you asked
about, and exactly where I'd spend the next round of work.
