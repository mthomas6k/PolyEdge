// ==========================================
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
