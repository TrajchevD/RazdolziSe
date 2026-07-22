# Deploying TripSplit for free — step by step

Stack: **Vercel** (frontend) + **Render** (backend, Docker) + **TiDB Cloud** (database, MySQL-compatible — reusing the cluster from your pcpartpicker project).

Already done for you in the project folder: `backend/Dockerfile`, `backend/.dockerignore`, `frontend/src/environments/environment.ts` + `environment.prod.ts`, `angular.json` wired to swap between them on production builds, and a git repo initialized on branch `main` with everything committed.

**Note on this pivot:** the backend was on SQL Server + .NET 10 until this point. TiDB speaks the MySQL protocol, not SQL Server's, so switching required swapping the EF Core database provider to Pomelo's MySQL provider — and Pomelo doesn't have official .NET 10 support yet, so the backend was also retargeted to .NET 9 (in support until Nov 2026) to use Pomelo's stable, official release rather than an unofficial fork. `Program.cs` now calls `UseMySql(...)` instead of `UseSqlServer(...)`, and `appsettings.json`'s connection string is in MySQL format.

---

## 1. Push the code to GitHub

1. Go to [github.com](https://github.com), log in, click **New repository** (top right → your avatar → *New repository*, or the green **New** button on the repos page).
2. Name it `tripsplit` (or anything), leave it **Public** or **Private** — either works for this setup. Do **not** check "Add a README" (you already have one).
3. Click **Create repository**. GitHub shows you a page with commands — ignore those, use these instead.
4. Open a terminal **on your own PC** (PowerShell, or the terminal inside Visual Studio) and run, from inside `C:\Users\david\OneDrive\Desktop\RazdolziSe`:

   ```
   git remote add origin https://github.com/YOUR-USERNAME/tripsplit.git
   git push -u origin main
   ```

   Replace `YOUR-USERNAME` with your GitHub username. It'll prompt you to log in (browser popup or a token) the first time.

You now have the code on GitHub — Render and Cloudflare Pages both deploy by connecting to this repo.

---

## 2. Database — TiDB Cloud

Reusing your existing cluster (`gateway01.eu-central-1.prod.aws.tidbcloud.com`) rather than setting up a new one:

1. Go to [tidbcloud.com](https://tidbcloud.com) and log in.
2. Open your cluster → click **Connect** (top right of the cluster overview page).
3. In the Connect panel: **Connect With** → pick *General* (or *MySQL CLI* / *MySQL Connector*, any option that shows a plain host/user/password, not a language-specific snippet). Make sure the branch is `main`/default if it asks.
4. Note down these four values — you'll need them for Render's environment variables in step 3:
   - **Host**: `gateway01.eu-central-1.prod.aws.tidbcloud.com`
   - **Port**: `4000`
   - **User**: shown in the panel, looks like `xxxxxxxx.root` (TiDB Cloud Serverless prefixes the username per-cluster)
   - **Password**: click *Generate Password* if you don't remember it (this resets it, so make sure nothing else is relying on the old one).
5. Create the database TripSplit will use: in the Connect panel there's usually a **Create database** option, or you can leave it — `Database.EnsureCreated()` in the app will create `TripSplitDb` and every table automatically on first successful connection, since MySQL/TiDB lets you connect and issue `CREATE DATABASE` without the database existing first (unlike SQL Server).
6. Build the connection string with your real values (this exact format goes into Render in step 3):

   ```
   Server=gateway01.eu-central-1.prod.aws.tidbcloud.com;Port=4000;Database=TripSplitDb;Uid=YOUR_TIDB_USER;Pwd=YOUR_TIDB_PASSWORD;SslMode=VerifyFull;
   ```

   Save this somewhere — you'll paste it into Render next. TiDB Cloud requires TLS; if `SslMode=VerifyFull` ever throws a certificate-validation error from Render's environment, fall back to `SslMode=Required` (still encrypted, just skips certificate-chain verification).

You can inspect this same database any time with a MySQL client (DBeaver, TablePlus, or TiDB Cloud's own web-based SQL console) using the same host/user/password — SSMS won't connect to it since it's not SQL Server.

---

## 3. Backend — Render

1. Go to [render.com](https://render.com) and sign up (GitHub login is easiest — it'll ask to authorize access to your repos).
2. Dashboard → **New** → **Web Service**.
3. Connect your `tripsplit` GitHub repo (authorize Render if prompted, then select it).
4. Configure the service:
   - **Name**: `tripsplit-api`.
   - **Root directory**: `backend`
   - **Environment**: Render should detect the Dockerfile automatically and show **Docker** as the environment/runtime. If it asks for a Dockerfile path, it's `Dockerfile` (relative to the root directory you set).
   - **Instance type**: **Free**.
5. Scroll to **Environment Variables** and add these (click *Add Environment Variable* for each):

   | Key | Value |
   |---|---|
   | `ConnectionStrings__DefaultConnection` | the TiDB Cloud connection string from step 2 |
   | `Jwt__Key` | a long random string — e.g. generate one with `openssl rand -base64 48` in any terminal, or mash the keyboard for 40+ characters. Do **not** reuse the placeholder from appsettings.json. |
   | `Jwt__Issuer` | `TripSplit` |
   | `Jwt__Audience` | `TripSplitClient` |
   | `Jwt__ExpiryMinutes` | `120` |
   | `Cors__AllowedOrigin` | leave as `http://localhost:4200` for now — you'll update this in step 5 once you have your real Cloudflare URL |
   | `ASPNETCORE_ENVIRONMENT` | `Production` |

   (The double underscore `__` is how ASP.NET Core reads nested config keys like `ConnectionStrings:DefaultConnection` from environment variables.)

6. Click **Create Web Service**. Render will pull the repo, build the Docker image, and deploy — first build takes a few minutes (watch the *Logs* tab).
7. Once live, note the URL Render gives you, e.g. `https://tripsplit-api.onrender.com`. Test it by visiting `https://tripsplit-api.onrender.com/api/trips` in a browser — you should get a 401 (Unauthorized) JSON response, not an error page. That means it's up and the database connection worked (it also means `EnsureCreated()` just built all your tables in TiDB). If you instead get a 500 or the page hangs, check the Render *Logs* tab first — a bad connection string or an SSL mode mismatch is the most likely cause.

Free-tier note: this service spins down after 15 minutes with no traffic. The next request after that wakes it back up but takes 30-60 seconds — normal for personal use, just don't expect instant load if you haven't opened the app in a while.

---

## 4. Frontend — Vercel

1. Before deploying, put your real Render URL into the frontend. Open `frontend/src/environments/environment.prod.ts` and replace the placeholder:

   ```ts
   export const environment = {
     production: true,
     apiBaseUrl: 'https://tripsplit-api.onrender.com/api',
   };
   ```

   Commit and push that change:
   ```
   git add frontend/src/environments/environment.prod.ts
   git commit -m "Point production build at Render backend"
   git push
   ```

2. Go to [vercel.com](https://vercel.com), sign up/log in (GitHub login is easiest).
3. Dashboard → **Add New** → **Project**.
4. Under "Import Git Repository", find and import your `RazdolziSe` (or `tripsplit`) repo — authorize Vercel's GitHub app if prompted.
5. On the configure screen:
   - **Root Directory**: click *Edit* → select `frontend`.
   - **Framework Preset**: Vercel will likely auto-detect "Angular" — that's fine, but expand **Build and Output Settings** and override manually to be safe:
     - **Build Command**: override on → `npm run build -- --configuration production`
     - **Output Directory**: override on → `dist/frontend/browser`
     - **Install Command**: leave as default (`npm install`).
6. Click **Deploy**. First build takes a couple of minutes.
7. Once done you get a URL like `https://razdolzise.vercel.app` — that's your live app.

---

## 5. Close the loop (CORS)

Your backend is currently only allowing `http://localhost:4200`. Update it to your real frontend URL:

1. Back in Render → your `tripsplit-api` service → **Environment** tab.
2. Edit `Cors__AllowedOrigin`, set it to your Vercel URL exactly, e.g. `https://razdolzise.vercel.app` (no trailing slash).
3. Save — Render auto-redeploys with the new value.

---

## 6. Test it

Open your `https://razdolzise.vercel.app` URL, register an account, create a trip, add an expense. If something fails, open the browser dev tools (F12) → Network tab and check what the failing request's status/response is — that'll tell you whether it's a CORS mismatch (recheck step 5), a database connection issue (recheck the TiDB connection string in Render), or something else.

From here on, any code changes just need `git push` — Render and Cloudflare Pages both auto-redeploy on push to `main`.
