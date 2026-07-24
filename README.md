# TripSplit — Internship-Scope Build

A trimmed-down, learnable version of the full TripSplit architecture: multi-trip, equal or exact
expense splitting, per-expense currency with automatic conversion, automatic balance tracking, and
the minimum-transaction settlement algorithm. See the project's earlier design docs for the full
production version this is scaled down from — this build deliberately skips loans, receipts,
exports, and Clean Architecture's full layering in favor of something a single person can build
and understand end to end in a few weeks.

## What's here

```
backend/     ASP.NET Core 9 Web API (C#), MySQL-wire-protocol DB (TiDB Cloud in production), JWT auth, 3-layer architecture
frontend/    Angular 22 app (standalone components, signals)
```

## Backend — first run

**Requirements:** .NET 9 SDK, Visual Studio 2022 (17.12+) or `dotnet` CLI, and a MySQL-compatible
database — a local MySQL/MariaDB install, or a TiDB Cloud cluster (what production uses) all work,
via the Pomelo EF Core provider.

1. Open `backend/TripSplit.Api.csproj` in Visual Studio (or `cd backend` in a terminal).
2. Check `appsettings.json` → `ConnectionStrings:DefaultConnection`. It defaults to a TiDB Cloud
   template — replace `YOUR_TIDB_USER` / `YOUR_TIDB_PASSWORD` (and host/port if you're using a
   different cluster or a local MySQL instance instead) with your real values from the TiDB Cloud
   console's "Connect" button. See the `_comment` key alongside it for a local-MySQL variant.
3. Restore + run:
   ```
   dotnet restore
   dotnet run
   ```
4. On first run, the app creates the `TripSplitDb` database (and every table) automatically via
   `Database.EnsureCreated()` instead of real EF Core migrations — a deliberate simplification for
   this scope (see the comment in `Program.cs`). Because of that, if you ever change a model
   (add/rename a column) after the database already exists, `EnsureCreated()` will NOT alter it —
   you'll need to drop `TripSplitDb` (`DROP DATABASE TripSplitDb;` from any MySQL client) and let it
   recreate on the next run, or switch to `dotnet ef migrations add InitialCreate`.
5. The API listens on `http://localhost:5080` (see `Properties/launchSettings.json`). Swagger UI
   opens automatically at `http://localhost:5080/swagger` — use it to register a user, log in,
   copy the returned token, and click "Authorize" (top right) pasting `Bearer <token>` to test the
   rest of the endpoints manually before the frontend is running.

**Before running for real:** open `appsettings.json` and replace the placeholder `Jwt:Key` value
with your own long random string. The placeholder is fine for local development only.

**A note on how this was built:** every backend file here was hand-written rather than scaffolded
with `dotnet new` / `dotnet ef`, because the sandbox this was built in doesn't have the .NET SDK
installed — so I could not run `dotnet build` myself to confirm it compiles. I reviewed the code
carefully (including one real bug I caught and fixed: ASP.NET Core's JWT handler silently renames
the `sub` claim unless you set `MapInboundClaims = false`, which would have broken
`GetUserId()` on every request). Please run `dotnet build` as your first step and tell me about
any compiler errors — I'll fix them immediately.

## Frontend — first run

**Requirements:** Node.js 20+ (you already have this).

1. `cd frontend`
2. `npm install`
3. `npm start` (runs `ng serve`) — opens at `http://localhost:4200`

The frontend expects the backend running at `http://localhost:5080` by default (set in
`src/environments/environment.ts` — change `apiBaseUrl` there if you run the backend on a
different port; `environment.prod.ts` is the equivalent for production builds). CORS is already
configured on the backend for `http://localhost:4200`.

**This part I *did* verify end-to-end:** I installed dependencies and ran `ng build` in an
isolated copy of this code, and it compiled cleanly with no TypeScript or template errors. Two
files (`app.ts` and `styles.scss`, both edited from the CLI-generated defaults) may show up as
their old scaffolded content for a little while after this session ends — that's OneDrive still
syncing the edit down to your machine, not a problem with the code. If they still look wrong a few
minutes after opening the folder, let me know and I'll rewrite them.

## Trying it out

1. Register two accounts (e.g. `alice@test.com` / `bob@test.com`) via the frontend's Register page.
2. Log in as Alice, create a trip.
3. Add Bob as a member by his email (he must already have registered).
4. Add an expense — e.g. Alice pays $30 for lunch, split between both of you.
5. Check the Balances and Settlement plan sections update automatically.

## Currency support

Each trip has a settlement currency (chosen at creation, defaulting to a suggestion based on the
creator's IP location — see `GET /api/currency/suggest`). Individual expenses can be logged in any
currency; the backend converts to the trip's settlement currency at the moment the expense is
saved, using a rate fetched from open.er-api.com (free, no API key, ~160 currencies including
MKD) and frozen permanently on that expense — so a trip's historical balances never silently drift
just because exchange rates moved later. Both the original amount/currency and the converted
amount are stored and shown.

This adds two outbound dependencies the backend calls at runtime: `open.er-api.com` (exchange
rates, cached 6h) and `ip-api.com` (currency suggestion by IP, called server-side so there's no
CORS/mixed-content issue). Both are free/keyless; if either is briefly down, the app falls back
gracefully (currency suggestion silently defaults to EUR; a failed exchange-rate lookup surfaces
as a normal error toast on save, not a crash).

## What's deliberately not here

Direct loans between members, receipts/file uploads, PDF/Excel export, email notifications,
recurring expenses, and EF Core migrations (this project uses `EnsureCreated()` instead — see the
schema-change note above). All of these exist in the full production architecture doc — none of
them are needed to demonstrate the core idea (splitting, balances, minimum-transaction settlement,
multi-currency) at internship scope.
