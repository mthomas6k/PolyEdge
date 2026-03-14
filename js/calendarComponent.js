// ==========================================
<<<<<<< HEAD
// CALENDAR COMPONENT
// calendarComponent.js — Monthly P&L calendar view
// ==========================================

const CalendarComponent = (() => {
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let closedTrades = [];

  function setTrades(trades) {
    closedTrades = (trades || []).filter(t => t.status === 'closed' && t.closed_at);
  }

  function getMonthData(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const dailyPnl = {};
    const dailyTrades = {};

    closedTrades.forEach(t => {
      const d = new Date(t.closed_at);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!dailyPnl[day]) { dailyPnl[day] = 0; dailyTrades[day] = []; }
        dailyPnl[day] += parseFloat(t.pnl || 0);
        dailyTrades[day].push(t);
      }
    });

    const totalPnl = Object.values(dailyPnl).reduce((s, v) => s + v, 0);
    const tradingDays = Object.keys(dailyPnl).length;
    const winDays = Object.values(dailyPnl).filter(v => v > 0).length;
    const lossDays = Object.values(dailyPnl).filter(v => v < 0).length;
    const bestDay = Math.max(...Object.values(dailyPnl), 0);
    const worstDay = Math.min(...Object.values(dailyPnl), 0);

    return { daysInMonth, firstDay, dailyPnl, dailyTrades, totalPnl, tradingDays, winDays, lossDays, bestDay, worstDay };
  }

  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const data = getMonthData(currentYear, currentMonth);
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const dayHeaders = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    let calendarCells = '';
    // Padding for first day
    for (let i = 0; i < data.firstDay; i++) {
      calendarCells += '<div class="cal-cell cal-empty"></div>';
    }
    // Days
    for (let d = 1; d <= data.daysInMonth; d++) {
      const pnl = data.dailyPnl[d];
      const trades = data.dailyTrades[d] || [];
      const hasTrades = pnl !== undefined;
      const isToday = d === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
      let cls = 'cal-cell';
      if (isToday) cls += ' cal-today';
      if (hasTrades && pnl > 0) cls += ' cal-green';
      if (hasTrades && pnl < 0) cls += ' cal-red';
      if (hasTrades && pnl === 0) cls += ' cal-neutral';

      calendarCells += `
        <div class="${cls}" ${hasTrades ? `onclick="CalendarComponent.showDayDetail(${d})"` : ''}>
          <div class="cal-day-num">${d}</div>
          ${hasTrades ? `
            <div class="cal-day-pnl ${pnl >= 0 ? 'cal-pnl-pos' : 'cal-pnl-neg'}">
              ${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}
            </div>
            <div class="cal-day-trades">${trades.length} trade${trades.length !== 1 ? 's' : ''}</div>
          ` : ''}
        </div>`;
    }

    container.innerHTML = `
      <div class="cal-card an-card an-card-full" style="margin-top:20px">
        <div class="cal-header">
          <span class="an-card-title">P&L Calendar</span>
          <div class="cal-nav">
            <button class="cal-nav-btn" onclick="CalendarComponent.prevMonth('${containerId}')">‹</button>
            <span class="cal-month-label">${monthNames[currentMonth]} ${currentYear}</span>
            <button class="cal-nav-btn" onclick="CalendarComponent.nextMonth('${containerId}')">›</button>
          </div>
        </div>
        <div class="cal-summary">
          <div class="cal-sum-item">
            <div class="cal-sum-label">Month P&L</div>
            <div class="cal-sum-val ${data.totalPnl >= 0 ? 'grn' : 'red'}">${data.totalPnl >= 0 ? '+' : ''}$${Math.abs(data.totalPnl).toFixed(2)}</div>
          </div>
          <div class="cal-sum-item">
            <div class="cal-sum-label">Trading Days</div>
            <div class="cal-sum-val">${data.tradingDays}</div>
          </div>
          <div class="cal-sum-item">
            <div class="cal-sum-label">Win Days</div>
            <div class="cal-sum-val grn">${data.winDays}</div>
          </div>
          <div class="cal-sum-item">
            <div class="cal-sum-label">Loss Days</div>
            <div class="cal-sum-val red">${data.lossDays}</div>
          </div>
          <div class="cal-sum-item">
            <div class="cal-sum-label">Best Day</div>
            <div class="cal-sum-val grn">+$${data.bestDay.toFixed(2)}</div>
          </div>
          <div class="cal-sum-item">
            <div class="cal-sum-label">Worst Day</div>
            <div class="cal-sum-val red">$${data.worstDay.toFixed(2)}</div>
          </div>
        </div>
        <div class="cal-grid-header">
          ${dayHeaders.map(d => `<div class="cal-hdr">${d}</div>`).join('')}
        </div>
        <div class="cal-grid">
          ${calendarCells}
        </div>
        <div id="cal-day-detail" class="cal-detail"></div>
      </div>`;
  }

  function showDayDetail(day) {
    const detail = document.getElementById('cal-day-detail');
    if (!detail) return;
    const trades = getMonthData(currentYear, currentMonth).dailyTrades[day] || [];
    const pnl = getMonthData(currentYear, currentMonth).dailyPnl[day] || 0;
    if (trades.length === 0) { detail.innerHTML = ''; return; }

    detail.innerHTML = `
      <div class="cal-detail-inner">
        <div class="cal-detail-header">
          <span class="cal-detail-date">${new Date(currentYear, currentMonth, day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          <span class="cal-detail-pnl ${pnl >= 0 ? 'grn' : 'red'}">${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}</span>
        </div>
        <table class="tbl">
          <thead><tr><th>Contract</th><th>Side</th><th>Entry</th><th>Exit</th><th>P&L</th></tr></thead>
          <tbody>
            ${trades.map(t => `
              <tr>
                <td>${t.contract_name || '—'}</td>
                <td>${t.side}</td>
                <td>${(t.entry_price * 100).toFixed(1)}¢</td>
                <td>${(t.exit_price * 100).toFixed(1)}¢</td>
                <td class="${t.pnl >= 0 ? 'pgrn' : 'pred'}">${t.pnl >= 0 ? '+' : ''}$${Number(t.pnl).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function prevMonth(containerId) {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    render(containerId);
  }

  function nextMonth(containerId) {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    render(containerId);
  }

  return { setTrades, render, showDayDetail, prevMonth, nextMonth };
})();
=======
// CONFIG (uses js/config.js — set window.__POLYEDGE_ENV in production to avoid hardcoding)
// ==========================================
var SUPABASE_URL = (typeof window !== 'undefined' && window.POLYEDGE_CONFIG) ? window.POLYEDGE_CONFIG.SUPABASE_URL : '';
var SUPABASE_KEY = (typeof window !== 'undefined' && window.POLYEDGE_CONFIG) ? window.POLYEDGE_CONFIG.SUPABASE_ANON_KEY : '';

// ==========================================
// SUPABASE INIT (anon key only — never use service_role in frontend)
// ==========================================
let sb = null;
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
      // Load accounts after auth
      await AccountManager.loadAccounts();
      AccountManager.restoreSelection();
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
    // Top nav vs bottom nav
    if (el.closest('.bottom-nav')) {
      el.style.display = 'block';
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
  showPage('dashboard');
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
// DASHBOARD — Now with Polymarket Live Markets
// ==========================================
async function loadDashboard() {
  const container = document.getElementById('dash-content');
  if (!container) return;

  if (!currentUser || !sb) {
    container.innerHTML = '<div class="empty-state"><h3>Sign in to view your dashboard</h3><p>Create an account or sign in to track your evaluations.</p><button class="btn btn-primary" data-page="login">Sign In</button></div>';
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
        <div class="dash-grid">
          <div class="dash-sidebar">
            <div class="dc">
              <div class="dc-label">Account</div>
              <div class="badge badge-warn">NO ACTIVE EVALUATION</div>
              <div class="dc-sub" style="margin-top:10px">You can browse live markets, but you can’t place bets until you start a challenge.</div>
              <div style="margin-top:14px">
                <button class="btn btn-primary" data-page="challenges" style="width:100%">View Challenges →</button>
              </div>
            </div>
          </div>
          <div class="dash-main">
            <div class="dash-markets-section">
              <div class="dash-markets-header">
                <div class="dp-title">Live Polymarket Markets</div>
                <div class="dash-markets-search">
                  <input id="market-search-input" placeholder="Search markets..." onkeyup="handleMarketSearch(event)">
                  <button class="form-btn" style="width:auto;padding:8px 16px;font-size:10px" onclick="refreshMarkets()">↻ Refresh</button>
                </div>
              </div>
              <div id="markets-grid" class="market-grid">
                <div class="market-loading"><div class="an-spinner" style="margin:0 auto 12px;width:24px;height:24px"></div>Loading markets...</div>
              </div>
              <div class="dc-sub" style="margin-top:10px">To place a bet, start a challenge and come back to Dashboard.</div>
            </div>
          </div>
        </div>
      `;
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
    <div class="dash-grid">
      <div class="dash-sidebar">
        <div class="dc"><div class="dc-label">Account</div>${statusBadge}<div class="progress-bar" style="margin-top:12px"><div class="progress-fill" style="width:${(daysUsed/daysTotal)*100}%"></div></div></div>
        <div class="dc"><div class="dc-label">Balance</div><div class="dc-val">${fmt(e.balance)}</div><div class="dc-sub">Starting: ${fmt(e.starting_balance)}</div></div>
        <div class="dc"><div class="dc-label">Profit Target</div><div class="dc-val ${profit>=0?'grn':'red'}">${fmt(Math.max(0,profit))} / ${fmt(profitTarget)}</div><div class="dc-sub">${e.profit_target_pct}% target</div><div class="progress-bar"><div class="progress-fill" style="width:${profitPct}%"></div></div></div>
        <div class="dc"><div class="dc-label">Drawdown Used</div><div class="dc-val">${ddUsed.toFixed(1)}%</div><div class="dc-sub">Max: ${ddLimit}%</div><div class="progress-bar"><div class="progress-fill" style="width:${(ddUsed/ddLimit)*100}%;${ddUsed>ddLimit*0.7?'background:var(--red)':''}"></div></div></div>
        <div class="dc"><div class="dc-label">Trades (Closed)</div><div class="dc-val">${closedTrades.length} / ${e.min_trades} min</div></div>
        <div class="dc"><div class="dc-label">Consistency</div><div class="dc-val ${consistencyOk?'grn':'red'}">${consistencyOk?'✓ Passing':'✕ Failing'}</div><div class="dc-sub">Largest: ${largestPct.toFixed(1)}% (max ${e.consistency_rule_pct}%)</div></div>
      </div>
      <div class="dash-main">
        <div class="dp">
          <div class="dp-header"><div class="dp-title">Open Positions</div><div style="display:flex;gap:8px"><span class="dp-badge">${openTrades.length} Active</span><button class="form-btn" style="width:auto;padding:6px 16px;font-size:10px" onclick="openModal('trade-modal')">+ New Trade</button></div></div>
          ${openTrades.length ? `<table class="tbl"><thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Commission</th><th>Action</th></tr></thead><tbody>${openTrades.map(t=>`<tr><td>${t.contract_name}</td><td>${t.side}</td><td>${fmt(t.trade_size)}</td><td>${(t.entry_price*100).toFixed(1)}¢</td><td>${fmt(t.commission)}</td><td><button class="form-btn secondary" style="width:auto;padding:4px 12px;font-size:9px" onclick="openCloseModal('${t.id}','${t.contract_name}',${t.entry_price},'${t.side}',${t.trade_size})">Close</button></td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3);font-family:var(--mono);font-size:12px">No open positions</p>'}
        </div>
        <div class="dp">
          <div class="dp-header"><div class="dp-title">Trade History (Closed)</div><span class="dp-badge">${closedTrades.length} Closed</span></div>
          ${closedTrades.length ? `<table class="tbl"><thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Exit</th><th>P&L</th></tr></thead><tbody>${closedTrades.map(t=>`<tr><td>${t.contract_name}</td><td>${t.side}</td><td>${fmt(t.trade_size)}</td><td>${(t.entry_price*100).toFixed(1)}¢</td><td>${(t.exit_price*100).toFixed(1)}¢</td><td class="${t.pnl>=0?'pgrn':'pred'}">${t.pnl>=0?'+':''}${fmt(t.pnl)}</td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3);font-family:var(--mono);font-size:12px">No closed trades yet</p>'}
        </div>
        <div class="dash-markets-section">
          <div class="dash-markets-header">
            <div class="dp-title">Live Polymarket Markets</div>
            <div class="dash-markets-search">
              <input id="market-search-input" placeholder="Search markets..." onkeyup="handleMarketSearch(event)">
              <button class="form-btn" style="width:auto;padding:8px 16px;font-size:10px" onclick="refreshMarkets()">↻ Refresh</button>
            </div>
          </div>
          <div id="markets-grid" class="market-grid">
            <div class="market-loading"><div class="an-spinner" style="margin:0 auto 12px;width:24px;height:24px"></div>Loading markets...</div>
          </div>
        </div>
      </div>
    </div>`;
  bindDataPage();

  // Load live markets asynchronously
  loadLiveMarkets();
}

// ==========================================
// LIVE POLYMARKET MARKETS
// ==========================================
async function loadLiveMarkets(query) {
  const grid = document.getElementById('markets-grid');
  if (!grid) return;

  try {
    let markets;
    if (query && query.length > 1) {
      markets = await PolymarketService.searchMarkets(query);
    } else {
      markets = await PolymarketService.getMarkets(24);
    }

    if (!markets || markets.length === 0) {
      grid.innerHTML = '<div class="market-loading">No markets found. API may be rate-limited — try again in a moment.</div>';
      return;
    }

    const canBet = !!activeEval;
    grid.innerHTML = markets.map(m => {
      const pm = PolymarketService.parseMarket(m);
      const yesP = (pm.yesPrice * 100).toFixed(0);
      const noP = (pm.noPrice * 100).toFixed(0);
      const vol = pm.volume > 1000000 ? '$' + (pm.volume / 1000000).toFixed(1) + 'M' :
                  pm.volume > 1000 ? '$' + (pm.volume / 1000).toFixed(0) + 'K' :
                  '$' + pm.volume.toFixed(0);
      const liq = pm.liquidity > 1000 ? '$' + (pm.liquidity / 1000).toFixed(0) + 'K' : '$' + pm.liquidity.toFixed(0);
      const q = (pm.question || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

      return `
        <div class="market-tile">
          <div class="market-tile-q">${truncateStr(pm.question, 80)}</div>
          <div class="market-tile-prices">
            <div class="market-price-btn market-price-yes ${canBet ? '' : 'disabled'}" ${canBet ? `onclick="openMarketBet('${q}','YES',${pm.yesPrice})"` : 'title="Start a challenge to place bets"'}>${yesP}¢ Yes</div>
            <div class="market-price-btn market-price-no ${canBet ? '' : 'disabled'}" ${canBet ? `onclick="openMarketBet('${q}','NO',${pm.noPrice})"` : 'title="Start a challenge to place bets"'}>${noP}¢ No</div>
          </div>
          <div class="market-tile-meta">
            <span>Vol: ${vol}</span>
            <span>Liq: ${liq}</span>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('Failed to load markets:', e);
    grid.innerHTML = '<div class="market-loading">Failed to load markets. CORS proxies may be rate-limited.</div>';
  }
}

let marketSearchTimeout;
function handleMarketSearch(e) {
  clearTimeout(marketSearchTimeout);
  const q = e.target.value.trim();
  marketSearchTimeout = setTimeout(() => loadLiveMarkets(q), 400);
}

function refreshMarkets() {
  const input = document.getElementById('market-search-input');
  loadLiveMarkets(input?.value?.trim() || '');
}

function openMarketBet(marketName, side, price) {
  if (!activeEval) {
    alert('No active evaluation. Start a challenge first.');
    return;
  }
  document.getElementById('mbet-market-name').value = marketName;
  document.getElementById('mbet-market-info').textContent = marketName;
  document.getElementById('mbet-side').value = side;
  document.getElementById('mbet-entry').value = Math.round(price * 100);
  document.getElementById('mbet-size').value = '';
  const errEl = document.getElementById('mbet-err');
  if (errEl) errEl.style.display = 'none';
  openModal('market-bet-modal');
}

async function placeDashboardBet() {
  const errEl = document.getElementById('mbet-err');
  if (errEl) errEl.style.display = 'none';
  if (!activeEval || !sb) { showMsg(errEl, 'No active evaluation', 'err'); return; }

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

function fmt(n) { return '$' + Number(n || 0).toFixed(2); }

// ==========================================
// TRADES
// ==========================================
async function openTrade() {
  const errEl = document.getElementById('trade-err');
  if (errEl) errEl.style.display = 'none';
  if (!activeEval || !sb) { showMsg(errEl, 'No active evaluation', 'err'); return; }

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

  container.innerHTML = `<table class="lb-table"><thead><tr><th>Rank</th><th>Trader</th><th>Account</th><th>Type</th><th>Return</th><th>Trades</th><th>Status</th></tr></thead><tbody>${data.map((r,i)=>{
    const rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
    return `<tr><td class="lb-rank ${rankClass}">${i+1}</td><td>${r.trader}</td><td>$${r.account_size}</td><td>${r.eval_type}</td><td style="color:var(--green)">+${r.return_pct}%</td><td>${r.trades_count}</td><td><span class="badge badge-ok">${r.status}</span></td></tr>`;
  }).join('')}</tbody></table>`;
}

function renderEmptyLeaderboard() {
  return `
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
    </table>`;
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
// CERTIFICATE PAGE
// ==========================================
function loadCertificate() {
  const dateEl = document.getElementById('cert-date-val');
  const nameEl = document.getElementById('cert-name-val');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  }
  if (nameEl && currentProfile) {
    nameEl.textContent = (currentProfile.display_name || currentUser?.email?.split('@')[0] || 'TRADER').toUpperCase();
  }
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
// MOCK CHECKOUT
// ==========================================
const PRICES = {
  '1step-500': 79, '1step-1000': 139, '1step-2000': 199,
  '2step-500': 59, '2step-1000': 119, '2step-2000': 179,
};

function startChallenge(type, size) {
  if (!currentUser) { showPage('login'); return; }
  const key = type + '-' + size;
  const price = PRICES[key] || 99;
  const label = (type === '1step' ? 'One-Step' : 'Two-Step') + ' $' + Number(size).toLocaleString();
  const mcLabel = document.getElementById('mc-label'); if (mcLabel) mcLabel.textContent = label;
  const mcPrice = document.getElementById('mc-price'); if (mcPrice) mcPrice.textContent = '$' + price;
  const mcType = document.getElementById('mc-type'); if (mcType) mcType.value = type;
  const mcSize = document.getElementById('mc-size'); if (mcSize) mcSize.value = size;
  ['mc-card','mc-expiry','mc-cvv'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const mcErr = document.getElementById('mc-err'); if (mcErr) mcErr.style.display = 'none';
  const mcBtn = document.getElementById('mc-btn');
  if (mcBtn) { mcBtn.textContent = 'Pay $' + price + ' →'; mcBtn.disabled = false; }
  openModal('mock-checkout-modal');
}

async function submitMockPayment() {
  if (!sb) return;
  const card = (document.getElementById('mc-card')?.value || '').replace(/\s/g, '');
  const expiry = (document.getElementById('mc-expiry')?.value || '').trim();
  const cvv = (document.getElementById('mc-cvv')?.value || '').trim();
  const errEl = document.getElementById('mc-err');
  if (errEl) errEl.style.display = 'none';
  if (card.length < 12) { showMsg(errEl, 'Enter a valid card number', 'err'); return; }
  if (!expiry.includes('/')) { showMsg(errEl, 'Enter expiry as MM/YY', 'err'); return; }
  if (cvv.length < 3) { showMsg(errEl, 'Enter a valid CVV', 'err'); return; }

  const btn = document.getElementById('mc-btn');
  if (btn) { btn.textContent = 'Processing…'; btn.disabled = true; }
  await new Promise(r => setTimeout(r, 1400));

  const type = document.getElementById('mc-type')?.value;
  const size = parseInt(document.getElementById('mc-size')?.value);
  const isOneStep = type === '1step';

  const { error } = await sb.from('evaluations').insert({
    user_id: currentUser.id, eval_type: isOneStep ? '1-step' : '2-step',
    account_size: size, phase: 1, status: 'active', starting_balance: size,
    balance: size, high_water_mark: size, profit_target_pct: isOneStep ? 10 : 6,
    max_drawdown_pct: 6, consistency_rule_pct: isOneStep ? 20 : 50,
    min_trades: isOneStep ? 5 : 2, trades_count: 0, total_profit: 0, total_loss: 0,
    largest_trade_profit: 0, expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  });

  if (error) {
    showMsg(errEl, error.message, 'err');
    if (btn) { btn.textContent = 'Pay $' + PRICES[type + '-' + size] + ' →'; btn.disabled = false; }
    return;
  }

  closeModal('mock-checkout-modal');
  await checkSession();
  showPage('dashboard');
}

// ==========================================
// NAVIGATION
// ==========================================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));

  const page = document.getElementById('page-' + id);
  if (page) { page.classList.add('active'); window.scrollTo(0, 0); }

  const link = document.querySelector(`.nav-links a[data-page="${id}"]`);
  if (link) link.classList.add('active');

  // Load page-specific data
  if (id === 'dashboard') loadDashboard();
  if (id === 'leaderboard') loadLeaderboard();
  if (id === 'admin' && currentProfile?.is_admin) loadAdmin();
  if (id === 'analytics') loadAnalytics();
  if (id === 'accounts') loadAccounts();
  if (id === 'certificate') loadCertificate();

  // Homepage animations
  if (id === 'home') {
    setTimeout(() => HomepageAnimations.init(), 100);
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

function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('open'); }

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
  bindDataPage();

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

  // Modal close on backdrop
  document.querySelectorAll('.modal-bg').forEach(bg => {
    bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('open'); });
  });

  // Payment success check
  if (window.location.search.includes('payment=success')) {
    alert('Payment received! Your evaluation will be activated shortly.');
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Init session
  checkSession();

  // Init homepage animations
  setTimeout(() => HomepageAnimations.init(), 200);
});
>>>>>>> 0044020ade8d36dff50037d00ef8c28a7b529764
