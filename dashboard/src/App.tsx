import React, { useState, useEffect } from 'react'
import { StatsBar } from './components/StatsBar'
import { HistoryChart } from './components/HistoryChart'
import { LeaderboardTable } from './components/LeaderboardTable'
import { StalenessWarning } from './components/StalenessWarning'
import { TodayResults } from './components/TodayResults'
import { Login } from './components/Login'
import { Settings } from './components/Settings'
import { api, setTokenProvider } from './api'
import { isAuthEnabled } from './auth'
import { useAuth } from './hooks/useAuth'
import type { ScrapeLogEntry } from './api'
import './styles.css'

const KNOWN_GAMES = ['queens', 'tango', 'pinpoint', 'crossclimb', 'zip', 'mini-sudoku']

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function DevTab({ logs }: { logs: ScrapeLogEntry[] }) {
  const errors = logs.filter(e => e.status === 'error')
  return (
    <div className="dev-tab">
      <section className="section">
        <h2 className="section-title">Scrape Errors</h2>
        {errors.length === 0 ? (
          <p className="dev-empty">No errors recorded.</p>
        ) : (
          <div className="dev-log-table">
            {errors.map(e => (
              <div key={e.id} className="dev-log-row">
                <span className="dev-log-time">{new Date(e.runAt).toLocaleString()}</span>
                <span className="dev-log-game">{e.gameName}</span>
                <span className="dev-status dev-status--error">error</span>
                <span className="dev-log-msg">{e.errorMessage ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="section">
        <h2 className="section-title">Full Scrape Log</h2>
        <div className="dev-log-table">
          {logs.map(e => (
            <div key={e.id} className="dev-log-row">
              <span className="dev-log-time">{new Date(e.runAt).toLocaleString()}</span>
              <span className="dev-log-game">{e.gameName}</span>
              <span className={`dev-status dev-status--${e.status}`}>{e.status}</span>
              <span className="dev-log-records">{e.recordsCaptured ?? '—'}</span>
              <span className="dev-log-msg">{e.errorMessage ?? ''}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default function App() {
  const { session, loading: authLoading, accessToken, signOut } = useAuth()
  const [selectedGame, setSelectedGame] = useState<string>('all')
  const [games, setGames] = useState<string[]>(KNOWN_GAMES)
  const [lastCapturedAt, setLastCapturedAt] = useState<string | null>(null)
  const [allLogs, setAllLogs] = useState<ScrapeLogEntry[]>([])
  const [showSettings, setShowSettings] = useState(false)

  // Wire up the token provider so all API calls include Authorization header
  useEffect(() => {
    setTokenProvider(() => accessToken)
  }, [accessToken])

  useEffect(() => {
    // Only fetch data if we're not in auth-required mode, or if we have a session
    if (isAuthEnabled && !session) return

    api.getGames().then(setGames).catch(() => {})
    api.getLogs().then(data => {
      setLastCapturedAt(data.lastCapturedAt)
      setAllLogs(data.entries)
    }).catch(() => {})
  }, [session])

  // Show nothing while Supabase checks for an existing session
  if (isAuthEnabled && authLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    )
  }

  // Require sign-in when auth is enabled
  if (isAuthEnabled && !session) {
    return <Login />
  }

  const isStale = lastCapturedAt
    ? Date.now() - new Date(lastCapturedAt).getTime() > 25 * 60 * 60 * 1000
    : true

  const tabs = ['all', ...games, 'dev']

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <span className="header-logo">🎮</span>
            <h1>LinkedIn Games Dashboard</h1>
          </div>
          <div className="header-actions">
            {lastCapturedAt && (
              <div className="header-meta">
                Last updated: {new Date(lastCapturedAt).toLocaleString()}
              </div>
            )}
            {isAuthEnabled && session && (
              <>
                <button
                  className="header-btn"
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                >
                  Settings
                </button>
                <button
                  className="header-btn header-btn--secondary"
                  onClick={() => signOut?.()}
                  title="Sign out"
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {isStale && <StalenessWarning lastCapturedAt={lastCapturedAt} />}

      <main className="app-main">
        {/* Game tabs */}
        <nav className="tabs" aria-label="Game filter">
          {tabs.map(game => (
            <button
              key={game}
              className={`tab ${selectedGame === game ? 'tab--active' : ''} ${game === 'dev' ? 'tab--dev' : ''}`}
              onClick={() => setSelectedGame(game)}
              aria-pressed={selectedGame === game}
            >
              {game === 'all'
                ? 'All Games'
                : game === 'dev'
                  ? 'Dev'
                  : capitalize(game)}
            </button>
          ))}
        </nav>

        {selectedGame === 'dev' ? (
          <DevTab logs={allLogs} />
        ) : (
          <>
            {/* Stats bar */}
            <StatsBar game={selectedGame} />

            {/* Today's Results — only shown on the All Games tab */}
            {selectedGame === 'all' && (
              <section className="section">
                <h2 className="section-title">Today's Results</h2>
                <TodayResults games={games} />
              </section>
            )}

            {/* History chart */}
            <section className="section">
              <h2 className="section-title">
                {selectedGame === 'all' ? 'All Games History' : `${capitalize(selectedGame)} History`}
              </h2>
              <HistoryChart game={selectedGame} />
            </section>

            {/* Leaderboard (only for specific games, not "all") */}
            {selectedGame !== 'all' && (
              <section className="section">
                <h2 className="section-title">Today's Leaderboard</h2>
                <LeaderboardTable game={selectedGame} />
              </section>
            )}
          </>
        )}
      </main>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
