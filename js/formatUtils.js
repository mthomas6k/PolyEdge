// ==========================================
// FORMAT UTILS - Accounting format & currency
// ==========================================
const FormatUtils = (() => {
  const CURRENCIES = {
    USD: { symbol: '$', code: 'USD', name: 'US Dollar', decimals: 2, position: 'left' },
    EUR: { symbol: '\u20AC', code: 'EUR', name: 'Euro', decimals: 2, position: 'left' },
    GBP: { symbol: '\u00A3', code: 'GBP', name: 'British Pound', decimals: 2, position: 'left' },
    JPY: { symbol: '\u00A5', code: 'JPY', name: 'Japanese Yen', decimals: 0, position: 'left' },
    AUD: { symbol: 'A$', code: 'AUD', name: 'Australian Dollar', decimals: 2, position: 'left' },
    CAD: { symbol: 'C$', code: 'CAD', name: 'Canadian Dollar', decimals: 2, position: 'left' },
    CHF: { symbol: 'CHF', code: 'CHF', name: 'Swiss Franc', decimals: 2, position: 'left' },
    CNY: { symbol: '\u00A5', code: 'CNY', name: 'Chinese Yuan', decimals: 2, position: 'left' },
    KRW: { symbol: '\u20A9', code: 'KRW', name: 'South Korean Won', decimals: 0, position: 'left' },
    INR: { symbol: '\u20B9', code: 'INR', name: 'Indian Rupee', decimals: 2, position: 'left' },
    BRL: { symbol: 'R$', code: 'BRL', name: 'Brazilian Real', decimals: 2, position: 'left' },
    BTC: { symbol: '\u20BF', code: 'BTC', name: 'Bitcoin', decimals: 8, position: 'left' },
    ETH: { symbol: '\u039E', code: 'ETH', name: 'Ethereum', decimals: 6, position: 'left' },
    SOL: { symbol: 'SOL', code: 'SOL', name: 'Solana', decimals: 4, position: 'right' },
    XRP: { symbol: 'XRP', code: 'XRP', name: 'Ripple', decimals: 4, position: 'right' },
    XAU: { symbol: 'oz', code: 'XAU', name: 'Gold (Troy oz)', decimals: 2, position: 'right' },
    XAG: { symbol: 'oz', code: 'XAG', name: 'Silver (Troy oz)', decimals: 2, position: 'right' },
  };

  let activeCurrency = 'USD';
  let rates = {}; // rates relative to USD

  function getCurrency() {
    return activeCurrency;
  }

  function setCurrency(code) {
    if (CURRENCIES[code]) {
      activeCurrency = code;
      try { localStorage.setItem('pe_currency', code); } catch (e) {}
    }
  }

  function restoreCurrency() {
    try {
      const saved = localStorage.getItem('pe_currency');
      if (saved && CURRENCIES[saved]) activeCurrency = saved;
    } catch (e) {}
  }

  function getCurrencyInfo(code) {
    return CURRENCIES[code || activeCurrency] || CURRENCIES.USD;
  }

  function getAllCurrencies() {
    return Object.values(CURRENCIES);
  }

  // Format a raw USD value into display string
  // IMPORTANT: value is always stored/calculated in USD internally
  // This ONLY formats for display - never use the output for math
  function money(value, opts = {}) {
    const cur = CURRENCIES[opts.currency || activeCurrency] || CURRENCIES.USD;
    let num = Number(value);
    if (isNaN(num)) return cur.symbol + '0.00';

    // Convert from USD if not USD
    if (cur.code !== 'USD' && rates[cur.code]) {
      num = num * rates[cur.code];
    }

    const isNeg = num < 0;
    const abs = Math.abs(num);
    const decimals = opts.decimals !== undefined ? opts.decimals : cur.decimals;

    // Format with commas and fixed decimals
    const parts = abs.toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = parts.join('.');

    const sign = isNeg ? '-' : (opts.showPlus && num > 0 ? '+' : '');

    if (cur.position === 'right') {
      return sign + formatted + ' ' + cur.symbol;
    }
    return sign + cur.symbol + formatted;
  }

  // Format percentage
  function pct(value, decimals = 1) {
    const num = Number(value);
    if (isNaN(num)) return '0%';
    return num.toFixed(decimals) + '%';
  }

  // Compact format for large numbers (e.g., $1.2M)
  function compact(value) {
    const num = Number(value);
    if (isNaN(num)) return '$0';
    const cur = CURRENCIES[activeCurrency] || CURRENCIES.USD;
    const abs = Math.abs(num);
    let str;
    if (abs >= 1e9) str = (num / 1e9).toFixed(1) + 'B';
    else if (abs >= 1e6) str = (num / 1e6).toFixed(1) + 'M';
    else if (abs >= 1e3) str = (num / 1e3).toFixed(1) + 'K';
    else str = num.toFixed(cur.decimals);
    return cur.symbol + str;
  }

  function setRates(newRates) {
    rates = newRates || {};
  }

  restoreCurrency();

  return {
    money,
    pct,
    compact,
    getCurrency,
    setCurrency,
    getCurrencyInfo,
    getAllCurrencies,
    setRates,
    CURRENCIES,
  };
})();
