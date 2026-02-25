/**
 * useAuth — manages Supabase session state.
 *
 * Returns:
 *   session      — current Supabase session (null if not signed in)
 *   loading      — true during initial session check
 *   accessToken  — JWT access token for API calls
 *   signIn()     — opens Google OAuth popup
 *   signOut()    — signs out and clears session
 */

import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../auth'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    // Get initial session (may already be authenticated from a previous visit)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return {
    session,
    loading,
    accessToken: session?.access_token ?? null,
    signIn: () => supabase?.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    }),
    signOut: () => supabase?.auth.signOut(),
  }
}
