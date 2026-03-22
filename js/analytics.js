// ==========================================
// POLYMARKET ANALYTICS ENGINE
// analytics.js — Fixed: uses CLOSED bets for all calculations
// ==========================================

const PM = (() => {
  const PROXIES = [
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://proxy.cors.sh/${url}`,
    (url) => `https://cors-anywhere.herokuapp.com/${url}`,
  ];

  const DATA_API  = 'https://data-api.polymarket.com';
  const GAMMA_API = 'https://gamma-api.polymarket.com';

  let proxyIndex = 0;

  async function fetchWithProxy(url, attempt = 0) {
    const admin = typeof window !== 'undefined' && !!window.__POLYEDGE_IS_ADMIN__;
    if (admin && attempt === 0) {
      try {
        const r = await fetch(url, {
          headers: { 'x-requested-with': 'XMLHttpRequest' },
          signal: AbortSignal.timeout(10000)
        });
        if (r.ok) {
          const text = await r.text();
          if (text && text.trim() !== '') return JSON.parse(text);
        }
      } catch (e) {
        console.warn('Polymarket data-api direct (admin):', e.message);
      }
    }

    if (attempt >= PROXIES.length) throw new Error('All CORS proxies failed. Try again in a moment.');
    const proxy = PROXIES[(proxyIndex + attempt) % PROXIES.length];
    try {
      const r = await fetch(proxy(url), {
        headers: { 'x-requested-with': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (!text || text.trim() === '') return [];
      return JSON.parse(text);
    } catch (e) {
      console.warn(`Proxy ${attempt} failed for ${url}:`, e.message);
      return fetchWithProxy(url, attempt + 1);
    }
  }

  async function getPositions(wallet) {
    try {
      const data = await fetchWithProxy(`${DATA_API}/positions?user=${wallet}&sizeThreshold=0&limit=1500`);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('getPositions failed:', e);
      return [];
    }
  }

  async function getActivity(wallet) {
    try {
      const data = await fetchWithProxy(`${DATA_API}/activity?user=${wallet}&limit=2000&type=TRADE`);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('getActivity failed:', e);
      return [];
    }
  }

  function computeStats(positions, activity) {
    const trades = (activity || []).filter(a => a.type === 'TRADE' || a.side);

    const dailyPnl = {};
    const sorted = [...trades].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    sorted.forEach(t => {
      const ts = t.timestamp ? t.timestamp * 1000 : Date.now();
      const day = new Date(ts).toISOString().slice(0, 10);
      if (!dailyPnl[day]) dailyPnl[day] = 0;
      const cash = parseFloat(t.cash || t.usdcSize || 0);
      const side = (t.side || '').toUpperCase();
      if (side === 'SELL') dailyPnl[day] += cash;
      else if (side === 'BUY') dailyPnl[day] -= cash;
    });

    const pnlDays = Object.keys(dailyPnl).sort();
    let cum = 0;
    const cumPnl = pnlDays.map(d => {
      cum += dailyPnl[d];
      return {
        date: d,
        pnl: parseFloat(cum.toFixed(2)),
        dayDelta: parseFloat(Number(dailyPnl[d] || 0).toFixed(2)),
      };
    });

    const pos = Array.isArray(positions) ? positions : [];
    const totalRealizedPnl = pos.reduce((s, p) => s + parseFloat(p.realizedPnl || 0), 0);
    const totalCurrentValue = pos.reduce((s, p) => s + parseFloat(p.currentValue || 0), 0);
    const totalCashPnl = pos.reduce((s, p) => s + parseFloat(p.cashPnl || 0), 0);
    const totalInitialValue = pos.reduce((s, p) => s + parseFloat(p.initialValue || 0), 0);

    // CLOSED positions — resolved markets only
    const closed = pos.filter(p => {
      const price = parseFloat(p.curPrice || 0);
      return p.redeemable || price <= 0.01 || price >= 0.99;
    });
    const won = closed.filter(p => {
      const price = parseFloat(p.curPrice || 0);
      return price >= 0.99 || parseFloat(p.cashPnl || 0) > 0;
    });
    const winRate = closed.length > 0 ? (won.length / closed.length * 100) : 0;

    // OPEN positions — include edge cases Polymarket still lists as active
    const open = pos.filter(p => {
      if (p.redeemable) return false;
      const c = parseFloat(p.curPrice || 0);
      const s = parseFloat(p.size || 0);
      const v = parseFloat(p.currentValue || 0);
      if (s <= 0) return false;
      const inSpread = c > 0.001 && c < 0.999;
      return inSpread || v > 0.01;
    });

    const openStrict = pos.filter(p =>
      !p.redeemable &&
      parseFloat(p.curPrice || 0) > 0.01 &&
      parseFloat(p.curPrice || 0) < 0.99
    );

    const allPositionsListed = pos.filter(p => parseFloat(p.size || 0) > 0);

    const posWithPnl = pos.filter(p => p.cashPnl !== undefined && p.cashPnl !== null);
    const best = posWithPnl.length > 0
      ? posWithPnl.reduce((b, p) => parseFloat(p.cashPnl) > parseFloat(b.cashPnl || -Infinity) ? p : b, posWithPnl[0])
      : null;
    const worst = posWithPnl.length > 0
      ? posWithPnl.reduce((b, p) => parseFloat(p.cashPnl) < parseFloat(b.cashPnl || Infinity) ? p : b, posWithPnl[0])
      : null;

    const totalVolume = trades.reduce((s, t) => s + Math.abs(parseFloat(t.cash || t.usdcSize || 0)), 0);

    const dayPerf = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    trades.forEach(t => {
      const ts = t.timestamp ? t.timestamp * 1000 : Date.now();
      const d = dayNames[new Date(ts).getDay()];
      const cash = parseFloat(t.cash || t.usdcSize || 0);
      if ((t.side || '').toUpperCase() === 'SELL') dayPerf[d] += cash;
      else dayPerf[d] -= cash;
    });

    function mondayKeyFromDateStr(dateStr) {
      const ms = new Date(dateStr + 'T12:00:00').getTime();
      const d = new Date(ms);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const m = new Date(d);
      m.setDate(diff);
      m.setHours(0, 0, 0, 0);
      return m.toISOString().slice(0, 10);
    }

    function mondayKey(ms) {
      const d = new Date(ms);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const m = new Date(d);
      m.setDate(diff);
      m.setHours(0, 0, 0, 0);
      return m.toISOString().slice(0, 10);
    }

    function buildOhlcFromCum(series, keyFn) {
      if (!series.length) return [];
      const groups = new Map();
      series.forEach(pt => {
        const k = keyFn(pt.date);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(pt);
      });
      const keys = [...groups.keys()].sort();
      return keys.map(k => {
        const pts = groups.get(k);
        const pnls = pts.map(p => p.pnl);
        let vol = 0;
        pts.forEach(p => { vol += Math.abs(p.dayDelta || 0); });
        return {
          key: k,
          open: pnls[0],
          high: Math.max(...pnls),
          low: Math.min(...pnls),
          close: pnls[pnls.length - 1],
          flow: pnls[pnls.length - 1] - pnls[0],
          startDate: pts[0].date,
          endDate: pts[pts.length - 1].date,
          days: pts.length,
          volume: parseFloat(vol.toFixed(2)),
        };
      });
    }

    const candlesWeek = buildOhlcFromCum(cumPnl, mondayKeyFromDateStr);
    const candlesMonth = buildOhlcFromCum(cumPnl, d => d.slice(0, 7));
    const candlesYear = buildOhlcFromCum(cumPnl, d => d.slice(0, 4));

    function guessTheme(title) {
      const t = (title || '').toLowerCase();
      if (/bitcoin|btc|\beth\b|crypto|solana|sol\b/.test(t)) return 'Crypto';
      if (/trump|biden|election|senate|house|president|politic|governor/.test(t)) return 'Politics';
      if (/nba|nfl|nhl|mlb|vs\.|spread|total\b|ucl\b|uefa/.test(t)) return 'Sports';
      if (/fed|cpi|gdp|rate|economy|stock|nasdaq|s&p/.test(t)) return 'Macro';
      return 'Other';
    }

    const themeVolume = { Crypto: 0, Politics: 0, Sports: 0, Macro: 0, Other: 0 };
    pos.forEach(p => {
      const th = guessTheme(p.title);
      themeVolume[th] = (themeVolume[th] || 0) + Math.abs(parseFloat(p.cashPnl || 0));
    });

    const sortedByPnl = [...posWithPnl].sort((a, b) => parseFloat(b.cashPnl || 0) - parseFloat(a.cashPnl || 0));
    const top3Best = sortedByPnl.filter(p => parseFloat(p.cashPnl || 0) > 0).slice(0, 3);
    const top3Worst = [...posWithPnl]
      .sort((a, b) => parseFloat(a.cashPnl || 0) - parseFloat(b.cashPnl || 0))
      .filter(p => parseFloat(p.cashPnl || 0) < 0)
      .slice(0, 3);

    const wrSpark = [];
    let cw = 0;
    let ct = 0;
    closed.forEach(p => {
      const w = parseFloat(p.curPrice || 0) >= 0.99 || parseFloat(p.cashPnl || 0) > 0;
      ct++;
      if (w) cw++;
      wrSpark.push(ct ? parseFloat(((cw / ct) * 100).toFixed(2)) : 0);
    });
    const winRateSpark = wrSpark.length > 48 ? wrSpark.slice(-48) : wrSpark;

    const walletDailyCalendar = pnlDays.map(d => ({ date: d, pnl: dailyPnl[d] }));
    const cumPnlWeeklyPoints = candlesWeek.map(b => ({ date: b.endDate, pnl: b.close, label: b.key }));

    let perfTier = 'flat';
    let perfLabel = 'Breakeven';
    let perfSub = 'On-chain cash P&amp;L is roughly flat.';
    const tcp = totalCashPnl;
    if (tcp > 250 && winRate >= 52) {
      perfTier = 'great'; perfLabel = 'Strong edge'; perfSub = 'Healthy P&amp;L with solid win rate on resolved books.';
    } else if (tcp > 50) {
      perfTier = 'good'; perfLabel = 'Profitable'; perfSub = 'Net positive — keep sizing and liquidity in check.';
    } else if (tcp < -250) {
      perfTier = 'bad'; perfLabel = 'Under water'; perfSub = 'Consider risk-down and review recent resolutions.';
    } else if (tcp < 0) {
      perfTier = 'weak'; perfLabel = 'Slightly red'; perfSub = 'Small drawdown — watch concentration.';
    }

    return {
      cumPnl,
      totalRealizedPnl,
      totalCurrentValue,
      totalCashPnl,
      totalInitialValue,
      winRate,
      won: won.length,
      lost: closed.length - won.length,
      totalClosed: closed.length,
      open,
      openStrict,
      allPositionsListed,
      closed,
      best,
      worst,
      top3Best,
      top3Worst,
      totalVolume,
      totalTrades: trades.length,
      dayPerf,
      themeVolume,
      positions: pos,
      candlesWeek,
      candlesMonth,
      candlesYear,
      perfTier,
      perfLabel,
      perfSub,
      winRateSpark,
      walletDailyCalendar,
      dailyPnlRaw: dailyPnl,
      cumPnlWeeklyPoints,
    };
  }

  return { getPositions, getActivity, computeStats };
})();


// ==========================================
// ANALYTICS PAGE RENDERER
// ==========================================

let analyticsWallet = null;
let analyticsData = null;

/** Unicode minus for negatives; always clear sign */
function formatSignedUsd(n, decimals) {
  const x = Number(n) || 0;
  const d = decimals === undefined ? 2 : decimals;
  const a = Math.abs(x).toFixed(d);
  if (x > 0) return '+' + '$' + a;
  if (x < 0) return '\u2212$' + a;
  return '$' + a;
}

function escAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const PM_POS_PAGE_SIZE = 10;

function pmPositionRowHtml(p) {
  const curP = parseFloat(p.curPrice || 0);
  const avgP = parseFloat(p.avgPrice || 0);
  const pnl = parseFloat(p.cashPnl || 0);
  const pct = parseFloat(p.percentPnl || 0);
  const pnlClass = pnl >= 0 ? 'an-pos' : 'an-neg';
  const priceBar = Math.min(100, Math.round(curP * 100));
  const dt = escAttr(p.title || '').replace(/"/g, '&quot;');
  const slug = escAttr(p.slug || '');
  return `<tr class="an-tr pe-pos-row" onclick="expandPosition(this)" data-title="${dt}" data-slug="${slug}">
    <td class="an-td-market">
      <div class="an-market-name pe-pos-title">${escapeHtml(p.title || '—')}</div>
      <div class="an-prob-bar"><div class="an-prob-fill" style="width:${priceBar}%;background:${curP > 0.6 ? 'var(--green)' : curP < 0.4 ? 'var(--red)' : 'var(--yellow)'}"></div></div>
    </td>
    <td><span class="an-outcome-badge">${escapeHtml(p.outcome || '—')}</span></td>
    <td class="an-mono" style="color:${curP > 0.6 ? 'var(--green)' : curP < 0.4 ? 'var(--red)' : 'var(--yellow)'}">${(curP * 100).toFixed(1)}¢</td>
    <td class="an-mono">${(avgP * 100).toFixed(1)}¢</td>
    <td class="an-mono">${parseFloat(p.size || 0).toFixed(0)}</td>
    <td class="an-mono">$${parseFloat(p.currentValue || 0).toFixed(2)}</td>
    <td class="an-mono ${pnlClass}">${formatSignedUsd(pnl)}</td>
    <td class="an-mono ${pnlClass}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</td>
  </tr>`;
}

function renderThemeBarsBlock(s) {
  const tv = s.themeVolume || {};
  const entries = Object.entries(tv).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  if (!entries.length) return '<div class="an-empty-state">No themed buckets yet</div>';
  return `<div class="pe-theme-bars">${entries.map(([k, v]) => {
    const pct = Math.round((v / max) * 100);
    return `<div class="pe-theme-row"><span class="pe-theme-name">${k}</span><div class="pe-theme-track"><i style="width:${pct}%"></i></div><span class="pe-theme-val">$${v.toFixed(0)}</span></div>`;
  }).join('')}</div><p class="pe-theme-caption">Exposure by theme (title keywords) × |cash P&amp;L| — not investment advice.</p>`;
}

function formatTop3Html(arr, asWin) {
  if (!arr || !arr.length) return '<div class="an-empty-state">None</div>';
  return arr.map((p, i) => `<div class="pe-tw-row ${asWin ? 'pe-tw-up' : 'pe-tw-down'}"><span class="pe-tw-rank">${i + 1}</span><div class="pe-tw-body"><div class="pe-tw-title">${escapeHtml(p.title || '—')}</div><div class="pe-tw-meta">${(parseFloat(p.avgPrice || 0) * 100).toFixed(1)}¢ avg · ${escapeHtml(p.outcome || '—')} · mark ${(parseFloat(p.curPrice || 0) * 100).toFixed(1)}¢</div></div><span class="pe-tw-pnl">${formatSignedUsd(p.cashPnl)}</span></div>`).join('');
}

function renderTopTradesBlock(s) {
  const best = s.top3Best || [];
  const worst = s.top3Worst || [];
  if (!best.length && !worst.length) return '<div class="an-empty-state">No position-level P&amp;L yet</div>';
  let out = '';
  if (best.length) out += `<div class="pe-tw-sec-h">Top winners</div>${formatTop3Html(best, true)}`;
  if (worst.length) out += `<div class="pe-tw-sec-h">Top losers</div>${formatTop3Html(worst, false)}`;
  return out;
}

function pmRefreshPositionsTable() {
  const s = analyticsData && analyticsData.stats;
  if (!s) return;
  const tab = window.__PM_TAB__ || 'active';
  const map = { active: s.open, all: s.allPositionsListed, closed: s.closed };
  const list = map[tab] || [];
  const n = PM_POS_PAGE_SIZE;
  let page = window.__PM_PAGE__ || 1;
  const pages = Math.max(1, Math.ceil(list.length / n));
  if (page > pages) page = pages;
  window.__PM_PAGE__ = page;
  const start = (page - 1) * n;
  const slice = list.slice(start, start + n);
  const tb = document.getElementById('pm-pos-tbody');
  if (tb) {
    tb.innerHTML = slice.length
      ? slice.map(pmPositionRowHtml).join('')
      : '<tr><td colspan="8" class="an-empty-state">No positions in this tab</td></tr>';
  }
  const pg = document.getElementById('pm-pos-pager');
  if (pg) {
    pg.innerHTML = `
      <button type="button" class="pe-pg-btn" ${page <= 1 ? 'disabled' : ''} onclick="pmPosPage(-1)">Prev</button>
      <span class="pe-pg-info">${list.length} total · page ${page} / ${pages}</span>
      <button type="button" class="pe-pg-btn" ${page >= pages ? 'disabled' : ''} onclick="pmPosPage(1)">Next</button>`;
  }
}

window.pmSwitchPosTab = function (tab) {
  window.__PM_TAB__ = tab;
  window.__PM_PAGE__ = 1;
  document.querySelectorAll('.pe-pos-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  pmRefreshPositionsTable();
};

window.pmPosPage = function (delta) {
  window.__PM_PAGE__ = Math.max(1, (window.__PM_PAGE__ || 1) + delta);
  pmRefreshPositionsTable();
};

window.pmSetCandlePeriod = function (period) {
  window.__PM_CANDLE__ = period;
  document.querySelectorAll('.pe-candle-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-per') === period);
  });
  if (analyticsData && analyticsData.stats) drawCandleChartFromStats(analyticsData.stats);
};

window.pmSetPnlMode = function (mode) {
  window.__PM_PNL_MODE__ = mode;
  document.querySelectorAll('.pe-pnl-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });
  if (analyticsData && analyticsData.stats) initInteractivePnlChart(analyticsData.stats);
};

window.openPmTopTradesModal = function () {
  const s = analyticsData && analyticsData.stats;
  if (!s) return;
  let el = document.getElementById('pm-top-modal-bg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pm-top-modal-bg';
    el.className = 'pm-modal-bg';
    el.innerHTML = `<div class="pm-modal pe-modal-grad" role="dialog">
      <button type="button" class="pm-modal-x" onclick="closePmTopTradesModal()">✕</button>
      <h3 class="pm-modal-h">Top winners &amp; losers</h3>
      <div id="pm-top-modal-body"></div>
    </div>`;
    el.addEventListener('click', e => { if (e.target === el) closePmTopTradesModal(); });
    document.body.appendChild(el);
  }
  document.getElementById('pm-top-modal-body').innerHTML = `
    <div class="pm-modal-sec"><h4>Best 3</h4>${formatTop3Html(s.top3Best, true)}</div>
    <div class="pm-modal-sec"><h4>Worst 3</h4>${formatTop3Html(s.top3Worst, false)}</div>`;
  el.classList.add('open');
};

window.closePmTopTradesModal = function () {
  const el = document.getElementById('pm-top-modal-bg');
  if (el) el.classList.remove('open');
};

async function loadAnalytics(forceWalletPrompt) {
  const content = document.getElementById('analytics-content');
  if (!content) return;

  // "Change wallet" clicked: show the wallet input form instead of reusing stored wallet
  if (forceWalletPrompt) {
    analyticsWallet = null;
    renderWalletPrompt();
    return;
  }

  const profileWallet = (typeof currentProfile !== 'undefined' && currentProfile) ? currentProfile.polymarket_wallet : null;
  let storedWallet = null;
  try {
    storedWallet = localStorage.getItem('pp_pm_wallet') || null;
  } catch (e) {}

  if (!analyticsWallet) {
    analyticsWallet = profileWallet || storedWallet || null;
  }

  if (!analyticsWallet) {
    renderWalletPrompt();
    return;
  }

  renderAnalyticsLoading();
  await fetchAndRenderAnalytics(analyticsWallet);
}

function renderWalletPrompt() {
  const c = document.getElementById('analytics-content');
  if (!c) return;
  c.innerHTML = `
    <div class="pe-connect-shell">
      <div class="pe-connect-card">
        <div class="pe-connect-icon">◎</div>
        <h2 class="pe-connect-title">Polymarket Wallet</h2>
        <p class="pe-connect-lead">Paste your wallet address to load on-chain positions and activity. Public address only — never your private key.</p>
        <p class="pe-connect-note">On-chain portfolio is separate from your PolyEdge evaluation balance and rules.</p>
        <div class="pe-connect-form">
          <input class="form-input pe-connect-input" id="pm-wallet-input" placeholder="0x… wallet address" autocomplete="off">
          <button type="button" class="form-btn pe-connect-btn" onclick="connectWallet()">Load portfolio</button>
        </div>
        <div class="msg msg-err" id="wallet-err"></div>
        <p class="pe-connect-hint">On <a href="https://polymarket.com" target="_blank" rel="noopener">polymarket.com</a> open your profile — the wallet appears in the URL.</p>
      </div>
    </div>`;
}

async function connectWallet() {
  const input = document.getElementById('pm-wallet-input');
  const err = document.getElementById('wallet-err');
  const wallet = input?.value?.trim();
  if (!wallet || !wallet.startsWith('0x') || wallet.length < 40) {
    showMsg(err, 'Please enter a valid Ethereum wallet address (starts with 0x)', 'err');
    return;
  }
  analyticsWallet = wallet;

  // Persist locally so the wallet is remembered across sessions
  try {
    localStorage.setItem('pp_pm_wallet', wallet);
  } catch (e) {}

  if (typeof currentUser !== 'undefined' && currentUser && typeof sb !== 'undefined' && sb) {
    try {
      await sb.from('profiles').update({ polymarket_wallet: wallet }).eq('id', currentUser.id);
      if (currentProfile) currentProfile.polymarket_wallet = wallet;
    } catch(e) {}
  }

  renderAnalyticsLoading();
  await fetchAndRenderAnalytics(wallet);
}

function renderAnalyticsLoading() {
  const c = document.getElementById('analytics-content');
  if (!c) return;
  c.innerHTML = `
    <div class="an-center">
      <div class="an-loading">
        <div class="an-spinner"></div>
        <div class="an-loading-text">Fetching on-chain data<span class="an-dots"></span></div>
        <div class="an-loading-sub">Querying Polymarket Data API</div>
      </div>
    </div>`;
  let d = 0;
  const iv = setInterval(() => {
    const dotsEl = document.querySelector('.an-dots');
    if (!dotsEl) { clearInterval(iv); return; }
    dotsEl.textContent = ['.', '..', '...'][d++ % 3];
  }, 400);
}

async function fetchAndRenderAnalytics(wallet) {
  try {
    const [positions, activity] = await Promise.all([
      PM.getPositions(wallet),
      PM.getActivity(wallet)
    ]);

    const stats = PM.computeStats(positions, activity);
    analyticsData = { positions, activity, stats, wallet };
    renderAnalyticsDashboard(stats, wallet);
  } catch (e) {
    console.error('Analytics error:', e);
    const c = document.getElementById('analytics-content');
    if (!c) return;
    c.innerHTML = `
      <div class="an-center">
        <div class="an-error-box">
          <div style="font-size:32px;margin-bottom:16px">⚠</div>
          <h3>Failed to Load Data</h3>
          <p>${e.message || 'All CORS proxies failed. This can happen due to rate limiting.'}</p>
          <button class="form-btn" style="width:auto;margin-top:20px;padding:12px 24px" onclick="fetchAndRenderAnalytics('${wallet}')">Retry →</button>
          <button class="form-btn secondary" style="width:auto;margin-top:10px;padding:12px 24px" onclick="loadAnalytics(true)">Change Wallet</button>
        </div>
      </div>`;
  }
}

function renderAnalyticsDashboard(s, wallet) {
  const shortWallet = wallet.slice(0, 6) + '…' + wallet.slice(-4);
  const pnlColor = s.totalCashPnl >= 0 ? 'var(--green)' : 'var(--red)';
  const rp = s.totalRealizedPnl >= 0 ? 'var(--green)' : 'var(--red)';
  const hasCandles = (s.candlesWeek && s.candlesWeek.length) || (s.candlesMonth && s.candlesMonth.length);

  const c = document.getElementById('analytics-content');
  if (!c) return;
  c.innerHTML = `
    <div class="an-header pe-dash-head pe-an-head">
      <div class="an-header-left">
        <div class="an-wallet-badge pe-wallet-pill">
          <span class="an-wallet-dot"></span>
          <span class="an-wallet-addr">${shortWallet}</span>
          <button type="button" class="pe-linkish" onclick="loadAnalytics(true)">Change</button>
        </div>
        <h1 class="an-title pe-an-title">Polymarket Wallet</h1>
        <p class="pe-an-sub">On-chain portfolio from the Polymarket Data API. Numbers may differ from polymarket.com (different definitions / refresh).</p>
      </div>
      <button type="button" class="pe-refresh" onclick="fetchAndRenderAnalytics('${wallet}')"><span>↻</span> Refresh</button>
    </div>

    <div class="an-perf-hero pe-card-r pe-tier-${s.perfTier} pe-grad-hero">
      <div class="an-perf-copy">
        <div class="an-perf-kicker">Snapshot</div>
        <h2 class="an-perf-title">${s.perfLabel}</h2>
        <p class="an-perf-sub">${s.perfSub}</p>
      </div>
      <div class="an-perf-stat">
        <div class="an-perf-big pe-tab-nums" style="color:${pnlColor}">${formatSignedUsd(s.totalCashPnl, 0)}</div>
        <div class="an-perf-mini">Σ position <code>cashPnl</code> · ${s.totalTrades} fills · ${s.totalClosed} resolved books</div>
      </div>
    </div>

    <div class="an-kpis pe-kpis-r pe-kpi-soft">
      <div class="an-kpi pe-kpi-g" data-tooltip="Sum of cashPnl on every position row returned by the API">
        <div class="an-kpi-label">Total P&amp;L</div>
        <div class="an-kpi-val" style="color:${pnlColor}">${formatSignedUsd(s.totalCashPnl)}</div>
        <div class="an-kpi-sub">API field: cashPnl</div>
      </div>
      <div class="an-kpi pe-kpi-g" data-tooltip="Sum of realizedPnl on positions">
        <div class="an-kpi-label">Realized P&amp;L</div>
        <div class="an-kpi-val" style="color:${rp}">${formatSignedUsd(s.totalRealizedPnl)}</div>
        <div class="an-kpi-sub">From realizedPnl</div>
      </div>
      <div class="an-kpi pe-kpi-g">
        <div class="an-kpi-label">Mark value</div>
        <div class="an-kpi-val">$${s.totalCurrentValue.toFixed(2)}</div>
        <div class="an-kpi-sub">${s.open.length} live · ${s.allPositionsListed.length} total rows</div>
      </div>
      <div class="an-kpi pe-kpi-g">
        <div class="an-kpi-label">Win rate</div>
        <div class="an-kpi-val" style="color:${s.winRate >= 50 ? 'var(--green)' : 'var(--red)'}">${s.winRate.toFixed(1)}%</div>
        <div class="an-kpi-sub">${s.won}W / ${s.lost}L resolved</div>
      </div>
      <div class="an-kpi pe-kpi-g">
        <div class="an-kpi-label">Volume</div>
        <div class="an-kpi-val">$${s.totalVolume.toFixed(0)}</div>
        <div class="an-kpi-sub">${s.totalTrades} trades</div>
      </div>
    </div>

    <div class="an-grid pe-an-grid">
      <div class="an-card an-card-wide pe-card-r pe-grad-card">
        <div class="an-card-header pe-card-head">
          <div>
            <span class="pe-card-kicker">Cumulative</span>
            <span class="an-card-title pe-card-title">P&amp;L path</span>
          </div>
          <div class="pe-seg pe-pnl-tabs">
            <button type="button" class="pe-seg-btn pe-pnl-tab active" data-mode="day" onclick="pmSetPnlMode('day')">Daily</button>
            <button type="button" class="pe-seg-btn pe-pnl-tab" data-mode="week" onclick="pmSetPnlMode('week')">Weekly</button>
            <button type="button" class="pe-seg-btn pe-pnl-tab" data-mode="all" onclick="pmSetPnlMode('all')">All time</button>
          </div>
        </div>
        <div class="pe-pnl-dial">
          <div class="pe-pnl-dial-label">Cumulative (hover chart)</div>
          <div id="an-pnl-dial-value" class="pe-pnl-dial-val pe-tab-nums">${s.cumPnl.length ? formatSignedUsd(s.cumPnl[s.cumPnl.length - 1].pnl) : '—'}</div>
          <div id="an-pnl-dial-date" class="pe-pnl-dial-date">${s.cumPnl.length ? s.cumPnl[s.cumPnl.length - 1].date : ''}</div>
        </div>
        ${s.cumPnl.length > 0
          ? '<div class="an-chart-wrap an-chart-interactive pe-chart-shade"><canvas id="pnl-chart"></canvas></div>'
          : '<div class="an-empty-chart">No trade history for this wallet</div>'
        }
        <p class="pe-fineprint">Built from net USDC flow per day (activity). Green / red segments = up / down vs previous point.</p>
      </div>

      <div class="an-card pe-card-r pe-grad-card">
        <div class="an-card-header pe-card-head"><span class="an-card-title pe-card-title">Win rate</span></div>
        <div class="an-gauge-wrap">
          <canvas id="gauge-chart" width="220" height="130"></canvas>
          <div class="an-gauge-center">
            <div class="an-gauge-val pe-tab-nums" style="color:${s.winRate >= 50 ? 'var(--green)' : 'var(--red)'}">${s.winRate.toFixed(1)}%</div>
            <div class="an-gauge-sub">of ${s.totalClosed} resolved</div>
          </div>
        </div>
        <div class="an-wl-row">
          <div class="an-wl-item"><div class="an-wl-num" style="color:var(--green)">${s.won}</div><div class="an-wl-label">Won</div></div>
          <div class="an-wl-divider"></div>
          <div class="an-wl-item"><div class="an-wl-num" style="color:var(--red)">${s.lost}</div><div class="an-wl-label">Lost</div></div>
        </div>
        ${(s.winRateSpark && s.winRateSpark.length) ? '<div class="pe-spark-wrap"><canvas id="winrate-spark-chart"></canvas></div><p class="pe-fineprint">Rolling win % as books resolve (order from API).</p>' : ''}
      </div>

      <div class="an-card pe-card-r pe-grad-card">
        <div class="an-card-header pe-card-head">
          <span class="an-card-title pe-card-title">Theme mix</span>
        </div>
        ${renderThemeBarsBlock(s)}
      </div>

      <div class="an-card pe-card-r pe-grad-card">
        <div class="an-card-header pe-card-head">
          <span class="an-card-title pe-card-title">Leaders</span>
          <button type="button" class="pe-mini-btn" onclick="openPmTopTradesModal()">Expand</button>
        </div>
        ${renderTopTradesBlock(s)}
      </div>

      <div class="an-card an-card-wide pe-card-r pe-grad-card" style="grid-column:1 / -1">
        <div class="an-card-header pe-card-head">
          <div>
            <span class="pe-card-kicker">Period OHLC</span>
            <span class="an-card-title pe-card-title">Cumulative range</span>
          </div>
          <div class="pe-seg">
            <button type="button" class="pe-seg-btn pe-candle-tab active" data-per="week" onclick="pmSetCandlePeriod('week')">Week</button>
            <button type="button" class="pe-seg-btn pe-candle-tab" data-per="month" onclick="pmSetCandlePeriod('month')">Month</button>
            <button type="button" class="pe-seg-btn pe-candle-tab" data-per="year" onclick="pmSetCandlePeriod('year')">Year</button>
          </div>
        </div>
        <p class="pe-week-hint">Each candle: low / high = min / max <em>cumulative</em> P&amp;L in the period; body = open→close. Hover for detail.</p>
        <div class="pe-candle-host">
          ${hasCandles
            ? '<canvas id="candle-chart"></canvas><div id="candle-tooltip" class="pe-candle-tip" hidden></div>'
            : '<div class="an-empty-chart">Need more history</div>'}
        </div>
      </div>
    </div>

    <div class="an-card an-card-full pe-card-r pe-grad-card pe-pos-card" style="margin-top:20px">
      <div class="an-card-header pe-card-head">
        <span class="an-card-title pe-card-title">Positions</span>
        <div class="pe-seg">
          <button type="button" class="pe-seg-btn pe-pos-tab active" data-tab="active" onclick="pmSwitchPosTab('active')">Active (${s.open.length})</button>
          <button type="button" class="pe-seg-btn pe-pos-tab" data-tab="all" onclick="pmSwitchPosTab('all')">All (${s.allPositionsListed.length})</button>
          <button type="button" class="pe-seg-btn pe-pos-tab" data-tab="closed" onclick="pmSwitchPosTab('closed')">Resolved (${s.closed.length})</button>
        </div>
      </div>
      <div class="an-table-wrap pe-table-round">
        <table class="an-table">
          <thead><tr>
            <th>Market</th><th>Outcome</th><th>Cur</th><th>Avg</th>
            <th>Size</th><th>Value</th><th>P&amp;L</th><th>%</th>
          </tr></thead>
          <tbody id="pm-pos-tbody"></tbody>
        </table>
      </div>
      <div id="pm-pos-pager" class="pe-pos-pager"></div>
    </div>

    <div id="analytics-calendar"></div>
  `;

  window.__PM_TAB__ = 'active';
  window.__PM_PAGE__ = 1;
  window.__PM_CANDLE__ = 'week';
  window.__PM_PNL_MODE__ = 'day';

  requestAnimationFrame(() => {
    if (s.cumPnl.length > 0) initInteractivePnlChart(s);
    drawGauge(s.winRate);
    if (s.winRateSpark && s.winRateSpark.length) drawWinRateSpark(s.winRateSpark);
    if (hasCandles) drawCandleChartFromStats(s);
    pmRefreshPositionsTable();
    initTooltips();
    loadAnalyticsCalendar(s);
  });
}

/** Wallet page: on-chain daily net; else evaluation closed trades when logged in */
async function loadAnalyticsCalendar(statsForWallet) {
  CalendarComponent.setWalletDaily([]);
  CalendarComponent.setTrades([]);
  CalendarComponent.setMilestones([]);

  if (statsForWallet && statsForWallet.walletDailyCalendar && statsForWallet.walletDailyCalendar.length) {
    CalendarComponent.setWalletDaily(statsForWallet.walletDailyCalendar);
  } else if (typeof sb !== 'undefined' && sb && typeof currentUser !== 'undefined' && currentUser) {
    const selectedAccount = typeof AccountManager !== 'undefined' ? AccountManager.getSelected() : null;
    if (selectedAccount) {
      const { data: trades } = await sb.from('trades')
        .select('*')
        .eq('evaluation_id', selectedAccount.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });
      CalendarComponent.setTrades(trades || []);
      CalendarComponent.setMilestones([
        { at: selectedAccount.expires_at, label: 'Phase deadline', kind: 'deadline' },
        ...(selectedAccount.created_at ? [{ at: selectedAccount.created_at, label: 'Eval started', kind: 'start' }] : [])
      ]);
    }
  }
  CalendarComponent.render('analytics-calendar');
}

function yAxisLabel(v) {
  if (v > 0) return '+' + '$' + Math.abs(v).toFixed(0);
  if (v < 0) return '\u2212$' + Math.abs(v).toFixed(0);
  return '$0';
}

function pnlSeriesForMode(st) {
  if (!st || !st.cumPnl || !st.cumPnl.length) return [];
  const mode = window.__PM_PNL_MODE__ || 'day';
  if (mode === 'week' && st.cumPnlWeeklyPoints && st.cumPnlWeeklyPoints.length) return st.cumPnlWeeklyPoints;
  return st.cumPnl;
}

let pnlDialAnim = null;
function setPnlDialValue(pnl, dateStr) {
  const valEl = document.getElementById('an-pnl-dial-value');
  const dateEl = document.getElementById('an-pnl-dial-date');
  if (!valEl) return;
  const target = Number(pnl) || 0;
  const start = pnlDialAnim ? pnlDialAnim.current : target;
  if (pnlDialAnim) cancelAnimationFrame(pnlDialAnim.raf);
  const t0 = performance.now();
  const dur = 180;
  function tick(now) {
    const t = Math.min(1, (now - t0) / dur);
    const ease = 1 - (1 - t) * (1 - t);
    const cur = start + (target - start) * ease;
    pnlDialAnim = { current: cur, raf: null };
    valEl.textContent = formatSignedUsd(cur);
    valEl.style.color = cur >= 0 ? 'var(--green)' : 'var(--red)';
    if (dateEl) dateEl.textContent = dateStr || '';
    if (t < 1) pnlDialAnim.raf = requestAnimationFrame(tick);
  }
  pnlDialAnim = { current: start, raf: requestAnimationFrame(tick) };
}

function initInteractivePnlChart(s) {
  const canvas = document.getElementById('pnl-chart');
  if (!canvas) return;
  const pad = { t: 22, r: 18, b: 40, l: 58 };
  const CH = 240;

  function currentSeries() {
    const st = analyticsData && analyticsData.stats;
    return pnlSeriesForMode(st || s);
  }

  let hoverI = 0;

  function drawFrame() {
    const series = currentSeries();
    if (!series.length) return;
    if (hoverI >= series.length) hoverI = series.length - 1;
    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.offsetWidth || canvas.offsetWidth || 600;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = CH + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const vals = series.map(d => d.pnl);
    const labels = series.map(d => (d.date || '').slice(5));
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, 0);
    const range = max - min || 1;
    const w = W - pad.l - pad.r;
    const h = CH - pad.t - pad.b;
    const toX = (i) => pad.l + (vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2);
    const toY = (v) => pad.t + (1 - (v - min) / range) * h;

    ctx.fillStyle = 'rgba(12,18,32,0.55)';
    ctx.fillRect(0, 0, W, CH);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let g = 0; g <= 4; g++) {
      const yy = pad.t + (g / 4) * h;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + w, yy);
      ctx.stroke();
    }

    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    const zeroY = toY(0);
    ctx.beginPath();
    ctx.moveTo(pad.l, zeroY);
    ctx.lineTo(pad.l + w, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(230,238,255,0.85)';
    ctx.textAlign = 'right';
    [max, (min + max) / 2, min].forEach(v => {
      ctx.fillText(yAxisLabel(v), pad.l - 8, toY(v) + 4);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(180,195,220,0.7)';
    const step = Math.max(1, Math.floor(labels.length / 7));
    for (let i = 0; i < labels.length; i += step) {
      ctx.fillText(labels[i], toX(i), CH - 10);
    }

    for (let i = 1; i < vals.length; i++) {
      const up = vals[i] >= vals[i - 1];
      const g = ctx.createLinearGradient(toX(i - 1), toY(vals[i - 1]), toX(i), toY(vals[i]));
      if (up) {
        g.addColorStop(0, 'rgba(61,214,138,0.4)');
        g.addColorStop(1, 'rgba(61,214,138,0.06)');
      } else {
        g.addColorStop(0, 'rgba(248,113,113,0.4)');
        g.addColorStop(1, 'rgba(248,113,113,0.06)');
      }
      ctx.beginPath();
      ctx.moveTo(toX(i - 1), toY(vals[i - 1]));
      ctx.lineTo(toX(i), toY(vals[i]));
      ctx.lineTo(toX(i), pad.t + h);
      ctx.lineTo(toX(i - 1), pad.t + h);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }

    for (let i = 1; i < vals.length; i++) {
      const up = vals[i] >= vals[i - 1];
      ctx.beginPath();
      ctx.moveTo(toX(i - 1), toY(vals[i - 1]));
      ctx.lineTo(toX(i), toY(vals[i]));
      ctx.strokeStyle = up ? '#3dd68a' : '#f87171';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    const hx = toX(hoverI);
    ctx.strokeStyle = 'rgba(96,165,250,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, pad.t);
    ctx.lineTo(hx, pad.t + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx, toY(vals[hoverI]), 5, 0, Math.PI * 2);
    ctx.fillStyle = '#93c5fd';
    ctx.fill();

    setPnlDialValue(series[hoverI].pnl, series[hoverI].date);
  }

  hoverI = Math.max(0, currentSeries().length - 1);
  drawFrame();

  if (canvas._pmPnlMove) {
    canvas.removeEventListener('mousemove', canvas._pmPnlMove);
    canvas.removeEventListener('mouseleave', canvas._pmPnlLeave);
  }
  canvas._pmPnlMove = e => {
    const series = currentSeries();
    if (!series.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const W = rect.width;
    const vals = series.map(d => d.pnl);
    const w = W - pad.l - pad.r;
    const t = Math.max(0, Math.min(1, (x - pad.l) / Math.max(w, 1)));
    hoverI = vals.length <= 1 ? 0 : Math.round(t * (vals.length - 1));
    drawFrame();
  };
  canvas._pmPnlLeave = () => {
    const series = currentSeries();
    hoverI = Math.max(0, series.length - 1);
    drawFrame();
  };
  canvas.addEventListener('mousemove', canvas._pmPnlMove);
  canvas.addEventListener('mouseleave', canvas._pmPnlLeave);

  if (!window._pmPnlResizeBound) {
    window._pmPnlResizeBound = true;
    window.addEventListener('resize', () => {
      if (document.getElementById('pnl-chart') && analyticsData) initInteractivePnlChart(analyticsData.stats);
    });
  }
}

function drawCandleChartFromStats(s) {
  const canvas = document.getElementById('candle-chart');
  const tip = document.getElementById('candle-tooltip');
  if (!canvas) return;
  const period = window.__PM_CANDLE__ || 'week';
  const raw = period === 'month' ? s.candlesMonth : period === 'year' ? s.candlesYear : s.candlesWeek;
  const candles = (raw || []).slice(-40);
  if (!candles.length) return;

  const ctx = canvas.getContext('2d');
  const pad = { t: 18, r: 12, b: 36, l: 52 };
  const CH = 260;

  let hoverIdx = -1;

  function fmtLb(c) {
    if (period === 'year') return c.key;
    if (period === 'month') return c.key;
    return (c.startDate || '').slice(5);
  }

  function draw() {
    const W = canvas.parentElement.offsetWidth || canvas.offsetWidth || 600;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = CH + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const lows = candles.map(c => c.low);
    const highs = candles.map(c => c.high);
    const min = Math.min(...lows, 0);
    const max = Math.max(...highs, 0);
    const range = max - min || 1;
    const w = W - pad.l - pad.r;
    const h = CH - pad.t - pad.b;
    const n = candles.length;
    const slot = w / Math.max(n, 1);
    const toY = v => pad.t + (1 - (v - min) / range) * h;

    ctx.fillStyle = 'rgba(10,14,26,0.6)';
    ctx.fillRect(0, 0, W, CH);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(pad.l, toY(0));
    ctx.lineTo(pad.l + w, toY(0));
    ctx.stroke();

    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(220,230,250,0.8)';
    ctx.textAlign = 'right';
    [max, (min + max) / 2, min].forEach(v => {
      ctx.fillText(yAxisLabel(v), pad.l - 6, toY(v) + 4);
    });

    candles.forEach((c, i) => {
      const cx = pad.l + i * slot + slot / 2;
      const bodyW = Math.max(4, slot * 0.45);
      const yHi = toY(c.high);
      const yLo = toY(c.low);
      const yO = toY(c.open);
      const yC = toY(c.close);
      const top = Math.min(yO, yC);
      const bot = Math.max(yO, yC);
      const bull = c.close >= c.open;
      ctx.strokeStyle = bull ? 'rgba(61,214,138,0.95)' : 'rgba(248,113,113,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, yHi);
      ctx.lineTo(cx, yLo);
      ctx.stroke();
      const bh = Math.max(bot - top, 2);
      const g = ctx.createLinearGradient(cx - bodyW / 2, top, cx + bodyW / 2, bot);
      if (bull) {
        g.addColorStop(0, 'rgba(61,214,138,0.95)');
        g.addColorStop(1, 'rgba(61,214,138,0.35)');
      } else {
        g.addColorStop(0, 'rgba(248,113,113,0.95)');
        g.addColorStop(1, 'rgba(248,113,113,0.35)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(cx - bodyW / 2, top, bodyW, bh);
      if (i === hoverIdx) {
        ctx.strokeStyle = 'rgba(147,197,253,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - bodyW / 2 - 2, Math.min(top, yHi) - 2, bodyW + 4, Math.abs(yLo - yHi) + 4);
      }
    });

    ctx.fillStyle = 'rgba(160,175,205,0.65)';
    ctx.textAlign = 'center';
    const st = Math.max(1, Math.floor(n / 8));
    for (let i = 0; i < n; i += st) {
      ctx.fillText(fmtLb(candles[i]), pad.l + i * slot + slot / 2, CH - 8);
    }
  }

  function showTip(i, clientX, clientY) {
    if (!tip || i < 0 || i >= candles.length) {
      if (tip) tip.hidden = true;
      return;
    }
    const c = candles[i];
    tip.hidden = false;
    tip.innerHTML = `
      <div class="pe-tip-h">${period.toUpperCase()} · ${c.startDate} → ${c.endDate}</div>
      <div class="pe-tip-row"><span>Open (cum)</span><b>${formatSignedUsd(c.open)}</b></div>
      <div class="pe-tip-row"><span>High</span><b>${formatSignedUsd(c.high)}</b></div>
      <div class="pe-tip-row"><span>Low</span><b>${formatSignedUsd(c.low)}</b></div>
      <div class="pe-tip-row"><span>Close</span><b>${formatSignedUsd(c.close)}</b></div>
      <div class="pe-tip-row"><span>Δ in period</span><b>${formatSignedUsd(c.flow)}</b></div>
      <div class="pe-tip-row"><span>Active days</span><b>${c.days}</b></div>
      <div class="pe-tip-row"><span>|Daily flow| Σ</span><b>$${c.volume.toFixed(2)}</b></div>`;
    const tw = tip.offsetWidth || 260;
    const th = tip.offsetHeight || 200;
    let x = clientX + 14;
    let y = clientY - th / 2;
    if (x + tw > innerWidth - 8) x = clientX - tw - 14;
    if (y < 8) y = 8;
    if (y + th > innerHeight - 8) y = innerHeight - th - 8;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  draw();

  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const W = rect.width;
    const w = W - pad.l - pad.r;
    const n = candles.length;
    const slot = w / Math.max(n, 1);
    const idx = Math.max(0, Math.min(n - 1, Math.floor((x - pad.l) / slot)));
    hoverIdx = idx;
    draw();
    showTip(idx, e.clientX, e.clientY);
  };
  canvas.onmouseleave = () => {
    hoverIdx = -1;
    draw();
    if (tip) tip.hidden = true;
  };
}

function drawWinRateSpark(arr) {
  const canvas = document.getElementById('winrate-spark-chart');
  if (!canvas || !arr.length) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.offsetWidth || 280;
  const H = 56;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = 'rgba(15,20,36,0.5)';
  ctx.fillRect(0, 0, W, H);
  const min = Math.min(...arr, 0);
  const max = Math.max(...arr, 100);
  const range = max - min || 1;
  const pad = 6;
  const w = W - pad * 2;
  const h = H - pad * 2;
  const toX = i => pad + (arr.length > 1 ? (i / (arr.length - 1)) * w : w / 2);
  const toY = v => pad + (1 - (v - min) / range) * h;
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(arr[0]));
  arr.forEach((v, i) => { if (i) ctx.lineTo(toX(i), toY(v)); });
  ctx.strokeStyle = 'rgba(96,165,250,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(arr[0]));
  arr.forEach((v, i) => { if (i) ctx.lineTo(toX(i), toY(v)); });
  ctx.lineTo(toX(arr.length - 1), pad + h);
  ctx.lineTo(toX(0), pad + h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(56,136,232,0.15)';
  ctx.fill();
}

function drawGauge(winRate) {
  const canvas = document.getElementById('gauge-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = 220, H = 130;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const cx = W / 2, cy = H - 20, r = 90;

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.stroke();

  const fillAngle = Math.PI + (winRate / 100) * Math.PI;
  const color = winRate >= 50 ? '#40b080' : winRate >= 30 ? '#c8a030' : '#d04848';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, fillAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.stroke();

  for (let i = 0; i <= 10; i++) {
    const angle = Math.PI + (i / 10) * Math.PI;
    const ix = cx + (r - 8) * Math.cos(angle);
    const iy = cy + (r - 8) * Math.sin(angle);
    const ox = cx + (r + 8) * Math.cos(angle);
    const oy = cy + (r + 8) * Math.sin(angle);
    ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ox, oy);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
  }

  ctx.font = "9px 'JetBrains Mono', monospace";
  ctx.fillStyle = '#4a5878';
  ctx.textAlign = 'center';
  ctx.fillText('0%', cx - r - 2, cy + 16);
  ctx.fillText('50%', cx, cy - r - 8);
  ctx.fillText('100%', cx + r + 2, cy + 16);
}

function initTooltips() {
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const t = document.createElement('div');
      t.className = 'an-tooltip';
      t.textContent = el.dataset.tooltip;
      t.style.cssText = 'position:fixed;z-index:9000;pointer-events:none';
      document.body.appendChild(t);
      const r = el.getBoundingClientRect();
      t.style.left = (r.left + r.width / 2 - t.offsetWidth / 2) + 'px';
      t.style.top = (r.top - t.offsetHeight - 8) + 'px';
      el._tip = t;
    });
    el.addEventListener('mouseleave', () => {
      if (el._tip) { el._tip.remove(); el._tip = null; }
    });
  });
}

function expandPosition(row) {
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains('an-tr-expand')) {
    existing.remove(); return;
  }
  document.querySelectorAll('.an-tr-expand').forEach(r => r.remove());
  const title = row.dataset.title;
  const slug = row.dataset.slug;
  const expand = document.createElement('tr');
  expand.className = 'an-tr-expand';
  expand.innerHTML = `<td colspan="8" class="an-expand-cell">
    <div class="an-expand-content">
      <strong>${title}</strong>
      ${slug ? `<a href="https://polymarket.com/event/${slug}" target="_blank" class="an-poly-link">View on Polymarket →</a>` : ''}
    </div>
  </td>`;
  row.parentNode.insertBefore(expand, row.nextSibling);
}

function truncate(s, n) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
