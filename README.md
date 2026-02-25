# LinkedIn Games Dashboard

Track your LinkedIn daily game results — scores, ranks, completion times, and 30-day history — on a hosted dashboard at **[linkedin-games-dashboard.up.railway.app](https://linkedin-games-dashboard.up.railway.app)**.

A Playwright scraper runs nightly on your Mac, captures results from Queens, Tango, Pinpoint, Crossclimb, Zip, and Mini-Sudoku, and pushes them to the cloud. Sign in with Google to see your stats from any device.

---

## Quickstart (for Claude Code users)

**Give this to your local Claude:**

> Clone https://github.com/nia-overflow/linkedin-games-cloud and set it up for me by following the README.

Claude will handle the installation automatically and pause to ask you when it needs you to do something in the browser.

---

## Setup

> **If you're using Claude Code**, paste the instruction above and skip to step 3 when Claude tells you. Otherwise follow the steps below manually.

### Prerequisites

- macOS (nightly scheduling uses launchd)
- Node.js 20+ — [nodejs.org](https://nodejs.org)
- pnpm — `npm install -g pnpm`
- A LinkedIn account with games played

### 1. Clone and install

```bash
git clone https://github.com/nia-overflow/linkedin-games-cloud.git
cd linkedin-games-cloud
pnpm install
pnpm exec playwright install chromium
```

Verify: `pnpm scrape --help` should print usage without errors.

### 2. Log in to LinkedIn

```bash
pnpm setup:profile
```

**[Human step]** This opens a Chrome window. Sign in to LinkedIn, play a game if you haven't today, then close the window. Tell Claude (or continue below) once the window is closed.

### 3. Sign in to the dashboard

**[Human step]** Open **[linkedin-games-dashboard.up.railway.app](https://linkedin-games-dashboard.up.railway.app)** and click **Sign in with Google**. Use the same Google account you want to track stats under.

### 4. Generate an API key

**[Human step]** In the dashboard, click **Settings → Generate API Key → Copy** the `lgk_...` key. Paste it back to Claude (or use it in step 5 below).

### 5. Configure the scraper

```bash
mkdir -p ~/.linkedin-games
```

Create `~/.linkedin-games/.env` with the following contents, replacing `lgk_YOUR_KEY_HERE` with the key from step 4:

```
CLOUD_ENDPOINT=https://linkedin-games-dashboard.up.railway.app
CLOUD_API_KEY=lgk_YOUR_KEY_HERE
```

### 6. Run your first scrape

```bash
cd linkedin-games-cloud
pnpm scrape
```

Verify: the output should end with `☁️ Cloud push OK`. Refresh the dashboard — your stats will appear.

### 7. Schedule nightly scrapes (recommended)

```bash
bash scripts/install-daemons.sh
```

This installs a launchd agent that runs the scraper at 11:55 PM every night and wakes your Mac if it's asleep. Done — no further action needed.

---

## Day-to-day

The scraper runs automatically every night. Open the dashboard any time to see your stats.

**If the scraper stops capturing data** (LinkedIn sessions expire every few weeks):

```bash
cd linkedin-games-cloud
pnpm setup:profile
```

Opens Chrome so you can log back in. No other changes needed.

---

## What you see

**All Games** — today's result for each game + 30-day history chart + aggregate stats (streak, win rate, avg time, avg percentile)

**Per-game tabs** — 5 stat cards · completion time history · today's leaderboard against your connections

**Community** — best times across all users who've opted in (opt in via Settings)

**Dev** — full scrape log for debugging

---

## Data & privacy

- Your game data is private by default — only you can see it (enforced at the database level)
- The Community Leaderboard is opt-in only, from the Settings page
- Your LinkedIn session stays on your machine — it is never sent to the server
- Local SQLite backup at `~/.linkedin-games/games.db` always kept in sync

---

## If scraping breaks

LinkedIn occasionally changes their page structure. If you see scrape errors:

1. `pnpm discover` — captures fresh screenshots and HTML of each game page
2. Check `scraper/discovery/` for the current DOM structure
3. Update selectors in `scraper/src/games/<game>.ts`
4. `pnpm scrape` to verify

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
