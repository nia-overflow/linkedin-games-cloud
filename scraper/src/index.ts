/**
 * Scraper Orchestrator — Phase 2.0
 *
 * Runs all 6 game scrapers sequentially using the dedicated Chrome profile.
 * Saves results to local SQLite. Optionally pushes to the cloud server.
 *
 * Cloud push is triggered when both CLOUD_ENDPOINT and CLOUD_API_KEY are set
 * in ~/.linkedin-games/.env — failure is logged but never blocks the scraper.
 *
 * Designed to be run by launchd at 11:55 PM nightly.
 * Exits with code 0 even on partial failure (launchd won't retry).
 *
 * Usage:
 *   pnpm scrape
 */

import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import { config as loadDotenv } from 'dotenv';

import { upsertGameResult, upsertLeaderboardEntries, logScrapeRun } from './db/index.js';
import type { ScrapeResult } from './games/types.js';
import { pushToCloud, type CloudItem } from './cloud.js';

import { scrape as scrapeQueens }     from './games/queens.js';
import { scrape as scrapeTango }      from './games/tango.js';
import { scrape as scrapePinpoint }   from './games/pinpoint.js';
import { scrape as scrapeCrossclimb } from './games/crossclimb.js';
import { scrape as scrapeZip }        from './games/zip.js';
import { scrape as scrapeMiniSudoku } from './games/mini-sudoku.js';

// Load optional env from ~/.linkedin-games/.env (for CLOUD_ENDPOINT, CLOUD_API_KEY)
// This file is outside the repo so credentials never get committed.
loadDotenv({ path: path.join(os.homedir(), '.linkedin-games', '.env') });

const PROFILE_PATH = path.join(os.homedir(), '.linkedin-games', 'chrome-profile');
const CLOUD_ENDPOINT = process.env['CLOUD_ENDPOINT'];
const CLOUD_API_KEY  = process.env['CLOUD_API_KEY'];

const GAMES = [
  { name: 'queens',      fn: scrapeQueens },
  { name: 'tango',       fn: scrapeTango },
  { name: 'pinpoint',    fn: scrapePinpoint },
  { name: 'crossclimb',  fn: scrapeCrossclimb },
  { name: 'zip',         fn: scrapeZip },
  { name: 'mini-sudoku', fn: scrapeMiniSudoku },
] as const;

async function runScraper(): Promise<void> {
  const runAt = new Date().toISOString();
  console.log(`[${runAt}] LinkedIn Games scraper starting...`);

  if (CLOUD_ENDPOINT && CLOUD_API_KEY) {
    console.log(`☁️  Cloud push enabled → ${CLOUD_ENDPOINT}`);
  }

  // Verify the profile exists before launching Chrome
  const { existsSync } = await import('fs');
  if (!existsSync(PROFILE_PATH)) {
    console.error(`❌ Chrome profile not found at: ${PROFILE_PATH}`);
    console.error('   Run `pnpm setup:profile` first.');
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  console.log('Browser launched. Running scrapers...\n');

  // Collect processed results for the cloud push (populated inside the loop)
  const cloudItems: CloudItem[] = [];

  for (const game of GAMES) {
    const gameStart = Date.now();
    console.log(`⏳ Scraping: ${game.name}`);

    try {
      const page = await context.newPage();
      let result: ScrapeResult;

      try {
        result = await game.fn(page);
      } finally {
        await page.close();
      }

      // Compute connection-level percentile from leaderboard
      const selfEntry = result.leaderboard.find(e => e.isSelf);
      const total = result.leaderboard.length;
      const percentile = (selfEntry?.rank != null && total > 0)
        ? Math.round(((total - selfEntry.rank) / total) * 100)
        : undefined;
      const myRank = selfEntry?.rank ?? undefined;

      // Persist to local SQLite
      upsertGameResult({
        gameName:            result.gameName,
        playedDate:          result.playedDate,
        capturedAt:          result.capturedAt,
        completed:           result.completed,
        score:               result.score,
        completionTimeSecs:  result.completionTimeSecs,
        percentile,
        myRank,
        globalPercentile:    result.globalPercentile,
        rawData:             result.rawData,
      });

      if (result.leaderboard.length > 0) {
        upsertLeaderboardEntries(result.leaderboard);
      }

      const status = result.completed ? 'success' : 'no_result';
      logScrapeRun({
        runAt,
        gameName:         result.gameName,
        status,
        recordsCaptured:  result.leaderboard.length,
      });

      // Collect for cloud push (same data that went to SQLite)
      cloudItems.push({
        gameResult: {
          gameName:           result.gameName,
          playedDate:         result.playedDate,
          capturedAt:         result.capturedAt,
          completed:          result.completed,
          score:              result.score,
          completionTimeSecs: result.completionTimeSecs,
          percentile,
          myRank,
          globalPercentile:   result.globalPercentile,
          rawData:            result.rawData,
        },
        leaderboardEntries: result.leaderboard,
        scrapeLog: {
          runAt,
          gameName:        result.gameName,
          status,
          recordsCaptured: result.leaderboard.length,
        },
      });

      const elapsed = ((Date.now() - gameStart) / 1000).toFixed(1);
      const statusIcon = result.completed ? '✅' : '⚪';
      const timeStr = result.completionTimeSecs
        ? ` (${Math.floor(result.completionTimeSecs / 60)}:${String(result.completionTimeSecs % 60).padStart(2, '0')})`
        : '';
      const leaderboardStr = result.leaderboard.length > 0
        ? ` | ${result.leaderboard.length} leaderboard entries`
        : '';

      console.log(`${statusIcon} ${game.name}: ${result.completed ? 'completed' : 'not played'}${timeStr}${leaderboardStr} [${elapsed}s]`);

    } catch (err) {
      const error = err as Error;
      console.error(`❌ ${game.name}: ${error.message}`);

      logScrapeRun({
        runAt,
        gameName:     game.name,
        status:       'error',
        errorMessage: error.message,
      });

      // Collect error log for cloud push too
      cloudItems.push({
        gameResult: {
          gameName:   game.name,
          playedDate: new Date().toISOString().split('T')[0]!,
          capturedAt: new Date().toISOString(),
          completed:  false,
        },
        leaderboardEntries: [],
        scrapeLog: {
          runAt,
          gameName:     game.name,
          status:       'error',
          errorMessage: error.message,
        },
      });
    }
  }

  await context.close();

  console.log('\n✅ Local scrape complete.');

  // Push to cloud (after all SQLite writes, non-blocking on failure)
  if (CLOUD_ENDPOINT && CLOUD_API_KEY && cloudItems.length > 0) {
    console.log('☁️  Pushing to cloud...');
    await pushToCloud(cloudItems, CLOUD_API_KEY, CLOUD_ENDPOINT);
  }

  console.log('Done.');
  // Exit cleanly (important for launchd — non-zero exit triggers restart)
  process.exit(0);
}

runScraper().catch(err => {
  console.error('Fatal scraper error:', err);
  process.exit(0);
});
