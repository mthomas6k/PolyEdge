// ==========================================
// PolyEdge — production env (copy to env.config.js and fill in)
// ==========================================
// 1. Copy this file to env.config.js:  cp js/env.example.js js/env.config.js
// 2. Replace the placeholder values with your real Supabase API URL and anon key.
//    Get them from: Supabase Dashboard → Project Settings → API
//    Use "Project URL" (https://YOUR_REF.supabase.co) and "anon public" key — not the dashboard page URL.
// 3. js/env.config.js is in .gitignore so you never commit real keys.
//
// When env.config.js exists and is loaded before config.js, the app uses these values instead of defaults.

window.__POLYEDGE_ENV = {
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-public-key-here'
};
