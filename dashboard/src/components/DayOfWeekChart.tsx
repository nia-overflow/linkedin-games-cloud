/**
 * DayOfWeekChart — shows average completion time by day of week.
 * Helps answer "am I faster on weekends?"
 */

import React, { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { api } from '../api'
import type { GameHistoryEntry } from '../api'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface DayPoint {
  day: string
  avgSecs: number | null
  count: number
}

function formatTime(secs: number | null): string {
  if (secs === null) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface Props {
  game: string
}

export function DayOfWeekChart({ game }: Props) {
  const [data, setData] = useState<DayPoint[]>([])
  const [loading, setLoading] = useState(true)

  const isPinpoint = game === 'pinpoint'

  useEffect(() => {
    setLoading(true)
    api.getHistory(game, 90)
      .then(history => {
        // Group completed entries by day of week (0=Sun ... 6=Sat → remap to Mon=0)
        const buckets: Record<number, number[]> = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] }
        for (const h of history) {
          if (!h.completed) continue
          const val = isPinpoint ? h.score : h.completionTimeSecs
          if (val == null) continue
          // played_date is YYYY-MM-DD — parse as local date
          const [y, m, d] = h.playedDate.split('-').map(Number) as [number, number, number]
          const dow = new Date(y, m - 1, d).getDay() // 0=Sun
          const monIndex = (dow + 6) % 7 // remap: Mon=0 ... Sun=6
          buckets[monIndex]!.push(val)
        }
        const points: DayPoint[] = DAYS.map((day, i) => {
          const vals = buckets[i]!
          return {
            day,
            avgSecs: vals.length > 0
              ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
              : null,
            count: vals.length,
          }
        })
        setData(points)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [game])

  if (loading) {
    return <div className="chart-placeholder skeleton" style={{ height: 160 }} />
  }

  const hasData = data.some(d => d.avgSecs !== null)
  if (!hasData) return null

  // Highlight the best (lowest) day
  const best = data.reduce<DayPoint | null>((best, d) => {
    if (d.avgSecs === null) return best
    if (best === null || d.avgSecs < best.avgSecs!) return d
    return best
  }, null)

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2640" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8b87a8' }} />
          <YAxis
            tick={{ fontSize: 11, fill: '#8b87a8' }}
            tickFormatter={(v) => isPinpoint ? String(v) : formatTime(v as number)}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const d = payload[0]?.payload as DayPoint
              return (
                <div className="chart-tooltip">
                  <p className="chart-tooltip-date">{label}</p>
                  {d.avgSecs !== null
                    ? <p>Avg: {isPinpoint ? `${d.avgSecs} guesses` : formatTime(d.avgSecs)}</p>
                    : <p>No data</p>
                  }
                  <p style={{ fontSize: '0.75rem', color: '#8b87a8' }}>{d.count} game{d.count !== 1 ? 's' : ''}</p>
                </div>
              )
            }}
          />
          <Bar dataKey="avgSecs" name={isPinpoint ? 'Avg Guesses' : 'Avg Time'}>
            {data.map((entry, i) => (
              <Cell
                key={`cell-${i}`}
                fill={entry.day === best?.day ? '#fbbf24' : entry.avgSecs !== null ? '#7c3aed' : '#2a2640'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="chart-legend-note">
        <span style={{ color: '#fbbf24' }}>■</span> Your best day &nbsp;
        <span style={{ color: '#7c3aed' }}>■</span> Other days &nbsp;
        · based on last 90 days
      </p>
    </div>
  )
}
