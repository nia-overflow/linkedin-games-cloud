/**
 * CommunityLeaderboard — cross-user stats for opted-in players.
 *
 * Shows best times for a given game on today's date.
 * Only appears in cloud mode when the user is authenticated.
 */

import React, { useState, useEffect } from 'react'
import { api, type CommunityEntry } from '../api'

function formatTime(secs: number | null): string {
  if (secs == null) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const KNOWN_GAMES = ['queens', 'tango', 'pinpoint', 'crossclimb', 'zip', 'mini-sudoku']

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function CommunityLeaderboard({ games }: { games: string[] }) {
  const [selectedGame, setSelectedGame] = useState(games[0] ?? KNOWN_GAMES[0] ?? 'queens')
  const [entries, setEntries] = useState<CommunityEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getCommunityLeaderboard(selectedGame)
      .then(data => {
        setEntries(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load')
        setLoading(false)
      })
  }, [selectedGame])

  const today = (() => {
    const d = new Date()
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  })()

  return (
    <div className="community">
      <div className="community-header">
        <p className="community-date">{today}</p>
        <p className="community-note">
          Only players who opted in to the Community Leaderboard are shown.
        </p>
      </div>

      {/* Game selector */}
      <nav className="community-tabs">
        {games.map(game => (
          <button
            key={game}
            className={`community-tab ${selectedGame === game ? 'community-tab--active' : ''}`}
            onClick={() => setSelectedGame(game)}
          >
            {capitalize(game)}
          </button>
        ))}
      </nav>

      {/* Results */}
      {loading && <p className="community-loading">Loading...</p>}
      {error && <p className="community-error">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <div className="community-empty">
          <p>No results yet for {capitalize(selectedGame)} today.</p>
          <p className="community-hint">
            Run your scraper and opt in to the leaderboard in Settings to appear here.
          </p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <table className="community-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Time</th>
              <th>Global %ile</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={entry.displayName + i}
                className={entry.isCurrentUser ? 'community-row--self' : ''}
              >
                <td>{i + 1}</td>
                <td>
                  {entry.displayName}
                  {entry.isCurrentUser && <span className="community-you"> (you)</span>}
                </td>
                <td>{formatTime(entry.completionTimeSecs)}</td>
                <td>{entry.globalPercentile != null ? `${entry.globalPercentile}%` : '—'}</td>
                <td>{entry.score ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
