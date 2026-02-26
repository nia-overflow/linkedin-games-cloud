import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { GameStats, PersonalBests } from '../api'

function formatTime(secs: number | null): string {
  if (secs === null) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [, mm, dd] = dateStr.split('-')
  return `${months[parseInt(mm) - 1]} ${parseInt(dd)}`
}

interface Props {
  game: string
}

export function StatsBar({ game }: Props) {
  const [stats, setStats] = useState<GameStats | null>(null)
  const [bests, setBests] = useState<PersonalBests | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setBests(null)
    const statsPromise = api.getStats(game, 365).then(setStats)
    const bestsPromise = game !== 'all'
      ? api.getBests(game).then(setBests).catch(() => {})
      : Promise.resolve()
    Promise.all([statsPromise, bestsPromise])
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [game])

  if (loading) {
    return (
      <div className="stats-bar stats-bar--loading">
        <div className="stat-card skeleton" />
        <div className="stat-card skeleton" />
        <div className="stat-card skeleton" />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="stats-bar stats-bar--error">
        <p>Unable to load stats: {error}</p>
      </div>
    )
  }

  const isPinpoint = game === 'pinpoint'
  const isSpecificGame = game !== 'all'

  return (
    <div className={`stats-bar ${isSpecificGame ? 'stats-bar--5col' : ''}`}>
      <div className="stat-card">
        <div className="stat-value stat-value--streak">
          {stats.streak}
          <span className="stat-emoji">🔥</span>
        </div>
        <div className="stat-label">Current Streak</div>
        <div className="stat-sub">days</div>
      </div>

      <div className="stat-card">
        <div className="stat-value">{stats.winRate}%</div>
        <div className="stat-label">Win Rate</div>
        <div className="stat-sub">{stats.totalCompleted}/{stats.totalPlayed} completed</div>
      </div>

      {/* Time card — Pinpoint shows avg guesses instead */}
      <div className="stat-card">
        {isPinpoint ? (
          <>
            <div className="stat-value">{stats.avgScore ?? '—'}</div>
            <div className="stat-label">Avg Guesses</div>
            <div className="stat-sub">last 30 days</div>
            {bests?.bestScore != null && (
              <div className="stat-pb">PB {bests.bestScore} guess{bests.bestScore !== 1 ? 'es' : ''} · {formatShortDate(bests.bestScoreDate)}</div>
            )}
          </>
        ) : (
          <>
            <div className="stat-value">{formatTime(stats.avgCompletionSecs)}</div>
            <div className="stat-label">Avg Time</div>
            <div className="stat-sub">last 30 days</div>
            {bests?.bestTimeSecs != null && (
              <div className="stat-pb">PB {formatTime(bests.bestTimeSecs)} · {formatShortDate(bests.bestTimeDate)}</div>
            )}
          </>
        )}
      </div>

      {/* Rank — only shown for individual games */}
      {isSpecificGame && (
        <div className="stat-card">
          <div className="stat-value">
            {stats.avgRank !== null ? `#${stats.avgRank}` : '—'}
          </div>
          <div className="stat-label">Avg Rank</div>
          <div className="stat-sub">among connections</div>
        </div>
      )}

      <div className="stat-card">
        <div className="stat-value">
          {stats.avgPercentile !== null ? `${stats.avgPercentile}th` : '—'}
        </div>
        <div className="stat-label">Avg Percentile</div>
        <div className="stat-sub">worldwide</div>
      </div>
    </div>
  )
}
