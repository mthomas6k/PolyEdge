// ==========================================
// POLYMARKET SERVICE — Gamma API
// - Admin: direct gamma-api first (fast), then gamma-proxy, then public proxies
// - Non-admin: gamma-proxy only (no public CORS proxies)
// Deploy gamma-proxy: supabase functions deploy gamma-proxy --no-verify-jwt
// ==========================================

const PolymarketService = (() => {
  const GAMMA_API = 'https://gamma-api.polymarket.com';
  const PAGE_SIZE = 100;
  const MAX_MARKETS = 600;

  const PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];

  let proxyIndex = 0;
  let fullCache = { list: [], ts: 0 };
  const CACHE_TTL_MS = 90000;

  function invalidateMarketsCache() {
    fullCache = { list: [], ts: 0 };
  }

  function isPolyEdgeAdmin() {
    try {
      return typeof window !== 'undefined' && !!window.__POLYEDGE_IS_ADMIN__;
    } catch (e) {
      return false;
    }
  }

  async function fetchGammaDirect(path) {
    const fullUrl = `${GAMMA_API}/${path}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await fetch(fullUrl, { signal: controller.signal });
      clearTimeout(t);
      const text = await r.text();
      if (!r.ok || !text || !text.trim()) return null;
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : null;
    } catch (e) {
      clearTimeout(t);
      console.warn('gamma-api direct:', e.message);
      return null;
    }
  }

  function config() {
    return typeof window !== 'undefined' && window.POLYEDGE_CONFIG
      ? window.POLYEDGE_CONFIG
      : {};
  }

  /**
   * Fetch JSON from Gamma: admin tries direct API first; everyone uses gamma-proxy; public proxies admin-only fallback.
   * @param {string} path — e.g. markets?limit=10&offset=0
   */
  async function fetchGammaPath(path) {
    const admin = isPolyEdgeAdmin();

    if (admin) {
      const direct = await fetchGammaDirect(path);
      if (direct) return direct;
    }

    const { SUPABASE_URL, SUPABASE_ANON_KEY } = config();
    const base = (SUPABASE_URL || '').replace(/\/$/, '');
    if (base) {
      try {
        const proxyUrl = `${base}/functions/v1/gamma-proxy?path=${encodeURIComponent(path)}`;
        const headers = {};
        if (SUPABASE_ANON_KEY) {
          headers.apikey = SUPABASE_ANON_KEY;
          headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
        }
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 20000);
        const r = await fetch(proxyUrl, { headers, signal: controller.signal });
        clearTimeout(t);
        const text = await r.text();
        if (r.ok && text && text.trim()) {
          const data = JSON.parse(text);
          if (Array.isArray(data)) return data;
        }
      } catch (e) {
        console.warn('gamma-proxy:', e.message);
      }
    }

    if (admin) {
      return fetchViaPublicProxies(`${GAMMA_API}/${path}`);
    }

    throw new Error(
      'Markets could not be loaded. Deploy the gamma-proxy Supabase function or sign in with an admin account.'
    );
  }

  async function fetchViaPublicProxies(fullUrl, attempt = 0) {
    if (attempt >= PROXIES.length) {
      throw new Error('All CORS proxies failed');
    }
    const proxy = PROXIES[(proxyIndex + attempt) % PROXIES.length];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const r = await fetch(proxy(fullUrl), {
        headers: { 'x-requested-with': 'XMLHttpRequest' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (!text || !text.trim()) throw new Error('Empty body');
      proxyIndex = (proxyIndex + attempt) % PROXIES.length;
      const data = JSON.parse(text);
      if (Array.isArray(data)) return data;
      if (data && typeof data.contents === 'string') {
        const inner = JSON.parse(data.contents);
        return Array.isArray(inner) ? inner : [];
      }
      throw new Error('Unexpected JSON shape');
    } catch (e) {
      console.warn(`Proxy ${attempt} failed:`, e.message);
      return fetchViaPublicProxies(fullUrl, attempt + 1);
    }
  }

  async function fetchAllMarkets(force = false) {
    const now = Date.now();
    if (
      !force &&
      fullCache.list.length > 0 &&
      now - fullCache.ts < CACHE_TTL_MS
    ) {
      return fullCache.list;
    }

    const all = [];
    let offset = 0;

    while (offset < MAX_MARKETS) {
      const path = `markets?limit=${PAGE_SIZE}&offset=${offset}&active=true&closed=false&order=volume&ascending=false`;
      let batch;
      try {
        batch = await fetchGammaPath(path);
      } catch (e) {
        console.warn('fetchAllMarkets batch failed:', e);
        break;
      }
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    fullCache = { list: all, ts: now };
    return all;
  }

  async function getMarkets(limit = 48, offset = 0) {
    const all = await fetchAllMarkets(false);
    return all.slice(offset, offset + limit);
  }

  async function searchMarkets(query) {
    const q = (query || '').trim().toLowerCase();
    const all = await fetchAllMarkets(false);
    if (!q) return all.slice(0, 200);
    return all
      .filter((m) => {
        const t = (m.question || m.title || '').toLowerCase();
        const slug = (m.slug || '').toLowerCase();
        return t.includes(q) || slug.includes(q.replace(/\s+/g, '-'));
      })
      .slice(0, 200);
  }

  async function getEvents(limit = 20) {
    try {
      const path = `events?limit=${limit}&active=true&closed=false&order=volume&ascending=false`;
      const data = await fetchGammaPath(path);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('getEvents failed:', e);
      return [];
    }
  }

  function parseMarket(m) {
    const outcomePrices = (() => {
      try {
        if (m.outcomePrices) {
          return typeof m.outcomePrices === 'string'
            ? JSON.parse(m.outcomePrices)
            : m.outcomePrices;
        }
        return [0.5, 0.5];
      } catch {
        return [0.5, 0.5];
      }
    })();

    const outcomes = (() => {
      try {
        if (m.outcomes) {
          return typeof m.outcomes === 'string'
            ? JSON.parse(m.outcomes)
            : m.outcomes;
        }
        return ['Yes', 'No'];
      } catch {
        return ['Yes', 'No'];
      }
    })();

    return {
      id: m.id || m.conditionId,
      question: m.question || m.title || 'Unknown Market',
      slug: m.slug || '',
      category: m.category || m.groupItemTitle || '',
      yesPrice: parseFloat(outcomePrices[0] || 0.5),
      noPrice: parseFloat(outcomePrices[1] || 0.5),
      outcomes: outcomes,
      volume: parseFloat(String(m.volume || m.volumeNum || 0).replace(/,/g, '')) || 0,
      liquidity: parseFloat(String(m.liquidity || m.liquidityNum || 0).replace(/,/g, '')) || 0,
      endDate: m.endDate || m.end_date_iso || null,
      image: m.image || m.icon || '',
      active: m.active !== false,
      closed: m.closed === true,
      _raw: m,
    };
  }

  /** Bucket for category pills (Gamma categories are messy — normalize). */
  function marketBucket(m) {
    const cat = `${m.category || ''} ${m.groupItemTitle || ''}`.toLowerCase();
    const q = `${m.question || ''}`.toLowerCase();
    const s = `${cat} ${q}`;
    if (/politic|election|trump|biden|congress|senate|house|vote|governor|president/.test(s)) return 'Politics';
    if (/crypto|bitcoin|btc|eth|ethereum|defi|token|solana|nft|chain/.test(s)) return 'Crypto';
    if (/nfl|nba|mlb|ufc|soccer|sport|olympic|game|vs\.|championship|super bowl/.test(s)) return 'Sports';
    if (/tech|ai\b|openai|google|apple|tesla|science|space|nvidia|semiconductor/.test(s)) return 'Tech';
    if (/pop|movie|music|celebr|oscar|grammy|entertainment/.test(s)) return 'Culture';
    if (/econom|fed|gdp|inflation|recession|jobs|rate|market crash|stock/.test(s)) return 'Economy';
    return 'Other';
  }

  return {
    getMarkets,
    searchMarkets,
    getEvents,
    parseMarket,
    fetchAllMarkets,
    invalidateMarketsCache,
    marketBucket,
    fetchGammaPath,
  };
})();
