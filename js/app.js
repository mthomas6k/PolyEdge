// ==========================================
// CONFIG
// ==========================================
const SUPABASE_URL = 'https://iyaqyoxezkovuusooomgf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YXF5b3hlemtvdnV1c29vbWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTM3NDcsImV4cCI6MjA4NzUyOTc0N30.9dja2T1r2AlgytvQWuQO2exoGTdPcIVM0VQXp1MWB7Q';

const STRIPE_LINKS = {
  '1step-500':  'STRIPE_LINK_1STEP_500',
  '1step-1000': 'STRIPE_LINK_1STEP_1000',
  '1step-2000': 'STRIPE_LINK_1STEP_2000',
  '2step-500':  'STRIPE_LINK_2STEP_500',
  '2step-1000': 'STRIPE_LINK_2STEP_1000',
  '2step-2000': 'STRIPE_LINK_2STEP_2000',
};

// ==========================================
// SUPABASE INIT
// ==========================================
let sb;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e) { console.warn('Supabase not configured yet', e); }

let currentUser = null;
let currentProfile = null;
let activeEval = null;
let closingTradeId = null;

// ==========================================
// AUTH
// ==========================================
async function checkSession() {
  if (!sb) return;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      await loadProfile();
      updateAuthUI(true);
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
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (data) currentProfile = data;
}

function updateAuthUI(loggedIn) {
  const navUser = document.getElementById('nav-user');
  const authBtn = document.getElementById('nav-auth-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  document.querySelectorAll('.auth-only').forEach(el => el.style.display = loggedIn ? '' : 'none');
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = (loggedIn && currentProfile?.is_admin) ? '' : 'none');
  if (loggedIn) {
    navUser.textContent = currentProfile?.display_name || currentUser.email.split('@')[0];
    navUser.style.display = '';
    authBtn.style.display = 'none';
    logoutBtn.style.display = '';
  } else {
    navUser.style.display = 'none';
    authBtn.style.display = '';
    logoutBtn.style.display = 'none';
  }
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  if (!email || !pass) { showMsg(errEl, 'Please enter email and password', 'err'); return; }
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { showMsg(errEl, error.message, 'err'); return; }
  await checkSession();
  showPage('dashboard');
}

async function register() {
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  const errEl = document.getElementById('reg-err');
  const okEl = document.getElementById('reg-ok');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  if (!email || !pass) { showMsg(errEl, 'Please fill in all fields', 'err'); return; }
  if (pass !== pass2) { showMsg(errEl, 'Passwords do not match', 'err'); return; }
  if (pass.length < 6) { showMsg(errEl, 'Password must be at least 6 characters', 'err'); return; }
  const { error } = await sb.auth.signUp({ email, password: pass });
  if (error) { showMsg(errEl, error.message, 'err'); return; }
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
  document.getElementById('auth-login').style.display = mode === 'login' ? '' : 'none';
  document.getElementById('auth-register').style.display = mode === 'register' ? '' : 'none';
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = 'msg msg-' + type;
  el.style.display = 'block';
}

// ==========================================
// DASHBOARD
// ==========================================
async function loadDashboard() {
  const container = document.getElementById('dash-content');
  if (!currentUser) { container.innerHTML = '<div class="empty-state"><h3>Sign in to view your dashboard</h3><p>Create an account or sign in to track your evaluations.</p><button class="btn btn-primary" data-page="login">Sign In</button></div>'; bindDataPage(); return; }

  const { data: evals } = await sb.from('evaluations').select('*').eq('user_id', currentUser.id).in('status', ['active', 'funded']).order('created_at', { ascending: false }).limit(1);

  if (!evals || evals.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No Active Evaluation</h3><p>Start a challenge to begin your funded trading journey.</p><button class="btn btn-primary" data-page="challenges">View Challenges →</button></div>';
    bindDataPage(); return;
  }

  activeEval = evals[0];
  const e = activeEval;
  const { data: trades } = await sb.from('trades').select('*').eq('evaluation_id', e.id).order('opened_at', { ascending: false });
  const openTrades = (trades || []).filter(t => t.status === 'open');
  const closedTrades = (trades || []).filter(t => t.status === 'closed');

  const daysUsed = Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86400000);
  const daysTotal = Math.floor((new Date(e.expires_at).getTime() - new Date(e.created_at).getTime()) / 86400000);
  const profit = e.balance - e.starting_balance;
  const profitTarget = e.starting_balance * (e.profit_target_pct / 100);
  const ddUsed = e.high_water_mark > 0 ? ((e.high_water_mark - e.balance) / e.high_water_mark * 100) : 0;
  const ddLimit = e.max_drawdown_pct;
  const profitPct = profitTarget > 0 ? Math.min(100, (Math.max(0, profit) / profitTarget) * 100) : 0;

  let consistencyOk = true;
  let largestPct = 0;
  if (e.total_profit > 0 && closedTrades.length > 0) {
    const maxTrade = Math.max(...closedTrades.filter(t => t.pnl > 0).map(t => t.pnl), 0);
    largestPct = (maxTrade / e.total_profit) * 100;
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
        <div class="dc"><div class="dc-label">Trades</div><div class="dc-val">${e.trades_count} / ${e.min_trades} min</div></div>
        <div class="dc"><div class="dc-label">Consistency</div><div class="dc-val ${consistencyOk?'grn':'red'}">${consistencyOk?'✓ Passing':'✕ Failing'}</div><div class="dc-sub">Largest: ${largestPct.toFixed(1)}% (max ${e.consistency_rule_pct}%)</div></div>
      </div>
      <div class="dash-main">
        <div class="dp">
          <div class="dp-header"><div class="dp-title">Open Positions</div><div style="display:flex;gap:8px"><span class="dp-badge">${openTrades.length} Active</span><button class="form-btn" style="width:auto;padding:6px 16px;font-size:10px" onclick="openModal('trade-modal')">+ New Trade</button></div></div>
          ${openTrades.length ? `<table class="tbl"><thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Commission</th><th>Action</th></tr></thead><tbody>${openTrades.map(t=>`<tr><td>${t.contract_name}</td><td>${t.side}</td><td>${fmt(t.trade_size)}</td><td>${t.entry_price*100}¢</td><td>${fmt(t.commission)}</td><td><button class="form-btn secondary" style="width:auto;padding:4px 12px;font-size:9px" onclick="openCloseModal('${t.id}','${t.contract_name}',${t.entry_price},'${t.side}',${t.trade_size})">Close</button></td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3);font-family:var(--mono);font-size:12px">No open positions</p>'}
        </div>
        <div class="dp">
          <div class="dp-header"><div class="dp-title">Trade History</div><span class="dp-badge">${closedTrades.length} Closed</span></div>
          ${closedTrades.length ? `<table class="tbl"><thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Exit</th><th>P&L</th></tr></thead><tbody>${closedTrades.map(t=>`<tr><td>${t.contract_name}</td><td>${t.side}</td><td>${fmt(t.trade_size)}</td><td>${(t.entry_price*100).toFixed(1)}¢</td><td>${(t.exit_price*100).toFixed(1)}¢</td><td class="${t.pnl>=0?'pgrn':'pred'}">${t.pnl>=0?'+':''}${fmt(t.pnl)}</td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3);font-family:var(--mono);font-size:12px">No closed trades yet</p>'}
        </div>
      </div>
    </div>`;
  bindDataPage();
}

function fmt(n) { return '$' + Number(n).toFixed(2); }

// ==========================================
// TRADES
// ==========================================
async function openTrade() {
  const errEl = document.getElementById('trade-err');
  errEl.style.display = 'none';
  if (!activeEval) { showMsg(errEl, 'No active evaluation', 'err'); return; }

  const name = document.getElementById('tr-name').value.trim();
  const side = document.getElementById('tr-side').value;
  const size = parseFloat(document.getElementById('tr-size').value);
  const entry = parseFloat(document.getElementById('tr-entry').value) / 100;

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

  closeModal('trade-modal');
  document.getElementById('tr-name').value = '';
  document.getElementById('tr-size').value = '';
  document.getElementById('tr-entry').value = '';
  await loadDashboard();
}

function openCloseModal(tradeId, name, entry, side, size) {
  closingTradeId = tradeId;
  document.getElementById('close-info').textContent = `${name} · ${side} · ${fmt(size)} @ ${(entry*100).toFixed(1)}¢`;
  document.getElementById('cl-exit').value = '';
  document.getElementById('close-err').style.display = 'none';
  openModal('close-modal');
}

async function closeTrade() {
  const errEl = document.getElementById('close-err');
  errEl.style.display = 'none';
  const exitPrice = parseFloat(document.getElementById('cl-exit').value) / 100;
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

  await sb.from('trades').update({
    exit_price: exitPrice,
    pnl: pnl,
    status: 'closed',
    closed_at: new Date().toISOString()
  }).eq('id', closingTradeId);

  const e = activeEval;
  const newBalance = e.balance + pnl;
  const newHWM = Math.max(e.high_water_mark, newBalance);
  const newTotalProfit = pnl > 0 ? e.total_profit + pnl : e.total_profit;
  const newTotalLoss = pnl < 0 ? e.total_loss + Math.abs(pnl) : e.total_loss;
  const newLargest = pnl > 0 ? Math.max(e.largest_trade_profit, pnl) : e.largest_trade_profit;

  const updateData = {
    balance: newBalance,
    high_water_mark: newHWM,
    trades_count: e.trades_count + 1,
    total_profit: newTotalProfit,
    total_loss: newTotalLoss,
    largest_trade_profit: newLargest
  };

  const ddPct = newHWM > 0 ? ((newHWM - newBalance) / newHWM) * 100 : 0;
  if (ddPct >= e.max_drawdown_pct) {
    updateData.status = 'failed';
  }

  const profitPct = ((newBalance - e.starting_balance) / e.starting_balance) * 100;
  if (profitPct >= e.profit_target_pct && e.trades_count + 1 >= e.min_trades) {
    const consistencyPct = newTotalProfit > 0 ? (newLargest / newTotalProfit) * 100 : 0;
    if (consistencyPct <= e.consistency_rule_pct) {
      if (e.eval_type === '1-step') {
        updateData.status = 'passed';
      } else if (e.phase === 1) {
        updateData.phase = 2;
        updateData.profit_target_pct = 4;
        updateData.total_profit = 0;
        updateData.total_loss = 0;
        updateData.largest_trade_profit = 0;
        updateData.trades_count = 0;
        updateData.balance = e.starting_balance;
        updateData.high_water_mark = e.starting_balance;
        updateData.expires_at = new Date(Date.now() + 30 * 86400000).toISOString();
      } else {
        updateData.status = 'passed';
      }
    }
  }

  await sb.from('evaluations').update(updateData).eq('id', e.id);
  closeModal('close-modal');
  await loadDashboard();
}

// ==========================================
// LEADERBOARD
// ==========================================
async function loadLeaderboard() {
  const container = document.getElementById('lb-content');
  if (!sb) { container.innerHTML = '<p style="text-align:center;color:var(--text3);font-family:var(--mono);font-size:12px">Configure Supabase to view leaderboard</p>'; return; }

  const { data } = await sb.from('leaderboard').select('*');
  if (!data || data.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text3);font-family:var(--mono);font-size:12px">No funded traders yet. Be the first.</p>';
    return;
  }

  container.innerHTML = `<table class="lb-table"><thead><tr><th>Rank</th><th>Trader</th><th>Account</th><th>Type</th><th>Return</th><th>Trades</th><th>Status</th></tr></thead><tbody>${data.map((r,i) => `<tr><td style="font-weight:700;${i<3?'color:'+(i===0?'#d4a840':i===1?'#a0a8b8':'#b87840'):''}">${i+1}</td><td>${r.trader}</td><td>$${r.account_size}</td><td>${r.eval_type}</td><td style="color:var(--green)">+${r.return_pct}%</td><td>${r.trades_count}</td><td><span class="badge badge-ok">${r.status}</span></td></tr>`).join('')}</tbody></table>`;
}

// ==========================================
// ADMIN
// ==========================================
async function loadAdmin() {
  if (!currentProfile?.is_admin) return;

  const { data: users } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  const usersEl = document.getElementById('admin-users');
  usersEl.innerHTML = users && users.length ? `<table class="tbl"><thead><tr><th>Email</th><th>Name</th><th>Admin</th><th>Created</th></tr></thead><tbody>${users.map(u => `<tr><td>${u.email}</td><td>${u.display_name}</td><td>${u.is_admin?'<span class="badge badge-ok">ADMIN</span>':'—'}</td><td>${new Date(u.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3)">No users</p>';

  const { data: evals } = await sb.from('evaluations').select('*, profiles(email)').order('created_at', { ascending: false });
  const evalsEl = document.getElementById('admin-evals');
  evalsEl.innerHTML = evals && evals.length ? `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>User</th><th>Type</th><th>Size</th><th>Phase</th><th>Balance</th><th>Status</th><th>Created</th></tr></thead><tbody>${evals.map(e => `<tr><td>${e.profiles?.email||'—'}</td><td>${e.eval_type}</td><td>$${e.account_size}</td><td>${e.phase}</td><td>${fmt(e.balance)}</td><td><span class="badge ${e.status==='active'?'badge-ok':e.status==='funded'?'badge-ok':e.status==='passed'?'badge-warn':'badge-fail'}">${e.status}</span></td><td>${new Date(e.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table></div>` : '<p style="color:var(--text3)">No evaluations</p>';
}

async function adminCreateEval() {
  const errEl = document.getElementById('admin-create-err');
  const okEl = document.getElementById('admin-create-ok');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  const email = document.getElementById('ac-email').value.trim();
  const type = document.getElementById('ac-type').value;
  const size = parseInt(document.getElementById('ac-size').value);

  if (!email) { showMsg(errEl, 'Enter user email', 'err'); return; }

  const { data: profiles } = await sb.from('profiles').select('id').eq('email', email);
  if (!profiles || profiles.length === 0) { showMsg(errEl, 'User not found', 'err'); return; }
  const userId = profiles[0].id;

  const isOneStep = type === '1-step';
  const profitTarget = isOneStep ? 10 : 6;
  const consistency = isOneStep ? 20 : 50;
  const minTrades = isOneStep ? 5 : 2;

  const { error } = await sb.from('evaluations').insert({
    user_id: userId,
    eval_type: type,
    account_size: size,
    phase: 1,
    status: 'active',
    starting_balance: size,
    balance: size,
    high_water_mark: size,
    profit_target_pct: profitTarget,
    max_drawdown_pct: 6,
    consistency_rule_pct: consistency,
    min_trades: minTrades,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
  });

  if (error) { showMsg(errEl, error.message, 'err'); return; }
  showMsg(okEl, `Evaluation created for ${email}: ${type} $${size}`, 'ok');
  document.getElementById('ac-email').value = '';
  await loadAdmin();
}

function showAdminTab(tab) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active'));
  document.getElementById('admin-' + tab).classList.add('active');
  event.target.classList.add('active');
}

// ==========================================
// STRIPE
// ==========================================
function startChallenge(type, size) {
  const key = type + '-' + size;
  const link = STRIPE_LINKS[key];
  if (link && !link.startsWith('STRIPE_LINK')) {
    window.location.href = link;
  } else {
    if (!currentUser) {
      showPage('login');
    } else {
      alert('Payment links not configured yet. Contact admin to activate your evaluation.');
    }
  }
}

// ==========================================
// NAVIGATION
// ==========================================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) { page.classList.add('active'); window.scrollTo(0, 0); }
  const link = document.querySelector('.nav-links a[data-page="' + id + '"]');
  if (link) link.classList.add('active');

  if (id === 'dashboard') loadDashboard();
  if (id === 'leaderboard') loadLeaderboard();
  if (id === 'admin' && currentProfile?.is_admin) loadAdmin();
}

function bindDataPage() {
  document.querySelectorAll('[data-page]').forEach(el => {
    if (!el._bound) {
      el.addEventListener('click', e => { e.preventDefault(); showPage(el.getAttribute('data-page')); });
      el._bound = true;
    }
  });
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); showPage(el.getAttribute('data-page')); });
    el._bound = true;
  });
  document.querySelectorAll('.faq-q').forEach(q => {
    q.addEventListener('click', () => { q.classList.toggle('open'); q.nextElementSibling.classList.toggle('open'); });
  });
  document.getElementById('t1').addEventListener('click', () => { document.getElementById('t1').classList.add('active'); document.getElementById('t2').classList.remove('active'); document.getElementById('s1').classList.add('active'); document.getElementById('s2').classList.remove('active'); });
  document.getElementById('t2').addEventListener('click', () => { document.getElementById('t2').classList.add('active'); document.getElementById('t1').classList.remove('active'); document.getElementById('s2').classList.add('active'); document.getElementById('s1').classList.remove('active'); });

  document.querySelectorAll('.modal-bg').forEach(bg => {
    bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('open'); });
  });

  if (window.location.search.includes('payment=success')) {
    alert('Payment received! Your evaluation will be activated shortly. Sign in to check your dashboard.');
    window.history.replaceState({}, '', window.location.pathname);
  }

  checkSession();
});
