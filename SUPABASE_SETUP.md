# Supabase security setup (RLS + least privilege)

**Do not paste this file into the SQL Editor.** This is a guide (Markdown), not SQL. In the SQL Editor you only run the contents of **`supabase/RLS_POLICIES.sql`** and, if you use it, the trigger snippet from section 2 below.

---

Follow these steps in the **Supabase Dashboard** so your app runs with server-side enforcement and least privilege. The frontend never gets a service role key; it only uses the **anon** key, and Row Level Security (RLS) restricts what each user can do.

---

## 1. Enable Row Level Security and add policies

1. In Supabase: **SQL Editor** → New query.
2. Open the file **`supabase/RLS_POLICIES.sql`** in this repo and copy its full contents.
3. Paste into the SQL Editor and click **Run**.

This will:

- Turn on RLS for `profiles`, `evaluations`, `trades`, and `leaderboard`.
- Let users read/update only their own profile and only their own evaluations and trades.
- Let admins (where `profiles.is_admin = true`) read all profiles and create evaluations for any user.
- Keep leaderboard read-only for authenticated users.

If you see errors like “policy already exists”, you may have run the script before. Either drop existing policies with the same names in the SQL Editor and run again, or skip the duplicate policy creation.

**Shared markets cache:** run **`supabase/migrations/20250324120000_market_cache.sql`** in the SQL Editor. It adds `public.market_cache` (public read, admin-only write via `profiles.is_admin`). Sign in once as an admin so the row is populated; other users then load markets from Supabase instead of `gamma-proxy`.

---

## 2. Ensure profiles exist for each user (trigger)

So that RLS and `is_admin` work, every new signup should get a row in `profiles`:

1. In Supabase: **Database** → **Triggers**, or run in SQL Editor:

```sql
-- Create profile on signup (adjust column list to match your public.profiles table)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at)
  VALUES (NEW.id, NEW.email, NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

2. Ensure `public.profiles` has at least `id` (uuid, primary key), `email`, and `created_at`. Add `is_admin`, `display_name`, `polymarket_wallet` etc. as you already use in the app.

3. Manually set `is_admin = true` for your admin user(s) in **Table Editor** → `profiles`.

---

## 3. Never put the service role key in the frontend

- **Anon key** in the frontend is fine; it’s designed to be public. RLS limits what it can do.
- **Service role key** bypasses RLS. Use it only:
  - In Supabase **Edge Functions**, or
  - On your own backend server (e.g. Node/Express) that runs after payment (e.g. Stripe) and then creates evaluations.

Store the service role key only in:

- Supabase Edge Function secrets, or
- Backend environment variables (e.g. `SUPABASE_SERVICE_ROLE_KEY`),

and never in the browser or in a repo that the frontend uses.

---

## 4. (Optional) Use env for anon key in production

The app loads Supabase URL and anon key from **`js/config.js`**. To avoid hardcoding them in the repo:

1. Copy the example file: **`cp js/env.example.js js/env.config.js`**
2. Edit **`js/env.config.js`** and set your real **Project URL** (e.g. `https://iyaqyoxezkovuusoomgf.supabase.co`) and **anon public** key from Supabase Dashboard → Project Settings → API.
3. **`js/env.config.js`** is listed in **`.gitignore`** so it is never committed. Deploy this file to production (e.g. via your host’s env or a build step that writes it from env vars).

`index.html` loads `env.config.js` before `config.js`. If `env.config.js` is missing (e.g. fresh clone), you may see a 404 for it in the console; the app still works using the defaults in `config.js`.

---

## 5. Leaderboard: table vs view

- If **`leaderboard`** is a **table**: the RLS policy in `RLS_POLICIES.sql` allows `SELECT` for authenticated users. Adjust or add an `anon` policy if you want it public.
- If **`leaderboard`** is a **view**, RLS applies to the underlying tables. You may need to `GRANT SELECT ON ... leaderboard TO authenticated;` (and optionally `anon`) so the view is readable.

---

## 6. Stripe Edge Functions (create-checkout + webhook + finalize-checkout)

The app uses three Supabase Edge Functions for Stripe payments:

1. **create-checkout** — Creates a Stripe Checkout Session when the user clicks “Start Challenge”. Success URL includes `session_id={CHECKOUT_SESSION_ID}` so the browser can confirm the purchase.
2. **stripe-webhook** — Receives Stripe `checkout.session.completed` events. It verifies the webhook signature, then uses the **service role** client to insert a row into `evaluations` for the paying user (with `stripe_checkout_session_id` for idempotency).
3. **finalize-checkout** — After redirect, the logged-in user calls this with `session_id`; it verifies payment with Stripe and inserts the evaluation if the webhook never ran (sandbox without Stripe CLI, or webhook misconfiguration).

### Database migration (required for idempotency)

Run `supabase/migrations/20250317_eval_stripe_session.sql` in the **SQL Editor** (adds `stripe_checkout_session_id` + unique index). Without it, webhook/finalize may fail until the column exists.

### Deploy and configure

1. **Deploy the functions** (from the project root, if using Supabase CLI):
   - `supabase functions deploy create-checkout`
   - `supabase functions deploy stripe-webhook`
   - `supabase functions deploy finalize-checkout`

   Or create and paste the code from `supabase/functions/*/index.ts` in the Dashboard: **Edge Functions** → New function.

2. **Set secrets** in Supabase Dashboard → **Edge Functions** → each function → **Secrets** (or via CLI `supabase secrets set ...`):

   - **create-checkout**: `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - **stripe-webhook**: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
   - **finalize-checkout**: `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`

   Use your Stripe secret key (e.g. `sk_test_...`), the webhook signing secret from Stripe Dashboard → Developers → Webhooks (e.g. `whsec_...`), and the Supabase URL and keys from Project Settings → API. **Never commit these values**; they live only in Edge Function secrets.

3. **Stripe webhook**: In Stripe Dashboard → Developers → Webhooks, add an endpoint for your site. URL:  
   `https://<YOUR_SUPABASE_REF>.supabase.co/functions/v1/stripe-webhook`  
   Select event `checkout.session.completed`. Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET` for the `stripe-webhook` function.

4. **Frontend**: Only the Stripe **publishable** key (`pk_test_...` or `pk_live_...`) may appear in the frontend if you add Stripe.js later. For redirect-only Checkout, no Stripe key is required in the browser; the create-checkout function uses the secret key on the server.

---

## 7. Backend mediation (Stripe flow)

The Stripe flow: redirect to Checkout → **stripe-webhook** (preferred) or **finalize-checkout** on return (fallback) creates the `evaluations` row. The frontend never inserts evaluations for money without the server verifying Stripe. Optional: set `window.POLYEDGE_CONFIG.SITE_BASE_URL` so `create-checkout` returns to the correct path on GitHub Pages.


---

## Summary checklist

- [ ] Run `supabase/RLS_POLICIES.sql` in Supabase SQL Editor.
- [ ] Ensure `profiles` has a trigger (or equivalent) so new users get a profile row.
- [ ] Set `is_admin = true` for admin accounts in `profiles`.
- [ ] Confirm **service role** key is never in the frontend or in public config.
- [ ] (Optional) Set `window.__POLYEDGE_ENV` in production so anon key/URL aren’t hardcoded.
- [ ] Run SQL migration for `stripe_checkout_session_id`.
- [ ] Deploy Stripe Edge Functions (`create-checkout`, `stripe-webhook`, `finalize-checkout`) and set their secrets; configure Stripe webhook to point at `stripe-webhook`.
