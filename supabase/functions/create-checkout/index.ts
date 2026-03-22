// create-checkout: creates a Stripe Checkout Session for a challenge purchase.
// Requires: Authorization: Bearer <supabase_access_token>
// Body: { "type": "1step"|"2step", "size": 500|1000|2000 }
// Set secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PRICES_CENTS: Record<string, number> = {
  "1step-500": 7900, "1step-1000": 13900, "1step-2000": 19900,
  "2step-500": 5900, "2step-1000": 11900, "2step-2000": 17900,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: auth } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      auth.replace("Bearer ", "")
    );
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const type = body?.type === "2step" ? "2step" : "1step";
    const size = [500, 1000, 2000].includes(Number(body?.size)) ? Number(body.size) : 500;
    const key = `${type}-${size}`;
    const amountCents = PRICES_CENTS[key] ?? 9900;
    const label = (type === "1step" ? "One-Step" : "Two-Step") + " $" + size;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = (body?.success_base_url || "https://mthomas6k.github.io/PolyEdge/").replace(/\/$/, "");
    const successUrl = `${baseUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/?payment=cancelled`;

    const sessionPayload = {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: { name: `PolyEdge ${label} Challenge` },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        eval_type: type === "1step" ? "1-step" : "2-step",
        account_size: String(size),
      },
    };

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode": sessionPayload.mode,
        "success_url": sessionPayload.success_url,
        "cancel_url": sessionPayload.cancel_url,
        "client_reference_id": sessionPayload.client_reference_id,
        "metadata[user_id]": sessionPayload.metadata.user_id,
        "metadata[eval_type]": sessionPayload.metadata.eval_type,
        "metadata[account_size]": sessionPayload.metadata.account_size,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(amountCents),
        "line_items[0][price_data][product_data][name]": sessionPayload.line_items[0].price_data.product_data.name,
      }).toString(),
    });

    const data = await res.json();
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message || "Stripe error" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!data.url) {
      return new Response(JSON.stringify({ error: "No checkout URL returned" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: data.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
