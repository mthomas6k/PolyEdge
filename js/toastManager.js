// ==========================================
// TOAST MANAGER
// toastManager.js — Premium notification toasts
// ==========================================

const Toast = (() => {
  let container = null;
  let toasts = [];
  const MAX_VISIBLE = 4;
  const DEFAULT_DURATION = 4500;

  const ICONS = {
    success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  function ensureContainer() {
    if (container && document.body.contains(container)) return;
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  function create(message, type = 'info', duration = DEFAULT_DURATION) {
    ensureContainer();

    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.id = id;
    el.innerHTML = `
      <div class="toast-icon">${ICONS[type] || ICONS.info}</div>
      <div class="toast-body">
        <div class="toast-msg">${message}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="toast-progress"><div class="toast-progress-bar" style="animation-duration:${duration}ms"></div></div>
    `;

    el.querySelector('.toast-close').addEventListener('click', () => dismiss(id));

    // Add to DOM
    container.appendChild(el);
    // Trigger entrance animation
    requestAnimationFrame(() => el.classList.add('toast--visible'));

    const entry = { id, el, timer: null };
    toasts.push(entry);

    // Auto dismiss
    entry.timer = setTimeout(() => dismiss(id), duration);

    // Enforce max visible
    while (toasts.length > MAX_VISIBLE) {
      dismiss(toasts[0].id);
    }

    return id;
  }

  function dismiss(id) {
    const idx = toasts.findIndex(t => t.id === id);
    if (idx === -1) return;
    const entry = toasts[idx];
    if (entry.timer) clearTimeout(entry.timer);
    entry.el.classList.add('toast--exit');
    entry.el.classList.remove('toast--visible');
    setTimeout(() => {
      if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    }, 340);
    toasts.splice(idx, 1);
  }

  function success(msg, duration) { return create(msg, 'success', duration); }
  function error(msg, duration) { return create(msg, 'error', duration || 6000); }
  function warning(msg, duration) { return create(msg, 'warning', duration || 5500); }
  function info(msg, duration) { return create(msg, 'info', duration); }

  return { success, error, warning, info, dismiss, create };
})();
