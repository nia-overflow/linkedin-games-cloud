/**
 * Login — full-page sign-in screen.
 * Shown when auth is enabled and the user is not signed in.
 */

import React, { useState } from 'react'
import { supabase } from '../auth'

export function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  function handleGoogleSignIn() {
    supabase?.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !supabase) return
    setSending(true)
    await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setSending(false)
    setSent(true)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🎮</div>
        <h1 className="login-title">LinkedIn Games Dashboard</h1>
        <p className="login-subtitle">
          Track your LinkedIn game stats across Queens, Tango, Pinpoint, and more.
        </p>
        <button className="login-btn" onClick={handleGoogleSignIn}>
          <GoogleIcon />
          Sign in with Google
        </button>
        <div className="login-divider"><span>or</span></div>
        {sent ? (
          <p className="login-sent">Check your email — we sent a sign-in link to <strong>{email}</strong></p>
        ) : (
          <form className="login-magic" onSubmit={handleMagicLink}>
            <input
              className="login-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <button className="login-btn login-btn--magic" type="submit" disabled={sending}>
              {sending ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
        <p className="login-note">
          Your data stays private. Only you can see your results.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="login-btn-icon" viewBox="0 0 24 24" width="20" height="20">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
