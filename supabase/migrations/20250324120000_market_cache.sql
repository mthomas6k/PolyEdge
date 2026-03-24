-- Shared Polymarket Gamma markets list for all visitors (GitHub Pages has no server-side shared memory).
-- Non-admins read only; admins PATCH with their session JWT (RLS checks profiles.is_admin).

CREATE TABLE IF NOT EXISTS public.market_cache (
  id text PRIMARY KEY DEFAULT 'singleton',
  data jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.market_cache (id, data)
VALUES ('singleton', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.market_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read (anon or authenticated) — needed for logged-out visitors on /markets
CREATE POLICY "market_cache_select_public"
  ON public.market_cache FOR SELECT
  USING (true);

-- Only admins (per profiles) can insert/update the singleton row
CREATE POLICY "market_cache_insert_admin"
  ON public.market_cache FOR INSERT
  WITH CHECK (
    id = 'singleton'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin IS TRUE
    )
  );

CREATE POLICY "market_cache_update_admin"
  ON public.market_cache FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin IS TRUE
    )
  )
  WITH CHECK (id = 'singleton');
