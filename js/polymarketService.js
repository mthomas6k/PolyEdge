// ==========================================
// POLYMARKET SERVICE — Gamma API via CORS proxies
// Fetches many pages of markets into one cache; search filters client-side.
// ==========================================

const PolymarketService = (() => {
  const PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://proxy.cors.sh/${url}`,
  ];

  const GAMMA_API = 'https://gamma-api.polymarket.com';
  const PAGE_SIZE = 100;
  const MAX_MARKETS = 600;

  let proxyIndex = 0;

  let fullCache = { list: [], ts: 0 };
  const CACHE_TTL_MS = 90000;

  function invalidateMarketsCache() {
    fullCache = { list: [], ts: 0 };
  }

  async function fetchWithProxy(url, attempt = 0) {
    if (attempt >= PROXIES.length) {
      throw new Error('All CORS proxies failed');
    }
    const proxy = PROXIES[(proxyIndex + attempt) % PROXIES.length];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const r = await fetch(proxy(url), {
        headers: { 'x-requested-with': 'XMLHttpRequest' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (!text || text.trim() === '') return [];
      proxyIndex = (proxyIndex + attempt) % PROXIES.length;
      return JSON.parse(text);
    } catch (e) {
      console.warn(`Proxy ${attempt} failed for ${url}:`, e.message);
      return fetchWithProxy(url, attempt + 1);
    }
  }

  /**
   * Pull multiple pages from Gamma until empty or MAX_MARKETS.
   */
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
      const url = `${GAMMA_API}/markets?limit=${PAGE_SIZE}&offset=${offset}&active=true&closed=false&order=volume&ascending=false`;
      let batch;
      try {
        batch = await fetchWithProxy(url);
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
      const data = await fetchWithProxy(
        `${GAMMA_API}/events?limit=${limit}&active=true&closed=false&order=volume&ascending=false`
      );
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
      volume: parseFloat(m.volume || m.volumeNum || 0),
      liquidity: parseFloat(m.liquidity || m.liquidityNum || 0),
      endDate: m.endDate || m.end_date_iso || null,
      image: m.image || '',
      active: m.active !== false,
      closed: m.closed === true,
      _raw: m,
    };
  }

  return {
    getMarkets,
    searchMarkets,
    getEvents,
    parseMarket,
    fetchWithProxy,
    fetchAllMarkets,
    invalidateMarketsCache,
  };
})();
