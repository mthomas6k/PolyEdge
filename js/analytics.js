// ==========================================
// POLYMARKET ANALYTICS ENGINE
// analytics.js — Fixed: uses CLOSED bets for all calculations
// ==========================================

const PM = (() => {
  const PROXIES = [
    (url) => `/api/pm-proxy?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://cors.eu.org/${url}`,
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
      const data = await fetchWithProxy(`${DATA_API}/activity?user=${wallet}&limit=3000`);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('getActivity failed:', e);
      return [];
    }
  }

  function pickNum(obj, ...keys) {
    if (!obj) return 0;
    for (const k of keys) {
      const raw = obj[k];
      if (raw === undefined || raw === null || raw === '') continue;
      const v = parseFloat(raw);
      if (Number.isFinite(v)) return v;
    }
    return 0;
  }

  function positionTotalPnlRow(p) {
    return pickNum(p, 'realizedPnl', 'realized_pnl') + pickNum(p, 'cashPnl', 'cash_pnl');
  }

  function positionDisplaySizeRow(p) {
    const sz = pickNum(p, 'size', 'numShares', 'num_shares');
    if (sz > 0) return sz;
    return pickNum(p, 'totalBought', 'total_bought');
  }

  function positionDisplayValueRow(p) {
    const cur = pickNum(p, 'currentValue', 'current_value');
    const init = pickNum(p, 'initialValue', 'initial_value');
    const realized = pickNum(p, 'realizedPnl', 'realized_pnl');
    const pr = pickNum(p, 'curPrice', 'cur_price');
    const closed = p.redeemable || pr <= 0.01 || pr >= 0.99;
    if (closed && cur < 0.02) return Math.max(cur, init + realized);
    return cur;
  }

  function computeStats(positions, activity) {
    const n = (obj, ...keys) => {
      if (!obj) return 0;
      for (const k of keys) {
        const raw = obj[k];
        if (raw === undefined || raw === null || raw === '') continue;
        const v = parseFloat(raw);
        if (Number.isFinite(v)) return v;
      }
      return 0;
    };

    const positionTotalPnl = positionTotalPnlRow;
    const positionDisplaySize = positionDisplaySizeRow;
    const positionDisplayValue = positionDisplayValueRow;

    const trades = (activity || []).filter(a => ['TRADE', 'REDEEM', 'MAKER_REBATE'].includes(a.type) || a.side);

    const dailyPnl = {};
    const activityByDay = {};
    const sorted = [...trades].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    sorted.forEach(t => {
      const ts = t.timestamp ? t.timestamp * 1000 : Date.now();
      const day = new Date(ts).toISOString().slice(0, 10);
      if (!dailyPnl[day]) dailyPnl[day] = 0;
      const cash = n(t, 'cash', 'usdcSize', 'usdc_size', 'amount');
      const side = (t.side || '').toUpperCase();
      
      const isCashIn = side === 'SELL' || t.type === 'REDEEM' || t.type === 'MAKER_REBATE';
      if (isCashIn) dailyPnl[day] += cash;
      else if (side === 'BUY') dailyPnl[day] -= cash;

      if (!activityByDay[day]) activityByDay[day] = [];
      
      let displaySide = side || '—';
      if (t.type === 'REDEEM') displaySide = 'REDEEM';
      if (t.type === 'MAKER_REBATE') displaySide = 'REBATE';

      activityByDay[day].push({
        title: t.title || t.slug || t.market || t.conditionId || 'Trade',
        side: displaySide,
        signedUsd: isCashIn ? cash : (side === 'BUY' ? -cash : 0),
        absUsd: Math.abs(cash),
        outcome: t.outcome || '',
      });
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
    const totalRealizedPnl = pos.reduce((s, p) => s + n(p, 'realizedPnl', 'realized_pnl'), 0);
    const totalCurrentValue = pos.reduce((s, p) => s + n(p, 'currentValue', 'current_value'), 0);
    const totalCashPnlFieldOnly = pos.reduce((s, p) => s + n(p, 'cashPnl', 'cash_pnl'), 0);
    /** Σ(realizedPnl + cashPnl) — aligns much closer to polymarket.com profile P&amp;L than cashPnl alone */
    const totalCashPnl = pos.reduce((s, p) => s + positionTotalPnl(p), 0);
    const totalInitialValue = pos.reduce((s, p) => s + n(p, 'initialValue', 'initial_value'), 0);

    // CLOSED positions — resolved markets only
    const closed = pos.filter(p => {
      const price = n(p, 'curPrice', 'cur_price');
      return p.redeemable || price <= 0.01 || price >= 0.99;
    });
    const won = closed.filter(p => {
      const price = n(p, 'curPrice', 'cur_price');
      return price >= 0.99 || positionTotalPnl(p) > 0;
    });
    const winRate = closed.length > 0 ? (won.length / closed.length * 100) : 0;

    // OPEN positions — include edge cases Polymarket still lists as active
    const open = pos.filter(p => {
      if (p.redeemable) return false;
      const c = n(p, 'curPrice', 'cur_price');
      const s = positionDisplaySize(p);
      const v = n(p, 'currentValue', 'current_value');
      if (s <= 0) return false;
      const inSpread = c > 0.001 && c < 0.999;
      return inSpread || v > 0.01;
    });

    const openStrict = pos.filter(p =>
      !p.redeemable &&
      n(p, 'curPrice', 'cur_price') > 0.01 &&
      n(p, 'curPrice', 'cur_price') < 0.99
    );

    const allPositionsListed = pos.filter(p => {
      const sz = positionDisplaySize(p);
      const pr = n(p, 'curPrice', 'cur_price');
      const isClosed = p.redeemable || pr <= 0.01 || pr >= 0.99;
      return sz > 0 || isClosed;
    });

    const sortedByPnlDesc = [...pos].sort((a, b) => positionTotalPnl(b) - positionTotalPnl(a));
    const sortedByPnlAsc = [...pos].sort((a, b) => positionTotalPnl(a) - positionTotalPnl(b));
    const best = sortedByPnlDesc.find(p => positionTotalPnl(p) > 0) || null;
    const worst = sortedByPnlAsc.find(p => positionTotalPnl(p) < 0) || null;

    const top3Best = sortedByPnlDesc.filter(p => positionTotalPnl(p) > 0).slice(0, 3);
    const top3Worst = sortedByPnlAsc.filter(p => positionTotalPnl(p) < 0).slice(0, 3);

    const totalVolume = trades.reduce((s, t) => {
      return (t.type === 'TRADE' || t.side) ? s + Math.abs(n(t, 'cash', 'usdcSize', 'usdc_size', 'amount')) : s;
    }, 0);

    const dayPerf = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    trades.forEach(t => {
      const ts = t.timestamp ? t.timestamp * 1000 : Date.now();
      const d = dayNames[new Date(ts).getDay()];
      const cash = n(t, 'cash', 'usdcSize', 'usdc_size', 'amount');
      const side = (t.side || '').toUpperCase();
      const isCashIn = side === 'SELL' || t.type === 'REDEEM' || t.type === 'MAKER_REBATE';
      if (isCashIn) dayPerf[d] += cash;
      else if (side === 'BUY') dayPerf[d] -= cash;
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
    const themeCounts = { Crypto: 0, Politics: 0, Sports: 0, Macro: 0, Other: 0 };
    pos.forEach(p => {
      const th = guessTheme(p.title);
      themeVolume[th] = (themeVolume[th] || 0) + Math.abs(positionTotalPnl(p));
      themeCounts[th] = (themeCounts[th] || 0) + 1;
    });

    const walletDailyCalendar = pnlDays.map(d => ({ date: d, pnl: dailyPnl[d] }));
    const cumPnlWeeklyPoints = candlesWeek.map(b => ({ date: b.endDate, pnl: b.close, label: b.key }));

    let perfTier = 'flat';
    let perfLabel = 'Breakeven';
    let perfSub = 'On-chain position P&amp;L is roughly flat (realized + mark).';
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
      totalCashPnlFieldOnly,
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
      themeCounts,
      positions: pos,
      candlesWeek,
      candlesMonth,
      candlesYear,
      perfTier,
      perfLabel,
      perfSub,
      walletDailyCalendar,
      dailyPnlRaw: dailyPnl,
      cumPnlWeeklyPoints,
      activityByDay,
    };
  }

  return {
    getPositions,
    getActivity,
    computeStats,
    pickNum,
    positionTotalPnlRow,
    positionDisplaySizeRow,
    positionDisplayValueRow,
  };
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
  const curP = PM.pickNum(p, 'curPrice', 'cur_price');
  const avgP = PM.pickNum(p, 'avgPrice', 'avg_price');
  const pnl = PM.positionTotalPnlRow(p);
  const pct = PM.pickNum(p, 'percentPnl', 'percent_pnl');
  const pnlClass = pnl >= 0 ? 'an-pos' : 'an-neg';
  const priceBar = Math.min(100, Math.round(curP * 100));
  const dt = escAttr(p.title || '').replace(/"/g, '&quot;');
  const slug = escAttr(p.slug || '');
  const sz = PM.positionDisplaySizeRow(p);
  const val = PM.positionDisplayValueRow(p);
  const szStr = sz >= 100 ? sz.toFixed(0) : sz >= 1 ? sz.toFixed(2) : sz > 0 ? sz.toFixed(4) : '0';
  const valStr = val >= 0 ? '$' + val.toFixed(2) : formatSignedUsd(val);
  return `<tr class="an-tr pe-pos-row" onclick="expandPosition(this)" data-title="${dt}" data-slug="${slug}">
    <td class="an-td-market">
      <div class="an-market-name pe-pos-title">${escapeHtml(p.title || '—')}</div>
      <div class="an-prob-bar"><div class="an-prob-fill" style="width:${priceBar}%;background:${curP > 0.6 ? 'var(--green)' : curP < 0.4 ? 'var(--red)' : 'var(--yellow)'}"></div></div>
    </td>
    <td><span class="an-outcome-badge">${escapeHtml(p.outcome || '—')}</span></td>
    <td class="an-num" style="color:${curP > 0.6 ? 'var(--green)' : curP < 0.4 ? 'var(--red)' : 'var(--yellow)'}">${(curP * 100).toFixed(1)}¢</td>
    <td class="an-num">${(avgP * 100).toFixed(1)}¢</td>
    <td class="an-num">${szStr}</td>
    <td class="an-num">${valStr}</td>
    <td class="an-num ${pnlClass}">${formatSignedUsd(pnl)}</td>
    <td class="an-num ${pnlClass}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</td>
  </tr>`;
}

function formatTop3Html(arr, asWin) {
  if (!arr || !arr.length) return '<div class="an-empty-state">None</div>';
  return arr.map((p, i) => {
    const pnl = PM.positionTotalPnlRow(p);
    const ap = PM.pickNum(p, 'avgPrice', 'avg_price');
    const cp = PM.pickNum(p, 'curPrice', 'cur_price');
    return `<div class="pe-tw-row ${asWin ? 'pe-tw-up' : 'pe-tw-down'}"><span class="pe-tw-rank">${i + 1}</span><div class="pe-tw-body"><div class="pe-tw-title">${escapeHtml(p.title || '—')}</div><div class="pe-tw-meta">${(ap * 100).toFixed(1)}¢ avg · ${escapeHtml(p.outcome || '—')} · mark ${(cp * 100).toFixed(1)}¢</div></div><span class="pe-tw-pnl">${formatSignedUsd(pnl)}</span></div>`;
  }).join('');
}

function renderTopTradesBlock(s) {
  const best = s.best;
  const worst = s.worst;
  if (!best && !worst) return '<div class="an-empty-state">No position-level P&amp;L yet</div>';
  let out = '';
  if (best) out += `<div class="pe-tw-sec-h">Best bet</div>${formatTop3Html([best], true)}`;
  if (worst) out += `<div class="pe-tw-sec-h">Worst bet</div>${formatTop3Html([worst], false)}`;
  return out;
}

/** Rough percentile vs ~50% baseline (σ=15). For copy only — not a rigorous population study. */
function winRateVsPopulationPct(wr) {
  const sigma = 15;
  const z = (wr - 50) / sigma;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const Phi = z > 0 ? 1 - p : p;
  return Math.round(Math.max(0, Math.min(100, Phi * 100)));
}

function pickSnapshotHeadline(tier) {
  const pools = {
    great: ['Unstoppable', 'Chefs kiss', 'Built different', 'Printing', 'Main character energy'],
    good: ['Cooking', 'Solid run', 'Nice edge', 'Green machine', 'In the zone'],
    flat: ['Aight', 'Sideways', 'Breakeven-ish', 'Neutral NPC', 'Flat as a pancake'],
    weak: ['Slightly cooked', 'Leaky boat', 'Rough patch', 'Oof territory', 'Needs a bounce'],
    bad: ['Under water', 'Cooked', 'It’s giving drawdown', 'RIP streak', 'Send help'],
  };
  const arr = pools[tier] || pools.flat;
  return arr[Math.floor(Math.random() * arr.length)];
}

function renderThemeRadarBlock(s) {
  const order = ['Crypto', 'Politics', 'Sports', 'Macro', 'Other'];
  const tv = s.themeVolume || {};
  const tc = s.themeCounts || {};
  const vals = order.map(k => Math.max(0, tv[k] || 0));
  const maxV = Math.max(...vals, 1);
  const radii = vals.map(v => Math.sqrt(v / maxV));
  const cx = 120;
  const cy = 110;
  const R = 78;
  const pts = order.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / order.length;
    const r = R * (0.12 + 0.88 * radii[i]);
    return `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`;
  });
  const labels = order.map((name, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / order.length;
    const lx = cx + (R + 28) * Math.cos(ang);
    const ly = cy + (R + 28) * Math.sin(ang);
    const cnt = tc[name] || 0;
    return `<text class="pe-radar-lbl" x="${lx}" y="${ly}" text-anchor="middle">${name}<tspan class="pe-radar-cnt" x="${lx}" dy="1.15em">${cnt} pos.</tspan></text>`;
  }).join('');
  return `<div class="pe-radar-wrap">
    <svg class="pe-radar-svg" viewBox="0 0 240 240" aria-hidden="true">
      <polygon class="pe-radar-grid" points="${order.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / order.length;
    return `${cx + R * Math.cos(ang)},${cy + R * Math.sin(ang)}`;
  }).join(' ')}" />
      <polygon class="pe-radar-shape" points="${pts.join(' ')}" />
      ${labels}
    </svg>
    <p class="pe-theme-caption">Shape stretches toward themes with larger |P&amp;L| exposure; counts = position rows in that theme.</p>
  </div>`;
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
  if (analyticsData && analyticsData.stats) initPmCandleChart(analyticsData.stats);
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
  const snapHeadline = pickSnapshotHeadline(s.perfTier);
  const vsPop = winRateVsPopulationPct(s.winRate);

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
        <p class="pe-an-sub">On-chain portfolio from the Polymarket Data API. Total P&amp;L sums <strong>realizedPnl + cashPnl</strong> per position (closer to your profile than cashPnl alone). Still may differ slightly from polymarket.com timing.</p>
      </div>
      <button type="button" class="pe-refresh" onclick="fetchAndRenderAnalytics('${wallet}')"><span>↻</span> Refresh</button>
    </div>

    <div class="an-perf-hero pe-card-r pe-tier-${s.perfTier} pe-grad-hero pe-snap-deep">
      <div class="an-perf-copy">
        <div class="an-perf-kicker">Snapshot</div>
        <h2 class="an-perf-title">${snapHeadline}</h2>
        <p class="an-perf-sub">${s.perfSub}</p>
      </div>
      <div class="an-perf-stat">
        <div class="an-perf-big pe-tab-nums" style="color:${pnlColor}">${formatSignedUsd(s.totalCashPnl)}</div>
        <div class="an-perf-mini">Σ (realizedPnl + cashPnl) · ${s.totalTrades} fills · ${s.totalClosed} resolved books</div>
      </div>
    </div>

    <div class="an-kpis pe-kpis-r pe-kpi-soft pe-kpi-deep">
      <div class="an-kpi pe-kpi-g" data-tooltip="Per position: realizedPnl + cashPnl, then summed. This usually tracks Polymarket profile P&amp;L much better than cashPnl alone.">
        <div class="an-kpi-label">Total P&amp;L</div>
        <div class="an-kpi-val" style="color:${pnlColor}">${formatSignedUsd(s.totalCashPnl)}</div>
        <div class="an-kpi-sub">realized + cash (per row)</div>
      </div>
      <div class="an-kpi pe-kpi-g" data-tooltip="Sum of realizedPnl across all position rows from the API.">
        <div class="an-kpi-label">Realized P&amp;L</div>
        <div class="an-kpi-val" style="color:${rp}">${formatSignedUsd(s.totalRealizedPnl)}</div>
        <div class="an-kpi-sub">Σ realizedPnl</div>
      </div>
      <div class="an-kpi pe-kpi-g" data-tooltip="Sum of currentValue — mark-to-market on open books; dust on some resolved rows is normal.">
        <div class="an-kpi-label">Mark value</div>
        <div class="an-kpi-val">${formatSignedUsd(s.totalCurrentValue)}</div>
        <div class="an-kpi-sub">${s.open.length} live · ${s.allPositionsListed.length} rows</div>
      </div>
      <div class="an-kpi pe-kpi-g" data-tooltip="Resolved books only: wins ÷ (wins + losses). Win = price ≥ 99¢ or net P&amp;L &gt; 0 on that row.">
        <div class="an-kpi-label">Win rate</div>
        <div class="an-kpi-val" style="color:${s.winRate >= 50 ? 'var(--green)' : 'var(--red)'}">${s.winRate.toFixed(2)}%</div>
        <div class="an-kpi-sub">${s.won}W / ${s.lost}L resolved</div>
      </div>
      <div class="an-kpi pe-kpi-g" data-tooltip="Sum of absolute USDC size on each TRADE activity row (proxy for turnover).">
        <div class="an-kpi-label">Volume</div>
        <div class="an-kpi-val">$${s.totalVolume.toFixed(2)}</div>
        <div class="an-kpi-sub">${s.totalTrades} fills</div>
      </div>
    </div>

    <div class="an-grid pe-an-grid">
      <div class="an-card an-card-wide pe-card-r pe-grad-card pe-card-deep">
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
        <p class="pe-fineprint">Built from net USDC flow per day (activity). Line segments are green/red by direction; the <strong>fill under the whole curve</strong> matches the <strong>most recent</strong> move.</p>
      </div>

      <div class="an-card pe-card-r pe-grad-card pe-card-deep">
        <div class="an-card-header pe-card-head"><span class="an-card-title pe-card-title">Win rate</span></div>
        <div class="an-gauge-wrap">
          <canvas id="gauge-chart" width="220" height="130"></canvas>
          <div class="an-gauge-center">
            <div class="an-gauge-val pe-tab-nums" style="color:${s.winRate >= 50 ? 'var(--green)' : 'var(--red)'}">${s.winRate.toFixed(2)}%</div>
            <div class="an-gauge-sub">of ${s.totalClosed} resolved</div>
          </div>
        </div>
        <div class="an-wl-row">
          <div class="an-wl-item"><div class="an-wl-num" style="color:var(--green)">${s.won}</div><div class="an-wl-label">Won</div></div>
          <div class="an-wl-divider"></div>
          <div class="an-wl-item"><div class="an-wl-num" style="color:var(--red)">${s.lost}</div><div class="an-wl-label">Lost</div></div>
        </div>
        <div class="pe-win-blurb">
          <p class="pe-win-blurb-main">Rough cut vs a <strong>50%</strong> coin-flip baseline (σ≈15pts): you’re ahead of about <strong>${vsPop}%</strong> of traders <em>in this toy model</em> — not a scientific ranking.</p>
        </div>
      </div>

      <div class="an-card pe-card-r pe-grad-card pe-card-deep">
        <div class="an-card-header pe-card-head">
          <span class="an-card-title pe-card-title">Theme mix</span>
        </div>
        ${renderThemeRadarBlock(s)}
      </div>

      <div class="an-card pe-card-r pe-grad-card pe-card-deep">
        <div class="an-card-header pe-card-head">
          <span class="an-card-title pe-card-title">Leaders</span>
          <button type="button" class="pe-mini-btn" onclick="openPmTopTradesModal()">Expand</button>
        </div>
        ${renderTopTradesBlock(s)}
      </div>

      <div class="an-card an-card-wide pe-card-r pe-grad-card pe-card-deep" style="grid-column:1 / -1">
        <div class="an-card-header pe-card-head">
          <div>
            <span class="pe-card-kicker">Period open, high, low, close</span>
            <span class="an-card-title pe-card-title">Cumulative range (candles)</span>
          </div>
          <div class="pe-seg">
            <button type="button" class="pe-seg-btn pe-candle-tab active" data-per="week" onclick="pmSetCandlePeriod('week')">Week</button>
            <button type="button" class="pe-seg-btn pe-candle-tab" data-per="month" onclick="pmSetCandlePeriod('month')">Month</button>
            <button type="button" class="pe-seg-btn pe-candle-tab" data-per="year" onclick="pmSetCandlePeriod('year')">Year</button>
          </div>
        </div>
        <p class="pe-week-hint">Each candle: low / high = min / max <em>cumulative</em> P&amp;L in the period; body = open → close. <strong>Drag</strong> to pan time, <strong>wheel</strong> to zoom, <strong>Shift+wheel</strong> to stretch price. Tooltip docks in the chart corner.</p>
        <div class="pe-candle-host">
          ${hasCandles
            ? '<canvas id="candle-chart" tabindex="0"></canvas><div id="candle-tooltip" class="pe-candle-tip pe-candle-tip--dock" hidden></div>'
            : '<div class="an-empty-chart">Need more history</div>'}
        </div>
      </div>
    </div>

    <div class="an-card an-card-full pe-card-r pe-grad-card pe-pos-card pe-card-deep" style="margin-top:20px">
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
    if (hasCandles) initPmCandleChart(s);
    pmRefreshPositionsTable();
    initTooltips();
    loadAnalyticsCalendar(s);
  });
}

/** Wallet page: on-chain daily net; else evaluation closed trades when logged in */
async function loadAnalyticsCalendar(statsForWallet) {
  CalendarComponent.setWalletDaily([]);
  CalendarComponent.setWalletActivityByDay(null);
  CalendarComponent.setTrades([]);
  CalendarComponent.setMilestones([]);

  if (statsForWallet && statsForWallet.walletDailyCalendar && statsForWallet.walletDailyCalendar.length) {
    CalendarComponent.setWalletDaily(statsForWallet.walletDailyCalendar);
    CalendarComponent.setWalletActivityByDay(statsForWallet.activityByDay || null);
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

function formatPnlDialDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function pnlChartXTickLabel(iso, spanDays) {
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  if (spanDays > 700) return String(d.getFullYear() % 100);
  if (spanDays > 120) return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
  if (spanDays > 21) return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
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
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, 0);
    const range = max - min || 1;
    const w = W - pad.l - pad.r;
    const h = CH - pad.t - pad.b;
    const toX = (i) => pad.l + (vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2);
    const toY = (v) => pad.t + (1 - (v - min) / range) * h;
    const t0 = new Date((series[0].date || '') + 'T12:00:00');
    const t1 = new Date((series[series.length - 1].date || '') + 'T12:00:00');
    const spanDays = Number.isNaN(t0) || Number.isNaN(t1) ? 365 : Math.max(1, (t1 - t0) / 864e5);

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
    ctx.fillStyle = 'rgba(200,210,230,0.88)';
    const maxTicks = Math.max(3, Math.floor(w / 52));
    const step = Math.max(1, Math.ceil(vals.length / maxTicks));
    for (let i = 0; i < vals.length; i += step) {
      const lab = pnlChartXTickLabel(series[i].date || '', spanDays);
      ctx.fillText(lab, toX(i), CH - 10);
    }
    if ((vals.length - 1) % step !== 0) {
      const li = vals.length - 1;
      ctx.fillText(pnlChartXTickLabel(series[li].date || '', spanDays), toX(li), CH - 10);
    }

    const lastUp = vals.length >= 2 && vals[vals.length - 1] >= vals[vals.length - 2];
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(toX(i), toY(vals[i]));
    ctx.lineTo(toX(vals.length - 1), pad.t + h);
    ctx.lineTo(toX(0), pad.t + h);
    ctx.closePath();
    const ug = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
    if (lastUp) {
      ug.addColorStop(0, 'rgba(61,214,138,0.24)');
      ug.addColorStop(1, 'rgba(61,214,138,0.02)');
    } else {
      ug.addColorStop(0, 'rgba(248,113,113,0.24)');
      ug.addColorStop(1, 'rgba(248,113,113,0.02)');
    }
    ctx.fillStyle = ug;
    ctx.fill();

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

    if (hoverI === 0 && vals.length > 1) {
      ctx.font = "600 11px 'Plus Jakarta Sans',system-ui,sans-serif";
      ctx.fillStyle = 'rgba(220,232,255,0.95)';
      ctx.textAlign = 'left';
      ctx.fillText('🦕 This is the beginning', hx + 10, toY(vals[0]) - 8);
    }

    setPnlDialValue(series[hoverI].pnl, formatPnlDialDate(series[hoverI].date));
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

function initPmCandleChart(s) {
  const canvas = document.getElementById('candle-chart');
  const tip = document.getElementById('candle-tooltip');
  const host = canvas && canvas.closest('.pe-candle-host');
  if (!canvas || !host || !s) return;

  const pad = { t: 20, r: 14, b: 40, l: 56 };
  const CH = 300;

  function periodKey() {
    return window.__PM_CANDLE__ || 'week';
  }

  function fullSeries() {
    const p = periodKey();
    const raw = p === 'month' ? s.candlesMonth : p === 'year' ? s.candlesYear : s.candlesWeek;
    return (raw || []).slice();
  }

  let candles = fullSeries();
  if (!candles.length) return;

  const nAll = candles.length;
  if (!canvas._pmCandle || canvas._pmCandle.period !== periodKey() || canvas._pmCandle.nAll !== nAll) {
    const defaultVis = Math.max(6, Math.min(48, nAll));
    canvas._pmCandle = {
      period: periodKey(),
      nAll,
      i0: Math.max(0, nAll - defaultVis),
      nVis: defaultVis,
      yStretch: 1,
      yPan: 0,
      hoverIdx: -1,
    };
  }
  const view = canvas._pmCandle;
  view.period = periodKey();
  view.nAll = candles.length;
  candles = fullSeries();

  const ctx = canvas.getContext('2d');

  function clampView() {
    const n = candles.length;
    view.nVis = Math.max(6, Math.min(n, Math.round(view.nVis)));
    view.i0 = Math.max(0, Math.min(n - view.nVis, Math.round(view.i0)));
    view.yStretch = Math.max(0.55, Math.min(2.8, view.yStretch));
    view.yPan = Math.max(-1, Math.min(1, view.yPan));
  }

  function visibleSlice() {
    clampView();
    return candles.slice(view.i0, view.i0 + view.nVis);
  }

  function yRange(sub) {
    const lows = sub.map(c => c.low);
    const highs = sub.map(c => c.high);
    let mn = Math.min(...lows, 0);
    let mx = Math.max(...highs, 0);
    const span = (mx - mn) || 1;
    const padY = span * 0.1 * view.yStretch;
    const mid = (mn + mx) / 2 + view.yPan * span * 0.15;
    const half = (span / 2 + padY) * view.yStretch;
    return { mn: mid - half, mx: mid + half };
  }

  function fmtLb(c, per) {
    if (per === 'year') return c.key;
    if (per === 'month') return c.key;
    return (c.startDate || '').slice(5);
  }

  function drawFrame() {
    candles = fullSeries();
    if (!candles.length) return;
    const sub = visibleSlice();
    if (!sub.length) return;
    const W = host.clientWidth || canvas.parentElement.offsetWidth || 600;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = CH + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const { mn, mx } = yRange(sub);
    const range = mx - mn || 1;
    const w = W - pad.l - pad.r;
    const h = CH - pad.t - pad.b;
    const n = sub.length;
    const slot = w / Math.max(n, 1);
    const toY = v => pad.t + (1 - (v - mn) / range) * h;
    const per = periodKey();

    ctx.fillStyle = 'rgba(6,8,14,0.92)';
    ctx.fillRect(0, 0, W, CH);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let g = 0; g <= 4; g++) {
      const yy = pad.t + (g / 4) * h;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + w, yy);
      ctx.stroke();
    }

    const zY = toY(0);
    if (zY >= pad.t && zY <= pad.t + h) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, zY);
      ctx.lineTo(pad.l + w, zY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = "11px 'Plus Jakarta Sans',system-ui,sans-serif";
    ctx.fillStyle = 'rgba(240,245,255,0.92)';
    ctx.textAlign = 'right';
    [mx, (mn + mx) / 2, mn].forEach(v => {
      ctx.fillText(yAxisLabel(v), pad.l - 8, toY(v) + 4);
    });

    sub.forEach((c, i) => {
      const cx = pad.l + i * slot + slot / 2;
      const bodyW = Math.max(3, slot * 0.42);
      const yHi = toY(c.high);
      const yLo = toY(c.low);
      const yO = toY(c.open);
      const yC = toY(c.close);
      const top = Math.min(yO, yC);
      const bot = Math.max(yO, yC);
      const bull = c.close >= c.open;
      ctx.strokeStyle = bull ? 'rgba(52,180,120,0.85)' : 'rgba(230,90,90,0.85)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(cx, yHi);
      ctx.lineTo(cx, yLo);
      ctx.stroke();
      const bh = Math.max(bot - top, 2);
      ctx.fillStyle = bull ? '#2fa86a' : '#e05555';
      ctx.fillRect(cx - bodyW / 2, top, bodyW, bh);
      if (i === view.hoverIdx) {
        ctx.strokeStyle = 'rgba(147,197,253,0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - bodyW / 2 - 2, Math.min(top, yHi) - 2, bodyW + 4, Math.abs(yLo - yHi) + 4);
      }
    });

    ctx.fillStyle = 'rgba(190,200,220,0.75)';
    ctx.textAlign = 'center';
    const maxTicks = Math.max(2, Math.floor(n / 2));
    const st = Math.max(1, Math.ceil(n / maxTicks));
    for (let i = 0; i < n; i += st) {
      ctx.fillText(fmtLb(sub[i], per), pad.l + i * slot + slot / 2, CH - 10);
    }
    if ((n - 1) % st !== 0) {
      ctx.fillText(fmtLb(sub[n - 1], per), pad.l + (n - 1) * slot + slot / 2, CH - 10);
    }

    ctx.fillStyle = 'rgba(160,175,200,0.55)';
    ctx.font = "10px 'Plus Jakarta Sans',system-ui,sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText('Drag · wheel zoom · Shift+wheel price', pad.l, CH - 2);
  }

  function showTip(i) {
    const sub0 = visibleSlice();
    if (!tip || i < 0 || i >= sub0.length) {
      if (tip) tip.hidden = true;
      return;
    }
    const sub = sub0;
    const c = sub[i];
    if (!c) {
      tip.hidden = true;
      return;
    }
    const p = periodKey();
    tip.hidden = false;
    tip.innerHTML = `
      <div class="pe-tip-h">${p.toUpperCase()} · ${c.startDate} → ${c.endDate}</div>
      <div class="pe-tip-row"><span>Open (cum)</span><b>${formatSignedUsd(c.open)}</b></div>
      <div class="pe-tip-row"><span>High</span><b>${formatSignedUsd(c.high)}</b></div>
      <div class="pe-tip-row"><span>Low</span><b>${formatSignedUsd(c.low)}</b></div>
      <div class="pe-tip-row"><span>Close</span><b>${formatSignedUsd(c.close)}</b></div>
      <div class="pe-tip-row"><span>Δ in period</span><b>${formatSignedUsd(c.flow)}</b></div>
      <div class="pe-tip-row"><span>Active days</span><b>${c.days}</b></div>
      <div class="pe-tip-row"><span>|Daily flow| Σ</span><b>$${Number(c.volume).toFixed(2)}</b></div>`;
    tip.style.left = 'auto';
    tip.style.top = '10px';
    tip.style.right = '10px';
    tip.style.bottom = 'auto';
  }

  function indexFromMouse(localX, W) {
    const w = W - pad.l - pad.r;
    const n = visibleSlice().length;
    const slot = w / Math.max(n, 1);
    return Math.max(0, Math.min(n - 1, Math.floor((localX - pad.l) / slot)));
  }

  if (canvas._pmCandleCleanup) canvas._pmCandleCleanup();
  let drag = null;

  function onDown(e) {
    drag = { x: e.clientX, y: e.clientY, i0: view.i0, ys: view.yStretch, yp: view.yPan, shift: e.shiftKey };
  }
  function onCanvasMove(e) {
    if (drag) return;
    const rect = canvas.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const W = rect.width;
    view.hoverIdx = indexFromMouse(lx, W);
    drawFrame();
    showTip(view.hoverIdx);
  }
  function onWinMove(e) {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.shift) {
      view.yStretch = drag.ys * (1 - dy * 0.005);
      view.yPan = drag.yp + dy * 0.002;
    } else {
      const sub = visibleSlice();
      const n = sub.length;
      const w = W - pad.l - pad.r;
      const slot = w / Math.max(n, 1);
      view.i0 = drag.i0 - Math.round(dx / Math.max(slot, 1));
    }
    drawFrame();
    if (view.hoverIdx >= 0) showTip(view.hoverIdx);
  }
  function onUp() {
    drag = null;
  }
  function onLeave() {
    drag = null;
    view.hoverIdx = -1;
    drawFrame();
    if (tip) tip.hidden = true;
  }
  function onWheel(e) {
    e.preventDefault();
    if (e.shiftKey) {
      view.yStretch *= e.deltaY > 0 ? 1.06 : 0.94;
      view.yPan += (e.deltaY > 0 ? 0.04 : -0.04);
    } else {
      const factor = e.deltaY > 0 ? 1.1 : 0.91;
      const center = view.i0 + Math.floor(view.nVis / 2);
      view.nVis = Math.round(view.nVis * factor);
      clampView();
      view.i0 = Math.max(0, Math.min(candles.length - view.nVis, center - Math.floor(view.nVis / 2)));
    }
    clampView();
    drawFrame();
    if (view.hoverIdx >= 0) showTip(view.hoverIdx);
  }
  function onDblClick() {
    const n = candles.length;
    const dv = Math.max(6, Math.min(48, n));
    view.i0 = Math.max(0, n - dv);
    view.nVis = dv;
    view.yStretch = 1;
    view.yPan = 0;
    drawFrame();
  }

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onCanvasMove);
  window.addEventListener('mousemove', onWinMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDblClick);

  canvas._pmCandleCleanup = () => {
    canvas.removeEventListener('mousedown', onDown);
    canvas.removeEventListener('mousemove', onCanvasMove);
    window.removeEventListener('mousemove', onWinMove);
    window.removeEventListener('mouseup', onUp);
    canvas.removeEventListener('mouseleave', onLeave);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDblClick);
    canvas._pmCandleCleanup = null;
  };

  drawFrame();
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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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

  ctx.font = "600 9px 'Plus Jakarta Sans',system-ui,sans-serif";
  ctx.fillStyle = 'rgba(180,195,220,0.75)';
  ctx.textAlign = 'center';
  ctx.fillText('0%', cx - r - 2, cy + 16);
  ctx.fillText('50%', cx, cy - r - 8);
  ctx.fillText('100%', cx + r + 2, cy + 16);
}

function initTooltips() {
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const t = document.createElement('div');
      t.className = 'pe-an-tooltip';
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
      ${title ? `<a href="https://polymarket.com/predictions?query=${encodeURIComponent(title)}" target="_blank" class="an-poly-link">Search on Polymarket →</a>` : ''}
    </div>
  </td>`;
  row.parentNode.insertBefore(expand, row.nextSibling);
}

function truncate(s, n) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
