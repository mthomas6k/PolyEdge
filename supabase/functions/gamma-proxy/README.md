# gamma-proxy

Forwards read-only GET requests to `https://gamma-api.polymarket.com/{path}` so the static site can load markets without broken public CORS proxies.

## Deploy

From repo root (with Supabase CLI logged in):

```bash
supabase functions deploy gamma-proxy
```

`verify_jwt` is disabled in `supabase/config.toml` for this function only.

## Query

`GET {SUPABASE_URL}/functions/v1/gamma-proxy?path=markets%3Flimit%3D100%26offset%3D0%26active%3Dtrue%26closed%3Dfalse`

Allowed `path` prefixes: `markets`, `events`.
