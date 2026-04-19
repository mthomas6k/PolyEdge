// ==========================================
// HOMEPAGE ENGINE - Snowflakes, Globe, Payment Marquee, FAQ, Hero Cycle
// ==========================================

// ---- SNOWFALL & SPOTLIGHT ----
const Snowfall = (() => {
  let canvas, ctx, particles = [], animId, active = false;
  const COUNT = 35;
  let t = 0; // for spotlight drifting

  function init() {
    canvas = document.getElementById('snowfall-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < COUNT; i++) particles.push(createParticle(true));
    active = true;
    loop();
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticle(randomY) {
    return {
      x: Math.random() * (canvas ? canvas.width : window.innerWidth),
      y: randomY ? Math.random() * (canvas ? canvas.height : window.innerHeight) : -5,
      r: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.4 + 0.15,
      drift: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.25 + 0.15,
    };
  }

  function loop() {
    if (!active || !ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    t += 0.002;

    const hero = document.querySelector('.hero');
    const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;

    // Drifting Spotlight (center -> right -> center -> left)
    // Map a sine wave so it idles gently using Math.sin
    const w = canvas.width, h = canvas.height;
    const spotX = w / 2 + Math.sin(t) * (w * 0.25);
    // Position spotlight lower so it hits the calculator area (e.g. 70% down viewport)
    const spotY = h * 0.7; 
    const spotRadius = w < 800 ? w * 0.7 : 500;

    // We only draw spotlight if it's below the hero
    if (spotY + spotRadius > heroBottom) {
      const grad = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, spotRadius);
      grad.addColorStop(0, 'rgba(56,136,232, 0.15)');
      grad.addColorStop(0.5, 'rgba(56,136,232, 0.05)');
      grad.addColorStop(1, 'transparent');
      
      ctx.fillStyle = grad;
      ctx.fillRect(0, Math.max(0, heroBottom), w, h);
    }

    particles.forEach(p => {
      p.y += p.speed;
      p.x += p.drift;
      if (p.y > canvas.height + 5 || p.x < -5 || p.x > canvas.width + 5) {
        Object.assign(p, createParticle(false));
      }
      
      // Do not render over the hero block
      if (p.y < heroBottom) return;

      // Distance to spotlight center
      const dx = p.x - spotX;
      const dy = p.y - spotY;
      const dist = Math.sqrt(dx*dx + dy*dy);

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      
      if (dist < spotRadius) {
        // Boost opacity near center of spotlight, assign blue tint
        const intensity = 1 - (dist / spotRadius);
        ctx.fillStyle = `rgba(200, 230, 255, ${p.opacity + (intensity * 0.6)})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(56, 136, 232, 0.8)';
      } else {
        // Normal dim flurries outside
        ctx.fillStyle = `rgba(180, 210, 255, ${p.opacity * 0.6})`;
        ctx.shadowBlur = 0;
      }
      
      ctx.fill();
    });

    // Reset shadow blur
    ctx.shadowBlur = 0;
    
    animId = requestAnimationFrame(loop);
  }

  function destroy() {
    active = false;
    if (animId) cancelAnimationFrame(animId);
    particles = [];
  }

  return { init, destroy };
})();



// ---- PAYMENT MARQUEE BUILDER ----
const PaymentMarquee = (() => {
  const PROVIDERS = [
    { name: 'Visa', icon: 'visa', color: '1434CB' },
    { name: 'Mastercard', icon: 'mastercard', color: 'EB001B' },
    { name: 'Apple Pay', icon: 'applepay', color: 'FFFFFF' },
    { name: 'Google Pay', icon: 'googlepay', color: '4285F4' },
    { name: 'PayPal', icon: 'paypal', color: '003087' },
    { name: 'Amex', icon: 'americanexpress', color: '006FCF' },
    { name: 'Discover', icon: 'discover', color: 'FF6000' },
    { name: 'Affirm', icon: 'affirm', color: '0FA0EA' },
    { name: 'Afterpay', icon: 'afterpay', color: 'B2FCE4' },
    { name: 'Klarna', icon: 'klarna', color: 'FFB3C7' },
    { name: 'Cash App', icon: 'cashapp', color: '00D632' },
    { name: 'Link', icon: 'stripe', color: '008CDD' },
    { name: 'JCB', icon: 'jcb', color: '0B7CB0' },
    { name: 'Bitcoin', icon: 'bitcoin', color: 'F7931A' },
    { name: 'Ethereum', icon: 'ethereum', color: '3C3C3D' },
    { name: 'USDC', custom: true },
  ];

  function buildChip(p) {
    if (p.custom) {
      return `<span class="pay-chip pay-chip--labeled" title="${p.name}"><span class="pay-chip-badge pay-chip-badge--usdc pay-chip-badge--lrg" aria-hidden="true">$</span><span class="pay-chip-name">USDC</span></span>`;
    }
    return `<span class="pay-chip pay-chip--labeled" title="${p.name}"><img class="pay-chip-img" src="https://cdn.simpleicons.org/${p.icon}/${p.color}" alt="${p.name}" width="28" height="28" loading="lazy" decoding="async"><span class="pay-chip-name">${p.name}</span></span>`;
  }

  function buildSet() {
    return `<div class="payment-marquee-set">${PROVIDERS.map(buildChip).join('')}</div>`;
  }

  function init(trackId) {
    const track = document.getElementById(trackId);
    if (!track) return;
    // 3 copies for seamless infinite loop
    track.innerHTML = buildSet() + buildSet() + buildSet();
  }

  return { init };
})();

// ---- FAQ ENGINE ----
const FaqEngine = (() => {
  const DATA = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      desc: 'Getting started with PolyEdge!',
      icon: '<svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
      articles: [
        { id: 'what-is-polyedge', q: 'What is PolyEdge?', body: '<p><strong>PolyEdge</strong> is a performance-based prediction market evaluation platform where traders can prove their skills and earn real money based on simulated trading performance.</p><p><strong>How it works:</strong></p><ul><li>Subscribe to a challenge tier ($79, $139, or $199 one-time)</li><li>Trade on simulated prediction markets for 30 days</li><li>Pass the evaluation by meeting all requirements</li><li>Get approved for funded status</li><li>Request payouts based on your simulated performance</li></ul><p><strong>Important:</strong> This is 100% simulated trading. You are NOT trading with real money. All accounts use virtual capital. PolyEdge pays you from company revenue based on your simulated performance, not from actual trading profits.</p>' },
        { id: 'how-does-process-work', q: 'How does the evaluation process work?', body: '<p>The evaluation process has either 1 or 2 phases depending on your challenge type:</p><p><strong>One-Step Challenge:</strong> A single phase where you must hit a 10% profit target, stay within 6% drawdown, maintain consistency, and complete at least 5 trades within 30 days.</p><p><strong>Two-Step Challenge:</strong> Phase 1 requires 6% profit, Phase 2 requires 4% profit. Both phases have a 6% max drawdown limit and 30-day time limits.</p><p>Once you pass all phases, your account is promoted to <strong>Funded</strong> status where you keep 80% of your profits.</p>' },
        { id: 'what-markets', q: 'What markets can I bet on?', body: '<p>You can bet on any active market available on Polymarket. We track your positions through the platform\'s public API.</p><p>Available categories include:</p><ul><li>Politics and elections</li><li>Cryptocurrency price predictions</li><li>Sports outcomes</li><li>Entertainment and pop culture</li><li>Economics and finance</li><li>Science and technology</li><li>Current events</li></ul>' },
        { id: 'tier-options', q: 'What are the tier options and pricing?', body: '<p>PolyEdge offers three account sizes:</p><ul><li><strong>$500 Account</strong> - $79 one-time (1-Step) / $59 (2-Step)</li><li><strong>$1,000 Account</strong> - $139 one-time (1-Step) / $119 (2-Step)</li><li><strong>$2,000 Account</strong> - $199 one-time (1-Step) / $179 (2-Step)</li></ul><p>All challenge purchases are one-time payments, not subscriptions.</p>' },
        { id: 'real-or-simulated', q: 'Is this real trading or simulated?', body: '<p>This is <strong>100% simulated trading</strong>. You are NOT trading with real money and your capital is NOT at risk beyond the challenge fee.</p><p>All accounts use virtual capital. PolyEdge pays you from company revenue based on your simulated performance, not from actual trading profits.</p><p><strong>Legal Disclaimer:</strong> Hypothetical and simulated performance results have inherent limitations. Unlike actual performance records, simulated results do not represent actual trading. No representation is being made that any account will achieve profits or losses similar to those shown.</p>' },
      ],
    },
    {
      id: 'challenge-rules',
      title: 'Challenge Rules',
      desc: 'Evaluation and challenge requirements',
      icon: '<svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>',
      articles: [
        { id: 'profit-target', q: 'What is the profit target?', body: '<p>The profit target is the percentage gain you must achieve on your evaluation account:</p><ul><li><strong>One-Step:</strong> 10% profit target</li><li><strong>Two-Step Phase 1:</strong> 6% profit target</li><li><strong>Two-Step Phase 2:</strong> 4% profit target</li></ul><p>For a $1,000 account on One-Step, you need to grow your balance to $1,100.</p>' },
        { id: 'max-drawdown', q: 'How does max drawdown work?', body: '<p>Your account cannot drop more than <strong>6%</strong> from its high-water mark at any point. This is a trailing drawdown based on your peak balance, not your starting balance.</p><p>If your $1,000 account grows to $1,050, your drawdown limit becomes $1,050 * 0.06 = $63. If the account drops below $987, the evaluation fails immediately.</p>' },
        { id: 'consistency-rule', q: 'How does the consistency rule work?', body: '<p>No single winning trade can account for more than a set percentage of your total profits:</p><ul><li><strong>One-Step:</strong> No single trade > 20% of total profit</li><li><strong>Two-Step:</strong> No single trade > 50% of total profit</li></ul><p>This ensures you demonstrate consistent trading ability rather than relying on one lucky bet.</p>' },
        { id: 'min-trades', q: 'How many trades do I need?', body: '<p>Minimum trade requirements:</p><ul><li><strong>One-Step:</strong> At least 5 trades</li><li><strong>Two-Step:</strong> At least 2 trades per phase</li></ul><p>These must be distinct trades on different markets or at different times.</p>' },
        { id: 'time-limit', q: 'What is the time limit?', body: '<p>Each evaluation phase has a <strong>30-day time limit</strong>. You must meet all targets (profit, drawdown, consistency, min trades) within this window.</p><p>If time expires before you hit your targets, the evaluation ends and you would need to purchase a new challenge.</p>' },
        { id: 'position-sizing', q: 'Are there position size limits?', body: '<p>Yes. No single position can exceed <strong>15%</strong> of your current account balance. This is enforced to ensure proper risk management.</p><p>For a $1,000 account, the maximum single position size is $150.</p>' },
      ],
    },
    {
      id: 'funded-phase',
      title: 'Funded Phase',
      desc: 'Rules and mechanics after passing the challenge',
      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
      articles: [
        { id: 'what-happens-pass', q: 'What happens when I pass?', body: '<p>When you pass all evaluation phases, your account is automatically promoted to <strong>Funded</strong> status. You will see a "Funded" badge on your Accounts page.</p><p>In funded phase, you continue trading with the same rules but now earn real payouts based on your simulated performance.</p>' },
        { id: 'funded-rules', q: 'Do the rules change when funded?', body: '<p>The max drawdown rule (6%) still applies in the funded phase. If you breach it, the funded account is terminated.</p><p>The profit target and consistency rules no longer apply, you are free to trade as you see fit within the drawdown limit.</p>' },
        { id: 'can-i-lose-funded', q: 'Can I lose my funded account?', body: '<p>Yes. If you breach the 6% drawdown limit from your high-water mark in the funded phase, the account is terminated.</p><p>You would need to purchase and pass a new challenge to get funded again.</p>' },
      ],
    },
    {
      id: 'payouts',
      title: 'Payout Information',
      desc: 'Payout policy, methods, and withdrawal details',
      icon: '<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
      articles: [
        { id: 'how-payouts-work', q: 'How do payouts work?', body: '<p>Funded traders keep <strong>80%</strong> of their simulated profits. Payouts are processed in USDC on a bi-weekly basis once you hit the minimum payout threshold.</p><p>PolyEdge pays from company revenue based on your simulated performance.</p>' },
        { id: 'payout-methods', q: 'What payout methods are available?', body: '<p>Current payout methods:</p><ul><li><strong>USDC</strong> (Polygon network) to your wallet address</li><li><strong>Wire transfer</strong> (for amounts over $500)</li></ul><p>We are working on adding more payout options including PayPal and additional crypto networks.</p>' },
        { id: 'min-payout', q: 'Is there a minimum payout?', body: '<p>Yes. The minimum payout threshold is <strong>$50</strong> in simulated profit (your 80% share). This ensures efficient processing of withdrawals.</p>' },
        { id: 'refund', q: 'Can I get a refund?', body: '<p>Challenge fees are non-refundable once the evaluation period has begun and you have placed any trades.</p><p>If you have not placed any trades within 48 hours of purchase, you may request a full refund through support.</p>' },
      ],
    },
    {
      id: 'account-settings',
      title: 'Account & Settings',
      desc: 'Managing your account and preferences',
      icon: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      articles: [
        { id: 'wallet-address', q: 'How do I set my wallet address?', body: '<p>Go to <strong>Settings</strong> and enter your Polymarket wallet address (starts with 0x...). This is used to:</p><ul><li>Track your on-chain positions in the Wallet tab</li><li>Receive USDC payouts when funded</li></ul>' },
        { id: 'change-password', q: 'How do I change my password?', body: '<p>Password management is handled through Supabase authentication. Currently, you can reset your password via the login page using the "Forgot Password" flow (coming soon).</p>' },
        { id: 'multiple-accounts', q: 'Can I have multiple evaluations?', body: '<p>Yes! You can purchase multiple challenges and run them simultaneously. Each evaluation is tracked independently with its own balance, trades, and metrics.</p>' },
      ],
    },
    {
      id: 'technical',
      title: 'Technical Support',
      desc: 'Troubleshooting and technical questions',
      icon: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
      articles: [
        { id: 'data-source', q: 'Where does market data come from?', body: '<p>All market data is sourced directly from <strong>Polymarket\'s public API</strong> (Gamma Markets). Prices, volumes, and outcomes are fetched in real-time.</p><p>On-chain wallet data is pulled from the Polymarket CLOB API for position tracking.</p>' },
        { id: 'trades-not-showing', q: 'Why are my trades not showing?', body: '<p>If trades are not appearing, check the following:</p><ul><li>Ensure you have selected the correct evaluation account on the Accounts page</li><li>Verify your trade was placed successfully (check the toast notification)</li><li>Try refreshing the page with Cmd+Shift+R</li></ul>' },
      ],
    },
  ];

  let currentView = 'list'; // 'list' or 'article'
  let currentCategory = null;
  let currentArticle = null;

  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (currentView === 'article' && currentArticle) {
      renderArticle(container);
    } else {
      renderList(container);
    }
  }

  function renderList(container) {
    let html = `<div class="faq-search-wrap">
      <svg class="faq-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="faq-search" type="text" placeholder="Search for articles..." oninput="FaqEngine.search(this.value,'${container.id}')">
    </div>`;

    DATA.forEach(cat => {
      const isOpen = currentCategory === cat.id;
      html += `<div class="faq-category${isOpen ? ' open' : ''}" data-cat="${cat.id}">
        <div class="faq-cat-header" onclick="FaqEngine.toggleCat('${cat.id}','${container.id}')">
          <div class="faq-cat-icon">${cat.icon}</div>
          <div class="faq-cat-info">
            <div class="faq-cat-title">${cat.title}</div>
            <div class="faq-cat-desc">${cat.desc}</div>
            <div class="faq-cat-count">${cat.articles.length} articles</div>
          </div>
          <svg class="faq-cat-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="faq-articles">
          ${cat.articles.map(a => {
            const isRead = sessionStorage.getItem(`faq_read_${a.id}`) ? ' faq-article-read' : '';
            return `<div class="faq-article-link${isRead}" onclick="FaqEngine.openArticle('${cat.id}','${a.id}','${container.id}')">
            <span>${a.q}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>`;
          }).join('')}
        </div>
      </div>`;
    });

    container.innerHTML = html;
  }

  function renderArticle(container) {
    const cat = DATA.find(c => c.id === currentCategory);
    const art = cat ? cat.articles.find(a => a.id === currentArticle) : null;
    if (!cat || !art) { currentView = 'list'; render(container.id); return; }

    // Mark as read in session
    sessionStorage.setItem(`faq_read_${art.id}`, 'true');

    container.innerHTML = `<div class="faq-article-view">
      <button class="btn btn-ghost faq-back-btn" onclick="FaqEngine.backToCat('${cat.id}','${container.id}')">
        &larr; Back to FAQ Categories
      </button>
      <div class="faq-breadcrumb" style="margin-top: 16px;">
        <a onclick="FaqEngine.backToList('${container.id}')">All Collections</a>
        <span class="faq-breadcrumb-sep">&rsaquo;</span>
        <a onclick="FaqEngine.backToCat('${cat.id}','${container.id}')">${cat.title}</a>
        <span class="faq-breadcrumb-sep">&rsaquo;</span>
        <span>${art.q}</span>
      </div>
      <h2 class="faq-article-title">${art.q}</h2>
      <div class="faq-article-meta">Written by PolyEdge Team</div>
      <div class="faq-article-body">${art.body}</div>
      <div class="faq-helpful">
        <div class="faq-helpful-q">Did this answer your question?</div>
        <div class="faq-helpful-btns">
          <button class="faq-helpful-btn faq-helpful-btn--yes" onclick="FaqEngine.vote(this,'yes')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <button class="faq-helpful-btn faq-helpful-btn--no" onclick="FaqEngine.vote(this,'no')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }

  function toggleCat(catId, containerId) {
    currentCategory = currentCategory === catId ? null : catId;
    currentView = 'list';
    render(containerId);
  }

  function openArticle(catId, artId, containerId) {
    currentCategory = catId;
    currentArticle = artId;
    currentView = 'article';
    render(containerId);
  }

  function backToList(containerId) {
    currentView = 'list';
    currentCategory = null;
    currentArticle = null;
    render(containerId);
  }

  function backToCat(catId, containerId) {
    currentView = 'list';
    currentCategory = catId;
    currentArticle = null;
    render(containerId);
  }

  function vote(btn, type) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.faq-helpful-btn').forEach(b => b.classList.remove('voted'));
    btn.classList.add('voted');
  }

  function search(query, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const q = query.toLowerCase().trim();
    if (!q) { currentCategory = null; render(containerId); return; }

    // Find matching articles
    let html = `<div class="faq-search-wrap">
      <svg class="faq-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="faq-search" type="text" placeholder="Search for articles..." value="${query}" oninput="FaqEngine.search(this.value,'${containerId}')">
    </div>`;

    let found = 0;
    DATA.forEach(cat => {
      const matches = cat.articles.filter(a =>
        a.q.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
      );
      if (matches.length) {
        html += `<div class="faq-category open" data-cat="${cat.id}">
          <div class="faq-cat-header">
            <div class="faq-cat-icon">${cat.icon}</div>
            <div class="faq-cat-info"><div class="faq-cat-title">${cat.title}</div></div>
          </div>
          <div class="faq-articles" style="display:block">
            ${matches.map(a => `<div class="faq-article-link" onclick="FaqEngine.openArticle('${cat.id}','${a.id}','${containerId}')">
              <span>${a.q}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>`).join('')}
          </div>
        </div>`;
        found += matches.length;
      }
    });

    if (!found) html += '<p style="text-align:center;color:var(--text3);padding:32px 0">No articles found.</p>';
    container.innerHTML = html;
    // Re-focus search input
    const input = container.querySelector('.faq-search');
    if (input) { input.focus(); input.setSelectionRange(query.length, query.length); }
  }

  return { render, toggleCat, openArticle, backToList, backToCat, vote, search };
})();

// ---- HERO CYCLING COUNTER ----
const HeroCycle = (() => {
  let animRaf = null;
  function init() {
    const el = document.getElementById('hero-trade-with');
    if (!el) return;
    const values = (el.dataset.cycle || '500,1000,2000').split(',').map(Number);
    const prefix = el.dataset.prefix || '$';
    let idx = 0;
    
    // Clear out Odometer classes if any exist
    el.classList.remove('odo-wrap');
    
    function formatVal(n) {
      return prefix + Math.floor(n).toLocaleString();
    }

    el.textContent = formatVal(values[0]);
    let currentVal = values[0];

    setInterval(() => {
      idx = (idx + 1) % values.length;
      const targetVal = values[idx];
      const startVal = currentVal;
      const t0 = performance.now();
      const dur = 800; // Duration of spinning effect

      if (animRaf) cancelAnimationFrame(animRaf);
      
      function tick(now) {
        const t = Math.min(1, (now - t0) / dur);
        // Easing out cubic: fast start, slow finish
        const ease = 1 - Math.pow(1 - t, 3);
        currentVal = startVal + (targetVal - startVal) * ease;
        el.textContent = formatVal(currentVal);
        
        if (t < 1) {
          animRaf = requestAnimationFrame(tick);
        } else {
          currentVal = targetVal;
          el.textContent = formatVal(targetVal);
        }
      }
      animRaf = requestAnimationFrame(tick);
      
    }, 4000);
  }

  return { init };
})();

// ---- INIT ALL ----
document.addEventListener('DOMContentLoaded', () => {
  Snowfall.init();
  PaymentMarquee.init('pay-marquee-home');
  FaqEngine.render('faq-hub-home');
  HeroCycle.init();

  // Init globe stat odometers
  document.querySelectorAll('[data-odo]').forEach(el => {
    const val = el.dataset.odo;
    if (typeof Odometer !== 'undefined') {
      const wrap = el.querySelector('.odo-wrap');
      if (wrap) Odometer.render(wrap, val);
    }
  });
});
