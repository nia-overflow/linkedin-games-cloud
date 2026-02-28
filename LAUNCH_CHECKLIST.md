# Launch Checklist

Run through this before sharing the dashboard URL with anyone.

## 1. Railway Deployment

- [ ] Railway service is green (build + deploy succeeded)
- [ ] `GET /health` returns `{"status":"ok","mode":"cloud"}`
- [ ] `GET /api/logs` returns JSON (even if entries are empty)

## 2. Supabase URL Configuration

Go to **Supabase → Authentication → URL Configuration** and verify:

- [ ] **Site URL** is `https://linkedin-games-dashboard.up.railway.app` (not localhost)
- [ ] **Redirect URLs** includes `https://linkedin-games-dashboard.up.railway.app/**`

## 3. Railway Environment Variables

Go to **Railway → Service → Variables** and verify all of these are set:

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_KEY`
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`

## 4. Test Auth Yourself First

Do this on the production URL, not localhost.

- [ ] Sign in with Google — confirm you land on the dashboard, not an error page
- [ ] Sign out, then request a magic link — click it within 2 minutes, confirm it works
- [ ] Confirm your name/account shows correctly in the dashboard

## 5. Confirm Data Flows

- [ ] Run a one-off scrape: `pnpm scrape`
- [ ] Confirm output shows `☁️ Cloud push OK`
- [ ] Reload the dashboard — confirm today's game results appear

## 6. New User Setup (for each friend you invite)

- [ ] They sign in at `https://linkedin-games-dashboard.up.railway.app`
- [ ] They go to Settings and generate an API key
- [ ] They add `CLOUD_ENDPOINT` and `CLOUD_API_KEY` to `~/.linkedin-games/.env` on their machine
- [ ] They run `pnpm scrape` once manually to confirm cloud push works
- [ ] Their data appears on their dashboard

---

**Rule of thumb:** be your own first user on the production URL before sharing it with anyone.
