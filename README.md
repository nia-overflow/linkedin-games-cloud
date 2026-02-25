# LinkedIn Games Dashboard

Track your LinkedIn daily game results — scores, ranks, completion times, and 30-day history — on a hosted dashboard at **[linkedin-games-dashboard.up.railway.app](https://linkedin-games-dashboard.up.railway.app)**.

A Playwright scraper runs nightly on your Mac, captures results from Queens, Tango, Pinpoint, Crossclimb, Zip, and Mini-Sudoku, and pushes them to the cloud. Sign in with Google to see your stats from any device.

---

## How it works

```
11:55 PM  Mac wakes up
          Scraper opens Chrome (your saved LinkedIn session)
          Visits each game page, captures scores + leaderboard
          Writes to local SQLite (offline backup)
          Pushes data to the cloud dashboard
          Browser closes

Any time  Open linkedin-games-dashboard.up.railway.app
          Sign in with Google → see your stats
```

---

## Requirements

- **macOS** (nightly scheduling uses launchd)
- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **pnpm** — `npm install -g pnpm`
- A **LinkedIn account** with games played

---

## Setup (15 min)

### 1. Clone and install

```bash
git clone https://github.com/nia-overflow/linkedin-games-cloud.git
cd linkedin-games-cloud
pnpm install
pnpm exec playwright install chromium
```

### 2. Log in to LinkedIn

This opens a Chrome window. Sign in to LinkedIn, then close the window.

```bash
pnpm setup:profile
```

### 3. Sign in to the dashboard

Go to **[linkedin-games-dashboard.up.railway.app](https://linkedin-games-dashboard.up.railway.app)** and click **Sign in with Google**.

### 4. Generate an API key

In the dashboard: **Settings → Generate API Key → Copy** the `lgk_...` key.

### 5. Configure the scraper

Create `~/.linkedin-games/.env`:

```bash
mkdir -p ~/.linkedin-games
cat > ~/.linkedin-games/.env << EOF
CLOUD_ENDPOINT=https://linkedin-games-dashboard.up.railway.app
CLOUD_API_KEY=lgk_YOUR_KEY_HERE
EOF
```

Replace `lgk_YOUR_KEY_HERE` with the key you copied in step 4.

### 6. Run your first scrape

```bash
pnpm scrape
```

You should see `☁️ Cloud push OK` at the end. Refresh the dashboard and your stats will appear.

### 7. Schedule nightly scrapes (optional but recommended)

```bash
bash scripts/install-daemons.sh
```

This installs a launchd agent that runs the scraper at 11:55 PM every night and wakes your Mac if it's asleep.

---

## Re-login

LinkedIn sessions expire every few weeks. If the scraper stops capturing data:

```bash
pnpm setup:profile
```

Opens Chrome so you can log back in. No other changes needed.

---

## Manual commands

```bash
pnpm scrape          # Run scraper now
pnpm setup:profile   # Re-login to LinkedIn
```

---

## What you see

**All Games tab** — today's result for each game + 30-day history chart + aggregate stats (streak, win rate, avg time, avg percentile)

**Per-game tabs** — 5 stat cards · completion time history · today's leaderboard against your connections

**Community tab** — best times across all users who've opted in to the leaderboard (opt in via Settings)

**Dev tab** — full scrape log for debugging

---

## Data & privacy

- Your game data is private by default — only you can see it (enforced at the database level)
- The Community Leaderboard is opt-in only, from the Settings page
- Your LinkedIn session stays on your machine — it's never sent to the server
- Local SQLite backup at `~/.linkedin-games/games.db` always kept in sync

---

## If scraping breaks

LinkedIn occasionally changes their page structure. If you see scrape errors:

1. Run `pnpm discover` to capture fresh screenshots and HTML of each game page
2. Check `scraper/discovery/` for the current DOM structure
3. Update selectors in `scraper/src/games/<game>.ts`
4. Run `pnpm scrape` to verify

---

## Project structure

```
linkedin-games-cloud/
├── scraper/src/
│   ├── games/        # One scraper per game
│   ├── db/           # SQLite schema and queries
│   ├── cloud.ts      # Cloud push module
│   └── index.ts      # Scraper orchestrator
├── server/src/
│   ├── middleware/   # JWT auth, API key auth
│   ├── supabase.ts   # Supabase client
│   └── index.ts      # Express API server
├── dashboard/src/
│   ├── components/   # StatsBar, Charts, Leaderboard, Login, Settings
│   ├── hooks/        # useAuth
│   ├── auth.ts       # Supabase browser client
│   └── App.tsx       # Main app
├── supabase/
│   └── schema.sql    # Postgres schema + RLS policies
└── scripts/
    ├── setup-profile.ts    # LinkedIn login helper
    └── install-daemons.sh  # launchd setup
```
