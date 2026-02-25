/**
 * Cloud push module — sends scraped data to the hosted server via API key.
 *
 * Design principles:
 *   - Non-blocking: called after all local SQLite writes complete
 *   - Never throws: logs errors but does NOT affect the scraper's exit code
 *   - Single HTTP call: batches all games into one POST /api/ingest request
 *
 * Usage:
 *   if (CLOUD_API_KEY && CLOUD_ENDPOINT) {
 *     await pushToCloud(collectedResults, CLOUD_API_KEY, CLOUD_ENDPOINT)
 *   }
 */

import type { GameResult, LeaderboardEntry, ScrapeLog } from './db/index.js';

export interface CloudItem {
  gameResult: GameResult;
  leaderboardEntries: LeaderboardEntry[];
  scrapeLog: ScrapeLog;
}

/**
 * Pushes all scraped data from one run to the cloud ingest endpoint.
 * Silently swallows all errors — cloud push failure must never break
 * the local scraper flow.
 */
export async function pushToCloud(
  items: CloudItem[],
  apiKey: string,
  endpoint: string,
): Promise<void> {
  if (items.length === 0) return;

  const gameResults = items.map(item => ({
    gameName: item.gameResult.gameName,
    playedDate: item.gameResult.playedDate,
    capturedAt: item.gameResult.capturedAt,
    completed: item.gameResult.completed,
    score: item.gameResult.score,
    completionTimeSecs: item.gameResult.completionTimeSecs,
    percentile: item.gameResult.percentile,
    myRank: item.gameResult.myRank,
    globalPercentile: item.gameResult.globalPercentile,
    rawData: item.gameResult.rawData,
  }));

  const leaderboardEntries = items.flatMap(item =>
    item.leaderboardEntries.map(e => ({
      gameName: e.gameName,
      playedDate: e.playedDate,
      rank: e.rank,
      connectionName: e.connectionName,
      connectionProfileUrl: e.connectionProfileUrl,
      score: e.score,
      completionTimeSecs: e.completionTimeSecs,
      isSelf: e.isSelf,
    }))
  );

  const scrapeLogs = items.map(item => ({
    runAt: item.scrapeLog.runAt,
    gameName: item.scrapeLog.gameName,
    status: item.scrapeLog.status,
    errorMessage: item.scrapeLog.errorMessage,
    recordsCaptured: item.scrapeLog.recordsCaptured,
  }));

  const url = `${endpoint.replace(/\/$/, '')}/api/ingest`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ gameResults, leaderboardEntries, scrapeLogs }),
      signal: AbortSignal.timeout(30_000), // 30s timeout
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`☁️  Cloud push failed: ${response.status} ${response.statusText} ${text}`);
    } else {
      const json = await response.json().catch(() => ({})) as { inserted?: { gameResults?: number } };
      console.log(`☁️  Cloud push OK — ${json.inserted?.gameResults ?? gameResults.length} game results synced`);
    }
  } catch (err) {
    // Network errors, timeouts, DNS failures — log and continue
    const message = err instanceof Error ? err.message : String(err);
    console.error(`☁️  Cloud push error: ${message}`);
  }
}
