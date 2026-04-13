// ==========================================
// ACCOUNT MANAGER V3
// accountManager.js — Premium account lifecycle UI
// ==========================================

const AccountManager = (() => {
  let accounts = [];
  let selectedAccountId = null;
  let onAccountChange = null;

  // === SVG Icon helpers ===
  const ICONS = {
    shield: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    zap: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    target: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    dollar: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    award: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`,
    trendUp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    trendDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
    alertTriangle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    xCircle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    hexagon: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    arrowRight: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    barChart: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    hash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
  };

  function setChangeCallback(cb) { onAccountChange = cb; }

  async function loadAccounts() {
    if (!sb || !currentUser) return [];
    try {
      const { data } = await sb.from('evaluations')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      accounts = data || [];
      if (!selectedAccountId && accounts.length > 0) {
        const active = accounts.find(a => a.status === 'active' || a.status === 'funded');
        selectedAccountId = active ? active.id : accounts[0].id;
      }
      return accounts;
    } catch (e) {
      console.warn('Failed to load accounts:', e);
      return [];
    }
  }

  function getAccounts() { return accounts; }
  function getSelected() { return accounts.find(a => a.id === selectedAccountId) || null; }
  function getSelectedId() { return selectedAccountId; }

  function selectAccount(id) {
    if (selectedAccountId === id) return;
    selectedAccountId = id;
    try { localStorage.setItem('pp_selected_account', id); } catch(e) {}
    if (onAccountChange) onAccountChange(getSelected());
  }

  function restoreSelection() {
    try {
      const saved = localStorage.getItem('pp_selected_account');
      if (saved && accounts.find(a => a.id === saved)) {
        selectedAccountId = saved;
      }
    } catch(e) {}
  }

  function getStatusBadge(status) {
    const map = {
      'active': `<span class="status-badge status-active">${ICONS.zap} Active</span>`,
      'funded': `<span class="status-badge status-funded">${ICONS.award} Funded</span>`,
      'passed': `<span class="status-badge status-passed">${ICONS.check} Passed</span>`,
      'failed': `<span class="status-badge status-failed">${ICONS.xCircle} Failed</span>`,
      'expired': `<span class="status-badge status-expired">${ICONS.clock} Expired</span>`,
    };
    return map[status] || `<span class="status-badge">${(status||'').toUpperCase()}</span>`;
  }

  // === SVG Progress Ring ===
  function progressRing(pct, gradClass, label, valueText) {
    const r = 22;
    const c = Math.PI * 2 * r;
    const clamped = Math.max(0, Math.min(100, pct));
    const offset = c - (clamped / 100) * c;
    return `
      <div class="acct-ring-item">
        <svg class="acct-ring-svg" viewBox="0 0 56 56">
          <circle class="acct-ring-bg" cx="28" cy="28" r="${r}"/>
          <circle class="acct-ring-fill ${gradClass}" cx="28" cy="28" r="${r}"
            stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
          <text class="acct-ring-center" x="28" y="32" text-anchor="middle"
            transform="rotate(90 28 28)">${valueText}</text>
        </svg>
        <div class="acct-ring-label">${label}</div>
      </div>`;
  }

  // === Status Pipeline ===
  function renderPipeline(account) {
    const s = account.status;
    const isTwoStep = account.eval_type !== '1-step';
    const phase = account.phase || 1;

    let steps = [];
    if (isTwoStep) {
      steps = [
        { label: 'Phase 1', icon: '1', done: phase > 1 || s === 'passed' || s === 'funded', active: phase === 1 && s === 'active', fail: s === 'failed' && phase === 1 },
        { label: 'Phase 2', icon: '2', done: s === 'passed' || s === 'funded', active: phase === 2 && s === 'active', fail: s === 'failed' && phase === 2 },
        { label: 'Passed', icon: ICONS.check, done: s === 'passed' || s === 'funded', active: false },
        { label: 'Funded', icon: ICONS.award, done: s === 'funded', active: s === 'passed' },
      ];
    } else {
      steps = [
        { label: 'Evaluation', icon: '1', done: s === 'passed' || s === 'funded', active: s === 'active', fail: s === 'failed' },
        { label: 'Passed', icon: ICONS.check, done: s === 'passed' || s === 'funded', active: false },
        { label: 'Funded', icon: ICONS.award, done: s === 'funded', active: s === 'passed' },
      ];
    }

    let html = '<div class="acct-pipeline">';
    steps.forEach((step, i) => {
      const cls = step.fail ? 'pipe-fail' : step.done ? 'pipe-done' : step.active ? 'pipe-active' : '';
      const iconContent = step.icon.startsWith('<') ? step.icon : `<span style="font-weight:700;font-size:13px">${step.icon}</span>`;
      html += `<div class="acct-pipe-step ${cls}"><div class="acct-pipe-dot">${iconContent}</div><div class="acct-pipe-label">${step.label}</div></div>`;
      if (i < steps.length - 1) {
        const lineDone = step.done ? 'pipe-line-done' : '';
        html += `<div class="acct-pipe-line ${lineDone}"></div>`;
      }
    });
    html += '</div>';
    return html;
  }

  // === Main Render ===
  function renderAccountSelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (accounts.length === 0) {
      container.innerHTML = `
        <div class="acct-page-v3">
          <div class="acct-empty-v3">
            <div class="acct-empty-hex">${ICONS.hexagon}</div>
            <h3>No Accounts Yet</h3>
            <p>Purchase a challenge to create your first evaluation account and start trading.</p>
            <button class="btn btn-primary" data-page="challenges">View Challenges ${ICONS.arrowRight}</button>
          </div>
        </div>`;
      bindDataPage();
      return;
    }

    const selected = getSelected();
    const activeCount = accounts.filter(a => a.status === 'active' || a.status === 'funded').length;
    const passedCount = accounts.filter(a => a.status === 'passed' || a.status === 'funded').length;

    container.innerHTML = `
      <div class="acct-page-v3">
        <div class="acct-hero">
          <div class="acct-hero-tag">${ICONS.shield} Accounts</div>
          <div class="acct-hero-title">Your Evaluations</div>
          <div class="acct-hero-sub">${accounts.length} account${accounts.length !== 1 ? 's' : ''} · ${activeCount} active · ${passedCount} passed. Select an account to trade or view its dashboard.</div>
        </div>

        ${selected ? renderPipeline(selected) : ''}

        <div class="acct-grid-v3">
          ${accounts.map(a => renderCardV3(a)).join('')}
        </div>
      </div>`;
    bindDataPage();
  }

  function renderCardV3(a) {
    const isSelected = a.id === selectedAccountId;
    const profit = a.balance - a.starting_balance;
    const profitPct = ((profit / a.starting_balance) * 100).toFixed(1);
    const typeLabel = a.eval_type === '1-step' ? 'One-Step' : `Two-Step · Phase ${a.phase}`;
    const daysLeft = Math.max(0, Math.ceil((new Date(a.expires_at).getTime() - Date.now()) / 86400000));
    const daysUsed = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000);

    // Progress calculations
    const profitTarget = a.starting_balance * (a.profit_target_pct / 100);
    const profitBar = profitTarget > 0 ? Math.min(100, (Math.max(0, profit) / profitTarget) * 100) : 0;
    const ddUsed = a.high_water_mark > 0 ? ((a.high_water_mark - a.balance) / a.high_water_mark * 100) : 0;
    const ddBar = a.max_drawdown_pct > 0 ? Math.min(100, (ddUsed / a.max_drawdown_pct) * 100) : 0;
    const tradeBar = Math.min(100, ((a.trades_count || 0) / Math.max(1, a.min_trades)) * 100);

    const isFailed = a.status === 'failed' || a.status === 'expired';
    const isActive = a.status === 'active' || a.status === 'funded';

    const profitIcon = profit >= 0 ? ICONS.trendUp : ICONS.trendDown;
    const profitColor = profit >= 0 ? 'grn' : 'red';

    return `
      <div class="acct-card-v3 ${isSelected ? 'acct-selected-v3' : ''} ${isFailed ? 'acct-blown' : ''}"
           onclick="AccountManager.selectAccount('${a.id}');AccountManager.renderAccountSelector('accounts-content');loadDashboard();loadPolyEdgeStats();loadAnalytics();">
        <div class="acct-card-header-v3">
          <div class="acct-card-id-v3">${ICONS.hash} ${(a.id || '').slice(0,8)}</div>
          ${getStatusBadge(a.status)}
        </div>
        <div class="acct-card-body-v3">
          ${isFailed ? `<div class="acct-blown-banner">${ICONS.alertTriangle} Account ${a.status === 'expired' ? 'expired' : 'breached drawdown limit'} — evaluation closed.</div>` : ''}
          <div class="acct-card-size-v3">$${Number(a.account_size).toLocaleString()}</div>
          <div class="acct-card-type-v3">${ICONS.target} ${typeLabel}</div>

          <div class="acct-rings">
            ${progressRing(profitBar, 'acct-ring-fill-profit', 'Profit Target', `${profitBar.toFixed(0)}%`)}
            ${progressRing(ddBar, 'acct-ring-fill-dd', 'Drawdown', `${ddUsed.toFixed(1)}%`)}
            ${progressRing(tradeBar, 'acct-ring-fill-trades', 'Trades', `${a.trades_count || 0}/${a.min_trades}`)}
          </div>

          <div class="acct-stats-v3">
            <div class="acct-stat-v3">
              <div class="acct-stat-label-v3">Balance</div>
              <div class="acct-stat-val-v3">$${Number(a.balance).toFixed(2)}</div>
            </div>
            <div class="acct-stat-v3">
              <div class="acct-stat-label-v3">P&L</div>
              <div class="acct-stat-val-v3 ${profitColor}">${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}</div>
            </div>
            <div class="acct-stat-v3">
              <div class="acct-stat-label-v3">Return</div>
              <div class="acct-stat-val-v3 ${profitColor}">${profit >= 0 ? '+' : ''}${profitPct}%</div>
            </div>
            <div class="acct-stat-v3">
              <div class="acct-stat-label-v3">Day</div>
              <div class="acct-stat-val-v3">${daysUsed}</div>
            </div>
          </div>
        </div>

        <div class="acct-card-footer-v3">
          <div class="acct-card-meta-v3">
            ${ICONS.clock}
            <span>${daysLeft}d left · ends ${new Date(a.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
          <div class="acct-card-actions-v3">
            ${isActive ? `
              <button class="acct-action-btn" onclick="event.stopPropagation();showPage('markets')">
                ${ICONS.barChart} Trade
              </button>
            ` : ''}
            <button class="acct-action-btn acct-action-btn--primary" onclick="event.stopPropagation();showPage('dashboard')">
              Dashboard ${ICONS.arrowRight}
            </button>
          </div>
        </div>
        ${isSelected
          ? '<div class="acct-active-glow" style="padding:0 24px 14px">Selected for trading</div>'
          : '<div class="acct-select-cta" style="padding:0 24px 14px">Click to select</div>'}
      </div>`;
  }

  return {
    loadAccounts,
    getAccounts,
    getSelected,
    getSelectedId,
    selectAccount,
    restoreSelection,
    renderAccountSelector,
    setChangeCallback,
    getStatusBadge
  };
})();
