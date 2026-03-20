// Node network for login — FundingPredictions-style headlines + %, blue glow, wider layout friendly.
(function () {
  var canvas = null;
  var ctx = null;
  var raf = 0;
  var nodes = [];
  var dust = [];
  var running = false;

  // “Current events” style headlines (static set — reads live-ish without an API)
  var EVENTS = [
    { h: 'Fed decision Mar', p: 72 },
    { h: 'NVDA earnings', p: 68 },
    { h: 'CPI MoM', p: 54 },
    { h: 'ETH ETF flow', p: 61 },
    { h: 'Trump 2028', p: 41 },
    { h: 'TikTok ban', p: 38 },
    { h: 'Israel / Iran', p: 55 },
    { h: 'BTC halving echo', p: 49 },
    { h: 'OpenAI release', p: 63 },
    { h: 'Super Bowl MVP', p: 44 },
    { h: 'GDP Q print', p: 57 },
    { h: 'Rates cut 2026', p: 59 },
    { h: 'SpaceX launch', p: 66 },
    { h: 'Oscars best pic', p: 52 },
    { h: 'EU tariff deal', p: 47 },
  ];

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pickEvent(i) {
    return EVENTS[i % EVENTS.length];
  }

  function buildNodes(w, h) {
    nodes = [];
    var n = Math.min(22, Math.floor((w * h) / 55000));
    for (var i = 0; i < n; i++) {
      var ev = pickEvent(i);
      var pct = Math.max(12, Math.min(92, ev.p + Math.floor(rand(-6, 6))));
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.1, 0.1),
        vy: rand(-0.09, 0.09),
        r: rand(4.5, 7.5),
        p: Math.random() * Math.PI * 2,
        headline: ev.h,
        pctLabel: pct + '%',
      });
    }
  }

  function resize() {
    if (!canvas) return;
    var box = canvas.parentElement
      ? canvas.parentElement.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };
    var w = Math.max(320, box.width);
    var h = Math.max(400, box.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildNodes(w, h);
    buildDust(w, h);
  }

  function buildDust(w, h) {
    dust = [];
    var n = Math.min(56, Math.floor((w * h) / 22000));
    for (var i = 0; i < n; i++) {
      dust.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.18, 0.18),
        vy: rand(-0.12, 0.12),
        s: rand(0.35, 1.05),
        a: rand(0.05, 0.16),
      });
    }
  }

  function loop() {
    if (!ctx || !running || !canvas) return;
    var w = canvas.clientWidth || 800;
    var h = canvas.clientHeight || 600;

    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, w, h);

    for (var di = 0; di < dust.length; di++) {
      var d = dust[di];
      d.x += d.vx;
      d.y += d.vy;
      if (d.x < -4) d.x = w + 4;
      if (d.x > w + 4) d.x = -4;
      if (d.y < -4) d.y = h + 4;
      if (d.y > h + 4) d.y = -4;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.s, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 230, 255, ' + d.a + ')';
      ctx.fill();
    }

    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      a.x += a.vx;
      a.y += a.vy;
      a.p += 0.014;
      if (a.x < 0 || a.x > w) a.vx *= -1;
      if (a.y < 0 || a.y > h) a.vy *= -1;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var dx = nodes[i].x - nodes[j].x;
        var dy = nodes[i].y - nodes[j].y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 140) {
          var alpha = 0.34 * (1 - d / 140);
          ctx.strokeStyle = 'rgba(100, 180, 255, ' + alpha + ')';
          ctx.lineWidth = 2.45;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      var pulse = 0.55 + Math.sin(n.p) * 0.18;
      ctx.save();
      ctx.shadowColor = 'rgba(80, 170, 255, 0.85)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(140, 210, 255, ' + pulse + ')';
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220, 240, 255, 0.95)';
      ctx.fill();
    }

    ctx.font = '600 10px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (var t = 0; t < nodes.length; t++) {
      var node = nodes[t];
      var hx = node.x;
      var hy = node.y - node.r - 22;
      var py = hy + 13;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4,6,10,0.94)';
      ctx.strokeText(node.headline, hx, hy);
      ctx.fillStyle = 'rgba(200, 230, 255, 0.95)';
      ctx.fillText(node.headline, hx, hy);
      ctx.font = '700 11px ui-monospace, Menlo, monospace';
      ctx.strokeStyle = 'rgba(4,6,10,0.94)';
      ctx.strokeText(node.pctLabel, hx, py);
      ctx.fillStyle = 'rgba(120, 200, 255, 0.98)';
      ctx.fillText(node.pctLabel, hx, py);
      ctx.font = '600 10px "Plus Jakarta Sans", system-ui, sans-serif';
    }

    raf = requestAnimationFrame(loop);
  }

  window.LoginNetwork = {
    mount: function (hostId) {
      var host = document.getElementById(hostId);
      if (!host) return;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'login-network-canvas';
        canvas.style.cssText =
          'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
        host.insertBefore(canvas, host.firstChild);
        ctx = canvas.getContext('2d', { alpha: false });
        window.addEventListener('resize', resize);
      }
      resize();
    },
    enable: function () {
      if (!canvas) return;
      running = true;
      if (raf) cancelAnimationFrame(raf);
      loop();
    },
    disable: function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
})();
