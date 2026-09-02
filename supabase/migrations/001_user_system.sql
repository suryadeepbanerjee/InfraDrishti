-- =============================================================================
-- InfraDrishti — User System Migration
-- 001_user_system.sql
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Creates:
--   public.profiles
--   public.user_preferences
--   public.analysis_runs
--   public.corridor_results
--   public.site_results
--   RLS policies (auth.uid() = user_id)
--   Indexes
--   updated_at trigger
--   Auto-profile trigger on auth.users insert
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: updated_at auto-trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  avatar_url    text,
  organization  text,
  job_title     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies: each user sees/edits only their own row
CREATE POLICY "profiles: select own" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "profiles: insert own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles: update own" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles: delete own" ON public.profiles
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Auto-create profile when a new auth user signs up
--    Uses SECURITY DEFINER so the trigger runs as the table owner,
--    not as the new (unauthenticated) user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, SPLIT_PART(NEW.email, '@', 1))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and recreate to avoid duplicate trigger errors on re-runs
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. user_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measurement_unit            text NOT NULL DEFAULT 'METRIC',
  coordinate_reference        text NOT NULL DEFAULT 'WGS84',
  default_infrastructure_type text NOT NULL DEFAULT 'highway',
  default_facility_type       text NOT NULL DEFAULT 'logistics_hub',
  map_style                   text NOT NULL DEFAULT 'streets',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences: select own" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_preferences: insert own" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_preferences: update own" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_preferences: delete own" ON public.user_preferences
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 4. analysis_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analysis_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id         text UNIQUE,           -- backend-assigned ID
  analysis_type      text NOT NULL,         -- 'corridor' | 'site'
  status             text NOT NULL DEFAULT 'PROCESSING',  -- PROCESSING | COMPLETED | FAILED
  title              text,

  -- Corridor-specific location fields
  origin_name        text,
  origin_lat         double precision,
  origin_lon         double precision,
  destination_name   text,
  destination_lat    double precision,
  destination_lon    double precision,

  -- Type-specific fields
  infrastructure_type text,
  facility_type       text,

  -- Full request and result summaries (no raw rasters)
  request_params     jsonb,
  result_summary     jsonb,

  -- Error fields (safe messages only — no stack traces)
  error_code         text,
  error_message      text,

  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_user_created
  ON public.analysis_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_request_id
  ON public.analysis_runs(request_id);

ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analysis_runs: select own" ON public.analysis_runs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "analysis_runs: insert own" ON public.analysis_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "analysis_runs: update own" ON public.analysis_runs
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "analysis_runs: delete own" ON public.analysis_runs
  FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. corridor_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.corridor_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid UNIQUE NOT NULL REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  geojson     jsonb,   -- final GeoJSON FeatureCollection (routes)
  routes      jsonb,   -- scored route list (metrics, MCDA scores)
  metrics     jsonb,   -- per-route raw metrics
  mcda        jsonb,   -- MCDA weights, contributions, math_check
  explanation jsonb,   -- generated text explanation
  provenance  jsonb,   -- data sources, cache bounds, request_id
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corridor_results_user_id
  ON public.corridor_results(user_id);

ALTER TABLE public.corridor_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corridor_results: select own" ON public.corridor_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "corridor_results: insert own" ON public.corridor_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "corridor_results: update own" ON public.corridor_results
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "corridor_results: delete own" ON public.corridor_results
  FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. site_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid UNIQUE NOT NULL REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  geojson     jsonb,
  sites       jsonb,
  metrics     jsonb,
  mcda        jsonb,
  explanation jsonb,
  provenance  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_results_user_id
  ON public.site_results(user_id);

ALTER TABLE public.site_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_results: select own" ON public.site_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "site_results: insert own" ON public.site_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "site_results: update own" ON public.site_results
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "site_results: delete own" ON public.site_results
  FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------
-- Tables:   profiles, user_preferences, analysis_runs, corridor_results, site_results
-- RLS:      enabled + user-scoped policies on all tables
-- Triggers: auto-create profile, auto-update updated_at
-- Indexes:  user_id-based on all tables; (user_id, created_at) on analysis_runs
-- Cascades: all tables cascade-delete when auth.users row is deleted
