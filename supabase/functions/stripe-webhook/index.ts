// stripe-webhook: handles Stripe webhook (checkout.session.completed) and creates an evaluation.
// Set secrets: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "sk_placeholder", { apiVersion: "2024-11-20.acacia" });

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  if (!signature || !webhookSecret) {
    return new Response("Webhook secret or signature missing", { status: 400 });
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${e.message}`, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.user_id || session.client_reference_id;
  const evalType = session.metadata?.eval_type || "1-step";
  const accountSize = parseInt(session.metadata?.account_size || "500", 10);
  if (!userId || !accountSize) {
    return new Response("Missing metadata", { status: 400 });
  }

  const isOneStep = evalType === "1-step";
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const sessionId = session.id || null;

  if (sessionId) {
    const { data: existing } = await supabase
      .from("evaluations")
      .select("id")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (existing?.id) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const { error } = await supabase.from("evaluations").insert({
    user_id: userId,
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
  });

  if (error) {
    console.error("Evaluation insert failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
