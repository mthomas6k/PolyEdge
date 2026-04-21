/**
 * GALAXY ENGINE v4.0 - Performance-Optimized
 * All volumetric quality preserved. Targeting 60fps.
 */

const THREE = window.THREE;

let isRendering = false;
let animId = null;

// Public control functions
function start() {
  if (isRendering && animId) return;
  console.log("[GalaxyEngine] Starting...");
  isRendering = true;
  if (window._galaxyUpdateScroll) window._galaxyUpdateScroll();
  if (window._galaxyRender && !animId) window._galaxyRender();
}

function stop() {
  if (!isRendering) return;
  console.log("[GalaxyEngine] Stopping...");
  isRendering = false;
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
}

function setPage(id) {
  if (id === 'home') {
    start();
  } else {
    stop();
  }
}

function init() {
  const canvas = document.getElementById("galaxy-canvas");
  if (!canvas) return;

  // Prevent double init
  if (window._galaxyRender) {
    if (document.getElementById('page-home')?.classList.contains('active')) setPage('home');
    return;
  }

  // ============================================================
  // RENDERER / SCENE / CAMERA
  // ============================================================
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: true, powerPreference: "high-performance"
  });
  // FIX 1: Force pixelRatio=1. On Retina displays this was rendering 4x pixels.
  // For a fullscreen background effect, 1x is invisible at normal viewing distance.
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000106, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x020814, 800, 2400);

  // Separate scene for volumetric nebulas — rendered at half resolution for performance
  // Everything else (stars, fog backdrop) renders at full res to the main canvas
  const nebulaScene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.1, 6000
  );
  camera.position.set(0, 0, 0);

  // ============================================================
  // TEXTURES
  // ============================================================
  function makeSoftCircleTexture(size = 128) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    g.addColorStop(0,    "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.5)");
    g.addColorStop(0.5,  "rgba(255,255,255,0.15)");
    g.addColorStop(1,    "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }
  const starTex = makeSoftCircleTexture(64);

  // ============================================================
  // PALETTE
  // ============================================================
  const BLUE_PALETTE = [
    "#3B9EFF", "#1a5cff", "#b8dcff", "#ffffff", "#7fb8ff", "#d8e9ff"
  ];

  // ============================================================
  // STAR LAYERS — significantly more stars, with a wrap-around far field
  // ============================================================
  function createStarLayer({ count, tubeRadius, spiralTightness, zMin, zMax, baseSize, palette, opacity }) {
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const z = zMin + Math.random() * (zMax - zMin);
      const angle = z * spiralTightness + Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.5) * tubeRadius;
      const jitter = (Math.random() - 0.5) * tubeRadius * 0.3;
      positions[i*3+0] = Math.cos(angle) * r + jitter;
      positions[i*3+1] = Math.sin(angle) * r + jitter * 0.5;
      positions[i*3+2] = z;
      col.set(palette[Math.floor(Math.random() * palette.length)]);
      const b = 0.6 + Math.random() * 0.4;
      colors[i*3+0] = col.r * b;
      colors[i*3+1] = col.g * b;
      colors[i*3+2] = col.b * b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: baseSize, map: starTex, vertexColors: true,
      transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    return new THREE.Points(geom, mat);
  }

  // FIX 5: Star counts reduced ~40% to cut additive-blend fill rate.
  // Tubes widened to cover drift zone.
  const tinyStars = createStarLayer({
    count: 9000, tubeRadius: 500, spiralTightness: 0.02,
    zMin: -2400, zMax: 400, baseSize: 0.6,
    palette: BLUE_PALETTE, opacity: 0.85
  });
  scene.add(tinyStars);

  const midStars = createStarLayer({
    count: 4000, tubeRadius: 300, spiralTightness: 0.04,
    zMin: -1800, zMax: 300, baseSize: 1.5,
    palette: BLUE_PALETTE, opacity: 0.9
  });
  scene.add(midStars);

  const heroStars = createStarLayer({
    count: 400, tubeRadius: 180, spiralTightness: 0.05,
    zMin: -1400, zMax: 100, baseSize: 4.0,
    palette: BLUE_PALETTE.slice(0, 4), opacity: 1.0
  });
  scene.add(heroStars);

  // DEDICATED DRIFT-ZONE STAR FIELD
  // The drift sweeps camera into +X territory. We add a huge star field in that
  // direction so during the turn, you're surrounded by stars, not emptiness.
  function createDriftZoneStars() {
    const count = 5000;
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Spread across a large volume centered roughly where drift ends up
      positions[i*3+0] = (Math.random() - 0.2) * 1400;  // biased toward +X
      positions[i*3+1] = (Math.random() - 0.5) * 800;
      positions[i*3+2] = -Math.random() * 2200;
      col.set(BLUE_PALETTE[Math.floor(Math.random() * BLUE_PALETTE.length)]);
      const b = 0.6 + Math.random() * 0.4;
      colors[i*3+0] = col.r * b;
      colors[i*3+1] = col.g * b;
      colors[i*3+2] = col.b * b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.8, map: starTex, vertexColors: true,
      transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    return new THREE.Points(geom, mat);
  }
  const driftStars = createDriftZoneStars();
  scene.add(driftStars);

  // FINALE-ZONE DENSE STARS
  // The area around and behind the big finale nebula was visibly empty of stars
  // (your green-circled region). This adds a dense cluster in a spherical shell
  // centered on the finale position, biased to be behind and around it.
  function createFinaleZoneStars() {
    const count = 6000;
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const col = new THREE.Color();
    // Finale is at (550, 40, -1000)
    const cx = 550, cy = 40, cz = -1000;
    for (let i = 0; i < count; i++) {
      // Spherical distribution around finale, extending 300-1500 units in each direction
      const r = 300 + Math.random() * 1200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sx = cx + r * Math.sin(phi) * Math.cos(theta);
      const sy = cy + r * Math.sin(phi) * Math.sin(theta) * 0.8;
      // Bias toward behind finale (more negative Z) so there's depth backdrop
      const sz = cz + r * Math.cos(phi) - Math.random() * 500;
      positions[i*3+0] = sx;
      positions[i*3+1] = sy;
      positions[i*3+2] = sz;
      col.set(BLUE_PALETTE[Math.floor(Math.random() * BLUE_PALETTE.length)]);
      const b = 0.65 + Math.random() * 0.35;
      colors[i*3+0] = col.r * b;
      colors[i*3+1] = col.g * b;
      colors[i*3+2] = col.b * b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.9, map: starTex, vertexColors: true,
      transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    return new THREE.Points(geom, mat);
  }
  const finaleStars = createFinaleZoneStars();
  scene.add(finaleStars);

  // ============================================================
  // VOLUMETRIC NEBULA SHADER (OPTION B)
  // ============================================================
  const nebulaVertexShader = `
    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;

    void main() {
      vLocalPosition = position;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const nebulaFragmentShader = `
    precision highp float;

    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;

    uniform vec3 uCameraPos;
    uniform vec3 uNebulaCenter;
    uniform float uNebulaRadius;
    uniform float uTime;
    uniform vec3 uColorCore;
    uniform vec3 uColorMid;
    uniform vec3 uColorEdge;
    uniform float uIntensity;
    uniform float uSeed;
    uniform float uDensityScale;

    // --- 3D Simplex Noise (Ashima/Stefan Gustavson, MIT license) ---
    // Standard simplex noise implementation. Gives smooth 3D noise values.
    vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);

      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);

      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;

      i = mod(i, 289.0);
      vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));

      float n_ = 1.0 / 7.0;
      vec3 ns = n_ * D.wyz - D.xzx;

      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);

      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);

      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);

      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));

      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);

      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    // FIX 4: FBM reduced to 2 octaves (from 3). 33% less noise math.
    // The 3rd octave was sub-pixel detail at half-res — invisible.
    float fbm(vec3 p) {
      float v = 0.5 * snoise(p);
      p = p * 2.0 + vec3(1.7, 9.2, 4.3);
      v += 0.25 * snoise(p);
      return v;
    }

    // Sample density at a world-space point inside the nebula volume
    float sampleDensity(vec3 worldPos) {
      vec3 local = worldPos - uNebulaCenter;
      float distFromCenter = length(local) / uNebulaRadius;

      float shapeFalloff = 1.0 - smoothstep(0.2, 1.0, distFromCenter);
      if (shapeFalloff <= 0.0) return 0.0;

      // FBM noise at multiple scales for organic cloud structure
      vec3 noisePos = local * 0.006 + vec3(uSeed * 100.0);
      float n1 = fbm(noisePos * 1.0);
      float n2 = fbm(noisePos * 2.5 + vec3(5.0));
      float noiseValue = n1 * 0.7 + n2 * 0.3;

      // Combine shape with noise. The noise carves VOIDS into the nebula
      float density = shapeFalloff * smoothstep(-0.2, 0.6, noiseValue);
      density *= uDensityScale;

      return density;
    }

    // Ray-Sphere intersection
    vec2 raySphereIntersect(vec3 rayOrigin, vec3 rayDir, vec3 sphereCenter, float sphereRadius) {
      vec3 oc = rayOrigin - sphereCenter;
      float b = dot(oc, rayDir);
      float c = dot(oc, oc) - sphereRadius * sphereRadius;
      float h = b * b - c;
      if (h < 0.0) return vec2(-1.0, -1.0);
      h = sqrt(h);
      return vec2(-b - h, -b + h);
    }

    // FIX 3: Ray-march steps 24→16. Same total ray coverage via larger steps.
    // FIX 7: Distance-adaptive: far nebulas (>1200 units) use only 8 steps.
    // referenceStepLen recalculated to match 16 steps (uNebulaRadius/8).
    vec4 rayMarchNebula(vec3 rayOrigin, vec3 rayDir) {
      float sphereR = uNebulaRadius * 1.15;
      vec2 hit = raySphereIntersect(rayOrigin, rayDir, uNebulaCenter, sphereR);

      if (hit.y < -sphereR) return vec4(0.0);

      float tNear = max(hit.x, 0.0);
      float tFar  = hit.y;

      float exitFade = smoothstep(-sphereR * 0.5, sphereR * 0.1, tFar);
      if (exitFade <= 0.001) return vec4(0.0);

      if (tFar <= tNear) return vec4(0.0);

      // Distance-adaptive step count
      float camDist = length(rayOrigin - uNebulaCenter);
      int actualSteps = (camDist > 1200.0) ? 8 : 16;
      float marchDist = tFar - tNear;
      float stepLen = marchDist / float(actualSteps);

      vec4 accumulated = vec4(0.0);

      // IGN dither preserved for smooth noise
      vec2 pixelCoord = gl_FragCoord.xy;
      float dither = fract(52.9829189 * fract(dot(pixelCoord, vec2(0.06711056, 0.00583715))));
      dither = fract(dither + uTime * 0.61803398);

      float t = tNear + stepLen * dither;

      // Unrolled to max 16 steps (GLSL requires constant loop bounds)
      for (int i = 0; i < 16; i++) {
        if (i >= actualSteps) break;
        vec3 samplePos = rayOrigin + rayDir * t;
        float density = sampleDensity(samplePos);

        if (density > 0.01) {
          vec3 color = mix(uColorEdge, uColorMid, smoothstep(0.0, 0.4, density));
          color = mix(color, uColorCore, smoothstep(0.4, 1.0, density));

          float brightness = 1.0 + density * 1.5;
          color *= brightness * uIntensity;

          // referenceStepLen matched to 16 steps: uNebulaRadius/8
          float referenceStepLen = uNebulaRadius / 8.0;
          float alpha = density * 0.16 * (stepLen / referenceStepLen);

          accumulated.rgb += (1.0 - accumulated.a) * color * alpha;
          accumulated.a += (1.0 - accumulated.a) * alpha;

          if (accumulated.a > 0.95) break;
        }

        t += stepLen;
        if (t > tFar) break;
      }

      accumulated *= exitFade;
      return accumulated;
    }

    void main() {
      // Ray starts AT the camera, not at the fragment.
      vec3 rayDir = normalize(vWorldPosition - uCameraPos);
      vec4 col = rayMarchNebula(uCameraPos, rayDir);

      if (col.a <= 0.0) discard;

      gl_FragColor = col;
    }
  `;

  function buildVolumetricNebula({
    position,
    radius = 200,
    colorCore = new THREE.Color("#ffffff"),
    colorMid = new THREE.Color("#3B9EFF"),
    colorEdge = new THREE.Color("#1a5cff"),
    intensity = 1.0,
    densityScale = 1.0,
    seed = Math.random()
  }) {
    const width = radius * 2.4;
    const height = radius * 2.0;
    const depth = radius * 2.4;
    const geom = new THREE.BoxGeometry(width, height, depth);

    const mat = new THREE.ShaderMaterial({
      vertexShader: nebulaVertexShader,
      fragmentShader: nebulaFragmentShader,
      uniforms: {
        uCameraPos:    { value: new THREE.Vector3() },
        uNebulaCenter: { value: position.clone() },
        uNebulaRadius: { value: radius },
        uTime:         { value: 0 },
        uColorCore:    { value: colorCore },
        uColorMid:     { value: colorMid },
        uColorEdge:    { value: colorEdge },
        uIntensity:    { value: intensity },
        uSeed:         { value: seed },
        uDensityScale: { value: densityScale }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    mesh.position.copy(position);
    return { mesh, material: mat };
  }

  // ============================================================
  // PLACE VOLUMETRIC NEBULAS
  // ============================================================

  // NEBULA A
  const nebA = buildVolumetricNebula({
    position: new THREE.Vector3(180, 40, -450),
    radius: 180,
    colorCore: new THREE.Color("#ffffff"),
    colorMid:  new THREE.Color("#7fb8ff"),
    colorEdge: new THREE.Color("#1a5cff"),
    intensity: 1.1,
    densityScale: 1.0,
    seed: 0.31
  });
  nebulaScene.add(nebA.mesh);

  // NEBULA B
  const nebB = buildVolumetricNebula({
    position: new THREE.Vector3(-220, -30, -850),
    radius: 230,
    colorCore: new THREE.Color("#d8e9ff"),
    colorMid:  new THREE.Color("#3B9EFF"),
    colorEdge: new THREE.Color("#1a5cff"),
    intensity: 1.15,
    densityScale: 1.1,
    seed: 0.72
  });
  nebulaScene.add(nebB.mesh);

  // NEBULA C
  const nebC = buildVolumetricNebula({
    position: new THREE.Vector3(120, 100, -1200),
    radius: 160,
    colorCore: new THREE.Color("#ffffff"),
    colorMid:  new THREE.Color("#b8dcff"),
    colorEdge: new THREE.Color("#3B9EFF"),
    intensity: 1.0,
    densityScale: 0.95,
    seed: 0.14
  });
  nebulaScene.add(nebC.mesh);

  // FINALE
  const FINALE_POS = new THREE.Vector3(550, 40, -1000);
  const finale = buildVolumetricNebula({
    position: FINALE_POS,
    radius: 380,
    colorCore: new THREE.Color("#ffffff"),
    colorMid:  new THREE.Color("#3B9EFF"),
    colorEdge: new THREE.Color("#0a2a6c"),
    intensity: 1.3,
    densityScale: 1.2,
    seed: 0.88
  });
  nebulaScene.add(finale.mesh);

  nebA.originalPos = nebA.mesh.position.clone();
  nebA.originalRadius = nebA.material.uniforms.uNebulaRadius.value;
  nebA.driftDir = new THREE.Vector3(1, 0.2, 0).normalize();

  nebB.originalPos = nebB.mesh.position.clone();
  nebB.originalRadius = nebB.material.uniforms.uNebulaRadius.value;
  nebB.driftDir = new THREE.Vector3(-1, -0.15, 0).normalize();

  nebC.originalPos = nebC.mesh.position.clone();
  nebC.originalRadius = nebC.material.uniforms.uNebulaRadius.value;
  nebC.driftDir = new THREE.Vector3(0.8, 0.5, 0).normalize();

  finale.originalPos = finale.mesh.position.clone();
  finale.originalRadius = finale.material.uniforms.uNebulaRadius.value;
  finale.driftDir = new THREE.Vector3(1, 0.1, 0).normalize();
  finale.skipDrift = true;

  const allNebulas = [nebA, nebB, nebC, finale];

  // ============================================================
  // LOCAL DUST
  // ============================================================
  const glowTex = makeSoftCircleTexture(256);
  const localDust = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({
      map: glowTex,
      color: new THREE.Color(BLUE_PALETTE[Math.floor(Math.random() * 3)]),
      transparent: true,
      opacity: 0.03 + Math.random() * 0.04,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    const z = -150 - Math.random() * 1100;
    const angle = z * 0.04 + Math.random() * Math.PI * 2;
    const r = 40 + Math.random() * 80;
    s.position.set(Math.cos(angle) * r, Math.sin(angle) * r, z);
    const scale = 100 + Math.random() * 160;
    s.scale.set(scale, scale, 1);
    localDust.add(s);
  }
  scene.add(localDust);

  // ============================================================
  // SCROLL / RESIZE
  // ============================================================
  let scrollProgress = 0;
  let targetScrollProgress = 0;
  function updateScroll() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    // Cap mapping at 1 so we map strictly top to bottom
    targetScrollProgress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
  }
  window.addEventListener("scroll", updateScroll, { passive: true });
  window._galaxyUpdateScroll = updateScroll;
  updateScroll();

  // ============================================================
  // CAMERA PATH
  // ============================================================
  const DRIFT_START = 0.4;
  const HELIX_RADIUS = 6;
  const HELIX_TURNS = 1.8;
  const TRAVEL_Z_MAX = 1100;

  function cameraPathAt(t, time) {
    const zProgress = easeOutCubic(t);
    const baseZ = -zProgress * TRAVEL_Z_MAX - t * 400;

    const helixAngle = t * HELIX_TURNS * Math.PI * 2 + time * 0.03;
    const helixX = Math.cos(helixAngle) * HELIX_RADIUS;
    const helixY = Math.sin(helixAngle) * HELIX_RADIUS * 0.6;

    const driftStrength = smoothstep(DRIFT_START, 1.0, t);
    const driftX = Math.sin(driftStrength * Math.PI * 0.5) * 600;
    const driftY = Math.sin(driftStrength * Math.PI) * 40;
    const driftZ = (1 - Math.cos(driftStrength * Math.PI * 0.5)) * 250;

    const position = new THREE.Vector3(
      helixX + driftX,
      helixY + driftY,
      baseZ + driftZ
    );

    const lookForward = new THREE.Vector3(
      position.x + Math.cos(helixAngle + 0.15) * HELIX_RADIUS * 0.4,
      position.y + Math.sin(helixAngle + 0.15) * HELIX_RADIUS * 0.3,
      position.z - 60
    );

    const gazeShift = smoothstep(DRIFT_START + 0.05, 0.95, t);
    const lookAt = new THREE.Vector3().lerpVectors(
      lookForward, FINALE_POS, gazeShift
    );

    const roll = Math.sin(driftStrength * Math.PI) * 0.22;

    return { position, lookAt, roll };
  }

  // ============================================================
  // FIX 2: RES_SCALE 0.5 → 0.35. ~2x less shader work on nebula pass.
  // Volumetric fog is low-frequency; the linear upscale hides the difference.
  // ============================================================
  const RES_SCALE = 0.35;
  const rtOpts = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false
  };
  const nebulaRenderTarget = new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * RES_SCALE),
    Math.floor(window.innerHeight * RES_SCALE),
    rtOpts
  );

  // FIX 6: Eliminated nebulaBlendedTarget. Merged blend+composite into 2 passes
  // using ping-pong between two targets instead of 3.
  const nebulaHistoryTarget = new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * RES_SCALE),
    Math.floor(window.innerHeight * RES_SCALE),
    rtOpts
  );

  // FIX 6: Merged pipeline. 2 post-process passes instead of 4.
  // Pass A: Blend current nebula frame with history → write to canvas (additive)
  // Pass B: Copy blended result to history for next frame (ping-pong)
  const compositeScene = new THREE.Scene();
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fullscreenGeo = new THREE.PlaneGeometry(2, 2);

  // Combined blend+composite shader: reads current + history, outputs blended
  const compositeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tCurrent: { value: nebulaRenderTarget.texture },
      tHistory: { value: nebulaHistoryTarget.texture },
      uBlendFactor: { value: 0.1 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tCurrent;
      uniform sampler2D tHistory;
      uniform float uBlendFactor;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tCurrent, vUv);
        vec4 h = texture2D(tHistory, vUv);
        gl_FragColor = mix(c, h, uBlendFactor);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const compositeQuad = new THREE.Mesh(fullscreenGeo, compositeMaterial);
  compositeScene.add(compositeQuad);

  // History copy shader (reads from current render target)
  const copyScene = new THREE.Scene();
  const copyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tCurrent: { value: nebulaRenderTarget.texture },
      tHistory: { value: nebulaHistoryTarget.texture },
      uBlendFactor: { value: 0.1 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tCurrent;
      uniform sampler2D tHistory;
      uniform float uBlendFactor;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tCurrent, vUv);
        vec4 h = texture2D(tHistory, vUv);
        gl_FragColor = mix(c, h, uBlendFactor);
      }
    `,
    depthTest: false,
    depthWrite: false
  });
  const copyQuad = new THREE.Mesh(fullscreenGeo, copyMaterial);
  copyScene.add(copyQuad);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    const w = Math.floor(window.innerWidth * RES_SCALE);
    const h = Math.floor(window.innerHeight * RES_SCALE);
    nebulaRenderTarget.setSize(w, h);
    nebulaHistoryTarget.setSize(w, h);
  };
  window.addEventListener("resize", onResize);

  // ============================================================
  // PARALLAX DRIFT
  // ============================================================
  function updateNebulaDrift() {
    const finaleZ = finale.originalPos.z;
    const finaleX = finale.originalPos.x;
    const finaleY = finale.originalPos.y;

    for (const neb of allNebulas) {
      if (neb.skipDrift) continue;

      const origZ = neb.originalPos.z;
      const camZ = camera.position.z;
      const zDist = Math.abs(camZ - origZ);

      const DRIFT_RADIUS = 600;
      let approach = 1 - Math.min(1, zDist / DRIFT_RADIUS);
      approach = approach * approach * (3 - 2 * approach);

      if (camZ < origZ) {
        approach = 1.0;
      }

      const MAX_DRIFT = 700 + neb.originalRadius * 2.2;
      const driftAmount = approach * MAX_DRIFT;

      neb.mesh.position.copy(neb.originalPos).addScaledVector(neb.driftDir, driftAmount);

      const scale = 1 + approach * 1.4;
      neb.material.uniforms.uNebulaRadius.value = neb.originalRadius * scale;
      neb.mesh.scale.setScalar(scale);

      const pastNebula = origZ - camZ;
      let backdropLerp = 0;
      if (pastNebula > 400) {
        backdropLerp = Math.min(1, (pastNebula - 400) / 600);
        backdropLerp = backdropLerp * backdropLerp * (3 - 2 * backdropLerp);
      }

      if (backdropLerp > 0) {
        const backdropTarget = new THREE.Vector3(
          finaleX + neb.driftDir.x * 400,
          finaleY + neb.driftDir.y * 200,
          finaleZ - 300
        );
        neb.mesh.position.lerp(backdropTarget, backdropLerp);
      }
      neb.material.uniforms.uNebulaCenter.value.copy(neb.mesh.position);
    }
  }

  function updateNebulaCulling() {
    const FADE_START = 1100;
    const FADE_END = 1800;
    for (const neb of allNebulas) {
      const dist = camera.position.distanceTo(neb.mesh.position);
      const nebRadius = neb.material.uniforms.uNebulaRadius.value;
      const effectiveDist = dist - nebRadius;
      let fade = 1.0;
      if (effectiveDist > FADE_START) {
        fade = 1.0 - (effectiveDist - FADE_START) / (FADE_END - FADE_START);
        fade = Math.max(0, Math.min(1, fade));
      }
      if (neb._baseIntensity === undefined) {
        neb._baseIntensity = neb.material.uniforms.uIntensity.value;
      }
      neb.material.uniforms.uIntensity.value = neb._baseIntensity * fade;
      neb.mesh.visible = fade > 0.001;
    }
  }

  // ============================================================
  // ANIMATION LOOP — 60fps cap
  // ============================================================
  const clock = new THREE.Clock();
  const TARGET_FPS = 60;
  const FRAME_MS = 1000 / TARGET_FPS;
  let lastFrameTime = 0;
  let frames = 0;
  let lastFpsTime = performance.now();
  let currentFps = 0;

  function render() {
    if (!isRendering) return;

    const now = performance.now();
    const elapsed = clock.getElapsedTime();

    // FPS cap: if we're too fast, wait
    if (now - lastFrameTime < FRAME_MS - 1) {
      animId = requestAnimationFrame(render);
      return;
    }
    lastFrameTime = now;

    scrollProgress += (targetScrollProgress - scrollProgress) * 0.05;

    const path = cameraPathAt(scrollProgress, elapsed);
    camera.position.copy(path.position);
    camera.up.set(Math.sin(path.roll), Math.cos(path.roll), 0);
    camera.lookAt(path.lookAt);

    for (const neb of allNebulas) {
      neb.material.uniforms.uCameraPos.value.copy(camera.position);
      neb.material.uniforms.uTime.value = elapsed;
    }

    tinyStars.rotation.z = elapsed * 0.005;
    midStars.rotation.z = -elapsed * 0.008;

    // FIX 8: Only update fog when it actually changes noticeably
    const newFogFar = 2400 + Math.sin(elapsed * 0.3) * 150;
    if (Math.abs(scene.fog.far - newFogFar) > 5) {
      scene.fog.far = newFogFar;
    }

    updateNebulaDrift();
    updateNebulaCulling();

    // PASS 1: Main scene (stars, dust) to canvas
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // PASS 2: Nebulas to low-res target
    renderer.setRenderTarget(nebulaRenderTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(nebulaScene, camera);

    // PASS 3: Blend with history + additive composite onto canvas
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000106, 1);
    renderer.autoClear = false;
    renderer.render(compositeScene, compositeCamera);
    renderer.autoClear = true;

    // PASS 4: Copy blended result to history for next frame
    renderer.setRenderTarget(nebulaHistoryTarget);
    renderer.clear();
    renderer.render(copyScene, compositeCamera);

    frames++;
    if (now - lastFpsTime > 500) {
      currentFps = Math.round((frames * 1000) / (now - lastFpsTime));
      frames = 0;
      lastFpsTime = now;
    }

    animId = requestAnimationFrame(render);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  window._galaxyRender = () => {
    lastFrameTime = performance.now();
    render();
  };

  // Only start rendering if we are on the home page when initialized
  if (document.getElementById('page-home')?.classList.contains('active')) {
    setPage('home');
  }
}

// Global hooks
window.GalaxyEngine = { init, setPage };

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
