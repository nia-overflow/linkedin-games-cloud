/**
 * API client — all calls go to /api/*
 *
 * In cloud mode, every request includes an Authorization: Bearer <token> header.
 * Call setTokenProvider() once in App.tsx after auth is initialized.
 */

const BASE = '/api'

// ── Token injection ────────────────────────────────────────────────────────────

let _getToken: (() => string | null) | null = null

/**
 * Register a function that returns the current auth token.
 * Called by App.tsx after the Supabase session is available.
 */
export function setTokenProvider(fn: () => string | null) {
  _getToken = fn
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface GameStats {
  game: string
  streak: number
  winRate: number
  avgCompletionSecs: number | null
  avgScore: number | null
  avgRank: number | null
  avgPercentile: number | null
  totalPlayed: number
  totalCompleted: number
  lastPlayedDate: string | null
}

export interface GameHistoryEntry {
  id: number
  gameName: string
  playedDate: string
  capturedAt: string
  completed: boolean
  score: number | null
  completionTimeSecs: number | null
  percentile: number | null
  globalPercentile: number | null
  myRank: number | null
}

export interface LeaderboardEntry {
  id: number
  gameName: string
  playedDate: string
  rank: number | null
  connectionName: string
  connectionProfileUrl: string | null
  score: number | null
  completionTimeSecs: number | null
  isSelf: boolean
}

export interface ScrapeLogEntry {
  id: number
  runAt: string
  gameName: string
  status: 'success' | 'error' | 'no_result'
  errorMessage: string | null
  recordsCaptured: number | null
}

export interface LogsResponse {
  lastCapturedAt: string | null
  entries: ScrapeLogEntry[]
}

export interface UserSettings {
  display_name: string | null
}

export interface ApiKeyInfo {
  hasKey: boolean
  label?: string
  createdAt?: string
  lastUsedAt?: string | null
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = _getToken?.()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), { headers: authHeaders() })
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
  return res.json()
}

// ── API methods ───────────────────────────────────────────────────────────────

export const api = {
  // ── Existing endpoints ────────────────────────────────────────────────────

  getStats: (game: string, days = 30) =>
    get<GameStats>('/stats', { game, days: String(days) }),

  getHistory: (game: string, days = 30) =>
    get<GameHistoryEntry[]>('/history', { game, days: String(days) }),

  getLeaderboard: (game: string, date?: string) =>
    get<LeaderboardEntry[]>('/leaderboard', {
      game,
      ...(date ? { date } : {}),
    }),

  getLogs: () => get<LogsResponse>('/logs'),

  getGames: () => get<string[]>('/games'),

  // ── User settings ─────────────────────────────────────────────────────────

  getSettings: () =>
    get<UserSettings>('/user/settings'),

  updateSettings: (data: { displayName?: string }) =>
    post<{ success: boolean }>('/user/settings', data),

  // ── API key management ────────────────────────────────────────────────────

  getApiKeyInfo: () =>
    get<ApiKeyInfo>('/user/api-key'),

  generateApiKey: () =>
    post<{ key: string }>('/user/api-key'),
}
