// ==========================================
// POLYMARKET SERVICE
// polymarketService.js — API integration with rotating CORS proxies
// ==========================================

const PolymarketService = (() => {
  const PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://proxy.cors.sh/${url}`,
    (url) => `https://cors-anywhere.herokuapp.com/${url}`,
  ];

  const GAMMA_API = 'https://gamma-api.polymarket.com';

  let proxyIndex = 0;
  let marketsCache = [];
  let lastFetch = 0;
  const CACHE_TTL = 30000;

  async function fetchWithProxy(url, attempt = 0) {
    if (attempt >= PROXIES.length) {
      throw new Error('All CORS proxies failed');
    }
    const proxy = PROXIES[(proxyIndex + attempt) % PROXIES.length];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(proxy(url), {
        headers: { 'x-requested-with': 'XMLHttpRequest' },
        signal: controller.signal
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

  async function getMarkets(limit = 30, offset = 0) {
    const now = Date.now();
    if (marketsCache.length > 0 && (now - lastFetch) < CACHE_TTL) {
      return marketsCache;
    }
    try {
      const data = await fetchWithProxy(
        `${GAMMA_API}/markets?limit=${limit}&offset=${offset}&active=true&closed=false&order=volume&ascending=false`
      );
      const markets = Array.isArray(data) ? data : [];
      marketsCache = markets;
      lastFetch = now;
      return markets;
    } catch (e) {
      console.warn('getMarkets failed:', e);
      return marketsCache.length > 0 ? marketsCache : [];
    }
  }

  async function searchMarkets(query) {
    try {
      const data = await fetchWithProxy(
        `${GAMMA_API}/markets?limit=20&active=true&closed=false&title_contains=${encodeURIComponent(query)}`
      );
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('searchMarkets failed:', e);
      return [];
    }
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
          return typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
        }
        return [0.5, 0.5];
      } catch { return [0.5, 0.5]; }
    })();

    const outcomes = (() => {
      try {
        if (m.outcomes) {
          return typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes;
        }
        return ['Yes', 'No'];
      } catch { return ['Yes', 'No']; }
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
      _raw: m
    };
  }

  return { getMarkets, searchMarkets, getEvents, parseMarket, fetchWithProxy };
})();
