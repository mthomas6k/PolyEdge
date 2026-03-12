// ==========================================
// HOMEPAGE ANIMATIONS
// homepageAnimations.js — Premium landing page effects
// ==========================================

const HomepageAnimations = (() => {
  let canvas, ctx;
  let particles = [];
  let animFrameId = null;
  let isActive = false;

  function init() {
    if (isActive) return;
    const hero = document.querySelector('#page-home .hero');
    if (!hero) return;

    // Create canvas for particle effects
    canvas = document.createElement('canvas');
    canvas.id = 'hero-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.6';
    hero.style.position = 'relative';
    hero.insertBefore(canvas, hero.firstChild);

    resize();
    window.addEventListener('resize', resize);
    createParticles();
    isActive = true;
    animate();

    // Animate stats counters
    animateCounters();

    // Add intersection observer for scroll animations
    observeSections();
  }

  function resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }

  function createParticles() {
    particles = [];
    const count = Math.min(60, Math.floor((canvas.offsetWidth * canvas.offsetHeight) / 15000));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.2 - 0.1,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.4 + 0.1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.005
      });
    }
  }

  function animate() {
    if (!isActive || !ctx) return;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += p.pulseSpeed;

      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;

      const opMod = Math.sin(p.pulse) * 0.2 + 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56, 136, 232, ${p.opacity * opMod})`;
      ctx.fill();
    });

    // Draw connection lines between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(56, 136, 232, ${0.06 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    animFrameId = requestAnimationFrame(animate);
  }

  function destroy() {
    isActive = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null; ctx = null;
    particles = [];
  }

  function animateCounters() {
    document.querySelectorAll('#page-home .stat-counter').forEach(el => {
      const target = parseFloat(el.dataset.target || 0);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const decimals = parseInt(el.dataset.decimals || 0);
      let current = 0;
      const step = target / 60;
      const run = () => {
        current += step;
        if (current >= target) {
          current = target;
          el.textContent = prefix + current.toFixed(decimals) + suffix;
          return;
        }
        el.textContent = prefix + current.toFixed(decimals) + suffix;
        requestAnimationFrame(run);
      };
      run();
    });
  }

  function observeSections() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('#page-home .section, #page-home .step, #page-home .faq-item').forEach(el => {
      observer.observe(el);
    });
  }

  return { init, destroy };
})();
