// ==========================================
// ACCOUNT MANAGER
// accountManager.js — Switch between funded accounts
// ==========================================

const AccountManager = (() => {
  let accounts = [];
  let selectedAccountId = null;
  let onAccountChange = null;

  function setChangeCallback(cb) {
    onAccountChange = cb;
  }

  async function loadAccounts() {
    if (!sb || !currentUser) return [];
    try {
      const { data } = await sb.from('evaluations')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      accounts = data || [];
      // Auto-select first active/funded, or first account
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
    // Persist selection
    try { localStorage.setItem('pp_selected_account', id); } catch(e) {}
    if (onAccountChange) onAccountChange(getSelected());
  }

  // Restore saved selection
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
      'active': '<span class="badge badge-ok">ACTIVE</span>',
      'funded': '<span class="badge badge-ok">FUNDED</span>',
      'passed': '<span class="badge badge-warn">PASSED</span>',
      'failed': '<span class="badge badge-fail">FAILED</span>',
      'expired': '<span class="badge badge-fail">EXPIRED</span>',
    };
    return map[status] || `<span class="badge">${(status||'').toUpperCase()}</span>`;
  }

  function renderAccountSelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (accounts.length === 0) {
      container.innerHTML = `
        <div class="acct-empty">
          <div class="acct-empty-icon">◇</div>
          <h3>No Accounts Found</h3>
          <p>Purchase a challenge to create your first evaluation account.</p>
          <button class="btn btn-primary" data-page="challenges">View Challenges →</button>
        </div>`;
      bindDataPage();
      return;
    }

    const selected = getSelected();
    container.innerHTML = `
      <div class="acct-page">
        <div class="section" style="padding-top:32px">
          <div class="section-tag">Accounts</div>
          <h2>Your Evaluations</h2>
          <div class="acct-grid">
            ${accounts.map(a => {
              const isSelected = a.id === selectedAccountId;
              const profit = a.balance - a.starting_balance;
              const profitPct = ((profit / a.starting_balance) * 100).toFixed(1);
              const typeLabel = a.eval_type === '1-step' ? 'One-Step' : `Two-Step · P${a.phase}`;
              const daysUsed = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000);
              return `
                <div class="acct-card ${isSelected ? 'acct-selected' : ''}" onclick="AccountManager.selectAccount('${a.id}');AccountManager.renderAccountSelector('accounts-content');loadDashboard();loadAnalytics();">
                  <div class="acct-card-top">
                    <div class="acct-card-id">#${(a.id || '').slice(0,8)}</div>
                    ${getStatusBadge(a.status)}
                  </div>
                  <div class="acct-card-size">$${Number(a.account_size).toLocaleString()}</div>
                  <div class="acct-card-type">${typeLabel}</div>
                  <div class="acct-card-stats">
                    <div class="acct-stat">
                      <div class="acct-stat-label">Balance</div>
                      <div class="acct-stat-val">$${Number(a.balance).toFixed(2)}</div>
                    </div>
                    <div class="acct-stat">
                      <div class="acct-stat-label">P&L</div>
                      <div class="acct-stat-val ${profit >= 0 ? 'grn' : 'red'}">${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}</div>
                    </div>
                    <div class="acct-stat">
                      <div class="acct-stat-label">Profit %</div>
                      <div class="acct-stat-val ${profit >= 0 ? 'grn' : 'red'}">${profit >= 0 ? '+' : ''}${profitPct}%</div>
                    </div>
                    <div class="acct-stat">
                      <div class="acct-stat-label">Day</div>
                      <div class="acct-stat-val">${daysUsed}</div>
                    </div>
                  </div>
                  <div class="acct-card-trades">
                    <span>${a.trades_count || 0} trades</span>
                    <span>DD: ${a.high_water_mark > 0 ? (((a.high_water_mark - a.balance) / a.high_water_mark) * 100).toFixed(1) : '0.0'}%</span>
                  </div>
                  ${isSelected ? '<div class="acct-active-indicator">● Active</div>' : '<div class="acct-select-hint">Click to select</div>'}
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
    bindDataPage();
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

