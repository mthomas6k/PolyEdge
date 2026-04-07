-- Migration to schedule the sync-markets edge function to run every 5 minutes.
-- Relies on pg_cron and pg_net extensions which are standard in Supabase.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Notice: You MUST replace the "your-project-ref" placeholder with your actual Supabase project ref,
-- and replace "YOUR_ANON_KEY" with your actual anon key before executing this via SQL Editor!
-- Alternatively, if deploying via CLI, you can construct this dynamically.

-- We delete the job if it already exists to allow safe re-runs.
SELECT cron.unschedule('sync-markets-every-5-min');

-- Schedule the job to run every 5 minutes
SELECT cron.schedule(
  'sync-markets-every-5-min',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
        url:='https://your-project-ref.supabase.co/functions/v1/sync-markets',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
