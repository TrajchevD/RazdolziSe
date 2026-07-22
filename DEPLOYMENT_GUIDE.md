# Deploying TripSplit for free — step by step

Stack: **Cloudflare Pages** (frontend) + **Render** (backend, Docker) + **Azure SQL Database** (free tier, same SQL Server engine you're already using).

Already done for you in the project folder: `backend/Dockerfile`, `backend/.dockerignore`, `frontend/src/environments/environment.ts` + `environment.prod.ts`, `angular.json` wired to swap between them on production builds, and a git repo initialized on branch `main` with everything committed.

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

## 2. Database — Azure SQL free tier

1. Go to [portal.azure.com](https://portal.azure.com) and sign up / log in (a card is required for identity verification only; the free database itself doesn't charge it).
2. Click **Create a resource** → search **SQL Database** → **Create**.
3. Fill in the basics:
   - **Resource group**: click *Create new*, name it `tripsplit-rg`.
   - **Database name**: `TripSplitDb`.
   - **Server**: click *Create new* → pick a unique server name (e.g. `tripsplit-yourname-srv`) → region close to you → Authentication method: **Use SQL authentication** → set an admin username and a strong password (write these down, you'll need them).
   - **Want to use SQL elastic pool?**: No.
   - **Workload environment**: Development.
   - **Compute + storage**: click *Configure database* → choose **Serverless** → this is what makes it eligible for the free monthly allowance (100,000 vCore-seconds, 32GB storage). Confirm.
4. **Networking** tab: set **Connectivity method** to *Public endpoint*, and switch on **Allow Azure services and resources to access this server**. Also add your current client IP (there's a button for that) so you can connect from SSMS later.
5. Click **Review + create** → **Create**. Takes a couple of minutes to deploy.
6. Once done, open the SQL **database** resource (not the server) → **Connection strings** (left sidebar) → copy the **ADO.NET** one. It looks like:

   ```
   Server=tcp:tripsplit-yourname-srv.database.windows.net,1433;Initial Catalog=TripSplitDb;Persist Security Info=False;User ID=youradmin;Password={your_password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
   ```

   Replace `{your_password}` with the real password you set. Save this string somewhere — you'll paste it into Render in step 3.

You can connect to this exact database from SSMS any time using the server name + admin login, if you want to inspect data directly.

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
   | `ConnectionStrings__DefaultConnection` | the Azure ADO.NET string from step 2 |
   | `Jwt__Key` | a long random string — e.g. generate one with `openssl rand -base64 48` in any terminal, or mash the keyboard for 40+ characters. Do **not** reuse the placeholder from appsettings.json. |
   | `Jwt__Issuer` | `TripSplit` |
   | `Jwt__Audience` | `TripSplitClient` |
   | `Jwt__ExpiryMinutes` | `120` |
   | `Cors__AllowedOrigin` | leave as `http://localhost:4200` for now — you'll update this in step 5 once you have your real Cloudflare URL |
   | `ASPNETCORE_ENVIRONMENT` | `Production` |

   (The double underscore `__` is how ASP.NET Core reads nested config keys like `ConnectionStrings:DefaultConnection` from environment variables.)

6. Click **Create Web Service**. Render will pull the repo, build the Docker image, and deploy — first build takes a few minutes (watch the *Logs* tab).
7. Once live, note the URL Render gives you, e.g. `https://tripsplit-api.onrender.com`. Test it by visiting `https://tripsplit-api.onrender.com/api/trips` in a browser — you should get a 401 (Unauthorized) JSON response, not an error page. That means it's up and the database connection worked (it also means `EnsureCreated()` just built all your tables in the new Azure database).

Free-tier note: this service spins down after 15 minutes with no traffic. The next request after that wakes it back up but takes 30-60 seconds — normal for personal use, just don't expect instant load if you haven't opened the app in a while.

---

## 4. Frontend — Cloudflare Pages

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

2. Go to [dash.cloudflare.com](https://dash.cloudflare.com), sign up/log in.
3. Left sidebar → **Workers & Pages** → **Create** → **Pages** tab → **Connect to Git**.
4. Authorize Cloudflare to access GitHub, pick the `tripsplit` repo.
5. Build settings:
   - **Framework preset**: Angular (or None if it's not listed — the settings below work either way).
   - **Root directory**: `frontend`
   - **Build command**: `npm run build -- --configuration production`
   - **Build output directory**: `dist/frontend/browser`
6. Click **Save and Deploy**. First build takes a couple of minutes.
7. Once done you get a URL like `https://tripsplit.pages.dev` — that's your live app.

---

## 5. Close the loop (CORS)

Your backend is currently only allowing `http://localhost:4200`. Update it to your real frontend URL:

1. Back in Render → your `tripsplit-api` service → **Environment** tab.
2. Edit `Cors__AllowedOrigin`, set it to your Cloudflare Pages URL exactly, e.g. `https://tripsplit.pages.dev` (no trailing slash).
3. Save — Render auto-redeploys with the new value.

---

## 6. Test it

Open your `https://tripsplit.pages.dev` URL, register an account, create a trip, add an expense. If something fails, open the browser dev tools (F12) → Network tab and check what the failing request's status/response is — that'll tell you whether it's a CORS mismatch (recheck step 5), a database connection issue (recheck the Azure connection string in Render), or something else.

From here on, any code changes just need `git push` — Render and Cloudflare Pages both auto-redeploy on push to `main`.
