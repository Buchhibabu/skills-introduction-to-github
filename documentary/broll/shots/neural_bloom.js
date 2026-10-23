// neural_bloom: a luminous neural network suspended in warm dawn haze. Ganglion-like clusters of nodes
// joined by curved filaments (screen-facing ribbons computed on the GPU), signals pulsing along them,
// fine dendrites, soft sun rays and out-of-focus motes. At lightAt the network strengthens: filaments
// brighten, signals multiply and quicken, and a wave of new connections grows outward through it.
//
// opts:
//   lightAt   local s when the network lights up and new connections start growing (default 40% of the shot)
//   wave      s the growth wave takes to cross the network (default 2.2)
//   density   0.5..1.5 scales the number of nodes/filaments (default 1)
//
// Overlays: a text card sits in the left third; that third is bright, soft haze (sun glow, a few far
// out-of-focus strands only). The network lives in the centre-right.
import { THREE, register, rng, noise, ease, smooth, prog, clamp, lerp } from '../kit.js';

// ---------------------------------------------------------------- helpers
function fbmTexture(size, seed, octaves = 5, base = 4) {
  const R = rng(seed), grids = [];
  for (let o = 0; o < octaves; o++) { const n = base << o, g = new Float32Array(n * n); for (let i = 0; i < n * n; i++) g[i] = R(); grids.push({ n, g }); }
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (const { n, g } of grids) {
      const fx = (x / size) * n, fy = (y / size) * n, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[(iy % n) * n + (ix % n)], b = g[(iy % n) * n + ((ix + 1) % n)];
      const cc = g[((iy + 1) % n) * n + (ix % n)], d = g[((iy + 1) % n) * n + ((ix + 1) % n)];
      v += amp * lerp(lerp(a, b, sx), lerp(cc, d, sx), sy); tot += amp; amp *= 0.55;
    }
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(clamp(v / tot) * 255); img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const gauss = (R) => { let u = 0; for (let i = 0; i < 4; i++) u += R(); return (u - 2) * 1.2; };

// ---------------------------------------------------------------- shaders
const FIL_VERT = /* glsl */`
attribute vec3 aA; attribute vec3 aB; attribute vec3 aC; attribute vec2 aTS; attribute vec4 aE; attribute vec4 aF;
uniform float uTime; uniform float uLight; uniform float uPx; uniform float uFog; uniform float uFocus; uniform float uAper;
varying float vT; varying float vSide; varying float vI; varying float vPh; varying float vSpd; varying float vOn; varying float vTip;
vec3 bez(float t){ float u = 1.0 - t; return u * u * aA + 2.0 * u * t * aC + t * t * aB; }
vec3 dbez(float t){ return 2.0 * (1.0 - t) * (aC - aA) + 2.0 * t * (aB - aC); }
void main(){
  float t = aTS.x, side = aTS.y;
  // aE: width, birth (-1 = always there), grow duration, brightness ; aF: phase, speed, pulse gate, kind
  float grow = aE.y < 0.0 ? 1.0 : clamp((uTime - aE.y) / aE.z, 0.0, 1.0);
  grow = 1.0 - (1.0 - grow) * (1.0 - grow);
  float tt = t * grow;
  vec3 p = bez(tt);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 tv = normalize(mat3(modelViewMatrix) * dbez(max(tt, 0.001)));
  vec3 sd = normalize(cross(tv, normalize(mv.xyz)));
  float d = -mv.z;
  float pxu = uPx / d;                                   // pixels per world unit here
  float w = aE.x * (0.55 + 0.45 * sin(3.14159 * t));     // taper at both ends
  float wMin = 0.8 / pxu;                                // keep at least ~1.6 px wide; dim instead of shimmer
  float coc = abs(d - uFocus) * uAper;                   // depth of field: out-of-focus strands widen and dim
  float wr = max(max(w, wMin), coc);
  mv.xyz += sd * wr * side;
  gl_Position = projectionMatrix * mv;
  vT = tt; vSide = side;
  vI = aE.w * (w / wr) * exp(-uFog * d) * step(0.0005, grow);
  vPh = aF.x; vSpd = aF.y; vOn = step(aF.z, 0.28 + 0.6 * uLight);
  vTip = (grow > 0.0 && grow < 0.999) ? smoothstep(0.7, 1.0, t) * (1.0 - grow * 0.5) : 0.0;   // bright growing tip
}`;
const FIL_FRAG = /* glsl */`
uniform float uTime; uniform float uLight; uniform vec3 uCol; uniform vec3 uHot;
varying float vT; varying float vSide; varying float vI; varying float vPh; varying float vSpd; varying float vOn; varying float vTip;
void main(){
  float e = 1.0 - abs(vSide);
  float prof = e * e * (3.0 - 2.0 * e);
  float pos = fract(vPh + uTime * vSpd * (1.0 + 1.2 * uLight));
  float dp = (vT - pos) * 16.0;
  float pulse = exp(-dp * dp) * vOn;
  float base = 0.15 + 0.13 * uLight;
  vec3 c = uCol * base + uHot * (pulse * (1.0 + 0.5 * uLight) + vTip * 1.8);
  gl_FragColor = vec4(c * prof * vI, 1.0);
}`;

const NODE_VERT = /* glsl */`
attribute vec4 aR;  // size, phase, birth (-1 = always), flash
uniform float uTime; uniform float uLight; uniform float uPx; uniform float uFog; uniform float uFocus; uniform float uAper;
varying float vA; varying float vCore;
void main(){
  float born = aR.z < 0.0 ? 1.0 : smoothstep(aR.z, aR.z + 0.5, uTime);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  float flash = aR.z < 0.0 ? 0.0 : exp(-max(uTime - aR.z, 0.0) * 2.0) * step(aR.z, uTime);
  float tw = 0.75 + 0.25 * sin(uTime * (1.3 + aR.y) + aR.y * 40.0);
  float sz = aR.x * (1.0 + 0.3 * uLight + 0.6 * flash);
  float coc = abs(d - uFocus) * uAper * 3.0;
  float szr = max(sz, coc);
  gl_PointSize = max(2.0, uPx * szr / d);
  vA = born * tw * (0.5 + 0.35 * uLight + 1.0 * flash) * exp(-uFog * d) * pow(sz / szr, 1.5);
  vCore = aR.w;
}`;
const NODE_FRAG = /* glsl */`
uniform vec3 uCol; uniform vec3 uHot;
varying float vA; varying float vCore;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;
  float core = exp(-r * r * 22.0);
  float halo = exp(-r * 4.0) * (1.0 - r);
  vec3 c = uHot * core * 2.4 + uCol * halo * 0.6;
  gl_FragColor = vec4(c * vA, 1.0);
}`;

// sky dome centred on the camera: angles per vertex, cheap per-pixel shading
const SKY_VERT = /* glsl */`
uniform vec3 uSun;
varying float vG; varying float vH; varying vec2 vRay; varying vec2 vQ;
void main(){
  vec3 d = normalize(position);
  vec3 s = normalize(uSun);
  vG = max(dot(d, s), 0.0); vH = d.y;
  vec3 ax = normalize(cross(s, vec3(0.0, 1.0, 0.0)));
  vec3 ay = cross(ax, s);
  vRay = vec2(atan(dot(d, ay), dot(d, ax)) * 0.6366, 0.5);
  vQ = vec2((atan(d.z, d.x) * 0.15915494 + 0.5) * 5.0, d.y * 2.0 + 0.3);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 uLightC; uniform vec3 uMidC; uniform vec3 uDeepC; uniform float uSunK; uniform float uTime;
uniform sampler2D uNoise;
varying float vG; varying float vH; varying vec2 vRay; varying vec2 vQ;
void main(){
  float g = vG, h = vH;
  // base: deep amber away from the sun, peach toward it, cream in the sun's halo (soft, never clipped)
  vec3 c = mix(uDeepC, uMidC, smoothstep(0.62, 0.95, g) + 0.08 * h);
  float n = texture2D(uNoise, vQ + vec2(uTime * 0.003, 0.0)).r;
  float sh = smoothstep(0.6, 1.0, g + (n - 0.5) * 0.08);
  c = mix(c, uLightC, sh * sh * 0.75);
  float g2 = g * g, g4 = g2 * g2, g8 = g4 * g4, g16 = g8 * g8, g32 = g16 * g16;
  c += uLightC * (g32 * g8 * 0.32) * uSunK;
  // sun rays (angular streaks) and drifting haze banks
  float rays = texture2D(uNoise, vRay + vec2(uTime * 0.004, 0.0)).r;
  c += uLightC * smoothstep(0.45, 0.85, rays) * g8 * smoothstep(0.999, 0.97, g) * 0.12 * uSunK;
  c *= 1.0 + 0.16 * smoothstep(0.35, 0.8, n);
  gl_FragColor = vec4(c, 1.0);
}`;

const MOTE_VERT = /* glsl */`
attribute vec4 aR;
uniform float uTime; uniform float uPx;
varying float vA; varying float vSoft;
void main(){
  vec3 p = position + vec3(sin(uTime * 0.13 + aR.x * 6.28) * 0.25, uTime * (0.03 + 0.04 * aR.y), cos(uTime * 0.11 + aR.z * 6.28) * 0.2);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  // depth of field: motes far from the focus plane grow into soft discs and dim
  float coc = abs(d - 10.5) * 0.02;
  vSoft = clamp(coc / 0.06, 0.0, 1.0);
  gl_PointSize = clamp(uPx * (0.012 + coc) / d, 1.5, 150.0);
  vA = (0.4 + 0.6 * aR.w) * mix(1.0, 0.1, vSoft) * smoothstep(0.6, 2.0, d);
}`;
const MOTE_FRAG = /* glsl */`
uniform vec3 uCol;
varying float vA; varying float vSoft;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;
  float disc = mix(exp(-r * r * 6.0), smoothstep(1.0, 0.75, r) * (0.75 + 0.25 * r), vSoft);
  gl_FragColor = vec4(uCol * disc * vA, 1.0);
}`;

// ---------------------------------------------------------------- the shot
register('neural_bloom', (opts) => {
  const dur = Math.max(0.5, (opts.t1 ?? 8) - (opts.t0 ?? 0));
  const lightAt = opts.lightAt ?? dur * 0.4;
  const wave = opts.wave ?? 2.2;
  const dens = clamp(opts.density ?? 1, 0.5, 1.5);
  const R = rng(2026);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 300);
  const noiseTex = fbmTexture(256, 5);

  // ---- network layout: ganglion clusters on a loose, brain-like ellipsoid shell, plus strays
  const RX = 3.8, RY = 2.3, RZ = 2.8;
  const clusters = [];
  const NC = Math.round(11 * dens);
  for (let i = 0; i < NC; i++) {
    const u = R() * 2 - 1, phi = R() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
    const sh = i < NC - 3 ? 0.8 + 0.2 * R() : 0.2 + 0.3 * R();
    clusters.push({ c: new THREE.Vector3(Math.cos(phi) * sq * RX * sh, u * RY * sh, Math.sin(phi) * sq * RZ * sh), sig: 0.24 + 0.12 * R(), n: Math.round((16 + 14 * R()) * dens) });
  }
  const nodes = [];
  clusters.forEach((cl, ci) => {
    for (let j = 0; j < cl.n; j++) nodes.push({ p: cl.c.clone().add(new THREE.Vector3(gauss(R), gauss(R) * 0.8, gauss(R)).multiplyScalar(cl.sig)), ci, size: 0.07 + 0.14 * Math.pow(R(), 3), born: -1 });
  });
  for (let j = 0; j < 36 * dens; j++) {
    const u = R() * 2 - 1, phi = R() * Math.PI * 2, sq = Math.sqrt(1 - u * u), rr = Math.cbrt(R()) * 1.05;
    nodes.push({ p: new THREE.Vector3(Math.cos(phi) * sq * RX * rr, u * RY * rr, Math.sin(phi) * sq * RZ * rr), ci: -1, size: 0.035 + 0.05 * R(), born: -1 });
  }
  // growth wave origin: the front of the network facing the lens
  const ORIGIN = new THREE.Vector3(-1.2, 0.3, 2.0);
  const waveT = (p) => lightAt + 0.05 + (p.distanceTo(ORIGIN) / 7.5) * wave + R() * 0.25;
  // some nodes are born in the bloom
  nodes.forEach((n) => { if (R() < 0.18) n.born = waveT(n.p); });

  const edges = [];
  const addEdge = (a, b, kind, birth, shared = null) => {
    const A = a.p, B = b.p, len = A.distanceTo(B);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const off = shared ? shared.clone().multiplyScalar(len).add(new THREE.Vector3(gauss(R), gauss(R), gauss(R)).multiplyScalar(len * 0.045))
      : new THREE.Vector3(gauss(R), gauss(R), gauss(R)).multiplyScalar(len * (kind === 2 ? 0.25 : 0.16));
    const born = Math.max(birth, a.born, b.born);
    edges.push({ A, B, C: mid.add(off), w: kind === 1 ? 0.011 + 0.008 * R() : 0.008 + 0.006 * R(), birth: born, gd: 0.5 + 0.6 * R() + len * 0.08,
      br: kind === 1 ? 0.75 + 0.45 * R() : 0.6 + 0.6 * R(), ph: R(), spd: (0.22 + 0.4 * R()) * (kind === 1 ? 0.6 : 1), gate: R() });
  };
  // nearest neighbours within clusters (k = 3 now, +2 more in the bloom)
  const byC = new Map();
  nodes.forEach((n, i) => { if (!byC.has(n.ci)) byC.set(n.ci, []); byC.get(n.ci).push(i); });
  const seen = new Set();
  const key = (i, j) => (i < j ? i * 100000 + j : j * 100000 + i);
  nodes.forEach((n, i) => {
    const pool = n.ci >= 0 ? byC.get(n.ci) : nodes.map((_, j) => j);
    const near = pool.filter((j) => j !== i).map((j) => [j, n.p.distanceToSquared(nodes[j].p)]).sort((a, b) => a[1] - b[1]).slice(0, 4);
    near.forEach(([j], r) => {
      if (n.ci < 0 && r > 1) return;
      const kk = key(i, j); if (seen.has(kk)) return; seen.add(kk);
      addEdge(n, nodes[j], 0, r < 2 ? -1 : waveT(n.p));
    });
  });
  // long filaments between neighbouring clusters (bundles), more of them grow in the bloom
  for (let a = 0; a < clusters.length; a++) {
    const near = clusters.map((cl, b) => [b, clusters[a].c.distanceTo(cl.c)]).filter(([b]) => b !== a).sort((x, y) => x[1] - y[1]).slice(0, 3);
    near.forEach(([b], r) => {
      if (b < a && r > 0) return;
      const ia = byC.get(a), ib = byC.get(b);
      const nb = 3 + Math.floor(R() * 3), nn = 3 + Math.floor(R() * 4);
      const arc = new THREE.Vector3(gauss(R), gauss(R), gauss(R)).multiplyScalar(0.17);
      for (let k = 0; k < nb + nn; k++) {
        const na = nodes[ia[Math.floor(R() * ia.length)]], nb2 = nodes[ib[Math.floor(R() * ib.length)]];
        addEdge(na, nb2, 1, k < nb ? -1 : waveT(na.p), arc);
      }
    });
  }
  // fine dendrites: short curling branches around nodes
  const dendrites = [];
  nodes.forEach((n) => {
    const m = n.size > 0.09 ? 3 : 1;
    for (let k = 0; k < m; k++) {
      const dir = new THREE.Vector3(gauss(R), gauss(R), gauss(R)).normalize();
      const L = 0.12 + 0.22 * R();
      dendrites.push({ p: n.p.clone().addScaledVector(dir, L), born: n.born < 0 ? (R() < 0.3 ? waveT(n.p) : -1) : n.born, size: 0 });
      const d = dendrites[dendrites.length - 1];
      addEdge(n, d, 2, d.born);
      edges[edges.length - 1].w = 0.004; edges[edges.length - 1].br = 0.4 + 0.3 * R();
    }
  });

  // ---- filament geometry
  const SEG = 18, NE = edges.length, NV = NE * (SEG + 1) * 2;
  const aA = new Float32Array(NV * 3), aB = new Float32Array(NV * 3), aC = new Float32Array(NV * 3), aTS = new Float32Array(NV * 2), aE = new Float32Array(NV * 4), aF = new Float32Array(NV * 4);
  const idx = new Uint32Array(NE * SEG * 6);
  let v = 0, ii = 0;
  edges.forEach((e) => {
    const v0 = v;
    for (let s = 0; s <= SEG; s++) for (const side of [-1, 1]) {
      aA.set([e.A.x, e.A.y, e.A.z], v * 3); aB.set([e.B.x, e.B.y, e.B.z], v * 3); aC.set([e.C.x, e.C.y, e.C.z], v * 3);
      aTS[v * 2] = s / SEG; aTS[v * 2 + 1] = side;
      aE.set([e.w, e.birth, e.gd, e.br], v * 4); aF.set([e.ph, e.spd, e.gate, 0], v * 4);
      v++;
    }
    for (let s = 0; s < SEG; s++) { const a = v0 + s * 2; idx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], ii); ii += 6; }
  });
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NV * 3), 3));
  fg.setAttribute('aA', new THREE.BufferAttribute(aA, 3)); fg.setAttribute('aB', new THREE.BufferAttribute(aB, 3)); fg.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
  fg.setAttribute('aTS', new THREE.BufferAttribute(aTS, 2)); fg.setAttribute('aE', new THREE.BufferAttribute(aE, 4)); fg.setAttribute('aF', new THREE.BufferAttribute(aF, 4));
  fg.setIndex(new THREE.BufferAttribute(idx, 1));
  const PX = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(34) / 2));
  const U = {
    uTime: { value: 0 }, uLight: { value: 0 }, uPx: { value: PX }, uFog: { value: 0.03 }, uFocus: { value: 10.5 }, uAper: { value: 0.014 },
    uCol: { value: new THREE.Color('#f7c27a') }, uHot: { value: new THREE.Color('#fff1da').multiplyScalar(1.4) },
  };
  const fil = new THREE.Mesh(fg, new THREE.ShaderMaterial({ vertexShader: FIL_VERT, fragmentShader: FIL_FRAG, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  fil.frustumCulled = false;

  // ---- nodes
  const all = nodes;
  const np = new Float32Array(all.length * 3), nr = new Float32Array(all.length * 4);
  all.forEach((n, i) => { np.set([n.p.x, n.p.y, n.p.z], i * 3); nr.set([n.size, R(), n.born, 1], i * 4); });
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(np, 3)); ng.setAttribute('aR', new THREE.BufferAttribute(nr, 4));
  const nodePts = new THREE.Points(ng, new THREE.ShaderMaterial({ vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  nodePts.frustumCulled = false;

  const net = new THREE.Group();
  net.add(fil, nodePts);
  net.position.set(0.6, 0, 0);
  scene.add(net);

  // ---- sky
  const skyU = {
    uSun: { value: new THREE.Vector3(-0.56, 0.3, -0.77) }, uLightC: { value: new THREE.Color('#ffe4b8').multiplyScalar(0.95) }, uMidC: { value: new THREE.Color('#f0b07c').multiplyScalar(0.85) },
    uDeepC: { value: new THREE.Color('#9a5a36').multiplyScalar(0.6) }, uSunK: { value: 1 }, uTime: { value: 0 }, uNoise: { value: noiseTex },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 96, 48), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // ---- motes (some sharp near the network, some huge soft bokeh near the lens)
  const NM = 260, mp = new Float32Array(NM * 3), mr = new Float32Array(NM * 4), RM = rng(77);
  for (let i = 0; i < NM; i++) {
    const near = i < 14;
    mp.set(near ? [lerp(0.5, 6, RM()), lerp(-2.5, 2.5, RM()), lerp(6.5, 9, RM())] : [lerp(-6, 7, RM()), lerp(-3.5, 3.5, RM()), lerp(-3.5, 3.5, RM())], i * 3);
    mr.set([RM(), RM(), RM(), RM()], i * 4);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aR', new THREE.BufferAttribute(mr, 4));
  const moteU = { uTime: { value: 0 }, uPx: { value: PX }, uCol: { value: new THREE.Color('#ffc98a').multiplyScalar(0.6) } };
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({ vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, uniforms: moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.frustumCulled = false; scene.add(motes);

  const look = new THREE.Vector3();
  return {
    scene, camera,
    bloom: { strength: 0.38, radius: 0.6, threshold: 0.95 },
    exposure: 0.95,
    update(lt, c) {
      const L = smooth(prog(lt, lightAt - 0.1, lightAt + 1.6));
      U.uTime.value = lt; U.uLight.value = L;
      moteU.uTime.value = lt; skyU.uTime.value = lt;
      skyU.uSunK.value = 1 + 0.12 * L;
      const k = ease.inOut(c.k);
      // slow push in with a gentle orbit (parallax through the clusters)
      const az = lerp(-0.32, -0.12, k), dist = lerp(11.5, 9.3, k);
      camera.position.set(Math.sin(az) * dist + 0.6, lerp(0.9, 0.5, k) + noise(lt * 0.3 + 2) * 0.03, Math.cos(az) * dist);
      look.set(lerp(-1.9, -1.6, k), lerp(0.05, 0.0, k), 0);
      camera.lookAt(look);
      camera.updateProjectionMatrix();
      sky.position.copy(camera.position);
      net.rotation.y = lerp(0.0, 0.12, k) + noise(lt * 0.15) * 0.01;
    },
  };
});
