// Supabase Edge Function: sync-markets
// Periodically fetches latest active markets from Polymarket and updates the `market_cache` table.
// Ensure you deploy with: supabase functions deploy sync-markets --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GAMMA_API = "https://gamma-api.polymarket.com";
const PAGE_SIZE = 100;
const MAX_MARKETS = 600;

serve(async (req) => {
  // We allow unauthenticated invoking so pg_net/cron can hit it without signing JWTs,
  // but it's safe because it only pulls public data and writes to a specific cache row.
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const allMarkets = [];
    let offset = 0;

    // Fetch pages sequentially to avoid aggressive rate limiting
    while (offset < MAX_MARKETS) {
      const path = `markets?limit=${PAGE_SIZE}&offset=${offset}&active=true&closed=false&order=volume&ascending=false`;
      const r = await fetch(`${GAMMA_API}/${path}`, {
        headers: { Accept: "application/json" }
      });
      
      if (!r.ok) {
        console.error(`Gamma API failed: ${r.status}`);
        break;
      }
      
      const batch = await r.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      
      allMarkets.push(...batch);
      
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (allMarkets.length > 0) {
      // Upsert the singleton row. Service Role key bypasses RLS so we don't need is_admin checks here.
      const { error } = await supabase
        .from('market_cache')
        .upsert({ 
          id: 'singleton', 
          data: allMarkets, 
          updated_at: new Date().toISOString() 
        }, { onConflict: 'id' });

      if (error) {
        throw new Error(`DB Write Error: ${error.message}`);
      }
    } else {
      console.warn("No markets fetched from Gamma, skipping cache update.");
    }

    return new Response(JSON.stringify({ 
      success: true, 
      synced: allMarkets.length,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
