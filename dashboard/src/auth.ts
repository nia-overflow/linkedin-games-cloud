/**
 * Supabase browser client (public anon key).
 *
 * When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set at build time,
 * auth is active and the dashboard requires Google sign-in.
 *
 * When those vars are absent (local dev without cloud setup), supabase is null
 * and the app runs in local mode — no login screen, no auth.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string | undefined
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined

export const isAuthEnabled = !!(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = isAuthEnabled
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null
