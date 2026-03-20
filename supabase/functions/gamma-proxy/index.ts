// Public read-only proxy to Polymarket Gamma API (browser CORS).
// Deploy: supabase functions deploy gamma-proxy --no-verify-jwt
// Whitelist keeps this from being an open relay.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GAMMA = "https://gamma-api.polymarket.com";
const ALLOW = /^(markets|events)(\?|\/|$)/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const path = (url.searchParams.get("path") || "").trim();
    if (!path || !ALLOW.test(path)) {
      return new Response(JSON.stringify({ error: "Invalid path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gammaUrl = `${GAMMA}/${path}`;
    const r = await fetch(gammaUrl, {
      headers: { Accept: "application/json" },
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: {
        ...corsHeaders,
        "Content-Type": r.headers.get("Content-Type") || "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
