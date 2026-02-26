/**
 * CalendarHeatmap — GitHub-style completion grid for the last ~16 weeks.
 * Each cell = one day, colored by how many games were completed.
 */

import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { GameHistoryEntry } from '../api'

const TOTAL_GAMES = 6

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function cellColor(completed: number | undefined): string {
  if (completed === undefined) return 'var(--bg-elevated)'
  if (completed === 0) return '#2a2640'
  if (completed <= 2) return '#4c1d95'
  if (completed <= 4) return '#6d28d9'
  return '#7c3aed'
}

function formatDate(dateStr: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [, mm, dd] = dateStr.split('-')
  return `${months[parseInt(mm!) - 1]} ${parseInt(dd!)}`
}

export function CalendarHeatmap() {
  const [completionByDate, setCompletionByDate] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getHistory('all', 112) // 16 weeks
      .then((history: GameHistoryEntry[]) => {
        const map: Record<string, number> = {}
        for (const h of history) {
          if (!h.completed) continue
          map[h.playedDate] = (map[h.playedDate] ?? 0) + 1
        }
        setCompletionByDate(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="heatmap-skeleton skeleton" />
  }

  // Build a 16-week grid ending today, starting on Monday
  const today = new Date()
  const todayStr = localDateStr(today)

  // Find the Monday 16 weeks ago
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - (16 * 7) + 1)
  // Roll back to Monday
  const dow = startDate.getDay() // 0=Sun
  const daysToMon = (dow + 6) % 7
  startDate.setDate(startDate.getDate() - daysToMon)

  // Build weeks array: each week is 7 days (Mon–Sun)
  const weeks: Array<Array<{ dateStr: string; isFuture: boolean }>> = []
  const cursor = new Date(startDate)

  while (cursor <= today) {
    const week: Array<{ dateStr: string; isFuture: boolean }> = []
    for (let d = 0; d < 7; d++) {
      const dateStr = localDateStr(cursor)
      week.push({ dateStr, isFuture: dateStr > todayStr })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  // Month labels: show month name at first week of each month
  const monthLabels: Array<{ weekIndex: number; label: string }> = []
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const m = parseInt(week[0]!.dateStr.split('-')[1]!) - 1
    if (m !== lastMonth) {
      monthLabels.push({ weekIndex: wi, label: months[m]! })
      lastMonth = m
    }
  })

  return (
    <div className="heatmap">
      {/* Month labels */}
      <div className="heatmap-months">
        {monthLabels.map(({ weekIndex, label }) => (
          <span
            key={weekIndex}
            className="heatmap-month-label"
            style={{ gridColumnStart: weekIndex + 1 }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="heatmap-grid">
        {/* Day labels (Mon–Sun) */}
        <div className="heatmap-days">
          {['M','T','W','T','F','S','S'].map((d, i) => (
            <span key={i} className="heatmap-day-label">{d}</span>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap-week">
            {week.map(({ dateStr, isFuture }) => {
              const count = isFuture ? undefined : (completionByDate[dateStr] ?? 0)
              const isToday = dateStr === todayStr
              return (
                <div
                  key={dateStr}
                  className={`heatmap-cell ${isToday ? 'heatmap-cell--today' : ''}`}
                  style={{ background: isFuture ? 'transparent' : cellColor(count) }}
                  title={isFuture ? '' : `${formatDate(dateStr)}: ${count ?? 0}/${TOTAL_GAMES} games`}
                />
              )
            })}
          </div>
        ))}
      </div>

      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Less</span>
        {[0, 2, 3, 5, 6].map(n => (
          <div key={n} className="heatmap-cell heatmap-cell--legend" style={{ background: cellColor(n) }} />
        ))}
        <span className="heatmap-legend-label">More</span>
      </div>
    </div>
  )
}
