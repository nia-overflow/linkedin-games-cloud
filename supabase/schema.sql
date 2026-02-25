-- LinkedIn Games Dashboard — Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Safe to re-run: uses CREATE IF NOT EXISTS + OR REPLACE

-- ── Profiles ──────────────────────────────────────────────────────────────────
-- One row per user; auto-created by the trigger below on first OAuth sign-in.

CREATE TABLE IF NOT EXISTS profiles (
  id                         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name               TEXT,
  global_leaderboard_opt_in  BOOLEAN DEFAULT false,
  created_at                 TIMESTAMPTZ DEFAULT now()
);

-- ── API Keys ──────────────────────────────────────────────────────────────────
-- Users generate keys in Settings; the scraper uses them to push data.
-- Only the SHA-256 hash is stored — plaintext is shown once and discarded.

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_hash     TEXT NOT NULL UNIQUE,
  label        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- ── Game Results ──────────────────────────────────────────────────────────────
-- One row per (user, game, date) — upserted by the ingest endpoint.

CREATE TABLE IF NOT EXISTS game_results (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_name            TEXT NOT NULL,
  played_date          DATE NOT NULL,
  captured_at          TIMESTAMPTZ,
  completed            BOOLEAN DEFAULT false,
  score                INTEGER,
  completion_time_secs INTEGER,
  percentile           INTEGER,
  my_rank              INTEGER,
  global_percentile    INTEGER,
  raw_data             JSONB,
  UNIQUE(user_id, game_name, played_date)
);

CREATE INDEX IF NOT EXISTS game_results_user_date
  ON game_results(user_id, played_date DESC);

-- ── Leaderboard Entries ───────────────────────────────────────────────────────
-- Connection-level leaderboard rows for each game+date.

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_name             TEXT NOT NULL,
  played_date           DATE NOT NULL,
  rank                  INTEGER,
  connection_name       TEXT NOT NULL,
  connection_profile_url TEXT,
  score                 INTEGER,
  completion_time_secs  INTEGER,
  is_self               BOOLEAN DEFAULT false,
  UNIQUE(user_id, game_name, played_date, connection_name)
);

CREATE INDEX IF NOT EXISTS leaderboard_entries_user_game_date
  ON leaderboard_entries(user_id, game_name, played_date);

-- ── Scrape Log ────────────────────────────────────────────────────────────────
-- One row per (run, game) — records each scraper attempt.

CREATE TABLE IF NOT EXISTS scrape_log (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  run_at           TIMESTAMPTZ NOT NULL,
  game_name        TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('success', 'error', 'no_result')),
  error_message    TEXT,
  records_captured INTEGER
);

CREATE INDEX IF NOT EXISTS scrape_log_user_run_at
  ON scrape_log(user_id, run_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Every table is private to its owner. The server uses the service-role key
-- (bypasses RLS) for admin operations like the community leaderboard query.

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_log        ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies so this script is idempotent
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users manage own profile"             ON profiles;
  DROP POLICY IF EXISTS "Users manage own api_keys"           ON api_keys;
  DROP POLICY IF EXISTS "Users manage own game_results"       ON game_results;
  DROP POLICY IF EXISTS "Users manage own leaderboard"        ON leaderboard_entries;
  DROP POLICY IF EXISTS "Users manage own scrape_log"         ON scrape_log;
END $$;

CREATE POLICY "Users manage own profile"
  ON profiles FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users manage own api_keys"
  ON api_keys FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own game_results"
  ON game_results FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own leaderboard"
  ON leaderboard_entries FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own scrape_log"
  ON scrape_log FOR ALL USING (auth.uid() = user_id);

-- ── Auto-profile trigger ──────────────────────────────────────────────────────
-- Creates a profiles row the moment a new user signs in via Google OAuth.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
