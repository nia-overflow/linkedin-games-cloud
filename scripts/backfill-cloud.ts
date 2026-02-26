/**
 * backfill-cloud.ts — One-time script to push historical SQLite data to Supabase.
 *
 * Reads all game_results, leaderboard_entries, and scrape_log rows from local
 * SQLite and pushes them to the cloud server via POST /api/ingest.
 *
 * Usage:
 *   pnpm backfill
 *
 * Requires CLOUD_ENDPOINT and CLOUD_API_KEY in ~/.linkedin-games/.env
 */

import path from 'path';
import os from 'os';
import { config as loadDotenv } from 'dotenv';
import Database from 'better-sqlite3';

loadDotenv({ path: path.join(os.homedir(), '.linkedin-games', '.env') });

const CLOUD_ENDPOINT = process.env['CLOUD_ENDPOINT'];
const CLOUD_API_KEY  = process.env['CLOUD_API_KEY'];

if (!CLOUD_ENDPOINT || !CLOUD_API_KEY) {
  console.error('❌ CLOUD_ENDPOINT and CLOUD_API_KEY must be set in ~/.linkedin-games/.env');
  process.exit(1);
}

const DB_PATH = path.join(os.homedir(), '.linkedin-games', 'games.db');
const db = new Database(DB_PATH, { readonly: true });

// ── Read everything from SQLite ───────────────────────────────────────────────

interface GameResultRow {
  game_name: string;
  played_date: string;
  captured_at: string;
  completed: number;
  score: number | null;
  completion_time_secs: number | null;
  percentile: number | null;
  my_rank: number | null;
  global_percentile: number | null;
  raw_data: string | null;
}

interface LeaderboardRow {
  game_name: string;
  played_date: string;
  rank: number | null;
  connection_name: string;
  connection_profile_url: string | null;
  score: number | null;
  completion_time_secs: number | null;
  is_self: number;
}

interface ScrapeLogRow {
  run_at: string;
  game_name: string;
  status: string;
  error_message: string | null;
  records_captured: number | null;
}

const gameResultRows = db.prepare(`
  SELECT game_name, played_date, captured_at, completed, score,
         completion_time_secs, percentile, my_rank, global_percentile, raw_data
  FROM game_results
  ORDER BY played_date DESC
`).all() as GameResultRow[];

const leaderboardRows = db.prepare(`
  SELECT game_name, played_date, rank, connection_name,
         connection_profile_url, score, completion_time_secs, is_self
  FROM leaderboard_entries
  ORDER BY played_date DESC
`).all() as LeaderboardRow[];

const scrapeLogRows = db.prepare(`
  SELECT run_at, game_name, status, error_message, records_captured
  FROM scrape_log
  ORDER BY run_at DESC
`).all() as ScrapeLogRow[];

db.close();

console.log(`📦 Loaded from SQLite:`);
console.log(`   ${gameResultRows.length} game results`);
console.log(`   ${leaderboardRows.length} leaderboard entries`);
console.log(`   ${scrapeLogRows.length} scrape log entries`);
console.log('');

// ── Format for ingest API ─────────────────────────────────────────────────────

const gameResults = gameResultRows.map(r => ({
  gameName:           r.game_name,
  playedDate:         r.played_date,
  capturedAt:         r.captured_at,
  completed:          r.completed === 1,
  score:              r.score,
  completionTimeSecs: r.completion_time_secs,
  percentile:         r.percentile,
  myRank:             r.my_rank,
  globalPercentile:   r.global_percentile,
  rawData:            r.raw_data ? JSON.parse(r.raw_data) : null,
}));

const leaderboardEntries = leaderboardRows.map(r => ({
  gameName:              r.game_name,
  playedDate:            r.played_date,
  rank:                  r.rank,
  connectionName:        r.connection_name,
  connectionProfileUrl:  r.connection_profile_url,
  score:                 r.score,
  completionTimeSecs:    r.completion_time_secs,
  isSelf:                r.is_self === 1,
}));

const scrapeLogs = scrapeLogRows.map(r => ({
  runAt:            r.run_at,
  gameName:         r.game_name,
  status:           r.status,
  errorMessage:     r.error_message,
  recordsCaptured:  r.records_captured,
}));

// ── Push to cloud ─────────────────────────────────────────────────────────────

async function main() {
  const url = `${CLOUD_ENDPOINT!.replace(/\/$/, '')}/api/ingest`;
  console.log(`☁️  Pushing to ${url} ...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': CLOUD_API_KEY!,
    },
    body: JSON.stringify({ gameResults, leaderboardEntries, scrapeLogs }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`❌ Ingest failed: ${response.status} ${response.statusText}`);
    console.error(`   ${text}`);
    process.exit(1);
  }

  const json = await response.json() as {
    inserted?: { gameResults?: number; leaderboardEntries?: number; scrapeLogs?: number }
  };

  console.log(`✅ Backfill complete!`);
  console.log(`   Game results synced:      ${json.inserted?.gameResults ?? gameResults.length}`);
  console.log(`   Leaderboard entries:       ${json.inserted?.leaderboardEntries ?? leaderboardEntries.length}`);
  console.log(`   Scrape log entries:        ${json.inserted?.scrapeLogs ?? scrapeLogs.length}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
