// ==========================================
// PolyEdge — runtime config (env-friendly)
// ==========================================
// In production, set window.__POLYEDGE_ENV before this script runs, e.g.:
//   <script>window.__POLYEDGE_ENV = { SUPABASE_URL: "...", SUPABASE_ANON_KEY: "..." };</script>
// so the anon key and URL are not hardcoded. Never put SUPABASE_SERVICE_ROLE_KEY in the frontend.
(function() {
  var defaults = {
    SUPABASE_URL: 'https://iyaqyoxezkovuusoomgf.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YXF5b3hlemtvdnV1c29vbWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTM3NDcsImV4cCI6MjA4NzUyOTc0N30.9dja2T1r2AlgytvQWuQO2exoGTdPcIVM0VQXp1MWB7Q',
    STRIPE_PUBLISHABLE_KEY: ''
  };
  window.POLYEDGE_CONFIG = window.__POLYEDGE_ENV
    ? { SUPABASE_URL: window.__POLYEDGE_ENV.SUPABASE_URL || defaults.SUPABASE_URL, SUPABASE_ANON_KEY: window.__POLYEDGE_ENV.SUPABASE_ANON_KEY || defaults.SUPABASE_ANON_KEY, STRIPE_PUBLISHABLE_KEY: window.__POLYEDGE_ENV.STRIPE_PUBLISHABLE_KEY || defaults.STRIPE_PUBLISHABLE_KEY }
    : defaults;
})();
