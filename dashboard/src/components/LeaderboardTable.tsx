import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { LeaderboardEntry } from '../api'
import { HeadToHeadModal } from './HeadToHeadModal'

function formatTime(secs: number | null): string {
  if (secs === null) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function rankEmoji(rank: number | null): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return String(rank ?? '—')
}

interface Props {
  game: string
  date?: string
}

export function LeaderboardTable({ game, date }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const todayLocal = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const displayDate = date || todayLocal

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getLeaderboard(game, date)
      .then(setEntries)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [game, date])

  if (loading) {
    return <div className="leaderboard-placeholder skeleton" style={{ height: 160 }} />
  }

  if (error) {
    return <div className="leaderboard-error">Unable to load leaderboard: {error}</div>
  }

  if (entries.length === 0) {
    return (
      <div className="leaderboard-empty">
        <p>No leaderboard data for {game} on {displayDate}.</p>
        <p className="hint">Leaderboard is captured when the scraper runs at 11:55 PM.</p>
      </div>
    )
  }

  // Pinpoint uses guess counts (score) instead of completion times.
  const isScoreBased = entries.every(e => e.completionTimeSecs === null && e.score !== null)

  function formatScore(entry: LeaderboardEntry): string {
    if (entry.completionTimeSecs !== null) return formatTime(entry.completionTimeSecs)
    if (entry.score !== null) return `${entry.score} guess${entry.score !== 1 ? 'es' : ''}`
    return '—'
  }

  return (
    <div className="leaderboard">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Name</th>
            <th>{isScoreBased ? 'Guesses' : 'Time'}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr
              key={entry.id}
              className={`leaderboard-row ${entry.isSelf ? 'leaderboard-row--self' : ''}`}
            >
              <td className="leaderboard-rank">{rankEmoji(entry.rank)}</td>
              <td className="leaderboard-name">
                {entry.isSelf ? (
                  <>
                    {entry.connectionName}
                    <span className="self-badge">You</span>
                  </>
                ) : (
                  <button
                    className="leaderboard-name-btn"
                    onClick={() => setSelected(entry.connectionName)}
                    title="View head-to-head history"
                  >
                    {entry.connectionName}
                  </button>
                )}
              </td>
              <td className="leaderboard-time">{formatScore(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="leaderboard-date">
        {displayDate} · {entries.length} player{entries.length !== 1 ? 's' : ''}
      </p>
      {selected && (
        <HeadToHeadModal
          game={game}
          connectionName={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
