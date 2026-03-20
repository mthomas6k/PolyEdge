// Soft node network background for login / register only.
(function () {
  var canvas = null;
  var ctx = null;
  var raf = 0;
  var nodes = [];
  var running = false;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function buildNodes(w, h) {
    nodes = [];
    var n = Math.min(48, Math.floor((w * h) / 35000));
    for (var i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.15, 0.15),
        vy: rand(-0.12, 0.12),
        r: rand(1.2, 2.8),
        p: Math.random() * Math.PI * 2,
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
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildNodes(w, h);
  }

  function loop() {
    if (!ctx || !running || !canvas) return;
    var w = canvas.clientWidth || 800;
    var h = canvas.clientHeight || 600;

    ctx.fillStyle = 'rgba(4, 6, 10, 0.22)';
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      a.x += a.vx;
      a.y += a.vy;
      a.p += 0.02;
      if (a.x < 0 || a.x > w) a.vx *= -1;
      if (a.y < 0 || a.y > h) a.vy *= -1;
    }

    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var dx = nodes[i].x - nodes[j].x;
        var dy = nodes[i].y - nodes[j].y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 120) {
          ctx.strokeStyle = 'rgba(80, 150, 255, ' + (0.08 * (1 - d / 120)) + ')';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      var glow = 0.35 + Math.sin(n.p) * 0.12;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120, 185, 255, ' + glow + ')';
      ctx.fill();
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
        ctx = canvas.getContext('2d');
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
