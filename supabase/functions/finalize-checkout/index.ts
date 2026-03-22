// finalize-checkout: after Stripe redirect, verifies Checkout Session server-side and creates evaluation
// if webhook missed (local dev, misconfigured endpoint). Idempotent via stripe_checkout_session_id.
// POST JSON: { "session_id": "cs_..." }
// Headers: Authorization: Bearer <supabase_jwt>, apikey: <anon>
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "sk_placeholder", {
  apiVersion: "2024-11-20.acacia",
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: auth } },
    });

    const token = auth.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId.startsWith("cs_")) {
      return new Response(JSON.stringify({ error: "Invalid session_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ error: "Payment not completed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metaUid = session.metadata?.user_id || session.client_reference_id;
    if (!metaUid || metaUid !== user.id) {
      return new Response(JSON.stringify({ error: "Session does not belong to this user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evalType = session.metadata?.eval_type || "1-step";
    const accountSize = parseInt(session.metadata?.account_size || "500", 10);
    if (!accountSize) {
      return new Response(JSON.stringify({ error: "Missing account size" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existing } = await supabase
      .from("evaluations")
      .select("id")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();

    if (existing?.id) {
      return new Response(JSON.stringify({ ok: true, already: true, evaluation_id: existing.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOneStep = evalType === "1-step";
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();

    const row = {
      user_id: user.id,
      eval_type: evalType,
      account_size: accountSize,
      phase: 1,
      status: "active",
      starting_balance: accountSize,
      balance: accountSize,
      high_water_mark: accountSize,
      profit_target_pct: isOneStep ? 10 : 6,
      max_drawdown_pct: 6,
      consistency_rule_pct: isOneStep ? 20 : 50,
      min_trades: isOneStep ? 5 : 2,
      trades_count: 0,
      total_profit: 0,
      total_loss: 0,
      largest_trade_profit: 0,
      expires_at: expiresAt,
      stripe_checkout_session_id: sessionId,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("evaluations")
      .insert(row)
      .select("id")
      .single();

    if (insErr) {
      if (insErr.code === "23505" || insErr.message?.includes("duplicate")) {
        return new Response(JSON.stringify({ ok: true, already: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (insErr.message?.includes("stripe_checkout_session_id") || insErr.message?.includes("column")) {
        return new Response(
          JSON.stringify({
            error:
              "Database missing stripe_checkout_session_id column. Run supabase/migrations/20250317_eval_stripe_session.sql in SQL Editor.",
            detail: insErr.message,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error("finalize-checkout insert:", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, evaluation_id: inserted?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
