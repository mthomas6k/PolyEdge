-- ============================================
-- PolyEdge: Row Level Security (RLS) Policies
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================
-- This enforces:
-- - Users can only read/update their own profile and their own evaluations/trades.
-- - Admins (profiles.is_admin = true) can read all profiles and create evaluations for any user.
-- - Leaderboard is read-only for everyone.
-- ============================================

-- 1. PROFILES
-- ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (e.g. polymarket_wallet, display_name)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can read all profiles (for admin panel)
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- Allow insert for own profile (e.g. on signup trigger; if you use a trigger that runs as service role, you may not need this)
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);


-- 2. EVALUATIONS
-- -------------
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Users can read their own evaluations
CREATE POLICY "evaluations_select_own"
  ON public.evaluations FOR SELECT
  USING (user_id = auth.uid());

-- Admins can read all evaluations
CREATE POLICY "evaluations_select_admin"
  ON public.evaluations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- Users can insert an evaluation for themselves only (e.g. after checkout)
CREATE POLICY "evaluations_insert_own"
  ON public.evaluations FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admins can insert evaluations for any user (admin create-eval)
CREATE POLICY "evaluations_insert_admin"
  ON public.evaluations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- Users can update only their own evaluations (balance, status, etc. when trading)
CREATE POLICY "evaluations_update_own"
  ON public.evaluations FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- 3. TRADES
-- ---------
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Users can read trades that belong to their evaluations
CREATE POLICY "trades_select_own"
  ON public.trades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.user_id = auth.uid()
    )
  );

-- Users can insert trades only for their own evaluations
CREATE POLICY "trades_insert_own"
  ON public.trades FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.user_id = auth.uid()
    )
  );

-- Users can update only trades that belong to their evaluations (e.g. close trade)
CREATE POLICY "trades_update_own"
  ON public.trades FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.user_id = auth.uid()
    )
  );


-- 4. LEADERBOARD (it's a VIEW — use GRANT, not RLS)
-- -----------------------------------------------------------------
-- Views cannot have RLS. Allow read-only access to the view for authenticated users
-- (and optionally anon if you want a public leaderboard).
GRANT SELECT ON public.leaderboard TO authenticated;
-- GRANT SELECT ON public.leaderboard TO anon;   -- uncomment for public leaderboard


-- ============================================
-- NOTES
-- ============================================
-- - If "leaderboard" is a VIEW and not a table, RLS on the underlying tables may apply; you might grant SELECT on the view to anon/authenticated instead.
-- - Ensure you have a trigger to create a profile row on signup (Supabase Auth → Database → "Create profile on signup" or similar).
-- - Service role key must NEVER be in the frontend; use it only in Edge Functions or your own backend.
