import React, { useState, useEffect } from 'react'
import { api } from '../api'
import type { GameHistoryEntry } from '../api'

interface Props {
  games: string[]
}

function generateShareText(byGame: Map<string, GameHistoryEntry>, games: string[]): string {
  const d = new Date()
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dateStr = `${months[d.getMonth()]} ${d.getDate()}`
  const lines = [`LinkedIn Games · ${dateStr}`, '─────────────────────']
  for (const game of games) {
    const entry = byGame.get(game)
    const label = capitalize(game).padEnd(13)
    if (!entry) {
      lines.push(`${label} —`)
    } else if (!entry.completed) {
      lines.push(`${label} ✗`)
    } else {
      const score = getTimeLabel(game, entry)
      const rank = entry.myRank ? `  #${entry.myRank}` : ''
      lines.push(`${label} ${score}${rank}`)
    }
  }
  return lines.join('\n')
}

/** Format seconds as M:SS */
function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Get today's local date as YYYY-MM-DD */
function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TodayResults({ games }: Props) {
  const [entries, setEntries] = useState<GameHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.getHistory('all', 1)
      .then(data => {
        const today = todayLocal()
        setEntries(data.filter(e => e.playedDate === today))
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="today-results">
        {games.map(g => (
          <div key={g} className="today-card today-card--loading skeleton" />
        ))}
      </div>
    )
  }

  // Build a lookup: gameName -> entry (prefer completed entry if multiple)
  const byGame = new Map<string, GameHistoryEntry>()
  for (const entry of entries) {
    const existing = byGame.get(entry.gameName)
    if (!existing || entry.completed) {
      byGame.set(entry.gameName, entry)
    }
  }

  function handleCopy() {
    const text = generateShareText(byGame, games)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const hasAnyResult = games.some(g => byGame.has(g))

  return (
    <>
    <div className="today-results">
      {games.map(game => {
        const entry = byGame.get(game)

        // Not played today
        if (!entry) {
          return (
            <div key={game} className="today-card today-card--unplayed">
              <span className="today-card__status">⬜</span>
              <span className="today-card__name">{capitalize(game)}</span>
              <span className="today-card__time today-card__time--none">—</span>
            </div>
          )
        }

        // Played — completed or not
        const timeLabel = entry.completed
          ? getTimeLabel(game, entry)
          : 'Did not finish'

        return (
          <div
            key={game}
            className={`today-card ${entry.completed ? 'today-card--completed' : 'today-card--incomplete'}`}
          >
            <span className="today-card__status">{entry.completed ? '✅' : '❌'}</span>
            <span className="today-card__name">{capitalize(game)}</span>
            <span className="today-card__time">{timeLabel}</span>
            {entry.myRank !== null && entry.myRank !== undefined && (
              <span className="today-card__rank">Rank #{entry.myRank}</span>
            )}
            {(entry.globalPercentile ?? entry.percentile) !== null && (entry.globalPercentile ?? entry.percentile) !== undefined && (
              <span className="today-card__percentile">top {100 - (entry.globalPercentile ?? entry.percentile)!}% worldwide</span>
            )}
          </div>
        )
      })}
    </div>
    {hasAnyResult && (
      <div className="share-row">
        <button className="share-btn" onClick={handleCopy}>
          {copied ? '✓ Copied!' : '⎘ Copy Results'}
        </button>
      </div>
    )}
    </>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Returns the display string for a game entry's result */
function getTimeLabel(game: string, entry: GameHistoryEntry): string {
  if (game === 'pinpoint') {
    // score = number of guesses used
    if (entry.score !== null) {
      return `${entry.score} guess${entry.score === 1 ? '' : 'es'}`
    }
    return 'Completed'
  }
  if (entry.completionTimeSecs !== null) {
    return formatTime(entry.completionTimeSecs)
  }
  return 'Completed'
}
