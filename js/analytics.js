// ==========================================
// POLYMARKET ANALYTICS ENGINE
// analytics.js
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
    if (attempt >= PROXIES.length) throw new Error('All CORS proxies failed. Try again in a moment.');
    const proxy = PROXIES[(proxyIndex + attempt) % PROXIES.length];
    try {
      const r = await fetch(proxy(url), {
        headers: { 'x-requested-with': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      // Handle empty responses gracefully
      if (!text || text.trim() === '') return [];
      return JSON.parse(text);
    } catch (e) {
      console.warn(`Proxy ${attempt} failed for ${url}:`, e.message);
      return fetchWithProxy(url, attempt + 1);
    }
  }

  async function getPositions(wallet) {
    try {
      const data = await fetchWithProxy(`${DATA_API}/positions?user=${wallet}&sizeThreshold=0&limit=500`);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('getPositions failed:', e);
      return [];
    }
  }

  async function getActivity(wallet) {
    try {
      const data = await fetchWithProxy(`${DATA_API}/activity?user=${wallet}&limit=500&type=TRADE`);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('getActivity failed:', e);
      return [];
    }
  }

  async function getProfile(wallet) {
    try {
      return await fetchWithProxy(`${GAMMA_API}/profiles?user=${wallet}`);
    } catch { return null; }
  }

  function computeStats(positions, activity) {
    const trades = (activity || []).filter(a => a.type === 'TRADE' || a.side);

    // P&L over time
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
      return { date: d, pnl: parseFloat(cum.toFixed(2)) };
    });

    const pos = Array.isArray(positions) ? positions : [];
    const totalRealizedPnl = pos.reduce((s, p) => s + parseFloat(p.realizedPnl || 0), 0);
    const totalCurrentValue = pos.reduce((s, p) => s + parseFloat(p.currentValue || 0), 0);
    const totalCashPnl = pos.reduce((s, p) => s + parseFloat(p.cashPnl || 0), 0);
    const totalInitialValue = pos.reduce((s, p) => s + parseFloat(p.initialValue || 0), 0);

    const closed = pos.filter(p => {
      const price = parseFloat(p.curPrice || 0);
      return p.redeemable || price <= 0.01 || price >= 0.99;
    });
    const won = closed.filter(p => {
      const price = parseFloat(p.curPrice || 0);
      return price >= 0.99 || parseFloat(p.cashPnl || 0) > 0;
    });
    const winRate = closed.length > 0 ? (won.length / closed.length * 100) : 0;

    const open = pos.filter(p =>
      !p.redeemable &&
      parseFloat(p.curPrice || 0) > 0.01 &&
      parseFloat(p.curPrice || 0) < 0.99
    );

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
      best,
      worst,
      totalVolume,
      totalTrades: trades.length,
      dayPerf,
      positions: pos,
    };
  }

  return { getPositions, getActivity, getProfile, computeStats };
})();


// ==========================================
// ANALYTICS PAGE RENDERER
// ==========================================

let analyticsWallet = null;
let analyticsData = null;

async function loadAnalytics() {
  const content = document.getElementById('analytics-content');
  if (!content) return;

  // Get wallet from profile or existing
  if (!analyticsWallet) {
    analyticsWallet = (typeof currentProfile !== 'undefined' && currentProfile?.polymarket_wallet) || null;
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
    <div class="an-center">
      <div class="an-connect-box">
        <div class="an-connect-icon">◎</div>
        <h2>Connect Your Polymarket Wallet</h2>
        <p>Enter your Polymarket wallet address to load your live portfolio analytics. Your address is public on-chain — no private keys needed.</p>
        <div class="an-input-row">
          <input class="form-input" id="pm-wallet-input" placeholder="0x... your wallet address" style="font-size:12px;letter-spacing:0.5px">
          <button class="form-btn" style="width:auto;padding:14px 28px;white-space:nowrap" onclick="connectWallet()">Load Portfolio →</button>
        </div>
        <div class="msg msg-err" id="wallet-err" style="margin-top:12px"></div>
        <p class="an-hint">Find your address on <a href="https://polymarket.com" target="_blank" style="color:var(--accent)">polymarket.com</a> → Profile → copy the wallet address from the URL.</p>
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

  // Save to profile if logged in
  if (typeof currentUser !== 'undefined' && currentUser && typeof sb !== 'undefined' && sb) {
    try {
      await sb.from('profiles').update({ polymarket_wallet: wallet }).eq('id', currentUser.id);
      if (currentProfile) currentProfile.polymarket_wallet = wallet;
    } catch(e) { /* non-critical */ }
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
        <div class="an-loading-sub">Querying Polymarket Data API via CORS proxy</div>
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
          <button class="form-btn secondary" style="width:auto;margin-top:10px;padding:12px 24px" onclick="analyticsWallet=null;loadAnalytics()">Change Wallet</button>
        </div>
      </div>`;
  }
}

function renderAnalyticsDashboard(s, wallet) {
  const shortWallet = wallet.slice(0, 6) + '...' + wallet.slice(-4);
  const pnlColor = s.totalCashPnl >= 0 ? 'var(--green)' : 'var(--red)';
  const pnlSign = s.totalCashPnl >= 0 ? '+' : '';

  const c = document.getElementById('analytics-content');
  if (!c) return;
  c.innerHTML = `
    <div class="an-header">
      <div class="an-header-left">
        <div class="an-wallet-badge">
          <span class="an-wallet-dot"></span>
          <span class="an-wallet-addr">${shortWallet}</span>
          <button class="an-change-wallet" onclick="analyticsWallet=null;loadAnalytics()">change</button>
        </div>
        <h1 class="an-title">Portfolio Analytics</h1>
      </div>
      <button class="an-refresh-btn" onclick="fetchAndRenderAnalytics('${wallet}')">
        <span class="an-refresh-icon">↻</span> Refresh
      </button>
    </div>

    <div class="an-kpis">
      <div class="an-kpi" data-tooltip="Total unrealized + realized P&L across all positions">
        <div class="an-kpi-label">Total P&L</div>
        <div class="an-kpi-val" style="color:${pnlColor}">${pnlSign}$${Math.abs(s.totalCashPnl).toFixed(2)}</div>
        <div class="an-kpi-sub">cash P&amp;L</div>
      </div>
      <div class="an-kpi" data-tooltip="Realized profits from closed/resolved markets">
        <div class="an-kpi-label">Realized P&L</div>
        <div class="an-kpi-val" style="color:${s.totalRealizedPnl>=0?'var(--green)':'var(--red)'}">${s.totalRealizedPnl>=0?'+':''}$${Math.abs(s.totalRealizedPnl).toFixed(2)}</div>
        <div class="an-kpi-sub">from closed markets</div>
      </div>
      <div class="an-kpi" data-tooltip="Current market value of all open positions">
        <div class="an-kpi-label">Portfolio Value</div>
        <div class="an-kpi-val">$${s.totalCurrentValue.toFixed(2)}</div>
        <div class="an-kpi-sub">open positions</div>
      </div>
      <div class="an-kpi" data-tooltip="Win rate on resolved markets only">
        <div class="an-kpi-label">Win Rate</div>
        <div class="an-kpi-val" style="color:${s.winRate>=50?'var(--green)':'var(--red)'}">${s.winRate.toFixed(1)}%</div>
        <div class="an-kpi-sub">${s.won}W / ${s.lost}L</div>
      </div>
      <div class="an-kpi" data-tooltip="Total USDC traded across all activity">
        <div class="an-kpi-label">Volume</div>
        <div class="an-kpi-val">$${s.totalVolume.toFixed(0)}</div>
        <div class="an-kpi-sub">${s.totalTrades} trades</div>
      </div>
    </div>

    <div class="an-grid">
      <div class="an-card an-card-wide">
        <div class="an-card-header">
          <span class="an-card-title">Cumulative P&amp;L</span>
          <div class="an-chart-legend">
            <span class="an-leg-dot" style="background:var(--accent)"></span>
            <span>Cash P&amp;L over time</span>
          </div>
        </div>
        ${s.cumPnl.length > 0
          ? '<div class="an-chart-wrap"><canvas id="pnl-chart"></canvas></div>'
          : '<div class="an-empty-chart">No trade history found for this wallet</div>'
        }
      </div>

      <div class="an-card">
        <div class="an-card-header"><span class="an-card-title">Win Rate</span></div>
        <div class="an-gauge-wrap">
          <canvas id="gauge-chart" width="220" height="130"></canvas>
          <div class="an-gauge-center">
            <div class="an-gauge-val" style="color:${s.winRate>=50?'var(--green)':'var(--red)'}">${s.winRate.toFixed(1)}%</div>
            <div class="an-gauge-sub">of ${s.totalClosed} resolved</div>
          </div>
        </div>
        <div class="an-wl-row">
          <div class="an-wl-item">
            <div class="an-wl-num" style="color:var(--green)">${s.won}</div>
            <div class="an-wl-label">Won</div>
          </div>
          <div class="an-wl-divider"></div>
          <div class="an-wl-item">
            <div class="an-wl-num" style="color:var(--red)">${s.lost}</div>
            <div class="an-wl-label">Lost</div>
          </div>
        </div>
      </div>

      <div class="an-card">
        <div class="an-card-header"><span class="an-card-title">Day Performance</span></div>
        <div class="an-day-bars">${renderDayBars(s.dayPerf)}</div>
      </div>

      <div class="an-card">
        <div class="an-card-header"><span class="an-card-title">Best &amp; Worst</span></div>
        ${s.best ? `
          <div class="an-bw-item an-bw-best">
            <div class="an-bw-label">↑ Best Trade</div>
            <div class="an-bw-title">${truncate(s.best.title, 40)}</div>
            <div class="an-bw-val" style="color:var(--green)">+$${parseFloat(s.best.cashPnl).toFixed(2)}</div>
          </div>` : ''}
        ${s.worst ? `
          <div class="an-bw-item an-bw-worst">
            <div class="an-bw-label">↓ Worst Trade</div>
            <div class="an-bw-title">${truncate(s.worst.title, 40)}</div>
            <div class="an-bw-val" style="color:var(--red)">$${parseFloat(s.worst.cashPnl).toFixed(2)}</div>
          </div>` : '<div class="an-empty-state">No closed positions yet</div>'}
      </div>
    </div>

    <div class="an-card an-card-full" style="margin-top:20px">
      <div class="an-card-header">
        <span class="an-card-title">Open Positions</span>
        <span class="an-badge">${s.open.length} Active</span>
      </div>
      ${s.open.length > 0 ? `
        <div class="an-table-wrap">
          <table class="an-table">
            <thead><tr>
              <th>Market</th><th>Outcome</th><th>Cur Price</th><th>Avg Entry</th>
              <th>Size</th><th>Current Value</th><th>Unrealized P&L</th><th>%</th>
            </tr></thead>
            <tbody>
              ${s.open.map(p => {
                const curP = parseFloat(p.curPrice || 0);
                const avgP = parseFloat(p.avgPrice || 0);
                const pnl = parseFloat(p.cashPnl || 0);
                const pct = parseFloat(p.percentPnl || 0);
                const pnlClass = pnl >= 0 ? 'an-pos' : 'an-neg';
                const priceBar = Math.round(curP * 100);
                return `<tr class="an-tr" onclick="expandPosition(this)" data-title="${(p.title||'').replace(/"/g,'&quot;')}" data-slug="${p.slug||''}">
                  <td class="an-td-market">
                    <div class="an-market-name">${truncate(p.title, 45)}</div>
                    <div class="an-prob-bar"><div class="an-prob-fill" style="width:${priceBar}%;background:${curP>0.6?'var(--green)':curP<0.4?'var(--red)':'var(--yellow)'}"></div></div>
                  </td>
                  <td><span class="an-outcome-badge">${p.outcome || '—'}</span></td>
                  <td class="an-mono" style="color:${curP>0.6?'var(--green)':curP<0.4?'var(--red)':'var(--yellow)'}">${(curP*100).toFixed(1)}¢</td>
                  <td class="an-mono">${(avgP*100).toFixed(1)}¢</td>
                  <td class="an-mono">${parseFloat(p.size||0).toFixed(0)}</td>
                  <td class="an-mono">$${parseFloat(p.currentValue||0).toFixed(2)}</td>
                  <td class="an-mono ${pnlClass}">${pnl>=0?'+':''}$${Math.abs(pnl).toFixed(2)}</td>
                  <td class="an-mono ${pnlClass}">${pct>=0?'+':''}${pct.toFixed(1)}%</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="an-empty-state" style="padding:40px">No open positions found</div>'}
    </div>
  `;

  // Draw charts after DOM renders
  requestAnimationFrame(() => {
    if (s.cumPnl.length > 0) drawPnlChart(s.cumPnl);
    drawGauge(s.winRate);
    initTooltips();
  });
}

function renderDayBars(dayPerf) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const vals = days.map(d => dayPerf[d] || 0);
  const max = Math.max(...vals.map(Math.abs), 0.01);
  return `<div class="an-day-chart">
    ${days.map((d, i) => {
      const v = vals[i];
      const h = Math.round(Math.abs(v) / max * 60);
      const pos = v >= 0;
      return `<div class="an-day-col" title="${d}: ${v>=0?'+':''}$${v.toFixed(2)}">
        <div class="an-day-bar-wrap">
          <div class="an-day-bar" style="height:${Math.max(h, 2)}px;background:${pos?'var(--green)':'var(--red)'};opacity:${h<5?0.3:1}"></div>
        </div>
        <div class="an-day-label">${d}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function drawPnlChart(cumPnl) {
  const canvas = document.getElementById('pnl-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.offsetWidth || canvas.offsetWidth || 600;
  const H = 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const vals = cumPnl.map(d => d.pnl);
  const labels = cumPnl.map(d => d.date.slice(5));
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const range = max - min || 1;
  const pad = { t: 20, r: 20, b: 36, l: 56 };
  const w = W - pad.l - pad.r;
  const h = H - pad.t - pad.b;

  const toX = (i) => pad.l + (vals.length > 1 ? (i / (vals.length - 1)) * w : w / 2);
  const toY = (v) => pad.t + (1 - (v - min) / range) * h;

  // Zero line
  const zeroY = toY(0);
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, zeroY); ctx.lineTo(pad.l + w, zeroY); ctx.stroke();
  ctx.setLineDash([]);

  // Y labels
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.fillStyle = '#4a5878';
  ctx.textAlign = 'right';
  [min, (min + max) / 2, max].forEach(v => {
    ctx.fillText((v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(0), pad.l - 6, toY(v) + 4);
  });

  // X labels (sparse)
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(labels.length / 6));
  for (let i = 0; i < labels.length; i += step) {
    ctx.fillText(labels[i], toX(i), H - 8);
  }

  // Gradient fill
  const lastVal = vals[vals.length - 1] || 0;
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
  if (lastVal >= 0) {
    grad.addColorStop(0, 'rgba(64,176,128,0.25)');
    grad.addColorStop(1, 'rgba(64,176,128,0.01)');
  } else {
    grad.addColorStop(0, 'rgba(208,72,72,0.01)');
    grad.addColorStop(1, 'rgba(208,72,72,0.25)');
  }

  ctx.beginPath();
  ctx.moveTo(toX(0), toY(vals[0]));
  vals.forEach((v, i) => { if (i > 0) ctx.lineTo(toX(i), toY(v)); });
  ctx.lineTo(toX(vals.length - 1), pad.t + h);
  ctx.lineTo(toX(0), pad.t + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  const lineColor = lastVal >= 0 ? '#40b080' : '#d04848';
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(vals[0]));
  vals.forEach((v, i) => { if (i > 0) ctx.lineTo(toX(i), toY(v)); });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // End dot
  const lastX = toX(vals.length - 1);
  const lastY = toY(lastVal);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
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

  const cx = W / 2, cy = H - 20;
  const r = 90;

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Value arc
  const fillAngle = Math.PI + (winRate / 100) * Math.PI;
  const color = winRate >= 50 ? '#40b080' : winRate >= 30 ? '#c8a030' : '#d04848';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, fillAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Tick marks
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
  if (!document.getElementById('chart-tooltip')) {
    const tip = document.createElement('div');
    tip.id = 'chart-tooltip';
    tip.className = 'an-chart-tooltip';
    document.body.appendChild(tip);
  }
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
