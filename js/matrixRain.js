// Blue “matrix” rain — viewport-fixed, solid frame clear (no column banding).
(function () {
  var canvas = null;
  var ctx = null;
  var running = false;
  var raf = 0;
  var drops = [];
  var fontSize = 14;
  var columns = 0;

  var chars =
    'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789ABCDEFｦｧｨｩｪ';

  var BG = '#04060a';

  function resize() {
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.max(1, Math.ceil(vw / fontSize));
    drops = [];
    for (var i = 0; i < columns; i++) {
      drops[i] = Math.random() * -50;
    }
  }

  function draw() {
    if (!ctx || !running || !canvas) return;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (w < 2 || h < 2) {
      raf = requestAnimationFrame(draw);
      return;
    }

    // Full solid clear each frame — removes vertical “stripe” artifacts from alpha trails
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    ctx.font = '600 ' + fontSize + 'px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';

    for (var i = 0; i < drops.length; i++) {
      var ch = chars[Math.floor(Math.random() * chars.length)];
      var x = i * fontSize + 0.5;
      var y = drops[i] * fontSize;
      var flicker = 0.2 + Math.random() * 0.55;
      ctx.fillStyle = 'rgba(120, 190, 255, ' + flicker + ')';
      ctx.fillText(ch, x, y);

      if (y > h && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i] += 0.55 + Math.random() * 0.45;
    }

    raf = requestAnimationFrame(draw);
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'matrix-rain-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;left:0;top:0;width:100vw;height:100vh;max-width:100vw;max-height:100vh;z-index:1;pointer-events:none;display:none;';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d', { alpha: false });
    resize();
    window.addEventListener('resize', resize);
  }

  window.MatrixRain = {
    enable: function () {
      ensureCanvas();
      canvas.style.display = 'block';
      if (!running) {
        running = true;
        resize();
        draw();
      }
    },
    disable: function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (canvas) canvas.style.display = 'none';
    },
  };
})();
