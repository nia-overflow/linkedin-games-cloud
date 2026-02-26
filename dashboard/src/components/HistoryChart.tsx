import React, { useEffect, useState } from 'react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { api } from '../api'
import type { GameHistoryEntry } from '../api'

interface ChartPoint {
  date: string       // MM-DD (display)
  fullDate: string   // YYYY-MM-DD (for click handler)
  completed: number
  missed: number
  timeSecs: number | null
  trendSecs?: number // linear regression value
  rankVal: number | null
  gameName?: string
}

interface Props {
  game: string
  selectedDate?: string
  bestDate?: string
  onBarClick?: (date: string) => void
}

type ChartView = 'time' | 'rank'

/** Compute linear regression trend values for an array of (index, value) pairs. */
function computeTrend(points: Array<{ x: number; y: number }>): number[] {
  const n = points.length
  if (n < 2) return points.map(p => p.y)
  const sumX  = points.reduce((a, p) => a + p.x, 0)
  const sumY  = points.reduce((a, p) => a + p.y, 0)
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0)
  const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0)
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return points.map(() => sumY / n)
  const slope     = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return points.map(p => Math.max(0, Math.round(slope * p.x + intercept)))
}

function formatTime(secs: number | null): string {
  if (secs === null) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function CustomTooltip({ active, payload, label, isPinpoint }: any) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload as ChartPoint
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{label}</p>
      {data.gameName && <p>Game: {data.gameName}</p>}
      <p>{data.completed ? '✅ Completed' : '❌ Not completed'}</p>
      {data.timeSecs !== null && data.timeSecs !== undefined && (
        isPinpoint
          ? <p>Guesses: {data.timeSecs}</p>
          : <p>Time: {formatTime(data.timeSecs)}</p>
      )}
    </div>
  )
}

export function HistoryChart({ game, selectedDate, bestDate, onBarClick }: Props) {
  const [history, setHistory] = useState<GameHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ChartView>('time')

  useEffect(() => {
    setLoading(true)
    setError(null)
    setView('time')
    api.getHistory(game, 30)
      .then(setHistory)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [game])

  if (loading) {
    return <div className="chart-placeholder skeleton" style={{ height: 220 }} />
  }

  if (error) {
    return <div className="chart-error">Unable to load history: {error}</div>
  }

  if (history.length === 0) {
    return (
      <div className="chart-empty">
        <p>No data yet. Run the scraper to capture game results.</p>
        <code>pnpm scrape</code>
      </div>
    )
  }

  // For "all games" view: aggregate by date, count games completed per day
  // For single game: show completion time trend (or guess count for Pinpoint)
  let chartData: ChartPoint[]

  const isPinpoint = game === 'pinpoint'

  if (game === 'all') {
    const byDate: Record<string, { completed: number; missed: number }> = {}
    history.forEach(h => {
      if (!byDate[h.playedDate]) byDate[h.playedDate] = { completed: 0, missed: 0 }
      if (h.completed) byDate[h.playedDate].completed++
      else byDate[h.playedDate].missed++
    })
    chartData = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, counts]) => ({
        date: date.slice(5), // MM-DD
        fullDate: date,
        ...counts,
        timeSecs: null,
        rankVal: null,
      }))
  } else {
    chartData = history
      .slice(0, 30)
      .reverse()
      .map(h => ({
        date: h.playedDate.slice(5),
        fullDate: h.playedDate,
        completed: h.completed ? 1 : 0,
        missed: h.completed ? 0 : 1,
        // Pinpoint stores guess count in `score`; all other games store seconds in `completionTimeSecs`
        timeSecs: isPinpoint ? h.score : h.completionTimeSecs,
        rankVal: h.myRank,
        gameName: h.gameName,
      }))
  }

  if (game === 'all') {
    return (
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2640" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#8b87a8" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8b87a8" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="completed" name="Completed" stackId="a" fill="#7c3aed" />
            <Bar dataKey="missed" name="Missed" stackId="a" fill="#2a2640" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // Compute trend line from completed data points (not for Pinpoint — guesses don't trend linearly)
  if (!isPinpoint) {
    const completedPoints = chartData
      .map((d, i) => (d.completed && d.timeSecs != null ? { x: i, y: d.timeSecs } : null))
      .filter((p): p is { x: number; y: number } => p !== null)
    if (completedPoints.length >= 3) {
      const trendValues = computeTrend(completedPoints)
      completedPoints.forEach((p, i) => {
        chartData[p.x] = { ...chartData[p.x]!, trendSecs: trendValues[i] }
      })
    }
  }

  const hasRankData = chartData.some(d => d.rankVal != null)

  // Single game: color bars by completion, height by time (or guess count for Pinpoint)
  return (
    <div className="chart-container">
      {hasRankData && (
        <div className="chart-view-toggle">
          <button
            className={`chart-view-btn ${view === 'time' ? 'chart-view-btn--active' : ''}`}
            onClick={() => setView('time')}
          >
            {isPinpoint ? 'Guesses' : 'Time'}
          </button>
          <button
            className={`chart-view-btn ${view === 'rank' ? 'chart-view-btn--active' : ''}`}
            onClick={() => setView('rank')}
          >
            Rank
          </button>
        </div>
      )}

      {view === 'time' ? (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2640" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#8b87a8" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "#8b87a8" }}
              tickFormatter={(v) => isPinpoint ? String(v) : formatTime(v as number)}
            />
            <Tooltip content={<CustomTooltip isPinpoint={isPinpoint} />} />
            <Bar
              dataKey="timeSecs"
              name={isPinpoint ? 'Guesses' : 'Completion Time'}
              onClick={(data: ChartPoint) => onBarClick?.(data.fullDate)}
              style={{ cursor: onBarClick ? 'pointer' : undefined }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.fullDate === selectedDate
                      ? '#c4b5fd'
                      : entry.fullDate === bestDate
                        ? '#fbbf24'
                        : entry.completed ? '#7c3aed' : '#2a2640'
                  }
                />
              ))}
            </Bar>
            {!isPinpoint && (
              <Line
                type="monotone"
                dataKey="trendSecs"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 3"
                connectNulls
                name="Trend"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2640" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#8b87a8" }} />
            <YAxis
              reversed
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#8b87a8" }}
              label={{ value: 'Rank', angle: -90, position: 'insideLeft', fill: '#8b87a8', fontSize: 11 }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const rank = payload[0]?.value
                return (
                  <div className="chart-tooltip">
                    <p className="chart-tooltip-date">{label}</p>
                    <p>Rank: #{rank}</p>
                  </div>
                )
              }}
            />
            <Bar
              dataKey="rankVal"
              name="Rank"
              onClick={(data: ChartPoint) => onBarClick?.(data.fullDate)}
              style={{ cursor: onBarClick ? 'pointer' : undefined }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.fullDate === selectedDate
                      ? '#c4b5fd'
                      : entry.rankVal === 1 ? '#fbbf24'
                        : entry.completed ? '#7c3aed' : '#2a2640'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      <p className="chart-legend-note">
        {view === 'time' ? (
          <>
            <span style={{ color: '#7c3aed' }}>■</span> Completed &nbsp;
            {bestDate && <><span style={{ color: '#fbbf24' }}>■</span> Personal best &nbsp;</>}
            <span style={{ color: '#ccc' }}>■</span> Not played
          </>
        ) : (
          <>
            <span style={{ color: '#7c3aed' }}>■</span> Ranked &nbsp;
            <span style={{ color: '#fbbf24' }}>■</span> Rank #1 &nbsp;
            <span style={{ color: '#ccc' }}>■</span> No rank
          </>
        )}
      </p>
    </div>
  )
}
