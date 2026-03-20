// Node network for login — lines + labeled topics only (no translucent polygon fill).
(function () {
  var canvas = null;
  var ctx = null;
  var raf = 0;
  var nodes = [];
  var running = false;

  var TOPICS = [
    'Politics',
    'Crypto',
    'Sports',
    'Fed rates',
    'AI',
    'Elections',
    'Tech',
    'Markets',
    'Weather',
    'Science',
  ];

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function buildNodes(w, h) {
    nodes = [];
    var n = Math.min(40, Math.floor((w * h) / 42000));
    for (var i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.12, 0.12),
        vy: rand(-0.1, 0.1),
        r: rand(1.5, 3.2),
        p: Math.random() * Math.PI * 2,
        label: Math.random() < 0.5 ? TOPICS[Math.floor(Math.random() * TOPICS.length)] : null,
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
  }

  function loop() {
    if (!ctx || !running || !canvas) return;
    var w = canvas.clientWidth || 800;
    var h = canvas.clientHeight || 600;

    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      a.x += a.vx;
      a.y += a.vy;
      a.p += 0.018;
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
        if (d < 110) {
          var alpha = 0.14 * (1 - d / 110);
          ctx.strokeStyle = 'rgba(100, 170, 255, ' + alpha + ')';
          ctx.lineWidth = 0.85;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      var glow = 0.5 + Math.sin(n.p) * 0.2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 1.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90, 160, 255, ' + (glow * 0.35) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160, 210, 255, ' + (0.55 + Math.sin(n.p) * 0.15) + ')';
      ctx.fill();
    }

    ctx.font = '600 9px system-ui, "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (var t = 0; t < nodes.length; t++) {
      var node = nodes[t];
      if (!node.label) continue;
      var lx = node.x;
      var ly = node.y - node.r - 6;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4,6,10,0.92)';
      ctx.strokeText(node.label, lx, ly);
      ctx.fillStyle = 'rgba(180, 210, 240, 0.9)';
      ctx.fillText(node.label, lx, ly);
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
