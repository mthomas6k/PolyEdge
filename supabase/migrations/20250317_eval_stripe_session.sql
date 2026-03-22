-- Idempotent Stripe Checkout → evaluation (webhook + finalize-checkout fallback)
-- Run in Supabase SQL Editor if you don't use CLI migrations.

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS evaluations_stripe_session_uidx
  ON public.evaluations (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
