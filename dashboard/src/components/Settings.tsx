/**
 * Settings — user profile and API key management.
 *
 * Features:
 *   - Display name editing
 *   - Global leaderboard opt-in toggle
 *   - API key generation and copy (shown once)
 */

import React, { useState, useEffect } from 'react'
import { api } from '../api'

interface SettingsData {
  display_name: string | null
}

interface ApiKeyInfo {
  hasKey: boolean
  label?: string
  createdAt?: string
  lastUsedAt?: string | null
}

export function Settings({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.getSettings().then(data => {
      setSettings(data)
      setDisplayName(data.display_name ?? '')
    }).catch(console.error)

    api.getApiKeyInfo().then(setApiKeyInfo).catch(console.error)
  }, [])

  async function handleSaveProfile() {
    setSaving(true)
    setSavedMsg('')
    try {
      await api.updateSettings({ displayName, globalLeaderboardOptIn: optIn })
      setSavedMsg('Saved!')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) {
      console.error(err)
      setSavedMsg('Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateKey() {
    if (!confirm('This will replace any existing API key. Continue?')) return
    setGeneratingKey(true)
    try {
      const { key } = await api.generateApiKey()
      setNewKey(key)
      setApiKeyInfo({ hasKey: true, createdAt: new Date().toISOString() })
    } catch (err) {
      console.error(err)
    } finally {
      setGeneratingKey(false)
    }
  }

  function handleCopyKey() {
    if (!newKey) return
    navigator.clipboard.writeText(newKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {settings === null ? (
          <p className="settings-loading">Loading...</p>
        ) : (
          <>
            {/* Profile section */}
            <section className="settings-section">
              <h3 className="settings-section-title">Profile</h3>

              <label className="settings-label">
                Display Name
                <input
                  className="settings-input"
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  maxLength={100}
                />
              </label>

              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={optIn}
                  onChange={e => setOptIn(e.target.checked)}
                />
                Show my stats on the Community Leaderboard
                <span className="settings-hint">
                  Only completion times and scores — no personal info beyond your display name.
                </span>
              </label>

              <div className="settings-actions">
                <button
                  className="settings-btn settings-btn--primary"
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                {savedMsg && <span className="settings-saved-msg">{savedMsg}</span>}
              </div>
            </section>

            {/* API Key section */}
            <section className="settings-section">
              <h3 className="settings-section-title">Scraper API Key</h3>
              <p className="settings-hint">
                Add this key to <code>~/.linkedin-games/.env</code> so your local
                scraper can push data to the cloud dashboard.
              </p>

              {apiKeyInfo?.hasKey && !newKey && (
                <div className="settings-key-info">
                  <span>Key active</span>
                  {apiKeyInfo.lastUsedAt && (
                    <span className="settings-key-meta">
                      Last used: {new Date(apiKeyInfo.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                  {!apiKeyInfo.lastUsedAt && (
                    <span className="settings-key-meta">Never used</span>
                  )}
                </div>
              )}

              {newKey && (
                <div className="settings-key-reveal">
                  <p className="settings-key-warning">
                    Copy this key now — it won't be shown again.
                  </p>
                  <div className="settings-key-copy-row">
                    <code className="settings-key-value">{newKey}</code>
                    <button
                      className="settings-btn settings-btn--secondary"
                      onClick={handleCopyKey}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              <button
                className="settings-btn settings-btn--secondary"
                onClick={handleGenerateKey}
                disabled={generatingKey}
              >
                {generatingKey
                  ? 'Generating...'
                  : apiKeyInfo?.hasKey
                    ? 'Regenerate API Key'
                    : 'Generate API Key'}
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
