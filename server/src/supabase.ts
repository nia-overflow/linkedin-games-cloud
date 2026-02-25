/**
 * Supabase admin client (service role).
 *
 * Uses the service-role key so it can bypass RLS for admin queries
 * (e.g. community leaderboard across multiple users).
 *
 * isCloudMode: true when both SUPABASE_URL and SUPABASE_SERVICE_KEY are set.
 * In local mode (no env vars), this module exports null and the server
 * falls back to SQLite for all data access.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseServiceKey = process.env['SUPABASE_SERVICE_KEY'];

export const isCloudMode = !!(supabaseUrl && supabaseServiceKey);

export const supabase: SupabaseClient | null = isCloudMode
  ? createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

if (isCloudMode) {
  console.log('[cloud] Supabase connected — running in cloud mode');
} else {
  console.log('[local] No SUPABASE_URL set — running in local SQLite mode');
}
