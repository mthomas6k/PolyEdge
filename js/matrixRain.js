// Blue “matrix” rain — sits behind page content (not on home / login).
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

  function resize() {
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.ceil(window.innerWidth / fontSize);
    drops = [];
    for (var i = 0; i < columns; i++) {
      drops[i] = Math.random() * -50;
    }
  }

  function draw() {
    if (!ctx || !running) return;
    ctx.fillStyle = 'rgba(4, 6, 10, 0.12)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.font = '600 ' + fontSize + 'px ui-monospace, Menlo, monospace';

    for (var i = 0; i < drops.length; i++) {
      var ch = chars[Math.floor(Math.random() * chars.length)];
      var x = i * fontSize;
      var y = drops[i] * fontSize;
      var flicker = 0.15 + Math.random() * 0.55;
      ctx.fillStyle = 'rgba(100, 170, 255, ' + flicker + ')';
      ctx.fillText(ch, x, y);

      if (y > window.innerHeight && Math.random() > 0.975) {
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
      'position:fixed;inset:0;z-index:1;pointer-events:none;display:none;';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
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
