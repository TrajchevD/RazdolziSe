# Tally design import — what's implemented

Source: `claude.ai/design/p/ff3e6ff9-06a9-4eb3-a531-5f67e563dcfd` ("Trip Expense
App.dc.html"), built on the **Organic** design system. Couldn't extract the raw
`.dc.html`/bundle source directly — Design Components content is reconstructed
client-side from the chat's event stream, not served as static files, so there
was nothing to fetch. Implemented instead from the rendered prototype (screenshots
of the Home screen, onboarding, and the design system's fully-documented color/
type/component tokens, which the project page's text content included in full).

## Done

- **Global retheme** (`src/styles.scss`, `src/index.html`): Caprasimo/Figtree
  fonts, the full Organic color ramp (cream ground, terracotta `--color-accent`,
  sage `--color-accent-2`), pill buttons, 16–24px card radii, soft shadows. This
  cascades to every screen automatically, including ones not individually
  redesigned below (trip-detail, add-expense, settlement) — they inherit the new
  buttons/inputs/cards for free since they use plain unstyled `<button>`/`<input>`
  elements.
- **Login / Register**: rounded card, Caprasimo heading, gradient accent mark.
- **Trips (Home)**: the aggregate balance card is now the dark "hero card"
  treatment from the design's Home screen; trip cards got a gradient banner
  (standing in for a cover photo, which this app has no upload for).
- **Bottom tab bar** (`src/app/shared/tab-bar.ts`): Trips / Friends / Analytics /
  Profile. Mobile-only, hidden on login/register and on a trip's own detail page
  (which already has its own back button).
- **Profile** (`src/app/profile/`): real screen — avatar, name, theme toggle,
  logout. Consolidates what used to live only in trip-list's header.
- **Friends / Analytics** (`src/app/friends/`, `src/app/analytics/`): honest
  "not built yet" placeholders, not screens with fake data. Both need real backend
  work first — see `PRODUCTION_REVIEW.md`'s feature-brainstorm section, which
  flagged exactly these two before this design even came in.

## One thing worth deciding: the name

The imported design is branded **"Tally,"** not RazdolziSe/TripSplit. I didn't
rename anything in the app — `index.html`'s `<title>` and the repo itself still
say RazdolziSe — since that's a product decision, not a design one. Say the word
and I'll thread "Tally" through the UI (or keep as-is; purely a copy change,
five minutes either way).

## Second pass — real features, not just visuals

Added after you had the app running locally:

- **Trip Invites** (real feature, replaces the Friends placeholder): sending
  someone to a trip now creates a pending invite instead of instantly adding
  them — they see it under the **Invites** tab and can accept or decline. New
  backend: `TripInvite` model/table, `TripInviteService`, `InvitesController`
  (`POST /api/trips/{id}/invites`, `GET /api/invites`,
  `POST /api/invites/{id}/accept|decline`). The old instant add-by-email flow on
  trip-detail is untouched — this is additive, not a replacement, so nothing
  that already worked can have regressed.
- **Haptics** (`@capacitor/haptics`, already in package.json, now actually
  wired up): trip created, invite sent/accepted/declined, tab switches, logout,
  theme toggle. No-ops completely on web/desktop.
- **Pull-to-refresh** on the Trips tab — no official Capacitor plugin exists for
  this, so it's a small hand-built `PullToRefresh` component
  (`shared/pull-to-refresh.ts`) using raw touch events, reusable anywhere else
  you'd want the same gesture.
  **⚠️ IMPORTANT — READ BEFORE TESTING THIS**: The pull-to-refresh gesture only
  arms when the page is scrolled all the way to the top (`window.scrollY <= 0`),
  and only responds to a *downward* drag starting from there — pulling down
  from partway through a long trip list won't trigger it, and dragging *up*
  never will. If it doesn't seem to respond, make sure the whole page is
  scrolled to the very top first (not just the visible trip cards) and pull
  slowly — it needs about 64px of drag before it releases.
- Trip cards now ease in with a light staggered entrance animation.

### ⚠️ Before you run this: your database needs the new table

You already ran this app once, so `TripSplitDb` already exists — and
`EnsureCreated()` (this project's stand-in for real migrations, see README.md)
**does not add new tables to a database that already exists.** Without this
step, the Invites feature will throw "table doesn't exist" errors the instant
you hit it. Same fix as the currency-support pivot documented in
`DEPLOYMENT_GUIDE.md`:

1. TiDB Cloud console → your cluster → SQL editor (or any MySQL client with the
   connection details you already used).
2. Run: `DROP DATABASE IF EXISTS TripSplitDb;`
3. Run the backend again (`dotnet run`) — `EnsureCreated()` rebuilds every
   table fresh, including the new `TripInvites` one.

This wipes whatever test trips/expenses/invites you already created. If that's
more than you want to lose, tell me and I'll write you the one `CREATE TABLE`
statement instead of a full drop — smaller, but has to be done by hand since
this project doesn't have real EF Core migrations to generate it from.

### One cleanup I couldn't finish myself

`mobile/frontend/src/app/friends/` (3 small files) is dead code now that
Invites replaced it — nothing references it, so it won't break your build, but
the sandbox couldn't delete it (permission error on that specific folder, not
worth fighting further for 3 files). Safe to delete yourself whenever.

### What I could and couldn't verify

Same limitation as before — no live `dotnet run`/`ng build` in this sandbox.
For the backend I traced every new code path against the exact patterns the
original working code already uses (same Include/Select shapes as
`SettlementService.GetPaymentsAsync`, same proactive-check-before-unique-index
pattern as `AuthService.RegisterAsync`, etc.) rather than inventing new
approaches — and I caught and fixed one real bug this way: the new
`TripInvite` table needed adding to `TripService.DeleteTripAsync`'s explicit
delete-order sequence, or deleting a trip with a pending invite on it would
have thrown a foreign-key error. Please still run through Send → Accept →
Decline once yourself and tell me what breaks, if anything does.

## Not yet touched

Trip detail, add-expense (with split methods), and the settlement screen still
have their **original layouts** — they look better than before (new colors/
fonts/buttons cascade in automatically) but haven't been individually redesigned
to match the imported screens for those specific flows. Screenshotting those from
the prototype and doing the same pass is the natural next step once you've had a
look at what's here.

## Verification note

This sandbox can't run `npm install`/`ng build` for this project (no root, and
package installs kept exceeding the sandbox's command time limit — see the
mobile-deploy conversation). Everything above was checked by close manual
reading (template bindings, SCSS brace-matching, import lists) rather than a
live compile. Run `npm install && npm start` as your first step and tell me
about any errors — same caveat as the original backend README's.
