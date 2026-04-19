document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('globe-container');
  const canvas3d = document.getElementById('c-globe');
  const canvasLc = document.getElementById('lc-globe');
  
  if (!container || !canvas3d || !canvasLc || typeof THREE === 'undefined') return;

  function getSize() {
    return {
      w: container.clientWidth || 320,
      h: container.clientHeight || 320
    };
  }

  let { w: W, h: H } = getSize();
  
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W/H, 0.1, 1000);
  camera.position.z = 2.8;
  const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x07090f, 0); // Transparent to blend with site background

  const R = 1.0;
  const RIPPLE_ANGLE = 2500 / 6371;
  const COOLDOWN = 4;

  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  const keyLight = new THREE.DirectionalLight(0x6699ff, 1.4);
  keyLight.position.set(-3, 2, 3); scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x112244, 0.4);
  fillLight.position.set(3, -2, -2); scene.add(fillLight);
  scene.add(new THREE.AmbientLight(0x0a1530, 1.0));
  const topLight = new THREE.DirectionalLight(0x2255aa, 0.5);
  topLight.position.set(0, 4, 0); scene.add(topLight);

  const sphereMat = new THREE.ShaderMaterial({
    uniforms: { lightDir: { value: new THREE.Vector3(-0.7, 0.5, 0.5).normalize() } },
    vertexShader: `varying vec3 vNormal;void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      uniform vec3 lightDir;varying vec3 vNormal;
      void main(){
        vec3 base=vec3(0.02,0.07,0.18);
        float diff=max(0.0,dot(vNormal,lightDir));
        float dark=max(0.0,dot(vNormal,normalize(vec3(0.5,-0.5,-0.2))));
        float rim=pow(1.0-abs(dot(vNormal,vec3(0,0,1))),4.0)*0.5;
        vec3 col=base*(0.3+diff*1.1)-vec3(0,0.01,0.03)*dark*0.6+vec3(0.05,0.2,0.7)*rim;
        col+=vec3(0.3,0.5,1.0)*pow(max(0.0,dot(reflect(-lightDir,vNormal),vec3(0,0,1))),18.0)*0.15;
        gl_FragColor=vec4(col,1.0);
      }
    `,
  });
  globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(R, 128, 128), sphereMat));

  const atmMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vN;void main(){float rim=pow(1.0-abs(dot(vN,vec3(0,0,1))),5.0);gl_FragColor=vec4(0.1,0.4,1.0,rim*0.45);}`,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 64, 64), atmMat));

  function latLonTo3D(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  }

  function addGrid() {
    const mN = new THREE.LineBasicMaterial({ color: 0x1a3a6a, transparent: true, opacity: 0.25 });
    const mE = new THREE.LineBasicMaterial({ color: 0x1e4480, transparent: true, opacity: 0.32 });
    const mM = new THREE.LineBasicMaterial({ color: 0x2255aa, transparent: true, opacity: 0.38 });
    for (let lat = -75; lat <= 75; lat += 15) {
      const pts = [], phi = (90 - lat) * Math.PI / 180;
      for (let lon = 0; lon <= 360; lon += 2) { const t = lon * Math.PI / 180; pts.push(new THREE.Vector3(R * Math.sin(phi) * Math.cos(t), R * Math.cos(phi), R * Math.sin(phi) * Math.sin(t))); }
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lat === 0 ? mE : mN));
    }
    for (let lon = 0; lon < 360; lon += 15) {
      const pts = [], t = lon * Math.PI / 180;
      for (let lat = -90; lat <= 90; lat += 2) { const phi = (90 - lat) * Math.PI / 180; pts.push(new THREE.Vector3(R * Math.sin(phi) * Math.cos(t), R * Math.cos(phi), R * Math.sin(phi) * Math.sin(t))); }
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), (lon === 0 || lon === 180) ? mM : mN));
    }
  }
  addGrid();

  async function loadCountries() {
    try { const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'); drawCountries(await res.json()); } catch (e) { }
  }
  function drawCountries(topo) {
    const mat = new THREE.LineBasicMaterial({ color: 0x55aaff, transparent: true, opacity: 0.85 });
    const arcs = topo.arcs, sc = topo.transform ? topo.transform.scale : [1, 1], tr = topo.transform ? topo.transform.translate : [0, 0];
    function arcPts(idx) {
      const rev = idx < 0, arc = arcs[rev ? ~idx : idx]; let x = 0, y = 0; const pts = [];
      for (let i = 0; i < arc.length; i++) { x += arc[i][0]; y += arc[i][1]; pts.push(latLonTo3D(y * sc[1] + tr[1], x * sc[0] + tr[0], R * 1.001)); }
      return rev ? pts.reverse() : pts;
    }
    (topo.objects.countries ? topo.objects.countries.geometries : []).forEach(geo => {
      const rings = [];
      if (geo.type === 'Polygon') rings.push(...geo.arcs);
      else if (geo.type === 'MultiPolygon') geo.arcs.forEach(p => rings.push(...p));
      rings.forEach(ring => { const pts = []; ring.forEach(i => pts.push(...arcPts(i))); if (pts.length > 1) globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat)); });
    });
  }
  loadCountries();

  (function () {
    const geo = new THREE.BufferGeometry(); const v = [];
    for (let i = 0; i < 1200; i++) v.push((Math.random() - .5) * 80, (Math.random() - .5) * 80, (Math.random() - .5) * 80);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x223366, size: 0.035, transparent: true, opacity: 0.4 })));
  })();

  function hash21(x, y) {
    let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  }
  function smoothNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash21(ix, iy), b = hash21(ix + 1, iy), c = hash21(ix, iy + 1), d = hash21(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (d - b - c + a) * ux * uy;
  }

  const cyclones = [
    { lon: -150, lat: 48, str: 3.2, sign: 1 },
    { lon: -170, lat: 35, str: 2.4, sign: -1 },
    { lon: -40, lat: 55, str: 2.8, sign: 1 },
    { lon: -30, lat: 38, str: 2.0, sign: -1 },
    { lon: 20, lat: 60, str: 2.2, sign: 1 },
    { lon: 160, lat: -45, str: 2.8, sign: -1 },
    { lon: -100, lat: -40, str: 2.4, sign: -1 },
    { lon: -30, lat: -50, str: 2.5, sign: -1 },
    { lon: 80, lat: -40, str: 2.2, sign: -1 },
    { lon: 80, lat: 25, str: 1.2, sign: 1 },
    { lon: -100, lat: 35, str: 1.4, sign: -1 },
    { lon: 140, lat: 30, str: 1.8, sign: -1 },
    { lon: -60, lat: -20, str: 1.6, sign: 1 },
  ];

  function windAt(lat, lon) {
    const absLat = Math.abs(lat);
    const hemi = lat >= 0 ? 1 : -1;
    const lonR = lon * Math.PI / 180;
    const latR = lat * Math.PI / 180;

    let dLon = 0, dLat = 0;

    if (absLat > 65) {
      dLon = -1.0; dLat = 0;
    } else if (absLat > 30) {
      dLon = 1.4;
      dLat = hemi * Math.sin(lonR * 2.5) * 0.35;
    } else if (absLat > 8) {
      dLon = -1.1;
      dLat = -hemi * 0.25;
    } else {
      dLon = Math.sin(lonR * 4) * 0.3;
      dLat = -hemi * 0.4;
    }

    cyclones.forEach(cyc => {
      const dlat = lat - cyc.lat;
      const dlon = lon - cyc.lon;
      const dist = Math.sqrt(dlat * dlat + dlon * dlon);
      const radius = 22;
      if (dist < radius && dist > 0.5) {
        const influence = (1 - dist / radius) * (1 - dist / radius) * cyc.str;
        const nx = dlon / dist, ny = dlat / dist;
        dLon += (-ny * cyc.sign) * influence * 1.2;
        dLat += (nx * cyc.sign) * influence * 1.2;
      }
    });

    const n = smoothNoise(lon * 0.05 + 3.1, lat * 0.05 + 1.7) * 2 - 1;
    const n2 = smoothNoise(lon * 0.07 + 0.5, lat * 0.07 + 4.2) * 2 - 1;
    dLon += n * 0.25;
    dLat += n2 * 0.18;

    return { dLon, dLat };
  }

  const NUM_PARTICLES = 3000;
  const TRAIL_LEN = 32;
  const SPEED = 0.07;

  class WindParticle {
    constructor() { this.reset(true); }
    reset(random) {
      this.lat = (Math.random() * 170 - 85);
      this.lon = (Math.random() * 360 - 180);
      this.maxAge = TRAIL_LEN + Math.floor(Math.random() * 30);
      this.age = random ? Math.floor(Math.random() * this.maxAge) : 0;
      this.trail = [];
      this.alphaMult = 1.0;
      if (random) {
        let lat = this.lat, lon = this.lon;
        const steps = Math.min(this.age, TRAIL_LEN);
        for (let i = 0; i < steps; i++) {
          const w = windAt(lat, lon);
          lat += w.dLat * SPEED; lon += w.dLon * SPEED;
          while (lon > 180) lon -= 360; while (lon < -180) lon += 360;
          if (lat > 85) lat = 85; if (lat < -85) lat = -85;
          this.trail.push({ lat, lon });
        }
        this.lat = lat; this.lon = lon;
      }
    }
    step() {
      this.trail.push({ lat: this.lat, lon: this.lon });
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
      const w = windAt(this.lat, this.lon);
      this.lat += w.dLat * SPEED;
      this.lon += w.dLon * SPEED;
      while (this.lon > 180) this.lon -= 360; while (this.lon < -180) this.lon += 360;
      if (this.lat > 85 || this.lat < -85) { this.reset(false); return; }
      this.age++;
      const remaining = this.maxAge - this.age;
      this.alphaMult = remaining < TRAIL_LEN ? Math.max(0, remaining / TRAIL_LEN) : 1.0;
      if (this.age > this.maxAge) this.reset(false);
    }
  }

  const particles = [];
  for (let i = 0; i < NUM_PARTICLES; i++) particles.push(new WindParticle());

  canvasLc.width = W; canvasLc.height = H;
  const lx = canvasLc.getContext('2d');

  const cities = [
    { n: 'New York', lat: 40.7, lon: -74.0 }, { n: 'London', lat: 51.5, lon: -0.1 },
    { n: 'Tokyo', lat: 35.7, lon: 139.7 }, { n: 'Beijing', lat: 39.9, lon: 116.4 },
    { n: 'Mumbai', lat: 19.1, lon: 72.9 }, { n: 'São Paulo', lat: -23.5, lon: -46.6 },
    { n: 'Cairo', lat: 30.0, lon: 31.2 }, { n: 'Sydney', lat: -33.9, lon: 151.2 },
    { n: 'Moscow', lat: 55.8, lon: 37.6 }, { n: 'Dubai', lat: 25.2, lon: 55.3 },
    { n: 'Singapore', lat: 1.3, lon: 103.8 }, { n: 'Lagos', lat: 6.5, lon: 3.4 },
    { n: 'Mexico City', lat: 19.4, lon: -99.1 }, { n: 'Seoul', lat: 37.6, lon: 126.9 },
    { n: 'Istanbul', lat: 41.0, lon: 28.9 }, { n: 'Barcelona', lat: 41.4, lon: 2.2 },
    { n: 'Cape Town', lat: -33.9, lon: 18.4 }, { n: 'Buenos Aires', lat: -34.6, lon: -58.4 },
    { n: 'Toronto', lat: 43.7, lon: -79.4 }, { n: 'Berlin', lat: 52.5, lon: 13.4 },
    { n: 'Paris', lat: 48.9, lon: 2.3 }, { n: 'Nairobi', lat: -1.3, lon: 36.8 },
    { n: 'Bangkok', lat: 13.8, lon: 100.5 }, { n: 'Los Angeles', lat: 34.0, lon: -118.2 },
    { n: 'Riyadh', lat: 24.7, lon: 46.7 }, { n: 'Johannesburg', lat: -26.2, lon: 28.0 },
  ];

  const cooldowns = {};

  function getVis(lp) {
    const wq = new THREE.Quaternion(); globeGroup.getWorldQuaternion(wq);
    return lp.clone().normalize().applyQuaternion(wq).z;
  }

  const _v3 = new THREE.Vector3();
  function toScreen(lp) {
    _v3.copy(lp); globeGroup.localToWorld(_v3); _v3.project(camera);
    return [(_v3.x * .5 + .5) * W, (-_v3.y * .5 + .5) * H];
  }

  function latLonToScreen(lat, lon) {
    const lp = latLonTo3D(lat, lon, R * 1.002);
    _v3.copy(lp); globeGroup.localToWorld(_v3);
    const vz = _v3.clone().project(camera);
    const wq = new THREE.Quaternion(); globeGroup.getWorldQuaternion(wq);
    const vis = lp.clone().normalize().applyQuaternion(wq).z;
    return {
      x: (vz.x * .5 + .5) * W,
      y: (-vz.y * .5 + .5) * H,
      vis,
    };
  }

  function greatCircleRing(lat, lon, angle, seg) {
    const c = latLonTo3D(lat, lon, 1.0).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    let t1 = new THREE.Vector3().crossVectors(c, up).normalize();
    if (t1.lengthSq() < 0.001) t1 = new THREE.Vector3(1, 0, 0);
    const t2 = new THREE.Vector3().crossVectors(c, t1).normalize();
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const axis = new THREE.Vector3().addScaledVector(t1, Math.cos(a)).addScaledVector(t2, Math.sin(a)).normalize();
      pts.push(new THREE.Vector3().addScaledVector(c, Math.cos(angle)).addScaledVector(axis, Math.sin(angle)).multiplyScalar(R * 1.003));
    }
    return pts;
  }

  function projectRing(pts3d) {
    return pts3d.map(p => {
      const wp = p.clone(); globeGroup.localToWorld(wp); wp.project(camera);
      return [((wp.x * .5) + .5) * W, ((-wp.y * .5) + .5) * H, wp.z];
    });
  }

  function resolveLabels(labels) {
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j];
        const dy = b.oy - a.oy;
        const dx = b.ox - a.ox;
        if (Math.abs(dx) < 95 && Math.abs(dy) < 16) {
          const overlap = 16 - Math.abs(dy);
          const push = overlap * 0.10;
          const dir = dy <= 0 ? -1 : 1;
          a.entry.pushVy = (a.entry.pushVy || 0) - push * dir;
          b.entry.pushVy = (b.entry.pushVy || 0) + push * dir;
        }
      }
    }
    labels.forEach(l => {
      l.entry.pushVy = (l.entry.pushVy || 0) * 0.70;
      l.oy += l.entry.pushVy;
    });
  }

  const CHAR_INTERVAL = 0.07;
  const ERASE_INTERVAL = 0.045;
  const HOLD_DUR = () => 2.2 + Math.random() * 1.0;
  const CURSOR_BLINK = 530;

  function makeLabelState(name) {
    return {
      name,
      displayed: '',
      phase: 'typing',
      charTimer: 0,
      holdTimer: 0,
      holdDur: HOLD_DUR(),
      done: false,
    };
  }

  function updateLabel(ls, dt, ts) {
    if (ls.done) return;
    if (ls.phase === 'typing') {
      ls.charTimer += dt;
      while (ls.charTimer >= CHAR_INTERVAL && ls.displayed.length < ls.name.length) {
        ls.displayed += ls.name[ls.displayed.length];
        ls.charTimer -= CHAR_INTERVAL;
      }
      if (ls.displayed.length === ls.name.length) { ls.phase = 'hold'; ls.holdTimer = 0; }
    } else if (ls.phase === 'hold') {
      ls.holdTimer += dt;
      if (ls.holdTimer >= ls.holdDur) { ls.phase = 'erasing'; ls.charTimer = 0; }
    } else if (ls.phase === 'erasing') {
      ls.charTimer += dt;
      while (ls.charTimer >= ERASE_INTERVAL && ls.displayed.length > 0) {
        ls.displayed = ls.displayed.slice(0, -1);
        ls.charTimer -= ERASE_INTERVAL;
      }
      if (ls.displayed.length === 0) ls.done = true;
    }
  }

  function drawTypedLabel(lx, ox, oy, ls, alpha, ts) {
    if (alpha < 0.01) return;
    const text = ls.displayed;
    const cursorOn = ls.phase !== 'erasing'
      ? Math.floor(ts / CURSOR_BLINK) % 2 === 0
      : false;

    lx.save();
    lx.font = 'bold 13px -apple-system,BlinkMacSystemFont,sans-serif';
    lx.textAlign = 'left';

    const tw = text.length > 0 ? lx.measureText(text).width : 0;

    lx.globalAlpha = alpha;
    lx.fillStyle = '#99ddff';
    lx.shadowColor = '#2288ff';
    lx.shadowBlur = 6;
    if (text.length > 0) lx.fillText(text, ox, oy);

    const cx = ox + tw + 2;
    const ch = 13;
    const cw = 7;
    const cy = oy - ch + 2;

    if (cursorOn || ls.phase === 'typing') {
      lx.globalAlpha = alpha;
      lx.shadowColor = 'rgba(130,185,255,0.95)';
      lx.shadowBlur = 10;
      lx.fillStyle = 'rgba(80,150,255,0.35)';
      lx.fillRect(cx - 2, cy - 2, cw + 4, ch + 4);
      lx.shadowBlur = 18;
      lx.fillStyle = 'rgba(50,120,255,0.22)';
      lx.fillRect(cx - 4, cy - 4, cw + 8, ch + 8);
      lx.shadowBlur = 8;
      lx.shadowColor = 'rgba(200,225,255,1)';
      lx.fillStyle = 'rgba(255,255,255,0.92)';
      lx.fillRect(cx, cy, cw, ch);
    }
    lx.restore();
  }

  const active = [];
  let spawnTimer = 0, nextSpawn = 1.0;

  function spawnRandom() {
    const now = performance.now() / 1000;
    const vis = cities.filter(c => {
      if (cooldowns[c.n] && now < cooldowns[c.n]) return false;
      return getVis(latLonTo3D(c.lat, c.lon, R)) > 0.3;
    });
    const showing = new Set(active.map(a => a.city.n));
    const cands = vis.filter(c => !showing.has(c.n));
    if (!cands.length) return;
    const city = cands[Math.floor(Math.random() * cands.length)];
    const NUM = 4;
    const rings = [];
    for (let i = 0; i < NUM; i++) rings.push({ delay: i * 0.8, age: 0, dur: 4.0, angle: 0 });
    active.push({
      city, lp: latLonTo3D(city.lat, city.lon, R),
      rings, age: 0,
      life: NUM * 0.8 + 4.0 + HOLD_DUR() + city.n.length * CHAR_INTERVAL + city.n.length * ERASE_INTERVAL + 0.5,
      sx: 0, sy: 0, vx: 0, vy: 0, smoothed: false,
      label: makeLabelState(city.n),
    });
    nextSpawn = 0.8 + Math.random() * 1.0;
    spawnTimer = 0;
  }

  let last = 0;
  let frameCount = 0;
  function animate(ts) {
    requestAnimationFrame(animate);
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    frameCount++;

    globeGroup.rotation.y += 0.0020;
    spawnTimer += dt;
    if (spawnTimer >= nextSpawn && active.length < 6) spawnRandom();
    renderer.render(scene, camera);
    lx.clearRect(0, 0, W, H);

    const startP = frameCount % 2;
    for (let i = startP; i < particles.length; i += 2) particles[i].step();

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const tlen = p.trail.length;
      if (tlen < 2) continue;
      const head = latLonToScreen(p.trail[tlen - 1].lat, p.trail[tlen - 1].lon);
      if (head.vis < 0.05) continue;
      const edgeFade = Math.max(0, Math.min(1, (head.vis - 0.05) / 0.2));
      const globalA = edgeFade * p.alphaMult;
      if (globalA < 0.01) continue;
      const projected = p.trail.map(pt => latLonToScreen(pt.lat, pt.lon));
      lx.lineWidth = 0.7; lx.lineCap = 'round'; lx.lineJoin = 'round';
      for (let t = 1; t < tlen; t++) {
        const pa = projected[t - 1], pb = projected[t];
        if (pa.vis < 0.02 || pb.vis < 0.02) continue;
        const frac = Math.pow(t / tlen, 1.5);
        const alpha = globalA * frac * 0.28;
        lx.strokeStyle = `rgba(180,215,255,${alpha})`;
        lx.beginPath(); lx.moveTo(pa.x, pa.y); lx.lineTo(pb.x, pb.y); lx.stroke();
      }
    }

    const labelData = [];

    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      a.age += dt;
      const vis = getVis(a.lp);
      if (vis < 0.15) {
        if (a.age > 1.5) { cooldowns[a.city.n] = performance.now() / 1000 + COOLDOWN; active.splice(i, 1); }
        continue;
      }
      const edgeFade = Math.max(0, Math.min(1, (vis - 0.15) / 0.25));

      const [rx, ry] = toScreen(a.lp);
      if (!a.smoothed) {
        a.sx = rx; a.sy = ry; a.vx = 0; a.vy = 0; a.smoothed = true;
      } else {
        const tdx = rx - a.sx, tdy = ry - a.sy;
        const dist = Math.hypot(tdx, tdy);
        if (dist > 80) {
          a.sx = rx; a.sy = ry; a.vx = 0; a.vy = 0;
        } else {
          a.vx = a.vx * 0.6 + (tdx * 0.10);
          a.vy = a.vy * 0.6 + (tdy * 0.10);
          const spd = Math.hypot(a.vx, a.vy);
          if (spd > 8) { a.vx = a.vx / spd * 8; a.vy = a.vy / spd * 8; }
          a.sx += a.vx; a.sy += a.vy;
        }
      }

      updateLabel(a.label, dt, ts);

      const dotAlpha = edgeFade * 0.85 * (a.label.phase === 'erasing' ? a.label.displayed.length / a.label.name.length : a.label.done ? 0 : 1);
      if (dotAlpha > 0.01) {
        lx.save(); lx.globalAlpha = dotAlpha;
        lx.beginPath(); lx.arc(a.sx, a.sy, 2.5, 0, Math.PI * 2);
        lx.fillStyle = '#77ccff'; lx.shadowColor = '#3399ff'; lx.shadowBlur = 8; lx.fill(); lx.restore();
      }

      labelData.push({
        ox: a.sx + 10, oy: a.sy - 8,
        label: a.label,
        alpha: edgeFade,
        dotX: a.sx, dotY: a.sy,
        entry: a,
      });

      let allRingsDone = true;
      a.rings.forEach(rg => {
        rg.age += dt;
        const ra = rg.age - rg.delay;
        if (ra < 0) return;
        const rp = Math.min(1, ra / rg.dur);
        rg.angle = rp * RIPPLE_ANGLE;
        if (rg.angle < 0.003) return;
        const fadeIn = ra < 0.15 ? ra / 0.15 : 1;
        const fadeOut = rp > 0.55 ? (1 - rp) / 0.45 : 1;
        const alpha = edgeFade * fadeIn * fadeOut * 0.5;
        if (rp < 1 || alpha >= 0.005) allRingsDone = false;
        if (alpha < 0.005) return;
        const pts3d = greatCircleRing(a.city.lat, a.city.lon, rg.angle, 80);
        const screenPts = projectRing(pts3d);
        if (screenPts.length < 2) return;
        lx.save();
        lx.strokeStyle = `rgba(50,135,255,${alpha})`;
        lx.lineWidth = 0.85;
        lx.lineJoin = 'round';
        lx.beginPath();
        let drawing = false;
        for (let k = 0; k < screenPts.length; k++) {
          const [sx, sy, sz] = screenPts[k];
          if (sz > 0.98) {
            if (drawing) { lx.stroke(); lx.beginPath(); drawing = false; }
            continue;
          }
          if (!drawing) { lx.moveTo(sx, sy); drawing = true; }
          else lx.lineTo(sx, sy);
        }
        if (drawing) lx.stroke();
        lx.restore();
      });
      a.ringsAllDone = allRingsDone;

      if ((a.label.done) && a.ringsAllDone) {
        cooldowns[a.city.n] = performance.now() / 1000 + COOLDOWN;
        active.splice(i, 1);
      }
    }

    resolveLabels(labelData);

    labelData.forEach(ld => {
      if (ld.alpha < 0.01) return;
      drawTypedLabel(lx, ld.ox, ld.oy, ld.label, ld.alpha, ts);
      const ddx = ld.ox - ld.dotX, ddy = ld.oy - ld.dotY;
      if (Math.hypot(ddx, ddy) > 22) {
        lx.save(); lx.globalAlpha = ld.alpha * 0.3; lx.strokeStyle = '#4488aa'; lx.lineWidth = 0.5;
        lx.beginPath(); lx.moveTo(ld.dotX, ld.dotY); lx.lineTo(ld.ox, ld.oy); lx.stroke();
        lx.restore();
      }
    });
  }
  requestAnimationFrame(animate);

  window.addEventListener('resize', () => {
    let { w, h } = getSize();
    W = w;
    H = h;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h); canvasLc.width = w; canvasLc.height = h;
  });
});
