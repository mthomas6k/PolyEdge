/**
 * GALAXY ENGINE v3.1 - Optimized & Integrated
 * Scroll-driven 3D galaxy with volumetric nebulas and low-end support.
 */

// We assume THREE is loaded globally via script tag in index.html
const THREE = window.THREE;

const isLowEnd = (() => {
  if (typeof navigator === 'undefined') return false;
  const memory = navigator.deviceMemory || 8;
  const cpu = navigator.hardwareConcurrency || 8;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  // "Pretty low end to qualify" - Focus on very weak devices
  return (isMobile && (memory <= 2 || cpu <= 4)) || (memory < 2);
})();

console.log(`[GalaxyEngine] Low-End Mode: ${isLowEnd}`);

// ---- CONFIG & CONSTANTS ----
const STAR_COUNT = isLowEnd ? 4000 : 12000;
const NEBULA_COUNT = isLowEnd ? 0 : 25; // Disable volumetric on low-end
const BASE_COLOR = new THREE.Color(0x02040a);
const ACCENT_COLOR = new THREE.Color(0x4488ff);

let renderer, scene, camera;
let starMesh, nebulaGroup = [];
let scrollProgress = 0, targetScrollProgress = 0;
let lastTime = 0;
let isRendering = false;
let animId = null;

// Temporal history for nebula rendering (High-end only)
let nebulaRT, historyRT, clock = new THREE.Clock();

function init() {
  const canvas = document.getElementById('galaxy-canvas');
  if (!canvas) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
  
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isLowEnd,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isLowEnd ? 1 : 2));

  // 1. STARS
  initStars();

  // 2. NEBULAS (High-end only)
  if (!isLowEnd) {
    initNebulas();
  }

  // EVENT LISTENERS
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', updateScroll, { passive: true });
  
  // Initial check: if we are already on home, start
  const homePage = document.getElementById('page-home');
  if (homePage && homePage.classList.contains('active')) {
    setPage('home');
  }
}

/**
 * Public control for the engine from external page logic
 */
function setPage(id) {
  if (id === 'home') {
    start();
  } else {
    stop();
  }
}

function start() {
  if (isRendering) return;
  console.log("[GalaxyEngine] Starting...");
  isRendering = true;
  updateScroll(); // Sync initially
  requestAnimationFrame(animate);
}

function stop() {
  if (!isRendering) return;
  console.log("[GalaxyEngine] Stopping...");
  isRendering = false;
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  const canvas = document.getElementById('galaxy-canvas');
  if (canvas) canvas.classList.remove('visible');
}

function initStars() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(STAR_COUNT * 3);
  const color = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 100 + Math.random() * 800;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);

    const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.1, 0.8, 0.5 + Math.random() * 0.5);
    color[i * 3] = c.r;
    color[i * 3 + 1] = c.g;
    color[i * 3 + 2] = c.b;
    
    sizes[i] = Math.random() * 2 + 0.5;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });

  starMesh = new THREE.Points(geo, mat);
  scene.add(starMesh);
}

// SIMPLEX NOISE 3D (Minified for nebula shader)
const noiseFunc = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

function initNebulas() {
  const geo = new THREE.SphereGeometry(60, 32, 32);
  
  for (let i = 0; i < NEBULA_COUNT; i++) {
    const color = i % 3 === 0 ? new THREE.Color(0x3366ff) : (i % 3 === 1 ? new THREE.Color(0x6633ff) : new THREE.Color(0x2244aa));
    
    // Path configuration for parallax drift
    const driftAngle = Math.random() * Math.PI * 2;
    const driftDist = 80 + Math.random() * 150;
    const startProgress = Math.random();

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        baseColor: { value: color },
        fade: { value: 1.0 },
        noiseScale: { value: 0.02 + Math.random() * 0.03 }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vLocalPos;
        varying vec3 vWorldPos;
        uniform float time;
        uniform vec3 baseColor;
        uniform float fade;
        uniform float noiseScale;
        ${noiseFunc}
        void main() {
          float d = length(vLocalPos) / 60.0;
          if (d > 1.0) discard;
          
          float n = snoise(vWorldPos * noiseScale + time * 0.1);
          float n2 = snoise(vWorldPos * noiseScale * 2.0 - time * 0.05);
          float combined = (n * 0.6 + n2 * 0.4);
          
          float alpha = smoothstep(0.1, 0.4, combined) * pow(1.0 - d, 2.5) * fade;
          gl_FragColor = vec4(baseColor * (combined + 0.5), alpha * 0.4);
        }
      `
    });

    const mesh = new THREE.Mesh(geo, mat);
    
    // Helper data for physics-based scroll logic
    mesh.userData = {
      basePos: new THREE.Vector3(
        (Math.random() - 0.5) * 1200,
        (Math.random() - 0.5) * 1200,
        (Math.random() - 0.5) * 1000
      ),
      drift: new THREE.Vector2(Math.cos(driftAngle) * driftDist, Math.sin(driftAngle) * driftDist),
      triggerAt: startProgress
    };
    
    scene.add(mesh);
    nebulaGroup.push(mesh);
  }
}

function updateScroll() {
  if (!isRendering) return;
  const hero = document.querySelector('.hero');
  const heroHeight = hero ? hero.offsetHeight : window.innerHeight;
  const scrollY = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  
  // Update visibility and mapping
  const canvas = document.getElementById('galaxy-canvas');
  if (scrollY < heroHeight * 0.5) {
    targetScrollProgress = 0;
    canvas?.classList.remove('visible');
  } else {
    // Start mapping when we are mostly through the hero section
    const startY = heroHeight * 0.8;
    const scrollRange = maxScroll - startY;
    targetScrollProgress = scrollRange > 0 ? Math.max(0, Math.min(1, (scrollY - startY) / scrollRange)) : 0;
    canvas?.classList.add('visible');
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function cameraPathAt(t) {
  // Bezier-like camera path through the galaxy
  const x = Math.sin(t * Math.PI * 1.2) * 400;
  const y = Math.cos(t * Math.PI * 0.8) * 300;
  const z = -200 + t * 1500;
  
  const lookX = Math.sin((t + 0.1) * Math.PI * 1.2) * 380;
  const lookY = Math.cos((t + 0.1) * Math.PI * 0.8) * 280;
  const lookZ = z + 100;

  return { pos: new THREE.Vector3(x, y, z), lookAt: new THREE.Vector3(lookX, lookY, lookZ) };
}

function animate(time) {
  if (!isRendering) return;
  animId = requestAnimationFrame(animate);
  
  const dt = (time - lastTime) / 1000;
  lastTime = time;

  // Smooth scroll interpolation
  scrollProgress += (targetScrollProgress - scrollProgress) * 0.08;

  // Update Camera
  const path = cameraPathAt(scrollProgress);
  camera.position.lerp(path.pos, 0.1);
  camera.lookAt(path.lookAt);

  // Update Stars
  if (starMesh) {
    starMesh.rotation.y += 0.0002;
    starMesh.rotation.z += 0.0001;
  }

  // Update Nebulas
  nebulaGroup.forEach(mesh => {
    const ud = mesh.userData;
    // Parallax drift: slide away as we approach them in the zoom
    const driftFac = Math.max(0, 1.0 - Math.abs(scrollProgress - ud.triggerAt) * 2.0);
    mesh.position.set(
      ud.basePos.x + ud.drift.x * driftFac,
      ud.basePos.y + ud.drift.y * driftFac,
      ud.basePos.z
    );
    
    if (mesh.material.uniforms) {
      mesh.material.uniforms.time.value = time * 0.001;
    }
  });

  renderer.render(scene, camera);
}

// Global hook for manual init/control
window.GalaxyEngine = { init, setPage };

// Auto-init on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
