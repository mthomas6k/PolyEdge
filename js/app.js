
// ==========================================
// CONFIG (uses js/config.js — set window.__POLYEDGE_ENV in production to avoid hardcoding)
// ==========================================
var SUPABASE_URL = (typeof window !== 'undefined' && window.POLYEDGE_CONFIG) ? window.POLYEDGE_CONFIG.SUPABASE_URL : '';
var SUPABASE_KEY = (typeof window !== 'undefined' && window.POLYEDGE_CONFIG) ? window.POLYEDGE_CONFIG.SUPABASE_ANON_KEY : '';
function getCreateCheckoutUrl() {
  if (!SUPABASE_URL) return '';
  return SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/create-checkout';
}

function getFinalizeCheckoutUrl() {
  if (!SUPABASE_URL) return '';
  return SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/finalize-checkout';
}

function getSiteBaseUrl() {
  try {
    if (typeof window !== 'undefined' && window.POLYEDGE_CONFIG && window.POLYEDGE_CONFIG.SITE_BASE_URL) {
      return String(window.POLYEDGE_CONFIG.SITE_BASE_URL).replace(/\/$/, '');
    }
    const { origin, pathname } = window.location;
    if (!origin || origin === 'null') return '';
    const noFile = pathname.replace(/\/[^/]+\.html?$/i, '');
    if (noFile === '/' || noFile === '') return origin;
    return origin + (noFile.endsWith('/') ? noFile.slice(0, -1) : noFile);
  } catch (e) {
    return '';
  }
}

// ==========================================
// SUPABASE INIT (anon key only — never use service_role in frontend)
// ==========================================
var sb = typeof sb !== 'undefined' ? sb : null;
try {
  if (typeof supabase !== 'undefined' && supabase.createClient && SUPABASE_URL && SUPABASE_KEY) {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch(e) {
  console.warn('Supabase not loaded:', e);
}

let currentUser = null;
let currentProfile = null;
let activeEval = null;
let closingTradeId = null;

// ==========================================
// AUTH
// ==========================================
async function checkSession() {
  if (!sb) { updateAuthUI(false); return; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      await loadProfile();
      updateAuthUI(true);
      if (window.__POLYEDGE_IS_ADMIN__) {
        if (!window.__adminMarketCacheInterval && typeof PolymarketService !== 'undefined' && PolymarketService.fetchAllMarkets) {
          window.__adminMarketCacheInterval = setInterval(async () => {
            if (!window.__POLYEDGE_IS_ADMIN__) return;
            try {
              await PolymarketService.fetchAllMarkets(true);
            } catch (e) {
              console.warn('Admin market cache refresh failed:', e);
            }
          }, 90000);
        }
        if (!window.__adminMarketCachePrimed && typeof PolymarketService !== 'undefined' && PolymarketService.fetchAllMarkets) {
          window.__adminMarketCachePrimed = true;
          PolymarketService.fetchAllMarkets(true).catch(e => console.warn('Admin market cache prime failed:', e));
        }
      }
      // Load accounts after auth
      await AccountManager.loadAccounts();
      AccountManager.restoreSelection();
      syncActiveEval();
    } else {
      updateAuthUI(false);
    }
  } catch(e) {
    console.error('Session check failed:', e);
    updateAuthUI(false);
  }
}

async function loadProfile() {
  if (!sb || !currentUser) return;
  try {
    const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) currentProfile = data;
  } catch(e) { console.warn('Profile load failed:', e); }
}

function updateAuthUI(loggedIn) {
  if (!loggedIn) {
    if (window.__adminMarketCacheInterval) {
      clearInterval(window.__adminMarketCacheInterval);
      window.__adminMarketCacheInterval = null;
    }
    window.__adminMarketCachePrimed = false;
  }

  const prevAdmin = window.__POLYEDGE_IS_ADMIN__;
  window.__POLYEDGE_IS_ADMIN__ = !!(loggedIn && currentProfile && currentProfile.is_admin);
  if (window.__POLYEDGE_IS_ADMIN__ && !prevAdmin && typeof PolymarketService !== 'undefined' && PolymarketService.invalidateMarketsCache) {
    PolymarketService.invalidateMarketsCache();
  }

  const navUser = document.getElementById('nav-user');
  const authBtn = document.getElementById('nav-auth-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');

  const authEls = document.querySelectorAll('.auth-only');
  const adminEls = document.querySelectorAll('.admin-only');

  authEls.forEach(el => {
    if (!loggedIn) {
      el.style.display = 'none';
      return;
    }
    if (el.closest('.bottom-nav')) {
      el.style.display = 'block';
    } else if (el.closest('.mobile-nav-slip')) {
      el.style.display = 'flex';
    } else {
      el.style.display = 'inline-block';
    }
  });

  adminEls.forEach(el => {
    const shouldShow = loggedIn && currentProfile?.is_admin;
    if (!shouldShow) {
      el.style.display = 'none';
      return;
    }
    if (el.closest('.bottom-nav')) {
      el.style.display = 'block';
    } else {
      el.style.display = 'inline-block';
    }
  });

  if (loggedIn && navUser) {
    navUser.textContent = currentProfile?.display_name || currentUser?.email?.split('@')[0] || 'User';
    navUser.style.display = '';
    if (authBtn) authBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = '';
  } else {
    if (navUser) navUser.style.display = 'none';
    if (authBtn) authBtn.style.display = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

async function login() {
  if (!sb) return;
  const email = document.getElementById('login-email')?.value?.trim();
  const pass = document.getElementById('login-pass')?.value;
  const errEl = document.getElementById('login-err');
  if (errEl) errEl.style.display = 'none';
  if (!email || !pass) { showMsg(errEl, 'Please enter email and password', 'err'); return; }
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { showMsg(errEl, error.message, 'err'); return; }
  await checkSession();
  showPage('markets');
}

async function register() {
  if (!sb) return;
  const email = document.getElementById('reg-email')?.value?.trim();
  const pass = document.getElementById('reg-pass')?.value;
  const pass2 = document.getElementById('reg-pass2')?.value;
  const wallet = document.getElementById('reg-wallet')?.value?.trim() || '';
  const errEl = document.getElementById('reg-err');
  const okEl = document.getElementById('reg-ok');
  if (errEl) errEl.style.display = 'none';
  if (okEl) okEl.style.display = 'none';
  if (!email || !pass) { showMsg(errEl, 'Please fill in all fields', 'err'); return; }
  if (pass !== pass2) { showMsg(errEl, 'Passwords do not match', 'err'); return; }
  if (pass.length < 6) { showMsg(errEl, 'Password must be at least 6 characters', 'err'); return; }
  const { error } = await sb.auth.signUp({ email, password: pass });
  if (error) { showMsg(errEl, error.message, 'err'); return; }

  if (wallet && wallet.startsWith('0x')) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) {
        await sb.from('profiles').update({ polymarket_wallet: wallet }).eq('id', session.user.id);
      }
    } catch(e) {}
  }

  showMsg(okEl, 'Account created! You can now sign in.', 'ok');
  setTimeout(() => toggleAuth('login'), 1500);
}

async function logout() {
  if (sb) await sb.auth.signOut();
  currentUser = null; currentProfile = null; activeEval = null;
  updateAuthUI(false);
  showPage('home');
}

function toggleAuth(mode) {
  const loginEl = document.getElementById('auth-login');
  const regEl = document.getElementById('auth-register');
  if (loginEl) loginEl.style.display = mode === 'login' ? '' : 'none';
  if (regEl) regEl.style.display = mode === 'register' ? '' : 'none';
}

function showMsg(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = 'msg msg-' + type;
  el.style.display = 'block';
}

// ==========================================
// POLYMARKET EXPLORE UI (FundingPredictions-style)
// ==========================================
var PM_STATE = {
  raw: [],
  cat: 'all',
  sort: 'volume',
  hideSports: false,
  hideCrypto: false,
  query: '',
};

function marketsChromeHTML() {
  return `
    <div class="poly-markets-wrap">
      <div class="pm-toolbar">
        <div class="pm-toolbar-left">
          <span class="pm-kicker">Polymarket</span>
          <h3 class="pm-heading">Live markets</h3>
        </div>
        <div class="dash-markets-search pm-search">
          <input id="market-search-input" type="search" placeholder="Search markets…" autocomplete="off" oninput="handleMarketSearch(event)">
          <button type="button" class="form-btn pm-refresh" onclick="refreshMarkets()">↻ Refresh</button>
        </div>
      </div>
      <div class="pm-cat-row" id="pm-cat-pills"></div>
      <div class="pm-filter-row">
        <label class="pm-filter-label">Sort
          <select id="pm-sort" class="pm-select" onchange="polyMarketOnSort(this.value)">
            <option value="volume">Volume</option>
            <option value="liquidity">Liquidity</option>
            <option value="change">Yes price</option>
          </select>
        </label>
        <label class="pm-check"><input type="checkbox" id="pm-hide-sports" onchange="polyMarketOnToggleSports(this.checked)"> Hide sports</label>
        <label class="pm-check"><input type="checkbox" id="pm-hide-crypto" onchange="polyMarketOnToggleCrypto(this.checked)"> Hide crypto</label>
      </div>
      <div class="pm-layout">
        <div class="pm-main-col">
          <div id="pm-featured" class="pm-featured" style="display:none"></div>
          <div id="markets-grid" class="pm-market-grid"></div>
        </div>
        <aside class="pm-trending" id="pm-trending-sidebar" aria-label="Trending markets">
          <div class="pm-trend-head">Trending</div>
          <div id="pm-trending-list" class="pm-trend-list"></div>
        </aside>
      </div>
    </div>`;
}

function pmFmtVol(v) {
  const n = parseFloat(v) || 0;
  if (n > 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n > 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function pmFmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return '—';
  }
}

function pmHashStr(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Fake “price history” curve for diagram (no historical API). */
function pmSparklineSVG(slug, w, h, uid) {
  const n = 28;
  let seed = pmHashStr(slug);
  const pts = [];
  let v = 35 + (seed % 25);
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    v = Math.max(6, Math.min(94, v + (seed % 11) - 5));
    pts.push(v);
  }
  const step = w / (n - 1);
  let d = '';
  pts.forEach((p, i) => {
    const x = i * step;
    const y = h - (p / 100) * h;
    d += (i ? ' L ' : 'M ') + x.toFixed(1) + ',' + y.toFixed(1);
  });
  const gid = 'pmg' + uid;
  return `<svg class="pm-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3888e8"/><stop offset="1" stop-color="#3dd68a"/></linearGradient></defs><path d="${d}" fill="none" stroke="url(#${gid})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function pmMetricsHtml(pm) {
  const spread = Math.abs(pm.yesPrice - pm.noPrice);
  const spreadC = Math.round(spread * 100);
  const liqScore = Math.min(100, Math.log10(10 + pm.liquidity) * 18);
  const volScore = Math.min(100, Math.log10(10 + pm.volume) * 14);
  return `
    <div class="pm-metrics">
      <div class="pm-metric"><span class="pm-metric-l">Liquidity</span><div class="pm-metric-bar"><span style="width:${liqScore.toFixed(0)}%;background:linear-gradient(90deg,#3888e8,#3dd68a)"></span></div><span class="pm-metric-v">${pmFmtVol(pm.liquidity)}</span></div>
      <div class="pm-metric"><span class="pm-metric-l">Volume</span><div class="pm-metric-bar"><span style="width:${volScore.toFixed(0)}%;background:linear-gradient(90deg,#2a6cc4,#5aa6ff)"></span></div><span class="pm-metric-v">${pmFmtVol(pm.volume)}</span></div>
      <div class="pm-metric-row"><span>Yes / No spread</span><span class="pm-metric-strong">${spreadC}¢</span></div>
      <div class="pm-metric-row"><span>Implied Yes</span><span class="pm-metric-strong">${(pm.yesPrice * 100).toFixed(1)}¢</span></div>
    </div>`;
}

function getFilteredMarkets() {
  let list = PM_STATE.raw.slice();
  const q = PM_STATE.query.trim().toLowerCase();
  if (q.length > 1) {
    list = list.filter(m => {
      const t = (m.question || m.title || '').toLowerCase();
      const slug = (m.slug || '').toLowerCase();
      return t.includes(q) || slug.includes(q.replace(/\s+/g, '-'));
    });
  }
  if (PM_STATE.cat !== 'all') {
    list = list.filter(m => PolymarketService.marketBucket(m) === PM_STATE.cat);
  }
  if (PM_STATE.hideSports) {
    list = list.filter(m => PolymarketService.marketBucket(m) !== 'Sports');
  }
  if (PM_STATE.hideCrypto) {
    list = list.filter(m => PolymarketService.marketBucket(m) !== 'Crypto');
  }
  list.sort((a, b) => {
    const pa = PolymarketService.parseMarket(a);
    const pb = PolymarketService.parseMarket(b);
    if (PM_STATE.sort === 'liquidity') return pb.liquidity - pa.liquidity;
    if (PM_STATE.sort === 'change') return pb.yesPrice - pa.yesPrice;
    return pb.volume - pa.volume;
  });
  return list;
}

function buildCategoryPills(rawList) {
  const counts = {};
  (rawList || []).forEach(m => {
    const b = PolymarketService.marketBucket(m);
    counts[b] = (counts[b] || 0) + 1;
  });
  const order = ['Politics', 'Crypto', 'Sports', 'Tech', 'Culture', 'Economy', 'Other'];
  let html = `<button type="button" class="pm-pill${PM_STATE.cat === 'all' ? ' active' : ''}" onclick="polyMarketSetCat('all')">All <span class="pm-pill-n">${rawList.length}</span></button>`;
  order.forEach(cat => {
    const n = counts[cat] || 0;
    if (n === 0) return;
    html += `<button type="button" class="pm-pill${PM_STATE.cat === cat ? ' active' : ''}" onclick="polyMarketSetCat('${cat}')">${cat} <span class="pm-pill-n">${n}</span></button>`;
  });
  return html;
}

function renderPmCard(m, canBet, idx) {
  const pm = PolymarketService.parseMarket(m);
  const yesP = Math.round(pm.yesPrice * 100);
  const noP = Math.round(pm.noPrice * 100);
  const pct = yesP;
  const slug = pm.slug || '';
  const uid = pmHashStr(slug + idx) % 100000;
  const polyUrl = pm.question ? `https://polymarket.com/predictions?query=${encodeURIComponent(pm.question)}` : 'https://polymarket.com';
  const img = pm.image
    ? `<img class="pm-card-img" src="${String(pm.image).replace(/"/g, '&quot;')}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="pm-card-img pm-card-img-ph">◆</div>`;
  const dis = canBet ? '' : ' disabled';
  const onY = canBet ? `onclick="openMarketBetByIdx(${idx},'YES')"` : '';
  const onN = canBet ? `onclick="openMarketBetByIdx(${idx},'NO')"` : '';
  return `
    <article class="pm-card">
      <div class="pm-card-top">
        ${img}
        <div class="pm-card-headtext">
          <div class="pm-card-title-row">
            <h4 class="pm-card-title">${truncateStr(pm.question, 200)}</h4>
            <span class="pm-live-badge">⚡ Live</span>
          </div>
          <div class="pm-bucket">${PolymarketService.marketBucket(m)}</div>
        </div>
      </div>
      <div class="pm-card-mid">
        <div class="pm-card-mid-left">
          <div class="pm-card-chance"><span class="pm-pct">${pct}%</span> <span class="pm-chance-label">chance</span></div>
          <div class="pm-progress"><div class="pm-progress-fill" style="width:${Math.min(100, pct)}%"></div></div>
          ${pmMetricsHtml(pm)}
        </div>
        <div class="pm-card-mid-chart">${pmSparklineSVG(slug, 120, 56, uid)}</div>
      </div>
      <div class="pm-card-btns">
        <button type="button" class="pm-btn-yes market-price-btn market-price-yes${dis}" ${onY}>Yes ${yesP}¢</button>
        <button type="button" class="pm-btn-no market-price-btn market-price-no${dis}" ${onN}>No ${noP}¢</button>
      </div>
      <div class="pm-card-foot">
        <span class="pm-vol">${pmFmtVol(pm.volume)} vol</span>
        <a class="pm-poly-link" href="${polyUrl}" target="_blank" rel="noopener">View →</a>
        <span class="pm-exp">${pmFmtDate(pm.endDate)}</span>
      </div>
    </article>`;
}

function renderFeaturedCard(m, canBet, idx) {
  const pm = PolymarketService.parseMarket(m);
  const yesP = Math.round(pm.yesPrice * 100);
  const noP = Math.round(pm.noPrice * 100);
  const slug = pm.slug || '';
  const uid = pmHashStr('feat' + slug) % 100000;
  const polyUrl = pm.question ? `https://polymarket.com/predictions?query=${encodeURIComponent(pm.question)}` : 'https://polymarket.com';
  const dis = canBet ? '' : ' disabled';
  const onY = canBet ? `onclick="openMarketBetByIdx(${idx},'YES')"` : '';
  const onN = canBet ? `onclick="openMarketBetByIdx(${idx},'NO')"` : '';
  return `
    <div class="pm-featured-inner">
      <div class="pm-featured-grid">
        <div class="pm-featured-copy">
          <span class="pm-live-badge">Featured</span>
          <h3 class="pm-featured-title">${truncateStr(pm.question, 220)}</h3>
          <div class="pm-card-chance pm-featured-chance"><span class="pm-pct">${yesP}%</span> <span class="pm-chance-label">chance</span></div>
          <div class="pm-progress pm-featured-bar"><div class="pm-progress-fill" style="width:${Math.min(100, yesP)}%"></div></div>
          ${pmMetricsHtml(pm)}
          <div class="pm-featured-btns">
            <button type="button" class="pm-btn-yes market-price-btn market-price-yes${dis}" ${onY}>Yes ${yesP}¢</button>
            <button type="button" class="pm-btn-no market-price-btn market-price-no${dis}" ${onN}>No ${noP}¢</button>
          </div>
          <div class="pm-featured-meta">
            <span>${pmFmtVol(pm.volume)} volume</span>
            <a class="pm-poly-link" href="${polyUrl}" target="_blank" rel="noopener">View market →</a>
          </div>
        </div>
        <div class="pm-featured-chart-wrap">
          <div class="pm-featured-chart-label">Synthetic odds path</div>
          ${pmSparklineSVG(slug, 200, 100, uid)}
        </div>
      </div>
    </div>`;
}

function renderTrendRow(m, idx, canBet) {
  const pm = PolymarketService.parseMarket(m);
  const p = Math.round(pm.yesPrice * 100);
  const dis = canBet ? '' : ' disabled';
  const click = canBet ? `onclick="openMarketBetByIdx(${idx},'YES')"` : '';
  return `
    <button type="button" class="pm-trend-row${dis}" ${click}>
      <span class="pm-trend-pct">${p}%</span>
      <span class="pm-trend-q">${truncateStr(pm.question, 120)}</span>
      <span class="pm-trend-v">${pmFmtVol(pm.volume)}</span>
    </button>`;
}

function polyMarketRedraw() {
  const grid = document.getElementById('markets-grid');
  const feat = document.getElementById('pm-featured');
  const trend = document.getElementById('pm-trending-list');
  if (!grid) return;

  const filtered = getFilteredMarkets();
  const sel = typeof AccountManager !== 'undefined' ? AccountManager.getSelected() : null;
  const canBet = !!(sel && (sel.status === 'active' || sel.status === 'funded'));
  const searching = PM_STATE.query.trim().length > 1;

  if (!filtered.length) {
    grid.innerHTML = '<div class="market-loading">No markets match filters. Try another category or search.</div>';
    if (feat) {
      feat.style.display = 'none';
      feat.innerHTML = '';
    }
    if (trend) trend.innerHTML = '';
    return;
  }

  window.__PM_LAST_LIST = filtered;

  if (!searching && feat) {
    feat.style.display = 'block';
    feat.innerHTML = renderFeaturedCard(filtered[0], canBet, 0);
  } else if (feat) {
    feat.style.display = 'none';
    feat.innerHTML = '';
  }

  if (trend) {
    const n = searching ? 12 : 8;
    trend.innerHTML = filtered.slice(0, n).map((m, i) => renderTrendRow(m, i, canBet)).join('');
  }

  const startIdx = !searching && feat && filtered.length > 1 ? 1 : 0;
  const gridSlice = filtered.slice(startIdx);
  if (gridSlice.length === 0) {
    grid.innerHTML = '<div class="market-loading" style="padding:12px 0">Only one market in this view — see featured above.</div>';
  } else {
    grid.innerHTML = gridSlice.map((m, i) => renderPmCard(m, canBet, startIdx + i)).join('');
  }
}

function polyMarketSetCat(cat) {
  PM_STATE.cat = cat || 'all';
  const pills = document.getElementById('pm-cat-pills');
  if (pills && PM_STATE.raw.length) pills.innerHTML = buildCategoryPills(PM_STATE.raw);
  polyMarketRedraw();
}

function polyMarketOnSort(v) {
  PM_STATE.sort = v || 'volume';
  polyMarketRedraw();
}

function polyMarketOnToggleSports(on) {
  PM_STATE.hideSports = !!on;
  polyMarketRedraw();
}

function polyMarketOnToggleCrypto(on) {
  PM_STATE.hideCrypto = !!on;
  polyMarketRedraw();
}

function openMarketBetByIdx(idx, side) {
  const m = window.__PM_LAST_LIST && window.__PM_LAST_LIST[idx];
  if (!m) return;
  const pm = PolymarketService.parseMarket(m);
  const px = side === 'YES' ? pm.yesPrice : pm.noPrice;
  openMarketBet(pm.question, side, px);
}

function updateNavTicker(markets) {
  const el = document.getElementById('nav-market-ticker');
  if (!el) return;
  if (!markets || !markets.length) {
    el.classList.remove('on');
    el.innerHTML = '';
    document.body.classList.remove('has-nav-ticker');
    return;
  }
  const slice = markets.slice(0, 28);
  const parts = slice.map((m, i) => {
    const pm = PolymarketService.parseMarket(m);
    const p = Math.round(pm.yesPrice * 100);
    const q = escHtml(pm.question || '—');
    const up = (pmHashStr(pm.slug + i) % 2) === 0;
    const cls = up ? 'nav-tick-up' : 'nav-tick-down';
    const arrow = up ? '▲' : '▼';
    return `<span class="nav-tick-item"><span class="${cls}">${arrow} ${p}%</span> ${q}</span>`;
  });
  const track = parts.join('<span class="nav-tick-dot">·</span>');
  el.innerHTML = `<div class="nav-ticker-inner" aria-hidden="true"><div class="nav-ticker-track">${track}<span class="nav-tick-dot">·</span>${track}</div></div>`;
  el.classList.add('on');
  document.body.classList.add('has-nav-ticker');
}

// ==========================================
// DASHBOARD — Now with Polymarket Live Markets
// ==========================================
async function loadDashboard() {
  const container = document.getElementById('dash-content');
  if (!container) return;

  if (!currentUser || !sb) {
    container.innerHTML = '<div class="empty-state"><h3>Sign in to open Markets</h3><p>Create an account or sign in to trade and track evaluations.</p><button class="btn btn-primary" data-page="login">Sign In</button></div>';
    bindDataPage();
    return;
  }

  // Use AccountManager's selected account
  const selectedAccount = AccountManager.getSelected();
  if (!selectedAccount) {
    // Try loading accounts first
    await AccountManager.loadAccounts();
    const acct = AccountManager.getSelected();
    if (!acct) {
      activeEval = null;
      container.innerHTML = `
        <div class="dash-markets-only">
          <div class="pm-eval-banner">
            <div class="pm-eval-banner-text">
              <strong>No active evaluation.</strong> Browse markets below — start a challenge to place bets from PolyEdge.
            </div>
            <button type="button" class="btn btn-primary" data-page="challenges">View challenges</button>
          </div>
          <div class="dash-markets-section dash-markets-section--wide">
            ${marketsChromeHTML()}
          </div>
        </div>`;
      bindDataPage();
      loadLiveMarkets();
      return;
    }
    activeEval = acct;
  } else {
    activeEval = selectedAccount;
  }

  const e = activeEval;

  // Fetch trades for this evaluation
  const { data: trades } = await sb.from('trades').select('*').eq('evaluation_id', e.id).order('opened_at', { ascending: false });

  // *** FIXED BET CATEGORIZATION ***
  // Open bets: status === 'open' (active, not resolved, still exposed to market)
  // Closed bets: status === 'closed' (resolved, outcome determined, P&L finalized)
  const openTrades = (trades || []).filter(t => t.status === 'open');
  const closedTrades = (trades || []).filter(t => t.status === 'closed');

  const daysUsed = Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86400000);
  const daysTotal = Math.floor((new Date(e.expires_at).getTime() - new Date(e.created_at).getTime()) / 86400000);

  // *** Calculate P&L from CLOSED bets only ***
  const totalClosedPnl = closedTrades.reduce((s, t) => s + parseFloat(t.pnl || 0), 0);
  const profit = e.balance - e.starting_balance;
  const profitTarget = e.starting_balance * (e.profit_target_pct / 100);
  const ddUsed = e.high_water_mark > 0 ? ((e.high_water_mark - e.balance) / e.high_water_mark * 100) : 0;
  const ddLimit = e.max_drawdown_pct;
  const profitPct = profitTarget > 0 ? Math.min(100, (Math.max(0, profit) / profitTarget) * 100) : 0;

  // Consistency calculated from CLOSED bets only
  let consistencyOk = true;
  let largestPct = 0;
  const closedProfit = closedTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  if (closedProfit > 0 && closedTrades.length > 0) {
    const maxTrade = Math.max(...closedTrades.filter(t => t.pnl > 0).map(t => t.pnl), 0);
    largestPct = (maxTrade / closedProfit) * 100;
    consistencyOk = largestPct <= e.consistency_rule_pct;
  }

  const typeLabel = e.eval_type === '1-step' ? 'One-Step' : `Two-Step · Phase ${e.phase}`;
  const statusBadge = e.status === 'funded' ? '<span class="badge badge-ok">FUNDED</span>' :
    (e.status === 'active' ? `<span class="badge badge-ok">${typeLabel} · Day ${daysUsed} of ${daysTotal}</span>` :
    `<span class="badge badge-fail">${e.status.toUpperCase()}</span>`);

  container.innerHTML = `
    <div class="dash-markets-page">
      <div class="pm-eval-strip">
        <div class="pm-eval-strip-inner">
          <span class="pm-strip-badge">${statusBadge}</span>
          <span class="pm-strip-item"><span class="pm-strip-l">Balance</span><strong>${fmt(e.balance)}</strong></span>
          <span class="pm-strip-item"><span class="pm-strip-l">Day</span><strong>${daysUsed}/${daysTotal}</strong></span>
          <span class="pm-strip-item"><span class="pm-strip-l">P&amp;L vs target</span><strong class="${profit>=0?'pgrn':'pred'}">${fmt(Math.max(0,profit))} / ${fmt(profitTarget)}</strong></span>
          <span class="pm-strip-item"><span class="pm-strip-l">DD</span><strong>${ddUsed.toFixed(1)}%</strong></span>
          <a href="#" class="pm-strip-link" data-page="dashboard">Dashboard →</a>
          <a href="#" class="pm-strip-link" data-page="accounts">Accounts →</a>
        </div>
      </div>
      ${renderDashEvalHub(e, closedTrades)}
      <div class="dash-trades-stack">
        <div class="dp">
          <div class="dp-header"><div class="dp-title">Open Positions</div><div style="display:flex;gap:8px"><span class="dp-badge">${openTrades.length} Active</span><button class="form-btn" style="width:auto;padding:6px 16px;font-size:10px" onclick="openModal('trade-modal')">+ New Trade</button></div></div>
          ${openTrades.length ? `<table class="tbl"><thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Commission</th><th>Action</th></tr></thead><tbody>${openTrades.map(t=>`<tr><td>${t.contract_name}</td><td>${t.side}</td><td>${fmt(t.trade_size)}</td><td>${(t.entry_price*100).toFixed(1)}¢</td><td>${fmt(t.commission)}</td><td><button class="form-btn secondary" style="width:auto;padding:4px 12px;font-size:9px" onclick="openCloseModal('${t.id}','${t.contract_name}',${t.entry_price},'${t.side}',${t.trade_size})">Close</button></td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3);font-size:13px">No open positions</p>'}
        </div>
        <div class="dp">
          <div class="dp-header"><div class="dp-title">Trade History (Closed)</div><span class="dp-badge">${closedTrades.length} Closed</span></div>
          ${closedTrades.length ? `<table class="tbl"><thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Exit</th><th>P&L</th></tr></thead><tbody>${closedTrades.map(t=>`<tr><td>${t.contract_name}</td><td>${t.side}</td><td>${fmt(t.trade_size)}</td><td>${(t.entry_price*100).toFixed(1)}¢</td><td>${(t.exit_price*100).toFixed(1)}¢</td><td class="${t.pnl>=0?'pgrn':'pred'}">${t.pnl>=0?'+':''}${fmt(t.pnl)}</td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3);font-size:13px">No closed trades yet</p>'}
        </div>
      </div>
      <div id="dash-eval-calendar" class="dash-cal-shell"></div>
      <div class="dash-markets-section dash-markets-section--wide">
        ${marketsChromeHTML()}
      </div>
    </div>`;
  bindDataPage();

  CalendarComponent.setTrades(closedTrades);
  CalendarComponent.setMilestones([
    { at: e.expires_at, label: 'Phase deadline', kind: 'deadline' },
    ...(e.created_at ? [{ at: e.created_at, label: 'Eval started', kind: 'start' }] : [])
  ]);
  CalendarComponent.render('dash-eval-calendar');

  // Load live markets asynchronously
  loadLiveMarkets();
}

// ==========================================
// LIVE POLYMARKET MARKETS
// ==========================================
async function loadLiveMarkets(query) {
  const grid = document.getElementById('markets-grid');
  if (!grid) return;

  const q = (query || '').trim();
  PM_STATE.query = q;

  const sortEl = document.getElementById('pm-sort');
  if (sortEl) PM_STATE.sort = sortEl.value || 'volume';
  const hs = document.getElementById('pm-hide-sports');
  if (hs) PM_STATE.hideSports = hs.checked;
  const hc = document.getElementById('pm-hide-crypto');
  if (hc) PM_STATE.hideCrypto = hc.checked;

  grid.innerHTML = '<div class="market-loading"><div class="an-spinner" style="margin:0 auto 12px;width:24px;height:24px"></div>Loading markets…</div>';

  try {
    let markets;
    if (q.length > 1) {
      markets = await PolymarketService.searchMarkets(q);
    } else {
      markets = await PolymarketService.fetchAllMarkets(false);
    }

    if (!markets || markets.length === 0) {
      grid.innerHTML = '<div class="market-loading">No markets loaded. Deploy the <code style="color:var(--accent)">gamma-proxy</code> Supabase function (see <code>supabase/functions/gamma-proxy</code>) or retry — public CORS proxies often rate-limit.</div>';
      const pills = document.getElementById('pm-cat-pills');
      if (pills) pills.innerHTML = '';
      updateNavTicker([]);
      return;
    }

    PM_STATE.raw = markets;
    const pills = document.getElementById('pm-cat-pills');
    if (pills) pills.innerHTML = buildCategoryPills(markets);
    polyMarketRedraw();
    updateNavTicker(markets);
  } catch (e) {
    console.error('Failed to load markets:', e);
    grid.innerHTML = '<div class="market-loading">Failed to load markets. Check console. If you control Supabase, deploy <strong>gamma-proxy</strong> and refresh.</div>';
    updateNavTicker([]);
  }
}

let marketSearchTimeout;
function handleMarketSearch(e) {
  clearTimeout(marketSearchTimeout);
  const q = (e.target && e.target.value) ? e.target.value.trim() : '';
  marketSearchTimeout = setTimeout(() => loadLiveMarkets(q), 400);
}

function refreshMarkets() {
  if (typeof PolymarketService !== 'undefined' && PolymarketService.invalidateMarketsCache) {
    PolymarketService.invalidateMarketsCache();
  }
  const input = document.getElementById('market-search-input');
  loadLiveMarkets(input?.value?.trim() || '');
}

function profitCalc() {
  const szEl = document.getElementById('pf-size');
  const enEl = document.getElementById('pf-entry');
  const yEl = document.getElementById('pf-out-yes');
  const pEl = document.getElementById('pf-maxp');
  const wrEl = document.getElementById('pf-winrate');
  const rkEl = document.getElementById('pf-risk');
  const sumEl = document.getElementById('pf-trader-summary');
  if (!szEl || !enEl || !yEl || !pEl) return;
  const sz = parseFloat(szEl.value) || 0;
  const entry = (parseFloat(enEl.value) || 0) / 100;
  const winrate = wrEl ? (parseFloat(wrEl.value) || 50) / 100 : 0.5;
  const risk = rkEl ? rkEl.value : 'med';
  if (entry <= 0 || entry >= 1 || sz <= 0) {
    yEl.textContent = '—';
    pEl.textContent = '—';
    if (sumEl) sumEl.textContent = '';
    return;
  }
  const shares = sz / entry;
  const payoutIfYes = shares;
  yEl.textContent = '$' + payoutIfYes.toFixed(2);
  pEl.textContent = '$' + (payoutIfYes - sz).toFixed(2);

  if (sumEl) {
    const ev = winrate * (payoutIfYes - sz) - (1 - winrate) * sz;
    const riskNote =
      risk === 'low'
        ? 'You skew conservative — size down and favor liquid markets.'
        : risk === 'high'
          ? 'Higher risk posture: keep position size small vs. bankroll and cap single-market exposure.'
          : 'Balanced risk: split size across uncorrelated events.';
    const edge =
      ev > sz * 0.08
        ? '<strong>Positive expected value</strong> if your win rate holds — keep sizing disciplined.'
        : ev > 0
          ? 'Edge looks thin — small edge, high variance.'
          : '<strong>EV is negative</strong> at these inputs — you’d need a higher hit rate or cheaper entry.';
    sumEl.innerHTML =
      `<p><strong>Expected value (rough):</strong> ${ev >= 0 ? '+' : ''}$${ev.toFixed(2)} per trial <span style="color:var(--text3)">(ignores fees/slippage)</span>.</p>` +
      `<p>${edge}</p>` +
      `<p><strong>Profile:</strong> ${riskNote}</p>` +
      '<p style="color:var(--text3);font-size:13px;margin-top:8px">This is educational math only, not financial advice.</p>';
  }
}

function openMarketBet(marketName, side, price, retried) {
  syncActiveEval();
  if (!activeEval && !retried && typeof AccountManager !== 'undefined') {
    AccountManager.loadAccounts().then(() => {
      AccountManager.restoreSelection();
      syncActiveEval();
      openMarketBet(marketName, side, price, true);
    });
    return;
  }
  if (!activeEval) {
    alert('No active evaluation. Purchase a challenge or pick an account on the Accounts tab.');
    return;
  }
  if (activeEval.status !== 'active' && activeEval.status !== 'funded') {
    alert('This evaluation is not active — you cannot open new trades.');
    return;
  }
  document.getElementById('mbet-market-name').value = marketName;
  document.getElementById('mbet-market-info').textContent = marketName;
  document.getElementById('mbet-side').value = side;
  document.getElementById('mbet-entry').value = Math.round(price * 100);
  document.getElementById('mbet-size').value = '';
  const pctEl = document.getElementById('mbet-pct');
  if (pctEl) pctEl.value = '';
  const errEl = document.getElementById('mbet-err');
  if (errEl) errEl.style.display = 'none';
  updateMbetSummary();
  openModal('market-bet-modal');
}

function updateMbetSummary() {
  const sum = document.getElementById('mbet-summary');
  const prev = document.getElementById('mbet-preview');
  const ev = typeof AccountManager !== 'undefined' ? AccountManager.getSelected() : activeEval;
  if (!sum) return;
  if (!ev) {
    sum.innerHTML = 'Select an evaluation on the <strong>Accounts</strong> tab.';
    if (prev) prev.innerHTML = '';
    return;
  }
  const max = ev.balance * 0.15;
  sum.innerHTML = `Balance <strong>${fmt(ev.balance)}</strong> · Max trade (15%) <strong>${fmt(max)}</strong> · Commission ~1% of size`;
  const entry = parseFloat(document.getElementById('mbet-entry')?.value) / 100;
  const sz = parseFloat(document.getElementById('mbet-size')?.value) || 0;
  const side = document.getElementById('mbet-side')?.value || 'YES';
  if (prev && entry > 0 && entry < 1 && sz > 0) {
    if (side === 'YES') {
      const shares = sz / entry;
      const maxProfit = shares - sz;
      prev.innerHTML = `≈ <strong>${shares.toFixed(1)}</strong> YES shares · if YES wins, payout ~<strong>${fmt(shares)}</strong> · max gain <strong>${fmt(maxProfit)}</strong> <span class="mbet-prev-note">(model, not advice)</span>`;
    } else {
      const eNo = 1 - entry;
      const shares = eNo > 0 ? sz / eNo : 0;
      const maxProfit = shares > 0 ? shares - sz : 0;
      prev.innerHTML = eNo > 0
        ? `≈ <strong>${shares.toFixed(1)}</strong> NO shares · if NO wins, max gain ~<strong>${fmt(maxProfit)}</strong> <span class="mbet-prev-note">(model)</span>`
        : '';
    }
  } else if (prev) prev.innerHTML = '';
}

function syncMbetFromDollars() {
  const ev = typeof AccountManager !== 'undefined' ? AccountManager.getSelected() : activeEval;
  const bal = ev ? Number(ev.balance) : 0;
  const sz = parseFloat(document.getElementById('mbet-size')?.value) || 0;
  const pctEl = document.getElementById('mbet-pct');
  if (pctEl && bal > 0) pctEl.value = sz > 0 ? ((sz / bal) * 100).toFixed(2) : '';
  updateMbetSummary();
}

function syncMbetFromPct() {
  const ev = typeof AccountManager !== 'undefined' ? AccountManager.getSelected() : activeEval;
  const bal = ev ? Number(ev.balance) : 0;
  const pct = parseFloat(document.getElementById('mbet-pct')?.value) || 0;
  const szEl = document.getElementById('mbet-size');
  if (szEl && bal > 0 && pct > 0) szEl.value = ((pct / 100) * bal).toFixed(2);
  updateMbetSummary();
}

async function placeDashboardBet() {
  const errEl = document.getElementById('mbet-err');
  if (errEl) errEl.style.display = 'none';
  syncActiveEval();
  if (!activeEval || !sb) { showMsg(errEl, 'No active evaluation', 'err'); return; }
  if (activeEval.status !== 'active' && activeEval.status !== 'funded') {
    showMsg(errEl, 'This evaluation cannot accept new trades.', 'err'); return;
  }

  const name = document.getElementById('mbet-market-name')?.value;
  const side = document.getElementById('mbet-side')?.value;
  const size = parseFloat(document.getElementById('mbet-size')?.value);
  const entry = parseFloat(document.getElementById('mbet-entry')?.value) / 100;

  if (!name) { showMsg(errEl, 'No market selected', 'err'); return; }
  if (!size || size <= 0) { showMsg(errEl, 'Enter valid size', 'err'); return; }
  if (!entry || entry <= 0 || entry >= 1) { showMsg(errEl, 'Entry price must be between 1-99¢', 'err'); return; }
  if (size > activeEval.balance * 0.15) { showMsg(errEl, 'Max position size is 15% of balance', 'err'); return; }

  const commission = size * 0.01;

  const { error } = await sb.from('trades').insert({
    evaluation_id: activeEval.id,
    user_id: currentUser.id,
    contract_name: name,
    side: side,
    trade_size: size,
    entry_price: entry,
    commission: commission,
    status: 'open'
  });

  if (error) { showMsg(errEl, error.message, 'err'); return; }

  await sb.from('evaluations').update({
    balance: activeEval.balance - commission
  }).eq('id', activeEval.id);

  // Refresh account data
  await AccountManager.loadAccounts();
  closeModal('market-bet-modal');
  await loadDashboard();
}

function truncateStr(s, n) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initRiskPostureDropdown() {
  const hidden = document.getElementById('pf-risk');
  const btn = document.getElementById('pf-risk-dd-btn');
  const labelEl = document.getElementById('pf-risk-dd-label');
  const menu = document.getElementById('pf-risk-dd-menu');
  const root = document.getElementById('pf-risk-dd-root');
  if (!hidden || !btn || !labelEl || !menu || !root) return;
  const labels = { low: 'Conservative', med: 'Balanced', high: 'Aggressive' };
  function close() {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
  function open() {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }
  function sync() {
    labelEl.textContent = labels[hidden.value] || 'Balanced';
  }
  sync();
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open();
    else close();
  });
  menu.querySelectorAll('[data-risk]').forEach((opt) => {
    opt.addEventListener('click', () => {
      hidden.value = opt.getAttribute('data-risk') || 'med';
      sync();
      close();
      profitCalc();
    });
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

function fmt(n) { return '$' + Number(n || 0).toFixed(2); }

function syncActiveEval() {
  try {
    activeEval = typeof AccountManager !== 'undefined' ? AccountManager.getSelected() : null;
  } catch (e) {
    activeEval = null;
  }
}

async function finalizeCheckoutSession(sessionId) {
  if (!sb || !sessionId || !SUPABASE_URL) return { ok: false, error: 'Not configured' };
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { ok: false, error: 'Sign in required' };
  try {
    const res = await fetch(getFinalizeCheckoutUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ session_id: sessionId })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j.error || ('HTTP ' + res.status) };
    return j;
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  }
}

/** @param {object} e evaluation */
function evalGradeLabel(e, closedTrades) {
  const profit = (Number(e.balance) || 0) - (Number(e.starting_balance) || 0);
  const target = (Number(e.starting_balance) || 0) * ((Number(e.profit_target_pct) || 10) / 100);
  const st = e.status || '';
  if (st === 'passed' || st === 'funded') return { label: 'Challenge cleared', cls: 'pe-grade-elite', sub: 'Rules satisfied — outstanding.' };
  if (st === 'failed' || st === 'expired') return { label: 'Evaluation closed', cls: 'pe-grade-end', sub: st.charAt(0).toUpperCase() + st.slice(1) };
  const pct = target > 0 ? (profit / target) * 100 : 0;
  if (pct >= 100) return { label: 'Target in sight', cls: 'pe-grade-great', sub: 'Lock in consistency & minimum trades.' };
  if (pct >= 55) return { label: 'On track', cls: 'pe-grade-good', sub: 'Stay within drawdown & size limits.' };
  if (profit > 0) return { label: 'Profitable', cls: 'pe-grade-ok', sub: 'Building toward the profit target.' };
  if (profit === 0 || (profit > -1 && profit < 1)) return { label: 'Breakeven', cls: 'pe-grade-flat', sub: 'Capital preserved — look for edge.' };
  return { label: 'Under pressure', cls: 'pe-grade-risk', sub: 'Prioritize drawdown control.' };
}

function renderDashEvalHub(e, closedTrades) {
  const profit = e.balance - e.starting_balance;
  const profitTarget = e.starting_balance * (e.profit_target_pct / 100);
  const profitBar = profitTarget > 0 ? Math.min(100, (Math.max(0, profit) / profitTarget) * 100) : 0;
  const ddUsed = e.high_water_mark > 0 ? ((e.high_water_mark - e.balance) / e.high_water_mark * 100) : 0;
  const ddBar = e.max_drawdown_pct > 0 ? Math.min(100, (ddUsed / e.max_drawdown_pct) * 100) : 0;
  let largestPct = 0;
  let consistencyOk = true;
  const closedProfit = closedTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  if (closedProfit > 0 && closedTrades.length > 0) {
    const maxTrade = Math.max(...closedTrades.filter(t => t.pnl > 0).map(t => t.pnl), 0);
    largestPct = (maxTrade / closedProfit) * 100;
    consistencyOk = largestPct <= e.consistency_rule_pct;
  }
  const tradesProgress = Math.min(100, (e.trades_count / Math.max(1, e.min_trades)) * 100);
  const daysLeft = Math.max(0, Math.ceil((new Date(e.expires_at).getTime() - Date.now()) / 86400000));
  const g = evalGradeLabel(e, closedTrades);
  const phaseLine = e.eval_type === '1-step'
    ? '<div class="pe-phase-track"><span class="pe-phase-dot pe-phase-on">1</span><span class="pe-phase-line"></span><span class="pe-phase-dot">Funded</span></div>'
    : (e.phase === 1
      ? '<div class="pe-phase-track"><span class="pe-phase-dot pe-phase-on">P1</span><span class="pe-phase-line"></span><span class="pe-phase-dot">P2</span><span class="pe-phase-line"></span><span class="pe-phase-dot">Funded</span></div>'
      : '<div class="pe-phase-track"><span class="pe-phase-dot pe-phase-done">P1</span><span class="pe-phase-line pe-phase-line-on"></span><span class="pe-phase-dot pe-phase-on">P2</span><span class="pe-phase-line"></span><span class="pe-phase-dot">Funded</span></div>');

  return `
    <div class="dash-eval-hub pe-card-r">
      <div class="pe-hub-top">
        <div>
          <div class="pe-hub-kicker">Evaluation progress</div>
          <h3 class="pe-hub-title">${e.eval_type === '1-step' ? 'One-step challenge' : 'Two-step challenge'} · $${Number(e.account_size).toLocaleString()}</h3>
          ${phaseLine}
        </div>
        <div class="pe-grade-pill ${g.cls}">
          <div class="pe-grade-label">${g.label}</div>
          <div class="pe-grade-sub">${g.sub}</div>
        </div>
      </div>
      <div class="pe-hub-grid">
        <div class="pe-goal">
          <div class="pe-goal-h"><span>Profit target</span><span class="pe-goal-pct">${profitBar.toFixed(0)}%</span></div>
          <div class="pe-bar"><span style="width:${profitBar}%"></span></div>
          <div class="pe-goal-foot">${fmt(Math.max(0, profit))} / ${fmt(profitTarget)} · ${e.profit_target_pct}% rule</div>
        </div>
        <div class="pe-goal">
          <div class="pe-goal-h"><span>Drawdown used</span><span class="pe-goal-pct">${ddUsed.toFixed(1)}% / ${e.max_drawdown_pct}%</span></div>
          <div class="pe-bar pe-bar-warn"><span style="width:${ddBar}%"></span></div>
          <div class="pe-goal-foot">High water ${fmt(e.high_water_mark)}</div>
        </div>
        <div class="pe-goal">
          <div class="pe-goal-h"><span>Min closed trades</span><span class="pe-goal-pct">${e.trades_count} / ${e.min_trades}</span></div>
          <div class="pe-bar pe-bar-neutral"><span style="width:${tradesProgress}%"></span></div>
          <div class="pe-goal-foot">Counts toward pass rules</div>
        </div>
        <div class="pe-goal">
          <div class="pe-goal-h"><span>Consistency</span><span class="pe-goal-pct ${consistencyOk ? 'pgrn' : 'pred'}">${consistencyOk ? 'OK' : 'Watch'}</span></div>
          <div class="pe-goal-foot">Largest win vs gross profit: ${largestPct.toFixed(0)}% (max ${e.consistency_rule_pct}%)</div>
        </div>
      </div>
      <div class="pe-hub-deadline">
        <span class="pe-dl-ic">⏱</span>
        <strong>${daysLeft}</strong> day${daysLeft === 1 ? '' : 's'} left in this phase · deadline ${new Date(e.expires_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
      </div>
    </div>`;
}

// ==========================================
// TRADES
// ==========================================
async function openTrade() {
  const errEl = document.getElementById('trade-err');
  if (errEl) errEl.style.display = 'none';
  syncActiveEval();
  if (!activeEval || !sb) { showMsg(errEl, 'No active evaluation', 'err'); return; }
  if (activeEval.status !== 'active' && activeEval.status !== 'funded') {
    showMsg(errEl, 'This evaluation cannot accept new trades.', 'err'); return;
  }

  const name = document.getElementById('tr-name')?.value?.trim();
  const side = document.getElementById('tr-side')?.value;
  const size = parseFloat(document.getElementById('tr-size')?.value);
  const entry = parseFloat(document.getElementById('tr-entry')?.value) / 100;

  if (!name) { showMsg(errEl, 'Enter contract name', 'err'); return; }
  if (!size || size <= 0) { showMsg(errEl, 'Enter valid size', 'err'); return; }
  if (!entry || entry <= 0 || entry >= 1) { showMsg(errEl, 'Entry price must be between 1-99¢', 'err'); return; }
  if (size > activeEval.balance * 0.15) { showMsg(errEl, 'Max position size is 15% of balance', 'err'); return; }

  const commission = size * 0.01;

  const { error } = await sb.from('trades').insert({
    evaluation_id: activeEval.id,
    user_id: currentUser.id,
    contract_name: name,
    side: side,
    trade_size: size,
    entry_price: entry,
    commission: commission,
    status: 'open'
  });

  if (error) { showMsg(errEl, error.message, 'err'); return; }

  await sb.from('evaluations').update({
    balance: activeEval.balance - commission
  }).eq('id', activeEval.id);

  await AccountManager.loadAccounts();
  closeModal('trade-modal');
  const nameEl = document.getElementById('tr-name'); if (nameEl) nameEl.value = '';
  const sizeEl = document.getElementById('tr-size'); if (sizeEl) sizeEl.value = '';
  const entryEl = document.getElementById('tr-entry'); if (entryEl) entryEl.value = '';
  await loadDashboard();
}

function openCloseModal(tradeId, name, entry, side, size) {
  closingTradeId = tradeId;
  const info = document.getElementById('close-info');
  if (info) info.textContent = `${name} · ${side} · ${fmt(size)} @ ${(entry*100).toFixed(1)}¢`;
  const exitEl = document.getElementById('cl-exit'); if (exitEl) exitEl.value = '';
  const errEl = document.getElementById('close-err'); if (errEl) errEl.style.display = 'none';
  openModal('close-modal');
}

async function closeTrade() {
  if (!sb) return;
  syncActiveEval();
  const errEl = document.getElementById('close-err');
  if (errEl) errEl.style.display = 'none';
  const exitPrice = parseFloat(document.getElementById('cl-exit')?.value) / 100;
  if (!exitPrice || exitPrice <= 0 || exitPrice >= 1) { showMsg(errEl, 'Exit price must be 1-99¢', 'err'); return; }

  const { data: trade } = await sb.from('trades').select('*').eq('id', closingTradeId).single();
  if (!trade) { showMsg(errEl, 'Trade not found', 'err'); return; }

  let pnl;
  if (trade.side === 'YES') {
    pnl = (exitPrice - trade.entry_price) * (trade.trade_size / trade.entry_price);
  } else {
    pnl = (trade.entry_price - exitPrice) * (trade.trade_size / (1 - trade.entry_price));
  }
  pnl = Math.round(pnl * 100) / 100;

  // Mark trade as CLOSED with finalized P&L
  await sb.from('trades').update({
    exit_price: exitPrice, pnl: pnl, status: 'closed', closed_at: new Date().toISOString()
  }).eq('id', closingTradeId);

  const e = activeEval;
  const newBalance = e.balance + pnl;
  const newHWM = Math.max(e.high_water_mark, newBalance);
  const newTotalProfit = pnl > 0 ? e.total_profit + pnl : e.total_profit;
  const newTotalLoss = pnl < 0 ? e.total_loss + Math.abs(pnl) : e.total_loss;
  const newLargest = pnl > 0 ? Math.max(e.largest_trade_profit, pnl) : e.largest_trade_profit;

  const updateData = {
    balance: newBalance, high_water_mark: newHWM, trades_count: e.trades_count + 1,
    total_profit: newTotalProfit, total_loss: newTotalLoss, largest_trade_profit: newLargest
  };

  const ddPct = newHWM > 0 ? ((newHWM - newBalance) / newHWM) * 100 : 0;
  if (ddPct >= e.max_drawdown_pct) updateData.status = 'failed';

  const profitPct = ((newBalance - e.starting_balance) / e.starting_balance) * 100;
  if (profitPct >= e.profit_target_pct && e.trades_count + 1 >= e.min_trades) {
    const consistencyPct = newTotalProfit > 0 ? (newLargest / newTotalProfit) * 100 : 0;
    if (consistencyPct <= e.consistency_rule_pct) {
      if (e.eval_type === '1-step') {
        updateData.status = 'passed';
      } else if (e.phase === 1) {
        Object.assign(updateData, {
          phase: 2, profit_target_pct: 4, total_profit: 0, total_loss: 0,
          largest_trade_profit: 0, trades_count: 0, balance: e.starting_balance,
          high_water_mark: e.starting_balance,
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
        });
      } else {
        updateData.status = 'passed';
      }
    }
  }

  await sb.from('evaluations').update(updateData).eq('id', e.id);
  await AccountManager.loadAccounts();
  closeModal('close-modal');
  await loadDashboard();
}

// ==========================================
// LEADERBOARD — Improved
// ==========================================
async function loadLeaderboard() {
  const container = document.getElementById('lb-content');
  if (!container) return;
  if (!sb) {
    container.innerHTML = renderEmptyLeaderboard();
    return;
  }

  const { data } = await sb.from('leaderboard').select('*');
  if (!data || data.length === 0) {
    container.innerHTML = renderEmptyLeaderboard();
    return;
  }

  container.innerHTML = `<div class="lb-shell"><div class="lb-shell-head"><h2 class="lb-title">Top performers</h2><p class="lb-sub">Funded &amp; passed traders by return</p></div><div class="lb-table-wrap"><table class="lb-table"><thead><tr><th>Rank</th><th>Trader</th><th>Account</th><th>Type</th><th>Return</th><th>Trades</th><th>Status</th></tr></thead><tbody>${data.map((r,i)=>{
    const rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
    return `<tr><td class="lb-rank ${rankClass}">${i+1}</td><td>${r.trader}</td><td>$${r.account_size}</td><td>${r.eval_type}</td><td style="color:var(--green)">+${r.return_pct}%</td><td>${r.trades_count}</td><td><span class="badge badge-ok">${r.status}</span></td></tr>`;
  }).join('')}</tbody></table></div></div>`;
}

function renderEmptyLeaderboard() {
  return `
    <div class="lb-shell lb-shell-empty">
    <div class="lb-shell-head"><h2 class="lb-title">Leaderboard</h2><p class="lb-sub">Be the first funded trader on the board</p></div>
    <div class="lb-table-wrap">
    <table class="lb-table">
      <thead>
        <tr><th>Rank</th><th>Trader</th><th>Account</th><th>Type</th><th>Return</th><th>Trades</th><th>Win Rate</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr class="lb-empty-row"><td colspan="8">No funded traders yet — be the first to pass an evaluation</td></tr>
        <tr class="lb-empty-row"><td>1</td><td style="color:var(--text3)">—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
        <tr class="lb-empty-row"><td>2</td><td style="color:var(--text3)">—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
        <tr class="lb-empty-row"><td>3</td><td style="color:var(--text3)">—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
        <tr class="lb-empty-row"><td>4</td><td style="color:var(--text3)">—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
        <tr class="lb-empty-row"><td>5</td><td style="color:var(--text3)">—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
      </tbody>
    </table></div></div>`;
}

// ==========================================
// ACCOUNTS PAGE
// ==========================================
async function loadAccounts() {
  if (!currentUser || !sb) {
    const container = document.getElementById('accounts-content');
    if (container) {
      container.innerHTML = '<div class="empty-state"><h3>Sign in to view accounts</h3><p>Access your evaluation accounts.</p><button class="btn btn-primary" data-page="login">Sign In</button></div>';
      bindDataPage();
    }
    return;
  }
  await AccountManager.loadAccounts();
  AccountManager.renderAccountSelector('accounts-content');
}

// ==========================================
// SETTINGS PAGE
// ==========================================
function loadSettings() {
  if (!currentUser || !currentProfile) {
    const status = document.getElementById('settings-status');
    if (status) {
      status.textContent = 'Sign in to manage settings';
      status.className = 'settings-status warn';
    }
    return;
  }
  const firstEl = document.getElementById('settings-first-name');
  const lastEl = document.getElementById('settings-last-name');
  const displayEl = document.getElementById('settings-display-name');
  const walletEl = document.getElementById('settings-wallet');
  if (firstEl) firstEl.value = currentProfile.first_name || '';
  if (lastEl) lastEl.value = currentProfile.last_name || '';
  if (displayEl) displayEl.value = currentProfile.display_name || '';
  if (walletEl) walletEl.value = currentProfile.polymarket_wallet || '';
  const status = document.getElementById('settings-status');
  if (status) {
    status.textContent = '';
    status.className = 'settings-status';
  }
}

async function saveSettings() {
  if (!sb || !currentUser) return;
  const first = document.getElementById('settings-first-name')?.value?.trim() || '';
  const last = document.getElementById('settings-last-name')?.value?.trim() || '';
  const display = document.getElementById('settings-display-name')?.value?.trim() || '';
  const wallet = document.getElementById('settings-wallet')?.value?.trim() || '';
  const status = document.getElementById('settings-status');
  if (status) {
    status.textContent = 'Saving...';
    status.className = 'settings-status saving';
  }
  try {
    const { error, data } = await sb.from('profiles')
      .update({
        first_name: first || null,
        last_name: last || null,
        display_name: display || null,
        polymarket_wallet: wallet || null
      })
      .eq('id', currentUser.id)
      .select()
      .single();
    if (error) throw error;
    currentProfile = data || currentProfile;
    if (status) {
      status.textContent = 'Saved';
      status.className = 'settings-status ok';
    }
    updateAuthUI(true);
  } catch (e) {
    console.error('saveSettings failed:', e);
    if (status) {
      status.textContent = e.message || 'Failed to save';
      status.className = 'settings-status err';
    }
  }
}

// ==========================================
// POLYEDGE INTERNAL STATS (Supabase-only)
// ==========================================
/** Weekly endpoints of cumulative P&L (Monday buckets) — mirrors wallet analytics */
function buildEvalWeeklyCumPoints(cumPnl) {
  if (!cumPnl || !cumPnl.length) return [];
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
  const groups = new Map();
  cumPnl.forEach(pt => {
    const k = mondayKeyFromDateStr(pt.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(pt);
  });
  const keys = [...groups.keys()].sort();
  return keys.map(k => {
    const pts = groups.get(k);
    const last = pts[pts.length - 1];
    return { date: last.date, pnl: last.pnl };
  });
}

function dashYAxisLabel(v) {
  if (typeof yAxisLabel === 'function') return yAxisLabel(v);
  if (v > 0) return '+' + '$' + Math.abs(v).toFixed(0);
  if (v < 0) return '\u2212$' + Math.abs(v).toFixed(0);
  return '$0';
}

function dashFormatSigned(n) {
  if (typeof formatSignedUsd === 'function') return formatSignedUsd(n);
  const x = Number(n) || 0;
  const a = Math.abs(x).toFixed(2);
  if (x > 0) return '+' + '$' + a;
  if (x < 0) return '\u2212$' + a;
  return '$' + a;
}

let statsPnlDialAnim = null;
function setStatsPnlDialValue(pnl, dateStr) {
  const valEl = document.getElementById('stats-pnl-dial-value');
  const dateEl = document.getElementById('stats-pnl-dial-date');
  if (!valEl) return;
  const target = Number(pnl) || 0;
  const start = statsPnlDialAnim ? statsPnlDialAnim.current : target;
  if (statsPnlDialAnim) cancelAnimationFrame(statsPnlDialAnim.raf);
  const t0 = performance.now();
  const dur = 180;
  function tick(now) {
    const t = Math.min(1, (now - t0) / dur);
    const ease = 1 - (1 - t) * (1 - t);
    const cur = start + (target - start) * ease;
    statsPnlDialAnim = { current: cur, raf: null };
    valEl.textContent = dashFormatSigned(cur);
    valEl.style.color = cur >= 0 ? 'var(--green)' : 'var(--red)';
    if (dateEl) dateEl.textContent = dateStr || '';
    if (t < 1) statsPnlDialAnim.raf = requestAnimationFrame(tick);
  }
  statsPnlDialAnim = { current: start, raf: requestAnimationFrame(tick) };
}

function dashPnlSeries() {
  const d = window.__DASH_PNL_DATA__;
  if (!d || !d.daily || !d.daily.length) return [];
  const mode = window.__DASH_PNL_MODE__ || 'day';
  if (mode === 'week' && d.weekly && d.weekly.length) return d.weekly;
  return d.daily;
}

window.dashSetPnlMode = function (mode) {
  window.__DASH_PNL_MODE__ = mode;
  document.querySelectorAll('.pe-dash-pnl-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });
  initDashboardPnlChart();
};

function initDashboardPnlChart() {
  const canvas = document.getElementById('stats-pnl-chart');
  if (!canvas || !window.__DASH_PNL_DATA__) return;
  const pad = { t: 22, r: 18, b: 40, l: 58 };
  const CH = 240;
  let hoverI = 0;

  function drawFrame() {
    const series = dashPnlSeries();
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
    const toX = i => pad.l + (vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2);
    const toY = v => pad.t + (1 - (v - min) / range) * h;

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
      ctx.fillText(dashYAxisLabel(v), pad.l - 8, toY(v) + 4);
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

    setStatsPnlDialValue(series[hoverI].pnl, series[hoverI].date);
  }

  hoverI = Math.max(0, dashPnlSeries().length - 1);
  drawFrame();

  if (canvas._dashPnlMove) {
    canvas.removeEventListener('mousemove', canvas._dashPnlMove);
    canvas.removeEventListener('mouseleave', canvas._dashPnlLeave);
  }
  canvas._dashPnlMove = e => {
    const series = dashPnlSeries();
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
  canvas._dashPnlLeave = () => {
    const series = dashPnlSeries();
    hoverI = Math.max(0, series.length - 1);
    drawFrame();
  };
  canvas.addEventListener('mousemove', canvas._dashPnlMove);
  canvas.addEventListener('mouseleave', canvas._dashPnlLeave);

  if (!window._dashPnlResizeBound) {
    window._dashPnlResizeBound = true;
    window.addEventListener('resize', () => {
      if (document.getElementById('stats-pnl-chart') && window.__DASH_PNL_DATA__) initDashboardPnlChart();
    });
  }
}

async function loadPolyEdgeStats() {
  const container = document.getElementById('stats-content');
  if (!container) return;
  if (!currentUser || !sb) {
    container.innerHTML = '<div class="an-center"><div class="an-connect-box"><h2>Sign In to View Dashboard</h2><p>Your evaluation dashboard is only available when you are logged in.</p><button class="form-btn" data-page="login">Sign In →</button></div></div>';
    bindDataPage();
    return;
  }

  const selectedAccount = AccountManager.getSelected();
  if (!selectedAccount) {
    container.innerHTML = '<div class="an-center"><div class="an-connect-box"><h2>No Active Evaluation</h2><p>Select an account on the Accounts page to view its stats.</p><button class="form-btn" data-page="accounts">View Accounts →</button></div></div>';
    bindDataPage();
    return;
  }

  container.innerHTML = '<div class="an-center"><div class="an-loading"><div class="an-spinner"></div><div class="an-loading-text">Loading dashboard<span class="an-dots"></span></div></div></div>';
  let d = 0;
  const iv = setInterval(() => {
    const dotsEl = container.querySelector('.an-dots');
    if (!dotsEl) { clearInterval(iv); return; }
    dotsEl.textContent = ['.', '..', '...'][d++ % 3];
  }, 400);

  try {
    const { data: trades } = await sb.from('trades')
      .select('*')
      .eq('evaluation_id', selectedAccount.id)
      .eq('status', 'closed')
      .order('closed_at', { ascending: true });
    const closedTrades = trades || [];

    const totalPnl = closedTrades.reduce((s, t) => s + parseFloat(t.pnl || 0), 0);
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl < 0);
    const winRate = closedTrades.length ? (wins.length / closedTrades.length * 100) : 0;
    const bestTrade = closedTrades.reduce((b, t) => (b === null || t.pnl > b.pnl) ? t : b, null);
    const worstTrade = closedTrades.reduce((b, t) => (b === null || t.pnl < b.pnl) ? t : b, null);

    const dailyPnl = {};
    closedTrades.forEach(t => {
      const day = (t.closed_at || '').slice(0, 10);
      if (!day) return;
      if (!dailyPnl[day]) dailyPnl[day] = 0;
      dailyPnl[day] += parseFloat(t.pnl || 0);
    });
    const days = Object.keys(dailyPnl).sort();
    let cum = 0;
    const cumPnl = days.map(d => {
      cum += dailyPnl[d];
      return { date: d, pnl: parseFloat(cum.toFixed(2)) };
    });

    container.innerHTML = `
      <div class="an-header pe-dash-head">
        <div class="an-header-left">
          <h1 class="an-title">Evaluation dashboard</h1>
          <div class="an-wallet-badge" style="margin-top:8px">
            <span class="an-wallet-dot"></span>
            <span class="an-wallet-addr">$${Number(selectedAccount.account_size).toLocaleString()} · ${selectedAccount.eval_type} · Phase ${selectedAccount.phase}</span>
          </div>
        </div>
      </div>

      ${renderDashEvalHub(selectedAccount, closedTrades)}

      <div class="an-kpis pe-kpis-r">
        <div class="an-kpi">
          <div class="an-kpi-label">Total P&L</div>
          <div class="an-kpi-val" style="color:${totalPnl >= 0 ? 'var(--green)' : 'var(--red)'}">${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}</div>
          <div class="an-kpi-sub">closed trades only</div>
        </div>
        <div class="an-kpi">
          <div class="an-kpi-label">Win Rate</div>
          <div class="an-kpi-val" style="color:${winRate >= 50 ? 'var(--green)' : 'var(--red)'}">${winRate.toFixed(1)}%</div>
          <div class="an-kpi-sub">${wins.length}W / ${losses.length}L</div>
        </div>
        <div class="an-kpi">
          <div class="an-kpi-label">Closed Trades</div>
          <div class="an-kpi-val">${closedTrades.length}</div>
          <div class="an-kpi-sub">PolyEdge platform only</div>
        </div>
        <div class="an-kpi">
          <div class="an-kpi-label">Best Trade</div>
          <div class="an-kpi-val" style="color:var(--green)">${bestTrade ? ('+$' + Number(bestTrade.pnl).toFixed(2)) : '$0.00'}</div>
          <div class="an-kpi-sub">${bestTrade ? (bestTrade.contract_name || '—') : '—'}</div>
        </div>
        <div class="an-kpi">
          <div class="an-kpi-label">Worst Trade</div>
          <div class="an-kpi-val" style="color:var(--red)">${worstTrade ? ('$' + Number(worstTrade.pnl).toFixed(2)) : '$0.00'}</div>
          <div class="an-kpi-sub">${worstTrade ? (worstTrade.contract_name || '—') : '—'}</div>
        </div>
      </div>

      <div class="an-grid">
        <div class="an-card an-card-wide pe-card-r pe-grad-card">
          <div class="an-card-header pe-card-head">
            <div>
              <span class="pe-card-kicker">Evaluation</span>
              <span class="an-card-title pe-card-title">Cumulative P&amp;L path</span>
            </div>
            <div class="pe-seg pe-pnl-tabs">
              <button type="button" class="pe-seg-btn pe-dash-pnl-tab active" data-mode="day" onclick="dashSetPnlMode('day')">Daily</button>
              <button type="button" class="pe-seg-btn pe-dash-pnl-tab" data-mode="week" onclick="dashSetPnlMode('week')">Weekly</button>
              <button type="button" class="pe-seg-btn pe-dash-pnl-tab" data-mode="all" onclick="dashSetPnlMode('all')">All time</button>
            </div>
          </div>
          <div class="pe-pnl-dial">
            <div class="pe-pnl-dial-label">Cumulative (hover chart)</div>
            <div id="stats-pnl-dial-value" class="pe-pnl-dial-val pe-tab-nums">${cumPnl.length ? dashFormatSigned(cumPnl[cumPnl.length - 1].pnl) : '—'}</div>
            <div id="stats-pnl-dial-date" class="pe-pnl-dial-date">${cumPnl.length ? cumPnl[cumPnl.length - 1].date : ''}</div>
          </div>
          ${cumPnl.length ? '<div class="an-chart-wrap an-chart-interactive pe-chart-shade"><canvas id="stats-pnl-chart"></canvas></div>' : '<div class="an-empty-chart">No closed trades yet</div>'}
          <p class="pe-fineprint">Built from closed-trade P&amp;L by day. Green / red segments = up / down vs previous point.</p>
        </div>

        <div class="an-card">
          <div class="an-card-header"><span class="an-card-title">Best Trade</span></div>
          ${bestTrade ? `
            <div class="an-bw-item an-bw-best">
              <div class="an-bw-label">↑ Best Trade</div>
              <div class="an-bw-title">${truncate(bestTrade.contract_name || '—', 40)}</div>
              <div class="an-bw-val" style="color:var(--green)">+$${Number(bestTrade.pnl).toFixed(2)}</div>
            </div>` : '<div class="an-empty-state">No closed trades yet</div>'}
        </div>

        <div class="an-card">
          <div class="an-card-header"><span class="an-card-title">Worst Trade</span></div>
          ${worstTrade ? `
            <div class="an-bw-item an-bw-worst">
              <div class="an-bw-label">↓ Worst Trade</div>
              <div class="an-bw-title">${truncate(worstTrade.contract_name || '—', 40)}</div>
              <div class="an-bw-val" style="color:var(--red)">$${Number(worstTrade.pnl).toFixed(2)}</div>
            </div>` : '<div class="an-empty-state">No closed trades yet</div>'}
        </div>

        <div class="an-card">
          <div class="an-card-header"><span class="an-card-title">Summary</span></div>
          <div class="an-tooltip">
            Closed trades only. P&L and win rate are based on trades recorded through the PolyEdge platform.
          </div>
        </div>
      </div>

      <div id="stats-calendar"></div>
    `;

    if (cumPnl.length) {
      window.__DASH_PNL_DATA__ = { daily: cumPnl, weekly: buildEvalWeeklyCumPoints(cumPnl) };
      window.__DASH_PNL_MODE__ = 'day';
      requestAnimationFrame(() => initDashboardPnlChart());
    } else {
      window.__DASH_PNL_DATA__ = null;
    }

    await (async () => {
      const { data: allClosed } = await sb.from('trades')
        .select('*')
        .eq('evaluation_id', selectedAccount.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });
      CalendarComponent.setTrades(allClosed || []);
      CalendarComponent.setMilestones([
        { at: selectedAccount.expires_at, label: 'Phase deadline', kind: 'deadline' },
        ...(selectedAccount.created_at ? [{ at: selectedAccount.created_at, label: 'Eval started', kind: 'start' }] : [])
      ]);
      CalendarComponent.render('stats-calendar');
    })();
  } catch (e) {
    console.error('loadPolyEdgeStats failed:', e);
    container.innerHTML = '<div class="an-center"><div class="an-error-box"><h3>Failed to Load Stats</h3><p>' + (e.message || 'Unknown error') + '</p></div></div>';
  }
}

// ==========================================
// CERTIFICATES PAGE
// ==========================================
async function loadCertificate() {
  const root = document.getElementById('certificates-root');
  if (!root) return;
  if (!currentUser || !sb) {
    root.innerHTML = '<div class="empty-state"><h3>Sign in to view certificates</h3><p>Log in to see which PolyEdge achievements you have unlocked.</p><button class="btn btn-primary" data-page="login">Sign In</button></div>';
    bindDataPage();
    return;
  }

  const fullName = [
    currentProfile?.first_name || '',
    currentProfile?.last_name || ''
  ].join(' ').trim() || currentProfile?.display_name || currentUser.email.split('@')[0] || 'Trader';

  let evals = [];
  let trades = [];
  try {
    const { data: e } = await sb.from('evaluations')
      .select('*')
      .eq('user_id', currentUser.id);
    evals = e || [];
    const { data: t } = await sb.from('trades')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('status', 'closed');
    trades = t || [];
  } catch (err) {
    console.warn('loadCertificate data error:', err);
  }

  const hasPassedEval = evals.some(e => e.status === 'passed');
  const hasFunded = evals.some(e => e.status === 'funded');
  const hasFirstTrade = trades.length > 0;
  const wins = trades.filter(t => t.pnl > 0);
  const wr = trades.length ? (wins.length / trades.length * 100) : 0;
  const hasConsistency = trades.length >= 10 && wr > 60;

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const certs = [
    {
      id: 'passed',
      title: 'Passed Evaluation',
      subtitle: 'Evaluation Achievement',
      unlocked: hasPassedEval,
      requirement: 'Pass at least one PolyEdge evaluation',
    },
    {
      id: 'funded',
      title: 'Funded Trader',
      subtitle: 'Funded Status',
      unlocked: hasFunded,
      requirement: 'Reach funded status on any account',
    },
    {
      id: 'first-trade',
      title: 'First Trade',
      subtitle: 'Milestone',
      unlocked: hasFirstTrade,
      requirement: 'Complete your first closed trade',
    },
    {
      id: 'consistency',
      title: 'Consistency Award',
      subtitle: 'Performance',
      unlocked: hasConsistency,
      requirement: 'Close 10+ trades with win rate above 60%',
    },
  ];

  root.innerHTML = `
    <h2 style="margin-bottom:24px">Certificates</h2>
    <p style="color:var(--text3);max-width:520px;margin:0 auto 32px">Premium PolyEdge certificates celebrating your progression as a trader. Unlock them by completing evaluations and trading consistently.</p>
    <div class="cert-grid">
      ${certs.map(c => `
        <div class="cert-type-card ${c.unlocked ? 'unlocked' : 'locked'}" ${c.unlocked ? '' : `title="${c.requirement}"`}>
          <div class="cert-type-header">
            <div class="cert-type-title">${c.title}</div>
            ${c.unlocked ? '<span class="badge badge-ok">Unlocked</span>' : '<span class="cert-lock">🔒</span>'}
          </div>
          <div class="cert-type-sub">${c.subtitle}</div>
          <div class="cert-type-body">
            <div class="cert-card">
              <div class="cert-glow"></div>
              <div class="cert-inner">
                <div class="cert-logo">PolyEdge</div>
                <div class="cert-divider"></div>
                <div class="cert-title">${c.title.toUpperCase()}</div>
                <div class="cert-subtitle">${c.subtitle.toUpperCase()}</div>
                <div class="cert-phase">CERTIFICATE</div>
                <div class="cert-date">DATE: <span>${today}</span></div>
                <div class="cert-presented">PROUDLY PRESENTED TO:</div>
                <div class="cert-name">${fullName.toUpperCase()}</div>
                <div class="cert-footer">
                  <div class="cert-signature">
                    <div class="cert-sign-line"></div>
                    <div class="cert-sign-label">PolyEdge</div>
                  </div>
                  <div class="cert-qr">
                    <div class="cert-qr-placeholder">
                      <svg width="64" height="64" viewBox="0 0 64 64"><rect x="0" y="0" width="20" height="20" fill="rgba(255,255,255,0.3)"/><rect x="24" y="0" width="8" height="8" fill="rgba(255,255,255,0.3)"/><rect x="44" y="0" width="20" height="20" fill="rgba(255,255,255,0.3)"/><rect x="0" y="24" width="8" height="8" fill="rgba(255,255,255,0.3)"/><rect x="16" y="24" width="8" height="8" fill="rgba(255,255,255,0.3)"/><rect x="32" y="24" width="8" height="8" fill="rgba(255,255,255,0.3)"/><rect x="0" y="44" width="20" height="20" fill="rgba(255,255,255,0.3)"/><rect x="24" y="44" width="8" height="8" fill="rgba(255,255,255,0.3)"/><rect x="44" y="44" width="8" height="8" fill="rgba(255,255,255,0.3)"/><rect x="56" y="44" width="8" height="8" fill="rgba(255,255,255,0.3)"/><rect x="44" y="56" width="8" height="8" fill="rgba(255,255,255,0.3)"/><rect x="56" y="56" width="8" height="8" fill="rgba(255,255,255,0.3)"/></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="cert-type-footer">
            ${c.unlocked ? '<span>Ready to download soon</span>' : `<span class="cert-locked-copy">Locked — ${c.requirement}</span>`}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  bindDataPage();
}

// ==========================================
// ADMIN
// ==========================================
async function loadAdmin() {
  if (!currentProfile?.is_admin || !sb) return;

  const { data: users } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  const usersEl = document.getElementById('admin-users');
  if (usersEl) {
    usersEl.innerHTML = users && users.length ? `<table class="tbl"><thead><tr><th>Email</th><th>Name</th><th>Admin</th><th>Created</th></tr></thead><tbody>${users.map(u=>`<tr><td>${u.email}</td><td>${u.display_name||''}</td><td>${u.is_admin?'<span class="badge badge-ok">ADMIN</span>':'—'}</td><td>${new Date(u.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3)">No users</p>';
  }

  const { data: evals } = await sb.from('evaluations').select('*, profiles(email)').order('created_at', { ascending: false });
  const evalsEl = document.getElementById('admin-evals');
  if (evalsEl) {
    evalsEl.innerHTML = evals && evals.length ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>User</th><th>Type</th><th>Size</th><th>Phase</th><th>Balance</th><th>Status</th><th>Created</th></tr></thead><tbody>${evals.map(e=>`<tr><td>${e.profiles?.email||'—'}</td><td>${e.eval_type}</td><td>$${e.account_size}</td><td>${e.phase}</td><td>${fmt(e.balance)}</td><td><span class="badge ${e.status==='active'||e.status==='funded'?'badge-ok':e.status==='passed'?'badge-warn':'badge-fail'}">${e.status}</span></td><td>${new Date(e.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>` : '<p style="color:var(--text3)">No evaluations</p>';
  }
}

async function adminCreateEval() {
  if (!sb) return;
  const errEl = document.getElementById('admin-create-err');
  const okEl = document.getElementById('admin-create-ok');
  if (errEl) errEl.style.display = 'none';
  if (okEl) okEl.style.display = 'none';

  const email = document.getElementById('ac-email')?.value?.trim();
  const type = document.getElementById('ac-type')?.value;
  const size = parseInt(document.getElementById('ac-size')?.value);

  if (!email) { showMsg(errEl, 'Enter user email', 'err'); return; }

  const { data: profiles } = await sb.from('profiles').select('id').eq('email', email);
  if (!profiles || profiles.length === 0) { showMsg(errEl, 'User not found', 'err'); return; }

  const isOneStep = type === '1-step';
  const { error } = await sb.from('evaluations').insert({
    user_id: profiles[0].id, eval_type: type, account_size: size, phase: 1, status: 'active',
    starting_balance: size, balance: size, high_water_mark: size,
    profit_target_pct: isOneStep ? 10 : 6, max_drawdown_pct: 6,
    consistency_rule_pct: isOneStep ? 20 : 50, min_trades: isOneStep ? 5 : 2,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });

  if (error) { showMsg(errEl, error.message, 'err'); return; }
  showMsg(okEl, `Evaluation created for ${email}: ${type} $${size}`, 'ok');
  const acEmail = document.getElementById('ac-email'); if (acEmail) acEmail.value = '';
  await loadAdmin();
}

function showAdminTab(tab) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active'));
  const section = document.getElementById('admin-' + tab);
  if (section) section.classList.add('active');
  if (event && event.target) event.target.classList.add('active');
}

// ==========================================
// STRIPE CHECKOUT (temporary minimal test)
// ==========================================
const PRICES = {
  '1step-500': 79, '1step-1000': 139, '1step-2000': 199,
  '2step-500': 59, '2step-1000': 119, '2step-2000': 179,
};

// Minimal test handler: just confirm wiring works
async function startChallenge(type, size) {
  if (!currentUser) {
    showPage('login');
    return;
  }

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showPage('login'); return; }

    const res = await fetch(getCreateCheckoutUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        type: type,
        size: size,
        success_base_url: getSiteBaseUrl() || undefined,
      })
    });
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
    } else {
      alert('Checkout error: ' + (data?.error || 'Unknown error'));
    }
  } catch(e) {
    alert('Failed to start checkout: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Start Challenge →'; }
  }
}
window.startChallenge = startChallenge;
// ==========================================
// NAVIGATION
// ==========================================
function updateShellBackground(pageId) {
  if (pageId === 'home') {
    const t = document.getElementById('nav-market-ticker');
    if (t) {
      t.classList.remove('on');
      t.innerHTML = '';
    }
    document.body.classList.remove('has-nav-ticker');
  }
  if (window.MatrixRain) {
    if (pageId === 'home' || pageId === 'login') window.MatrixRain.disable();
    else window.MatrixRain.enable();
  }
  if (window.LoginNetwork) {
    if (pageId === 'login') {
      window.LoginNetwork.mount('login-page-bg');
      window.LoginNetwork.enable();
    } else {
      window.LoginNetwork.disable();
    }
  }
}

function attachBottomNavToActivePage() {
  const bar = document.getElementById('bottom-nav');
  const page = document.querySelector('.page.active');
  if (!bar || !page) return;
  page.appendChild(bar);
}

function showPage(id) {
  let scrollEstimator = false;
  if (id === 'profit') {
    id = 'home';
    scrollEstimator = true;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));

  const page = document.getElementById('page-' + id);
  if (page) {
    page.classList.add('active');
    attachBottomNavToActivePage();
    if (!scrollEstimator) window.scrollTo(0, 0);
  }

  const link = document.querySelector(`.nav-links a[data-page="${id}"]`);
  if (link) link.classList.add('active');

  document.querySelectorAll('.mobile-nav-slip a[data-page]').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('data-page') === id);
  });

  updateShellBackground(id);

  // Load page-specific data
  if (id === 'markets') loadDashboard();
  if (id === 'leaderboard') loadLeaderboard();
  if (id === 'admin' && currentProfile?.is_admin) loadAdmin();
  if (id === 'wallet') loadAnalytics();
  if (id === 'accounts') loadAccounts();
  if (id === 'certificate') loadCertificate();
  if (id === 'dashboard') loadPolyEdgeStats();
  if (id === 'settings') loadSettings();

  // Homepage animations
  if (id === 'home') {
    setTimeout(() => HomepageAnimations.init(), 100);
    if (scrollEstimator) {
      setTimeout(() => {
        document.getElementById('home-estimator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        profitCalc();
      }, 160);
    }
  }
}

function bindDataPage() {
  document.querySelectorAll('[data-page]').forEach(el => {
    if (!el._bound) {
      el.addEventListener('click', e => {
        e.preventDefault();
        showPage(el.getAttribute('data-page'));
        // Close mobile nav menu after navigation
        const navLinks = document.getElementById('nav-links');
        if (navLinks) navLinks.classList.remove('open');
      });
      el._bound = true;
    }
  });
}

function mobileSlipAllowed() {
  const p = document.querySelector('.page.active');
  if (!p) return false;
  return p.id !== 'page-login';
}

function initMobileNavSlip() {
  const slip = document.getElementById('mobile-nav-slip');
  if (!slip) return;
  const mq = window.matchMedia('(max-width:768px)');
  let hideTimer = null;

  function armHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      slip.classList.remove('is-visible');
      hideTimer = null;
    }, 2800);
  }

  function bump() {
    if (!mq.matches || !mobileSlipAllowed()) return;
    slip.classList.add('is-visible');
    armHide();
  }

  let lastBump = 0;
  function throttledBump() {
    const now = Date.now();
    if (now - lastBump < 60) return;
    lastBump = now;
    bump();
  }

  window.addEventListener('scroll', throttledBump, { passive: true });
  window.addEventListener('touchmove', throttledBump, { passive: true });
  window.addEventListener('wheel', throttledBump, { passive: true });

  mq.addEventListener('change', () => {
    if (!mq.matches) slip.classList.remove('is-visible');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) slip.classList.remove('is-visible');
  });
}

function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
  bindDataPage();
  initMobileNavSlip();
  initRiskPostureDropdown();
  setTimeout(() => profitCalc(), 0);

  const initialPage = document.querySelector('.page.active');
  const initialId = initialPage?.id?.replace(/^page-/, '') || 'home';
  updateShellBackground(initialId);

  // Mobile nav toggle
  const menuToggle = document.getElementById('nav-menu-toggle');
  const navLinks = document.getElementById('nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  // FAQ toggles
  document.querySelectorAll('.faq-q').forEach(q => {
    q.addEventListener('click', () => {
      q.classList.toggle('open');
      const a = q.nextElementSibling;
      if (a) a.classList.toggle('open');
    });
  });

  // Challenge type toggles
  const t1 = document.getElementById('t1');
  const t2 = document.getElementById('t2');
  const s1 = document.getElementById('s1');
  const s2 = document.getElementById('s2');
  if (t1 && t2 && s1 && s2) {
    t1.addEventListener('click', () => {
      t1.classList.add('active'); t2.classList.remove('active');
      s1.classList.add('active'); s2.classList.remove('active');
    });
    t2.addEventListener('click', () => {
      t2.classList.add('active'); t1.classList.remove('active');
      s2.classList.add('active'); s1.classList.remove('active');
    });
  }

  // Start Challenge is handled by inline onclick (so it works even if this block runs late)

  // Modal close on backdrop
  document.querySelectorAll('.modal-bg').forEach(bg => {
    bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('open'); });
  });

  // Init session first (needed for finalize-checkout)
  await checkSession();

  const payParams = new URLSearchParams(window.location.search);
  if (payParams.get('payment') === 'success') {
    const stripeSessionId = payParams.get('session_id');
    let msg = 'Payment received.';
    if (stripeSessionId && sb && currentUser && getFinalizeCheckoutUrl()) {
      const r = await finalizeCheckoutSession(stripeSessionId);
      if (r.ok) {
        await AccountManager.loadAccounts();
        AccountManager.restoreSelection();
        syncActiveEval();
        msg = r.already
          ? 'Your evaluation is already linked — head to Accounts or Markets.'
          : 'Your evaluation account is ready. You can trade from Markets or the Dashboard.';
      } else {
        msg = 'Payment received. If your account does not show on Accounts in a minute, confirm the Stripe webhook is deployed, or run the SQL migration for stripe_checkout_session_id. Details: ' + (r.error || 'unknown');
      }
    } else {
      await AccountManager.loadAccounts();
      AccountManager.restoreSelection();
      syncActiveEval();
      msg += ' Open Accounts — if empty, configure Stripe webhook (checkout.session.completed) or use the finalize-checkout function with session_id in the success URL.';
    }
    const clean = window.location.pathname + (window.location.hash || '');
    window.history.replaceState({}, '', clean || '/');
    alert(msg);
    showPage('markets');
    await loadDashboard();
  } else if (payParams.get('payment') === 'cancelled') {
    window.history.replaceState({}, '', window.location.pathname + (window.location.hash || '') || '/');
  }

  const activePid = document.querySelector('.page.active')?.id?.replace(/^page-/, '') || 'home';
  document.querySelectorAll('.mobile-nav-slip a[data-page]').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('data-page') === activePid);
  });

  attachBottomNavToActivePage();

  // Init homepage animations
  setTimeout(() => HomepageAnimations.init(), 200);
});
console.log('app.js loaded, startChallenge:', typeof window.startChallenge);