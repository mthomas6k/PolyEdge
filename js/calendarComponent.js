// ==========================================
// CALENDAR COMPONENT
// calendarComponent.js — Monthly P&L calendar view
// ==========================================

const CalendarComponent = (() => {
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let closedTrades = [];
  /** @type {{ date: string, pnl: number }[]} — Polymarket wallet: net activity P&amp;L by day */
  let walletDailyRows = [];
  /** @type {Record<string, { title: string, side: string, signedUsd: number, absUsd: number }[]> | null} */
  let walletActivityByDay = null;
  /** @type {{ at: string, label: string, kind?: string }[]} */
  let milestones = [];

  function setTrades(trades) {
    closedTrades = (trades || []).filter(t => t.status === 'closed' && t.closed_at);
  }

  /** When set, calendar uses on-chain daily net instead of evaluation trades */
  function setWalletDaily(rows) {
    walletDailyRows = Array.isArray(rows) ? rows.filter(r => r && r.date) : [];
  }

  /** Fills per calendar day (YYYY-MM-DD) for wallet mode — from Polymarket activity */
  function setWalletActivityByDay(map) {
    walletActivityByDay = map && typeof map === 'object' ? map : null;
  }

  function setMilestones(list) {
    milestones = Array.isArray(list) ? list.filter(m => m && m.at) : [];
  }

  function getMonthData(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const dailyPnl = {};
    const dailyTrades = {};

    if (walletDailyRows.length) {
      walletDailyRows.forEach(row => {
        const d = new Date(row.date + 'T12:00:00');
        if (d.getFullYear() === year && d.getMonth() === month) {
          const day = d.getDate();
          const amt = parseFloat(row.pnl || 0);
          if (!dailyPnl[day]) { dailyPnl[day] = 0; dailyTrades[day] = []; }
          dailyPnl[day] += amt;
          const iso = String(row.date).slice(0, 10);
          const legs = walletActivityByDay && walletActivityByDay[iso];
          if (legs && legs.length) {
            legs.forEach(tr => {
              dailyTrades[day].push({
                contract_name: tr.title || 'Trade',
                side: tr.side || '—',
                pnl: tr.signedUsd,
                walletFills: true,
              });
            });
          } else {
            dailyTrades[day].push({ contract_name: 'Net flow (no fill breakdown)', side: '—', pnl: amt, walletDay: true });
          }
        }
      });
    } else {
      closedTrades.forEach(t => {
        const d = new Date(t.closed_at);
        if (d.getFullYear() === year && d.getMonth() === month) {
          const day = d.getDate();
          if (!dailyPnl[day]) { dailyPnl[day] = 0; dailyTrades[day] = []; }
          dailyPnl[day] += parseFloat(t.pnl || 0);
          dailyTrades[day].push(t);
        }
      });
    }

    const totalPnl = Object.values(dailyPnl).reduce((s, v) => s + v, 0);
    const tradingDays = Object.keys(dailyPnl).length;
    const winDays = Object.values(dailyPnl).filter(v => v > 0).length;
    const lossDays = Object.values(dailyPnl).filter(v => v < 0).length;
    const bestDay = Math.max(...Object.values(dailyPnl), 0);
    const worstDay = Math.min(...Object.values(dailyPnl), 0);

    const milestoneByDay = {};
    milestones.forEach(m => {
      const d = new Date(m.at);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!milestoneByDay[day]) milestoneByDay[day] = [];
        milestoneByDay[day].push(m);
      }
    });

    return { daysInMonth, firstDay, dailyPnl, dailyTrades, totalPnl, tradingDays, winDays, lossDays, bestDay, worstDay, milestoneByDay };
  }

  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const data = getMonthData(currentYear, currentMonth);
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const dayHeaders = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    let calendarCells = '';
    for (let i = 0; i < data.firstDay; i++) {
      calendarCells += '<div class="cal-cell cal-empty"></div>';
    }
    for (let d = 1; d <= data.daysInMonth; d++) {
      const pnl = data.dailyPnl[d];
      const trades = data.dailyTrades[d] || [];
      const hasTrades = pnl !== undefined;
      const ms = data.milestoneByDay[d] || [];
      const hasMilestone = ms.length > 0;
      const isToday = d === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
      let cls = 'cal-cell';
      if (isToday) cls += ' cal-today';
      if (hasMilestone) cls += ' cal-milestone';
      if (hasTrades && pnl > 0) cls += ' cal-green';
      if (hasTrades && pnl < 0) cls += ' cal-red';
      if (hasTrades && pnl === 0) cls += ' cal-neutral';

      const msHtml = hasMilestone
        ? `<div class="cal-milestone-pill" title="${ms.map(m => m.label).join(' · ')}">${ms[0].label}</div>`
        : '';

      const click = hasTrades || hasMilestone ? `onclick="CalendarComponent.showDayDetail(${d})"` : '';

      calendarCells += `
        <div class="${cls}" ${click}>
          <div class="cal-day-num">${d}</div>
          ${msHtml}
          ${hasTrades ? `
            <div class="cal-day-pnl ${pnl >= 0 ? 'cal-pnl-pos' : 'cal-pnl-neg'}">
              ${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}
            </div>
            <div class="cal-day-trades">${trades.length} trade${trades.length !== 1 ? 's' : ''}</div>
          ` : ''}
        </div>`;
    }

    const calTitle = walletDailyRows.length ? 'On-chain activity calendar' : 'Evaluation P&amp;L calendar';

    container.innerHTML = `
      <div class="cal-card an-card an-card-full cal-card-rounded" style="margin-top:20px">
        <div class="cal-header">
          <span class="an-card-title">${calTitle}</span>
          <div class="cal-nav">
            <button class="cal-nav-btn" onclick="CalendarComponent.prevMonth('${containerId}')">‹</button>
            <span class="cal-month-label">${monthNames[currentMonth]} ${currentYear}</span>
            <button class="cal-nav-btn" onclick="CalendarComponent.nextMonth('${containerId}')">›</button>
          </div>
        </div>
        <div class="cal-summary">
          <div class="cal-sum-item"><div class="cal-sum-label">Month P&L</div><div class="cal-sum-val ${data.totalPnl >= 0 ? 'grn' : 'red'}">${data.totalPnl >= 0 ? '+' : ''}$${Math.abs(data.totalPnl).toFixed(2)}</div></div>
          <div class="cal-sum-item"><div class="cal-sum-label">Trading Days</div><div class="cal-sum-val">${data.tradingDays}</div></div>
          <div class="cal-sum-item"><div class="cal-sum-label">Win Days</div><div class="cal-sum-val grn">${data.winDays}</div></div>
          <div class="cal-sum-item"><div class="cal-sum-label">Loss Days</div><div class="cal-sum-val red">${data.lossDays}</div></div>
          <div class="cal-sum-item"><div class="cal-sum-label">Best Day</div><div class="cal-sum-val grn">+$${data.bestDay.toFixed(2)}</div></div>
          <div class="cal-sum-item"><div class="cal-sum-label">Worst Day</div><div class="cal-sum-val red">$${data.worstDay.toFixed(2)}</div></div>
        </div>
        <div class="cal-grid-header">
          ${dayHeaders.map(d => `<div class="cal-hdr">${d}</div>`).join('')}
        </div>
        <div class="cal-grid">${calendarCells}</div>
        <div id="cal-day-detail" class="cal-detail"></div>
      </div>`;
  }

  function showDayDetail(day) {
    const detail = document.getElementById('cal-day-detail');
    if (!detail) return;
    const md = getMonthData(currentYear, currentMonth);
    const trades = md.dailyTrades[day] || [];
    const pnl = md.dailyPnl[day] || 0;
    const ms = md.milestoneByDay[day] || [];
    if (trades.length === 0 && ms.length === 0) { detail.innerHTML = ''; return; }

    const msBlock = ms.length
      ? `<div class="cal-milestone-detail">${ms.map(m => `<div class="cal-ms-row"><span class="cal-ms-dot"></span><span>${m.label}</span></div>`).join('')}</div>`
      : '';

    if (trades.length === 0) {
      detail.innerHTML = `
      <div class="cal-detail-inner">
        <div class="cal-detail-header">
          <span class="cal-detail-date">${new Date(currentYear, currentMonth, day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
        ${msBlock}
      </div>`;
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    detail.innerHTML = `
      <div class="cal-detail-inner">
        <div class="cal-detail-header">
          <span class="cal-detail-date">${new Date(currentYear, currentMonth, day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          <span class="cal-detail-pnl ${pnl >= 0 ? 'grn' : 'red'}">${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}</span>
        </div>
        ${msBlock}
        <table class="tbl">
          <thead><tr>${trades[0] && trades[0].walletFills ? '<th>Market / leg</th><th>Side</th><th>USDC (signed)</th>' : trades[0] && trades[0].walletDay ? '<th>Source</th><th>P&amp;L</th>' : '<th>Contract</th><th>Side</th><th>Entry</th><th>Exit</th><th>P&L</th>'}</tr></thead>
          <tbody>
            ${trades.map(t => t.walletFills ? `
              <tr>
                <td>${t.contract_name || '—'}</td>
                <td>${t.side || '—'}</td>
                <td class="${t.pnl >= 0 ? 'pgrn' : 'pred'}">${t.pnl >= 0 ? '+' : ''}$${Number(t.pnl).toFixed(2)}</td>
              </tr>` : t.walletDay ? `
              <tr>
                <td>${t.contract_name || '—'}</td>
                <td class="${t.pnl >= 0 ? 'pgrn' : 'pred'}">${t.pnl >= 0 ? '+' : ''}$${Number(t.pnl).toFixed(2)}</td>
              </tr>` : `
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

  return { setTrades, setWalletDaily, setWalletActivityByDay, setMilestones, render, showDayDetail, prevMonth, nextMonth };
})();