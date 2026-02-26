/**
 * HeadToHeadModal — per-date comparison between the user and a connection.
 * Opens when a connection name is clicked in the leaderboard.
 */

import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { HeadToHeadEntry } from '../api'

function formatTime(secs: number | null): string {
  if (secs === null) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatShortDate(dateStr: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [, mm, dd] = dateStr.split('-')
  return `${months[parseInt(mm!) - 1]} ${parseInt(dd!)}`
}

interface Props {
  game: string
  connectionName: string
  onClose: () => void
}

export function HeadToHeadModal({ game, connectionName, onClose }: Props) {
  const [entries, setEntries] = useState<HeadToHeadEntry[]>([])
  const [loading, setLoading] = useState(true)

  const isPinpoint = game === 'pinpoint'

  useEffect(() => {
    api.getHeadToHead(game, connectionName)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [game, connectionName])

  const wins = entries.filter(e => e.youWon).length
  const losses = entries.filter(e => !e.youWon).length

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Head-to-Head</h2>
            <p className="modal-subtitle">You vs {connectionName} · {game}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="modal-loading skeleton" style={{ height: 80 }} />
        ) : entries.length === 0 ? (
          <p className="modal-empty">Not enough shared data yet — need at least one day playing the same game.</p>
        ) : (
          <>
            <div className="h2h-record">
              <div className="h2h-score h2h-score--you">
                <div className="h2h-score-num">{wins}</div>
                <div className="h2h-score-label">You</div>
              </div>
              <div className="h2h-vs">—</div>
              <div className="h2h-score h2h-score--them">
                <div className="h2h-score-num">{losses}</div>
                <div className="h2h-score-label">{connectionName.split(' ')[0]}</div>
              </div>
            </div>

            <div className="h2h-table-wrapper">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>You</th>
                    <th>{connectionName.split(' ')[0]}</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.playedDate} className={e.youWon ? 'h2h-row--win' : 'h2h-row--loss'}>
                      <td>{formatShortDate(e.playedDate)}</td>
                      <td>
                        {isPinpoint
                          ? (e.myScore != null ? `${e.myScore}g` : '—')
                          : formatTime(e.myTimeSecs)
                        } <span className="h2h-rank">#{e.myRank}</span>
                      </td>
                      <td>
                        {isPinpoint
                          ? (e.theirScore != null ? `${e.theirScore}g` : '—')
                          : formatTime(e.theirTimeSecs)
                        } {e.theirRank != null && <span className="h2h-rank">#{e.theirRank}</span>}
                      </td>
                      <td>{e.youWon ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
