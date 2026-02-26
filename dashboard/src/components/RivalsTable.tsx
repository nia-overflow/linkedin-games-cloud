/**
 * RivalsTable — shows win rate against each connection you've faced ≥3 times.
 * Clicking a name opens the HeadToHeadModal.
 */

import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { RivalEntry } from '../api'
import { HeadToHeadModal } from './HeadToHeadModal'

interface Props {
  game: string
}

export function RivalsTable({ game }: Props) {
  const [rivals, setRivals] = useState<RivalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.getRivals(game)
      .then(setRivals)
      .catch(() => setRivals([]))
      .finally(() => setLoading(false))
  }, [game])

  if (loading) {
    return <div className="rivals-placeholder skeleton" style={{ height: 80 }} />
  }

  if (rivals.length === 0) {
    return (
      <p className="rivals-empty hint">
        Need 3+ shared game days to show rivalry stats.
      </p>
    )
  }

  return (
    <>
      <div className="rivals-table">
        {rivals.map(r => (
          <div key={r.connectionName} className="rivals-row">
            <button
              className="rivals-name"
              onClick={() => setSelected(r.connectionName)}
              title="View head-to-head history"
            >
              {r.connectionName}
            </button>
            <div className="rivals-bar-wrap">
              <div
                className="rivals-bar"
                style={{ width: `${r.winRate}%` }}
              />
            </div>
            <span className="rivals-pct">{r.winRate}%</span>
            <span className="rivals-record">
              {r.wins}W–{r.total - r.wins}L
            </span>
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>Click a name for head-to-head history</p>

      {selected && (
        <HeadToHeadModal
          game={game}
          connectionName={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
