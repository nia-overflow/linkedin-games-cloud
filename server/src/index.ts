/**
 * LinkedIn Games Dashboard — Express API Server
 *
 * Modes:
 *   Local (no SUPABASE_URL): reads SQLite, no auth required
 *   Cloud (SUPABASE_URL set): reads Supabase Postgres, JWT auth required
 *
 * Routes:
 *   GET  /health                         — health check (no auth)
 *   GET  /api/stats                      — aggregated stats
 *   GET  /api/history                    — raw result history
 *   GET  /api/leaderboard                — leaderboard for game+date
 *   GET  /api/logs                       — scrape logs
 *   GET  /api/games                      — list of known games
 *   POST /api/ingest                     — API key auth; scraper bulk push
 *   GET  /api/user/api-key               — JWT; current key info
 *   POST /api/user/api-key               — JWT; generate new key
 *   GET  /api/user/settings              — JWT; profile settings
 *   POST /api/user/settings              — JWT; update profile settings
 *   GET  /api/community/leaderboard      — JWT; cross-user opted-in stats
 *   GET  /*                              — SPA fallback
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

import {
  getResultsForGame,
  getLeaderboard,
  getRecentLogs,
  getDb,
} from '../../scraper/src/db/index.js';

import { supabase, isCloudMode } from './supabase.js';
import { authMiddleware } from './middleware/auth.js';
import { apiKeyMiddleware } from './middleware/apiKey.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env['PORT'] || '3000', 10);

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

/**
 * Require JWT auth only when running in cloud mode.
 * In local mode, pass through so SQLite is used without auth overhead.
 */
function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!isCloudMode) {
    next();
    return;
  }
  authMiddleware(req, res, next);
}

// Rate limiter for the ingest endpoint — prevent scraper abuse
const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 pushes per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many ingest requests — try again in 15 minutes' },
});

// ── Data access helpers ───────────────────────────────────────────────────────
// Each helper switches between Supabase (cloud) and SQLite (local) transparently.
// The returned row shapes are identical between the two backends.

async function dbGetResults(userId: string | undefined, game: string, days: number) {
  if (isCloudMode && userId && supabase) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0]!;

    let query = supabase
      .from('game_results')
      .select('*')
      .eq('user_id', userId)
      .gte('played_date', cutoffStr)
      .order('played_date', { ascending: false });

    if (game !== 'all') {
      query = query.eq('game_name', game);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }
  return getResultsForGame(game, days);
}

async function dbGetLeaderboard(userId: string | undefined, game: string, date: string) {
  if (isCloudMode && userId && supabase) {
    const { data, error } = await supabase
      .from('leaderboard_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('game_name', game)
      .eq('played_date', date)
      .order('rank', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }
  return getLeaderboard(game, date);
}

async function dbGetLogs(userId: string | undefined, days: number) {
  if (isCloudMode && userId && supabase) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { data, error } = await supabase
      .from('scrape_log')
      .select('*')
      .eq('user_id', userId)
      .gte('run_at', cutoff.toISOString())
      .order('run_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }
  return getRecentLogs(days);
}

// ── Stats helpers (shared between modes) ─────────────────────────────────────

/** Local date string in YYYY-MM-DD — matches how the scraper stores played_date. */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeStats(game: string, rows: any[]) {
  if (rows.length === 0) {
    return {
      game,
      streak: 0,
      winRate: 0,
      avgCompletionSecs: null,
      avgScore: null,
      avgRank: null,
      avgPercentile: null,
      totalPlayed: 0,
      totalCompleted: 0,
      lastPlayedDate: null,
    };
  }

  // Streak: consecutive completed days ending today or yesterday
  const completedDates = [
    ...new Set(
      rows
        .filter(r => r.completed)
        .map(r => r.played_date),
    ),
  ].sort().reverse();

  let streak = 0;
  const today = new Date();

  for (let i = 0; i < completedDates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = localDateStr(expected);

    if (completedDates[i] === expectedStr) {
      streak++;
    } else {
      if (i === 0) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = localDateStr(yesterday);
        if (completedDates[0] === yesterdayStr) {
          streak++;
          continue;
        }
      }
      break;
    }
  }

  const totalPlayed = rows.length;
  const totalCompleted = rows.filter(r => r.completed).length;
  const winRate = totalPlayed > 0 ? Math.round((totalCompleted / totalPlayed) * 100) : 0;

  const completionTimes = rows
    .filter(r => r.completion_time_secs != null)
    .map(r => r.completion_time_secs as number);
  const avgCompletionSecs = completionTimes.length > 0
    ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
    : null;

  const globalPercentiles = rows
    .filter(r => r.global_percentile != null)
    .map(r => r.global_percentile as number);
  const avgPercentile = globalPercentiles.length > 0
    ? Math.round(globalPercentiles.reduce((a, b) => a + b, 0) / globalPercentiles.length)
    : null;

  const ranks = rows
    .filter(r => r.my_rank != null)
    .map(r => r.my_rank as number);
  const avgRank = ranks.length > 0
    ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length)
    : null;

  const scores = rows
    .filter(r => r.score != null)
    .map(r => r.score as number);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  return {
    game,
    streak,
    winRate,
    avgCompletionSecs,
    avgScore,
    avgRank,
    avgPercentile,
    totalPlayed,
    totalCompleted,
    lastPlayedDate: rows[0]?.played_date || null,
  };
}

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mode: isCloudMode ? 'cloud' : 'local' });
});

// ── /api/stats ────────────────────────────────────────────────────────────────

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const game = (req.query['game'] as string) || 'all';
    const days = Math.min(parseInt((req.query['days'] as string) || '30', 10), 365);
    const rows = await dbGetResults(req.userId, game, days);
    return res.json(computeStats(game, rows));
  } catch (err) {
    console.error('/api/stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── /api/history ──────────────────────────────────────────────────────────────

app.get('/api/history', requireAuth, async (req, res) => {
  try {
    const game = (req.query['game'] as string) || 'all';
    const days = Math.min(parseInt((req.query['days'] as string) || '30', 10), 365);
    const rows = await dbGetResults(req.userId, game, days);

    return res.json(rows.map(r => ({
      id: r.id,
      gameName: r.game_name,
      playedDate: r.played_date,
      capturedAt: r.captured_at,
      completed: Boolean(r.completed),
      score: r.score,
      completionTimeSecs: r.completion_time_secs,
      percentile: r.percentile,
      globalPercentile: r.global_percentile,
      myRank: r.my_rank,
    })));
  } catch (err) {
    console.error('/api/history error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── /api/leaderboard ──────────────────────────────────────────────────────────

app.get('/api/leaderboard', requireAuth, async (req, res) => {
  try {
    const game = req.query['game'] as string;
    if (!game) return res.status(400).json({ error: 'game query param is required' });

    const todayLocal = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const date = (req.query['date'] as string) || todayLocal;

    const rows = await dbGetLeaderboard(req.userId, game, date);

    return res.json(rows.map(r => ({
      id: r.id,
      gameName: r.game_name,
      playedDate: r.played_date,
      rank: r.rank,
      connectionName: r.connection_name,
      connectionProfileUrl: r.connection_profile_url,
      score: r.score,
      completionTimeSecs: r.completion_time_secs,
      isSelf: Boolean(r.is_self),
    })));
  } catch (err) {
    console.error('/api/leaderboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── /api/logs ─────────────────────────────────────────────────────────────────
// Auth is optional here — unauthenticated requests get empty data.
// This allows Railway's health check (healthcheckPath: "/api/logs") to work
// without a JWT.

app.get('/api/logs', async (req, res) => {
  try {
    // In cloud mode, try to resolve userId from Bearer token if present
    let resolvedUserId = req.userId;
    if (isCloudMode && !resolvedUserId && supabase) {
      const authHeader = req.headers['authorization'];
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { data: { user } } = await supabase.auth.getUser(token);
        resolvedUserId = user?.id;
      }
    }

    const rows = await dbGetLogs(resolvedUserId, 7);
    const lastSuccessRow = rows.find((r: { status: string }) => r.status === 'success');

    return res.json({
      lastCapturedAt: lastSuccessRow?.run_at || null,
      entries: rows.map((r: {
        id: number; run_at: string; game_name: string;
        status: string; error_message: string | null; records_captured: number | null;
      }) => ({
        id: r.id,
        runAt: r.run_at,
        gameName: r.game_name,
        status: r.status,
        errorMessage: r.error_message,
        recordsCaptured: r.records_captured,
      })),
    });
  } catch (err) {
    console.error('/api/logs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── /api/games ────────────────────────────────────────────────────────────────

app.get('/api/games', requireAuth, async (req, res) => {
  try {
    if (isCloudMode && req.userId && supabase) {
      const { data, error } = await supabase
        .from('game_results')
        .select('game_name')
        .eq('user_id', req.userId)
        .order('game_name');

      if (error) throw error;
      const names = [...new Set((data ?? []).map((r: { game_name: string }) => r.game_name))].sort();
      return res.json(names.length > 0
        ? names
        : ['queens', 'tango', 'pinpoint', 'crossclimb', 'zip', 'mini-sudoku']
      );
    }

    // Local mode
    try {
      const db = getDb();
      const rows = db.prepare(
        'SELECT DISTINCT game_name FROM game_results ORDER BY game_name ASC'
      ).all() as { game_name: string }[];
      return res.json(rows.map(r => r.game_name));
    } catch {
      return res.json(['queens', 'tango', 'pinpoint', 'crossclimb', 'zip', 'mini-sudoku']);
    }
  } catch (err) {
    console.error('/api/games error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── /api/ingest ───────────────────────────────────────────────────────────────
// Authenticated by API key (X-API-Key header).
// Accepts bulk scraper output and upserts into Supabase.

app.post('/api/ingest', ingestLimiter, apiKeyMiddleware, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Cloud mode not configured' });

  try {
    const userId = req.userId!;
    const { gameResults = [], leaderboardEntries = [], scrapeLogs = [] } = req.body as {
      gameResults: Array<{
        gameName: string; playedDate: string; capturedAt: string;
        completed: boolean; score?: number; completionTimeSecs?: number;
        percentile?: number; myRank?: number; globalPercentile?: number;
        rawData?: unknown;
      }>;
      leaderboardEntries: Array<{
        gameName: string; playedDate: string; capturedAt?: string;
        rank?: number; connectionName: string; connectionProfileUrl?: string;
        score?: number; completionTimeSecs?: number; isSelf: boolean;
      }>;
      scrapeLogs: Array<{
        runAt: string; gameName: string;
        status: 'success' | 'error' | 'no_result';
        errorMessage?: string; recordsCaptured?: number;
      }>;
    };

    // Validate status values
    const validStatuses = new Set(['success', 'error', 'no_result']);
    for (const log of scrapeLogs) {
      if (!validStatuses.has(log.status)) {
        return res.status(400).json({ error: `Invalid status: ${log.status}` });
      }
    }

    // Upsert game results
    if (gameResults.length > 0) {
      const { error } = await supabase.from('game_results').upsert(
        gameResults.map(r => ({
          user_id: userId,
          game_name: r.gameName,
          played_date: r.playedDate,
          captured_at: r.capturedAt,
          completed: r.completed,
          score: r.score ?? null,
          completion_time_secs: r.completionTimeSecs ?? null,
          percentile: r.percentile ?? null,
          my_rank: r.myRank ?? null,
          global_percentile: r.globalPercentile ?? null,
          raw_data: r.rawData ?? null,
        })),
        { onConflict: 'user_id,game_name,played_date' },
      );
      if (error) throw error;
    }

    // Replace leaderboard entries per (game, date): delete then insert
    const gamesDates = [...new Set(
      leaderboardEntries.map(e => `${e.gameName}|${e.playedDate}`)
    )];

    for (const key of gamesDates) {
      const [gameName, playedDate] = key.split('|') as [string, string];

      const { error: delError } = await supabase
        .from('leaderboard_entries')
        .delete()
        .eq('user_id', userId)
        .eq('game_name', gameName)
        .eq('played_date', playedDate);

      if (delError) throw delError;

      const batch = leaderboardEntries.filter(
        e => e.gameName === gameName && e.playedDate === playedDate
      );

      if (batch.length > 0) {
        const { error: insError } = await supabase.from('leaderboard_entries').insert(
          batch.map(e => ({
            user_id: userId,
            game_name: e.gameName,
            played_date: e.playedDate,
            rank: e.rank ?? null,
            connection_name: e.connectionName,
            connection_profile_url: e.connectionProfileUrl ?? null,
            score: e.score ?? null,
            completion_time_secs: e.completionTimeSecs ?? null,
            is_self: e.isSelf,
          })),
        );
        if (insError) throw insError;
      }
    }

    // Insert scrape logs
    if (scrapeLogs.length > 0) {
      const { error } = await supabase.from('scrape_log').insert(
        scrapeLogs.map(l => ({
          user_id: userId,
          run_at: l.runAt,
          game_name: l.gameName,
          status: l.status,
          error_message: l.errorMessage ?? null,
          records_captured: l.recordsCaptured ?? null,
        })),
      );
      if (error) throw error;
    }

    return res.json({
      success: true,
      inserted: {
        gameResults: gameResults.length,
        leaderboardEntries: leaderboardEntries.length,
        scrapeLogs: scrapeLogs.length,
      },
    });
  } catch (err) {
    console.error('/api/ingest error:', err);
    return res.status(500).json({ error: 'Ingest failed' });
  }
});

// ── /api/user/api-key ─────────────────────────────────────────────────────────

app.get('/api/user/api-key', requireAuth, async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Cloud mode not configured' });

  try {
    const { data } = await supabase
      .from('api_keys')
      .select('id, label, created_at, last_used_at')
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json(data
      ? { hasKey: true, label: data.label, createdAt: data.created_at, lastUsedAt: data.last_used_at }
      : { hasKey: false }
    );
  } catch (err) {
    console.error('/api/user/api-key GET error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/user/api-key', requireAuth, async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Cloud mode not configured' });

  try {
    // Delete any existing key for this user (one key per user)
    await supabase.from('api_keys').delete().eq('user_id', req.userId!);

    // Generate a new key
    const rawKey = `lgk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const { error } = await supabase.from('api_keys').insert({
      user_id: req.userId!,
      key_hash: keyHash,
      label: 'Default',
    });

    if (error) throw error;

    // Return the plaintext key exactly once
    return res.json({ key: rawKey });
  } catch (err) {
    console.error('/api/user/api-key POST error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── /api/user/settings ────────────────────────────────────────────────────────

app.get('/api/user/settings', requireAuth, async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Cloud mode not configured' });

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, global_leaderboard_opt_in')
      .eq('id', req.userId!)
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error('/api/user/settings GET error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/user/settings', requireAuth, async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Cloud mode not configured' });

  try {
    const { displayName, globalLeaderboardOptIn } = req.body as {
      displayName?: string;
      globalLeaderboardOptIn?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (displayName !== undefined) updates['display_name'] = displayName.slice(0, 100);
    if (globalLeaderboardOptIn !== undefined) updates['global_leaderboard_opt_in'] = globalLeaderboardOptIn;

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.userId!);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error('/api/user/settings POST error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── /api/community/leaderboard ────────────────────────────────────────────────
// Returns best times for opted-in users on a given game+date.
// Uses service-role key to query across users (bypasses RLS intentionally).

app.get('/api/community/leaderboard', requireAuth, async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Cloud mode not configured' });

  try {
    const game = req.query['game'] as string;
    const todayLocal = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const date = (req.query['date'] as string) || todayLocal;

    if (!game) return res.status(400).json({ error: 'game query param is required' });

    // Get opted-in user IDs
    const { data: optedIn, error: optInError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('global_leaderboard_opt_in', true);

    if (optInError) throw optInError;
    if (!optedIn || optedIn.length === 0) return res.json([]);

    const optedInIds = optedIn.map((u: { id: string }) => u.id);
    const displayNames = Object.fromEntries(
      optedIn.map((u: { id: string; display_name: string }) => [u.id, u.display_name])
    ) as Record<string, string>;

    // Fetch results for opted-in users
    const { data, error } = await supabase
      .from('game_results')
      .select('user_id, game_name, played_date, completion_time_secs, my_rank, global_percentile, score, completed')
      .in('user_id', optedInIds)
      .eq('game_name', game)
      .eq('played_date', date)
      .order('completion_time_secs', { ascending: true });

    if (error) throw error;

    return res.json((data ?? []).map((r: {
      user_id: string; game_name: string; played_date: string;
      completion_time_secs: number | null; my_rank: number | null;
      global_percentile: number | null; score: number | null; completed: boolean;
    }) => ({
      displayName: displayNames[r.user_id] || 'Anonymous',
      isCurrentUser: r.user_id === req.userId,
      gameName: r.game_name,
      playedDate: r.played_date,
      completionTimeSecs: r.completion_time_secs,
      myRank: r.my_rank,
      globalPercentile: r.global_percentile,
      score: r.score,
      completed: Boolean(r.completed),
    })));
  } catch (err) {
    console.error('/api/community/leaderboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Serve dashboard SPA ───────────────────────────────────────────────────────

const dashboardDist = path.resolve(__dirname, '../../dashboard/dist');

app.use(express.static(dashboardDist));

app.get('*', (_req, res) => {
  const indexPath = path.join(dashboardDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <html><body>
          <h2>LinkedIn Games Dashboard</h2>
          <p>Dashboard not built yet. Run: <code>pnpm build</code></p>
          <p>API is running at <a href="/api/logs">/api/logs</a></p>
        </body></html>
      `);
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`LinkedIn Games server running at http://localhost:${PORT}`);
});

export default app;
