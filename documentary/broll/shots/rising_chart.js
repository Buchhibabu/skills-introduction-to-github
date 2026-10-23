// rising_chart: a 3D evidence chart. A glowing amber line draws itself across a dark glossy floor
// through data beacons (light columns, floor pools, crisp labels); the camera swoops from low on the
// left along the line and finishes looking up at the highest point. Cold haze, dust, mirrored floor.
//
// opts:
//   points    [{ fx: 0..1, v: percent, label: '2%', sub: 'OCT 2023', t?: local s, side?: 'left'|'right'|'centre' }, ...]
//             fx = position along the time axis, v = value (0..100). t (optional) = when the line reaches it.
//             side: where the label stack sits (default: over the point, a little to its left, clear of the
//             climbing line; labels are kept inside the frame and scaled up with distance to stay legible)
//             default: 2% OCT 2023, 33% AUG 2024, ~80% FEB 2026
//   drawFrom  local s when the line starts drawing (default min(0.8, 10% of the shot))
//   drawTo    local s when it reaches the last point (default dur - min(2.5, 25% of dur))
//   years     [{ fx, label }] floor axis labels (default 2024/2025/2026 placed for the default points; [] = none)
//   axis      true (default) | false   faint 25/50/75/100% guide lines behind the line
//   readout   true (default) | false   a live value riding the line head while it draws ('17%' ... '64%')
//
// Camera: low on the left at the first point, tracking along the front of the chart as the line draws (the
// previous beacon, the floor horizon and the live readout stay in frame), then pulling back to the right and
// down to finish looking up at the last point with the whole rise (first, middle, last) in one frame.
//
// Overlays: the top-left band (title, x < ~1000, y < ~300) and the bottom band (footnote and source,
// y > ~880) are kept calm: guides, floor rings, dust and the floor's glints are masked there in screen space,
// and the composition keeps the line, beacons and labels between y ~130 and ~880.
import { THREE, register, keys, rng, noise, ease, smooth, prog, clamp, lerp, glowTexture } from '../kit.js';

const DEFAULT_POINTS = [
  { fx: 0.03, v: 1.96, label: '2%', sub: 'OCT 2023' },
  { fx: 0.4, v: 33.2, label: '33%', sub: 'AUG 2024' },
  { fx: 0.95, v: 80.8, label: '~80%', sub: 'FEB 2026' },
];
const DEFAULT_YEARS = [{ fx: 0.129, label: '2024' }, { fx: 0.523, label: '2025' }, { fx: 0.917, label: '2026' }];

// ---------------------------------------------------------------- helpers (local to this shot)
function monotone(xs, ys) {
  const n = xs.length, d = [], m = [];
  if (n === 1) { const f = () => ys[0]; f.m = [0]; return f; }
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const f = (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
  f.m = m;
  return f;
}

/** All text labels share one atlas canvas: one GPU upload; each label is a clone of the atlas texture
 *  (clones share the image source) with its own offset/repeat. Crisp text, letter spacing, optional glow. */
function makeAtlas(W = 2048, H = 1024) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const base = new THREE.CanvasTexture(c);
  base.colorSpace = THREE.SRGBColorSpace; base.anisotropy = 8;
  base.minFilter = THREE.LinearMipmapLinearFilter; base.generateMipmaps = true;
  let x = 0, y = 0, rowH = 0;
  return (text, { font = '600 160px Oswald', color = '#f4ecdc', spacing = 0, glow = null, glowBlur = 30 } = {}) => {
    const size = parseInt(font.match(/(\d+)px/)[1], 10), pad = Math.ceil(size * 0.35);
    g.font = font; g.letterSpacing = `${spacing}px`;
    const w = Math.ceil(g.measureText(text).width + pad * 2), h = Math.ceil(size * 1.3 + pad * 2);
    if (x + w > W) { x = 0; y += rowH + 8; rowH = 0; }
    const x0 = x, y0 = y;
    x += w + 8; rowH = Math.max(rowH, h);
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    g.font = font; g.letterSpacing = `${spacing}px`; g.textBaseline = 'middle'; g.textAlign = 'center';
    if (glow) { g.shadowColor = glow; g.shadowBlur = glowBlur; g.fillStyle = glow; g.fillText(text, x0 + w / 2, y0 + h / 2); g.shadowBlur = 0; }
    g.fillStyle = color; g.fillText(text, x0 + w / 2, y0 + h / 2);
    g.restore();
    const t = base.clone();
    t.offset.set(x0 / W, 1 - (y0 + h) / H); t.repeat.set(w / W, h / H);
    t.needsUpdate = true;
    return { texture: t, aspect: w / h, padFrac: pad / h };
  };
}

/** Tileable fbm value-noise canvas texture (for haze and floor smudges). */
function fbmTexture(size, seed, octaves = 5, base = 4) {
  const R = rng(seed);
  const grids = [];
  for (let o = 0; o < octaves; o++) {
    const n = base << o, g = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) g[i] = R();
    grids.push({ n, g });
  }
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
    v /= tot;
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(clamp(v) * 255); img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- shaders
const W_VERT = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// screen-space mask for the overlay bands: the top-left title band and the bottom footnote/source band
const CALM = /* glsl */`
float calmMask(){
  vec2 f = gl_FragCoord.xy; float yTop = 1080.0 - f.y;
  float bottom = 1.0 - smoothstep(850.0, 925.0, yTop);
  float tl = (1.0 - smoothstep(900.0, 1120.0, f.x)) * (1.0 - smoothstep(250.0, 340.0, yTop));
  return bottom * (1.0 - tl);
}`;

// one program for every additive light in the chart (fewer shader compiles):
// mode 0 line core, 1 glow tube, 2 curtain under the line, 3 beacon column / beam, 4 dashed guide line, 5 flat colour
const LIGHT_FRAG = /* glsl */`
${CALM}
uniform float uMode; uniform float uHead; uniform vec3 uColor; uniform float uGain; uniform float uFog; uniform float uPow;
uniform float uGrow; uniform float uTop; uniform float uFall; uniform float uReveal;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 v = normalize(cameraPosition - vW);
  float f = abs(dot(normalize(vN), v));
  float dh = max(uHead - vW.x, 0.0);
  vec3 c; float mirrorK = 0.6;
  if (uMode < 0.5) {
    float m = smoothstep(uHead + 0.015, uHead - 0.015, vW.x);
    if (m <= 0.001) discard;
    float hot = exp(-dh * 0.9);
    c = (uColor * (0.55 + 0.45 * f) * (1.0 + 2.2 * hot) + vec3(1.0, 0.85, 0.6) * hot * f * 0.8) * uGain * m;
    mirrorK = 1.1;
  } else if (uMode < 1.5) {
    float m = smoothstep(uHead + 0.25, uHead - 0.05, vW.x);
    if (m <= 0.001) discard;
    c = uColor * uGain * pow(f, uPow) * (0.7 + 1.6 * exp(-dh * 0.6)) * m;
  } else if (uMode < 2.5) {
    float m = smoothstep(uHead + 0.02, uHead - 3.5, vW.x);
    if (m <= 0.001) discard;
    float h = vUv.y;
    float g = pow(h, 2.4) * 0.85 + 0.06 * h;
    float bars = 0.8 + 0.2 * smoothstep(0.42, 0.5, abs(fract(vW.x * 2.5) - 0.5));
    float lip = exp(-(1.0 - h) * 26.0) * 0.9;
    c = uColor * uGain * (g * bars + lip) * (0.65 + 0.8 * exp(-dh * 0.5)) * m;
  } else if (uMode < 3.5) {
    float y = vUv.y;
    if (y > uGrow) discard;
    float prof = 0.35 + 0.65 * (exp(-y * 6.0) + exp(-(uTop - y) * 9.0));
    float tip = exp(-(uGrow - y) * 30.0) * step(uGrow, 0.999);
    c = uColor * uGain * pow(f, uPow) * (prof + tip * 2.0) * exp(-y * uFall);
  } else if (uMode > 4.5) {
    c = uColor * uGain;
  } else {
    float dash = step(0.45, fract(vW.x * 1.6));
    float rev = smoothstep(uReveal, uReveal - 3.0, vW.x);
    float edge = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
    float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    c = uColor * uGain * mix(0.35, 1.0, dash) * edge * rev * ends;
  }
  c *= exp(-uFog * length(cameraPosition - vW)) * exp(min(vW.y, 0.0) * mirrorK);
  if (uMode > 1.5) c *= calmMask();
  gl_FragColor = vec4(c, 1.0);
}`;

// glossy dark floor: grid, light pools, smudged gloss; drawn over a mirrored copy of the chart
const FLOOR_FRAG = /* glsl */`
${CALM}
uniform float uFog; uniform vec3 uFogCol; uniform sampler2D uNoise;
uniform vec4 uPool[NPOOL];             // x, z, radius, intensity (amber)
uniform float uHead; uniform float uX0; uniform float uLineGlow;
uniform float uPX[NPOOL]; uniform float uPY[NPOOL]; uniform float uPM[NPOOL];
uniform vec4 uBea[NPOOL];              // beacon x, lit column top, intensity, point height
varying vec3 vW;
float curveY(float x){
  float y = uPY[0];
  for (int i = 0; i < NPOOL - 1; i++) {
    if (x > uPX[i] && x <= uPX[i + 1]) {
      float h = uPX[i + 1] - uPX[i], t = (x - uPX[i]) / h, t2 = t * t, t3 = t2 * t;
      y = (2.0 * t3 - 3.0 * t2 + 1.0) * uPY[i] + (t3 - 2.0 * t2 + t) * h * uPM[i] + (-2.0 * t3 + 3.0 * t2) * uPY[i + 1] + (t3 - t2) * h * uPM[i + 1];
    }
  }
  if (x > uPX[NPOOL - 1]) y = uPY[NPOOL - 1];
  return y;
}
float gridLine(vec2 p, float w){
  vec2 g = abs(fract(p - 0.5) - 0.5) / (fwidth(p) * w);
  return 1.0 - min(min(g.x, g.y), 1.0);
}
void main(){
  vec2 p = vW.xz;
  float d = length(vW - cameraPosition);
  vec3 vdir = normalize(cameraPosition - vW);
  float cosT = clamp(vdir.y, 0.0, 1.0);
  float smudge = texture2D(uNoise, p * 0.035).r;
  vec3 base = vec3(0.010, 0.012, 0.016) * (0.75 + 0.6 * smudge);
  // grid: minor 1 m, major 4 m, fading with distance
  float minor = gridLine(p, 1.0) * exp(-d * 0.09) * 0.55;
  float major = gridLine(p * 0.25, 1.4) * exp(-d * 0.035);
  vec3 gridC = vec3(0.30, 0.42, 0.55) * (minor * 0.10 + major * 0.22);
  // amber light pools under the beacons
  vec3 pool = vec3(0.0);
  for (int i = 0; i < NPOOL; i++) {
    vec2 q = p - uPool[i].xy;
    float r2 = dot(q, q) / (uPool[i].z * uPool[i].z);
    pool += vec3(0.94, 0.58, 0.20) * uPool[i].w * (exp(-r2 * 2.5) * 0.6 + exp(-r2 * 0.35) * 0.12);
  }
  // a faint glow strip under the drawn line
  float under = smoothstep(uHead + 0.4, uHead - 0.8, p.x) * smoothstep(uX0 - 1.2, uX0 + 0.3, p.x);
  pool += vec3(0.94, 0.58, 0.20) * under * exp(-p.y * p.y * 0.9) * 0.05 * uLineGlow;
  float calm = calmMask();
  pool *= calm;
  vec3 c = base + gridC * (1.0 + 2.0 * length(pool)) + pool * (0.6 + 0.4 * smudge);
  // glossy reflection of the chart (everything lives in the z = 0 plane): follow the mirrored view ray
  // to that plane and shade what it meets, blurred more the higher it is above the floor (rough gloss)
  vec3 cm = vec3(cameraPosition.x, -cameraPosition.y, cameraPosition.z);
  vec3 rd = vW - cm;
  float sr = abs(rd.z) > 1e-4 ? -vW.z / rd.z : -1.0;
#ifdef NOREFL
  sr = -1.0;
#endif
  if (sr > 0.0) {
    vec3 Q = vW + rd * sr;
    float qy = Q.y;
    float blur = 0.07 + 0.09 * qy;
    float cy = curveY(Q.x);
    float start = smoothstep(uX0 - 0.05, uX0 + 0.05, Q.x);
    float drawn = smoothstep(uHead + 0.05, uHead - 0.7, Q.x) * start;
    float trail = smoothstep(uHead + 0.02, uHead - 3.5, Q.x) * start;
    float dl = (qy - cy) / blur;
    float tLine = (exp(-dl * dl) * 0.5 + exp(-abs(dl) * 0.5) * 0.02) * drawn;
    float tCurt = step(qy, cy) * pow(clamp(qy / max(cy, 0.01), 0.0, 1.0), 2.4) * 0.035 * trail;
    float lit = tLine + tCurt;
    float tBea = 0.0;
    for (int i = 0; i < NPOOL; i++) {
      float dx = (Q.x - uBea[i].x) / (blur * 0.7);
      tBea += exp(-dx * dx) * step(qy, uBea[i].y) * uBea[i].z * 0.22;
      vec2 dq = (Q.xy - vec2(uBea[i].x, uBea[i].w)) / (blur * 3.0 + 0.15);
      tBea += exp(-dot(dq, dq)) * uBea[i].z * 0.35;
    }
    lit += tBea;
#ifdef DBGREFL
    gl_FragColor = vec4(vec3(tLine, tCurt * 10.0, tBea) * exp(-qy * 1.1), 1.0); return;
#endif
    float refl = mix(0.55, 0.14, pow(cosT, 0.6)) * (0.5 + 0.7 * smudge);
    c += vec3(0.94, 0.62, 0.25) * lit * exp(-qy * 1.1) * refl * calm;
  }
  float fog = 1.0 - exp(-uFog * d);
  c = mix(c, uFogCol, fog);
  gl_FragColor = vec4(c, 1.0);
}`;

// sky dome centred on the camera: direction maths per vertex, one texture fetch per pixel
const SKY_VERT = /* glsl */`
uniform vec3 uWarmDir;
varying vec2 vQ; varying float vH; varying float vWarm;
void main(){
  vec3 d = normalize(position);
  vH = d.y;
  vQ = vec2((atan(d.z, d.x) * 0.15915494 + 0.5) * 6.0, d.y * 2.4);
  vWarm = pow(max(dot(d, normalize(uWarmDir)), 0.0), 5.0);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uHaze; uniform vec3 uWarm;
uniform sampler2D uNoise; uniform vec2 uOff;
varying vec2 vQ; varying float vH; varying float vWarm;
void main(){
  float h = vH;
  vec3 c = mix(uHor, uTop, smoothstep(-0.02, 0.6, h));
  float n = texture2D(uNoise, vQ + uOff).r;
  float bank = smoothstep(0.3, 0.9, n) * (exp(-max(h, 0.0) * 2.5) * 0.8 + 0.2) * smoothstep(0.0, 0.14, h);
  c += uHaze * bank;
  c += uWarm * vWarm * (0.4 + 0.6 * n) * smoothstep(-0.05, 0.1, h);
  gl_FragColor = vec4(c, 1.0);
}`;

const DUST_VERT = /* glsl */`
uniform float uTime; uniform vec3 uHeadPos; uniform float uSize;
attribute vec4 aSeed;
varying float vA; varying vec3 vC;
void main(){
  vec3 p = position;
  float t = uTime * (0.08 + 0.06 * aSeed.x);
  p += vec3(sin(t * 2.1 + aSeed.y * 6.28) * 0.35, sin(t * 1.3 + aSeed.z * 6.28) * 0.25 + t * 0.15, cos(t * 1.7 + aSeed.w * 6.28) * 0.35);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  gl_Position = projectionMatrix * mv;
  float hd = length(p - uHeadPos);
  float warm = exp(-hd * 0.35);
  vC = mix(vec3(0.55, 0.65, 0.78), vec3(1.0, 0.72, 0.38), warm);
  float tw = 0.6 + 0.4 * sin(uTime * (0.7 + aSeed.x) + aSeed.y * 40.0);
  vA = (0.12 + 1.2 * warm) * tw * smoothstep(0.4, 1.6, dist) * exp(-dist * 0.06);
  gl_PointSize = uSize * (0.6 + aSeed.z) / dist;
}`;
const DUST_FRAG = /* glsl */`
${CALM}
varying float vA; varying vec3 vC;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = dot(q, q) * 4.0;
  float a = exp(-r * 3.0) * vA * calmMask();
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC * a, 1.0);
}`;

const RING_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */`
${CALM}
uniform sampler2D map; uniform vec3 color; uniform float opacity; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb * color * opacity * calmMask(), 1.0); }`;

// ---------------------------------------------------------------- the shot
register('rising_chart', (opts) => {
  const dur = Math.max(0.5, (opts.t1 ?? 10) - (opts.t0 ?? 0));
  const XW = 22, HM = 8.6;                                   // chart width (fx = 1) and height of 100%
  const raw = (opts.points && opts.points.length ? opts.points : DEFAULT_POINTS).slice().sort((a, b) => a.fx - b.fx);
  const P = raw.map((p, i) => ({ ...p, x: p.fx * XW, y: Math.max(0.12, (p.v / 100) * HM), i }));
  const X0 = P[0].x, XN = P[P.length - 1].x, YN = P[P.length - 1].y;
  const curveY = monotone(P.map((p) => p.x), P.map((p) => p.y));

  const drawFrom = opts.drawFrom ?? P[0].t ?? Math.min(0.8, 0.1 * dur);
  const drawTo = Math.max(drawFrom + 0.4, opts.drawTo ?? P[P.length - 1].t ?? dur - Math.min(2.5, 0.25 * dur));
  // head timing: through each point's t when given, else spaced by x
  const hk = P.map((p) => [p.t ?? drawFrom + (drawTo - drawFrom) * (p.x - X0) / Math.max(1e-3, XN - X0), p.x]);
  hk[0][0] = drawFrom; hk[hk.length - 1][0] = drawTo;
  for (let i = 1; i < hk.length; i++) hk[i][0] = Math.max(hk[i][0], hk[i - 1][0] + 0.05);
  const headEase = (x) => lerp(x, smooth(x), 0.55);
  const headX = (lt) => keys(lt, hk, headEase);
  const hitT = hk.map((k) => k[0]);

  const OFF = new Set(opts._off || []);   // profiling switch: parts to leave out
  const scene = new THREE.Scene();
  const FOG_COL = new THREE.Color('#161f2b');
  const FOG = 0.034;
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 400);
  const AMBER = new THREE.Color('#f0a63a');
  const noiseTex = fbmTexture(256, 11);
  const label = makeAtlas();

  // ---- sky dome
  const skyU = {
    uTop: { value: new THREE.Color('#05070a') }, uHor: { value: FOG_COL.clone() }, uHaze: { value: new THREE.Color('#5a7698').multiplyScalar(0.36) },
    uWarm: { value: new THREE.Color('#f0a63a').multiplyScalar(0.025) }, uWarmDir: { value: new THREE.Vector3(0.55, 0.35, -1) },
    uNoise: { value: noiseTex }, uOff: { value: new THREE.Vector2() },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 72, 36), new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, uniforms: skyU,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -10; if (!OFF.has('sky')) scene.add(sky);

  // ---- line geometry (core, glow, curtain)
  class ChartCurve extends THREE.Curve {
    getPoint(t, out = new THREE.Vector3()) { const x = lerp(X0, XN, t); return out.set(x, curveY(x), 0); }
  }
  const curve = new ChartCurve();
  const SEG = 360;
  const coreGeo = new THREE.TubeGeometry(curve, SEG, 0.035, 10, false);
  const glowGeo = new THREE.TubeGeometry(curve, SEG, 0.32, 12, false);
  // curtain strip: x samples, from floor (uv.y 0) to line (uv.y 1)
  const cpos = [], cuv = [], cidx = [];
  for (let i = 0; i <= SEG; i++) {
    const x = lerp(X0, XN, i / SEG), y = curveY(x);
    cpos.push(x, 0, 0, x, y, 0); cuv.push(i / SEG, 0, i / SEG, 1);
    if (i < SEG) { const a = i * 2; cidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const curtainGeo = new THREE.BufferGeometry();
  curtainGeo.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  curtainGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
  curtainGeo.setIndex(cidx);

  const headU = { value: X0 };
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const guideReveal = { value: -10 };
  const mk = (mode, uniforms, extra = {}) => new THREE.ShaderMaterial({
    vertexShader: W_VERT, fragmentShader: OFF.has('lightsimple') ? 'uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }' : LIGHT_FRAG, side: THREE.DoubleSide,
    uniforms: { uMode: { value: mode }, uHead: headU, uFog: { value: FOG }, uColor: { value: AMBER.clone() }, uGain: { value: 1 }, uPow: { value: 2 },
      uGrow: { value: 1 }, uTop: { value: 1 }, uFall: { value: 0 }, uReveal: guideReveal, ...uniforms },
    ...extra,
  });

  const columnGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
  const sphGeo = new THREE.SphereGeometry(0.11, 20, 12);
  const beaconGlowTex = glowTexture('rgba(255,190,110,1)');
  const beacons = [], lineParts = [];
  function buildChart(mirror) {
    const g = new THREE.Group();
    const s = mirror ? 0.3 : 1;
    const core = new THREE.Mesh(coreGeo, mk(0, { uGain: { value: (mirror ? 0.12 : 3.2) } }));
    const glow = new THREE.Mesh(glowGeo, mk(1, { uGain: { value: 0.17 * s }, uPow: { value: 2.2 } }, add));
    lineParts.push([core, mirror ? 0.12 : 3.2], [glow, 0.17 * s]);
    const curtain = new THREE.Mesh(curtainGeo, mk(2, { uGain: { value: 0.22 * s } }, add));
    g.add(core);
    if (!OFF.has('glow')) g.add(glow);
    if (!OFF.has('curtain') && !mirror) g.add(curtain);
    // beacons: column to the point, faint beam above, core sphere
    P.forEach((p, i) => {
      const colU = { uColor: { value: new THREE.Color('#f5b456') }, uGain: { value: 1.3 * s }, uGrow: { value: 0 }, uTop: { value: 1 }, uPow: { value: 3.0 }, uFall: { value: 0 } };
      const col = new THREE.Mesh(columnGeo, mk(3, colU, add));
      col.scale.set(0.05, p.y, 0.05); col.position.set(p.x, 0, 0);
      const colGU = { uColor: { value: new THREE.Color('#f09a3a') }, uGain: { value: 0.22 * s }, uGrow: { value: 0 }, uTop: { value: 1 }, uPow: { value: 1.6 }, uFall: { value: 0 } };
      const colG = new THREE.Mesh(columnGeo, mk(3, colGU, add));
      colG.scale.set(0.42, p.y, 0.42); colG.position.set(p.x, 0, 0);
      const beamU = { uColor: { value: new THREE.Color('#f0a63a') }, uGain: { value: 0.28 * s }, uGrow: { value: 0 }, uTop: { value: 50 }, uPow: { value: 2.0 }, uFall: { value: 3.2 } };
      const beam = new THREE.Mesh(columnGeo, mk(3, beamU, add));
      beam.scale.set(0.05, 4.5, 0.05); beam.position.set(p.x, p.y, 0);
      const sph = new THREE.Mesh(sphGeo, mk(5, { uColor: { value: new THREE.Color('#ffd9a0').multiplyScalar(3 * s) }, uGain: { value: 0 } }, add));
      sph.position.set(p.x, p.y, 0);
      const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconGlowTex, ...add, opacity: 0 }));
      glowS.position.set(p.x, p.y, 0); glowS.scale.setScalar(1.2);
      g.add(col, beam, glowS);
      if (!mirror) g.add(sph, colG);
      if (!beacons[i]) beacons[i] = { p, parts: [] };
      beacons[i].parts.push({ colU, colGU, beamU, sph, glowS, s });
    });
    if (mirror) { g.scale.y = -1; g.traverse((o) => { o.renderOrder = -5; }); }
    return g;
  }
  // ring texture for activation shockwaves
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,200,130,0)'); gr.addColorStop(0.78, 'rgba(255,200,130,0)'); gr.addColorStop(0.9, 'rgba(255,200,130,1)'); gr.addColorStop(1, 'rgba(255,200,130,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const chart = buildChart(false);
  scene.add(chart);

  // floor shockwave rings
  const ringMat = (color, opacity) => new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, ...add,
    uniforms: { map: { value: ringTex }, color: { value: new THREE.Color(color) }, opacity: { value: opacity } } });
  const floorRings = P.map((p) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat(0xffffff, 0));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.012, 0); m.renderOrder = 2;
    if (!OFF.has('rings')) scene.add(m); return m;
  });

  // unlit target markers on the floor: where the line is going
  const markers = P.map((p) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), ringMat(0x9fb6d6, 0.35));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.011, 0); m.renderOrder = 2; scene.add(m); return m;
  });

  // ---- floor
  const poolU = { value: P.map(() => new THREE.Vector4(0, 0, 1, 0)) };
  const beaU = { value: P.map(() => new THREE.Vector4()) };
  const floorU = { uFog: { value: FOG }, uFogCol: { value: FOG_COL }, uNoise: { value: noiseTex }, uPool: poolU, uHead: headU, uX0: { value: X0 }, uLineGlow: { value: 1 },
    uPX: { value: P.map((p) => p.x) }, uPY: { value: P.map((p) => p.y) }, uPM: { value: curveY.m.slice() }, uBea: beaU };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({ vertexShader: W_VERT, fragmentShader: OFF.has('floorsimple') ? 'void main(){ gl_FragColor = vec4(0.02, 0.02, 0.03, 1.0); }' : FLOOR_FRAG, uniforms: floorU, defines: { NPOOL: P.length, ...(OFF.has('refl') ? { NOREFL: 1 } : {}), ...(OFF.has('dbgrefl') ? { DBGREFL: 1 } : {}) } }));
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = -1; if (!OFF.has('floor')) scene.add(floor);

  // ---- axis guides (behind the line) and floor year labels
  const guides = new THREE.Group(); if (!OFF.has('guides')) scene.add(guides);
  const ZG = -2.6, axisLabels = [];
  if (opts.axis !== false) {
    [25, 50, 75, 100].forEach((v) => {
      const y = (v / 100) * HM;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(XN - X0 + 4, 0.03), mk(4, { uColor: { value: new THREE.Color('#7b97bd') }, uGain: { value: v === 100 ? 0.42 : 0.28 } }, add));
      m.position.set((X0 + XN) / 2, y, ZG); guides.add(m);
      const L = label(`${v}%`, { font: '400 48px "IBM Plex Mono"', color: '#8fa6c2', spacing: 5 });
      for (const x of [X0 - 2.2, XN + 2.2]) {
        const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.62 * L.aspect, 0.62), new THREE.MeshBasicMaterial({ map: L.texture, transparent: true, depthWrite: false, opacity: 0.55, fog: false }));
        sp.position.set(x, y + 0.28, ZG); guides.add(sp);
        axisLabels.push({ m: sp, h: 0.62 * 0.36 });          // glyph height in world units (for the size gate)
      }
    });
  }
  const years = opts.years ?? (opts.points ? [] : DEFAULT_YEARS);
  const tickGeos = [], yearLabels = [];
  const flatTick = (w, l, x, z) => tickGeos.push(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2).translate(x, 0.01, z));
  years.forEach((yr) => {
    const x = yr.fx * XW;
    const L = label(yr.label, { font: '400 72px "IBM Plex Mono"', color: '#9fb3cc', spacing: 14 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62 * L.aspect, 0.62), new THREE.MeshBasicMaterial({ map: L.texture, transparent: true, depthWrite: false, opacity: 0.32 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, 2.1); m.renderOrder = 1; scene.add(m);
    yearLabels.push(m);
    flatTick(0.025, 1.0, x, 1.05);
  });
  // month ticks and the time axis along the floor (one mesh, flat colour)
  for (let i = 0; i < 34; i++) flatTick(0.012, 0.32, X0 + (i - 2) * (XN - X0) / 28, 0.95);
  flatTick(XW + 8, 0.02, XW / 2, 0.8);
  {
    const pos = [], idx = [];
    tickGeos.forEach((g) => { const o = pos.length / 3; pos.push(...g.attributes.position.array); idx.push(...Array.from(g.index.array, (v) => v + o)); });
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
    tg.setIndex(idx);
    const ticks = new THREE.Mesh(tg, mk(5, { uColor: { value: new THREE.Color('#8fa6c2') }, uGain: { value: 0.09 } }, add));
    ticks.renderOrder = 1; scene.add(ticks);
  }

  // ---- labels (sprites, always facing the lens, crisp, unfogged), stacked above each point, never under
  // the flare; scaled up with distance so the numbers and dates never fall below a legible size
  const labels = P.map((p, i) => {
    const num = label(p.label, { font: '600 150px Oswald', color: '#e8dfcd', glow: 'rgba(240,166,58,0.3)', glowBlur: 16 });
    const sub = label(p.sub || ' ', { font: '400 60px "IBM Plex Mono"', color: '#dfe5ec', spacing: 10 });
    const side = p.side || 'centre';
    const hN = 1.0 + 0.25 * (i / Math.max(1, P.length - 1)), hS = 0.4;
    const mN = new THREE.SpriteMaterial({ map: num.texture, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0 });
    const mS = new THREE.SpriteMaterial({ map: sub.texture, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0 });
    const sN = new THREE.Sprite(mN), sS = new THREE.Sprite(mS);
    // anchor: centred over the point by default (number over date), or beside it when a side is given
    const px = num.padFrac / num.aspect, sx = sub.padFrac / sub.aspect;
    if (side === 'right') { sN.center.set(px * 0.9, 0); sS.center.set(sx * 0.9, 0); }
    else if (side === 'left') { sN.center.set(1 - px * 0.9, 0); sS.center.set(1 - sx * 0.9, 0); }
    else { sN.center.set(0.6, 0); sS.center.set(0.6, 0); }
    sN.renderOrder = 20; sS.renderOrder = 20;
    const dx = side === 'right' ? 0.3 : side === 'left' ? -0.3 : 0, lift = i === 0 ? 0.95 : 0.66;
    if (!OFF.has('labels')) scene.add(sN, sS);
    return { sN, sS, p, hN, hS, nAsp: num.aspect, sAsp: sub.aspect, nPad: num.padFrac, sPad: sub.padFrac, side, dx, lift };
  });

  // ---- live readout riding the line head (redrawn only when the shown value changes; a pure function of time)
  const ro = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 200; const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0 }));
    sp.center.set(0.86, 0.12); sp.renderOrder = 21;
    let shown = null;
    const set = (v) => {
      const txt = `${v}%`;
      if (txt === shown) return; shown = txt;
      g.clearRect(0, 0, 512, 200);
      g.font = '600 120px Oswald'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.shadowColor = 'rgba(240,166,58,0.55)'; g.shadowBlur = 22; g.fillStyle = '#f6c37a'; g.fillText(txt, 440, 150);
      g.shadowBlur = 0; g.fillStyle = '#fbe3bd'; g.fillText(txt, 440, 150);
      tex.needsUpdate = true;
    };
    if (opts.readout !== false && !OFF.has('labels')) scene.add(sp);
    return { sp, set };
  })();
  // a faint cursor from the floor up to the head
  const cursorU = { uColor: { value: new THREE.Color('#f5b456') }, uGain: { value: 0 }, uGrow: { value: 1 }, uTop: { value: 1 }, uPow: { value: 1.5 }, uFall: { value: 0 } };
  const cursor = new THREE.Mesh(columnGeo, mk(3, cursorU, add));
  cursor.scale.set(0.012, 1, 0.012); if (opts.readout !== false) scene.add(cursor);

  // ---- haze layers and dust
  const ND = 1200, R = rng(23);
  const dpos = new Float32Array(ND * 3), dseed = new Float32Array(ND * 4);
  for (let i = 0; i < ND; i++) {
    dpos[i * 3] = lerp(X0 - 6, XN + 4, R()); dpos[i * 3 + 1] = Math.pow(R(), 1.6) * 9; dpos[i * 3 + 2] = lerp(-7, 9, R());
    for (let j = 0; j < 4; j++) dseed[i * 4 + j] = R();
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dg.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 4));
  const dustU = { uTime: { value: 0 }, uHeadPos: { value: new THREE.Vector3() }, uSize: { value: 50 } };
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: dustU, ...add }));
  dust.frustumCulled = false; dust.renderOrder = 6; if (!OFF.has('dust')) scene.add(dust);

  // head flare: bright point + anamorphic streak
  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconGlowTex, color: new THREE.Color(1.0, 1.1, 1.25), ...add }));
  const headHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconGlowTex, color: new THREE.Color(0.95, 0.75, 0.5), ...add, opacity: 0.35 }));
  const streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 32; const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, 'rgba(255,190,120,0)'); gr.addColorStop(0.5, 'rgba(255,215,170,1)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 32);
    const g2 = x.createLinearGradient(0, 0, 0, 32); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = g2; x.fillRect(0, 0, 512, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })(), ...add, opacity: 0.5 }));
  [headHalo, headGlow, streak].forEach((s) => { s.renderOrder = 8; if (!OFF.has('flare')) scene.add(s); });

  // ---- camera path, expressed against the chart so it adapts to the data. u: 0 -> 0.07 pre-roll at the first
  // point, 0.07 -> 0.86 rides the line (follows the head), 0.86 -> 1 pulls back to the payoff after the line lands
  const SPAN = XN - X0, Y1 = Math.max(1.2, YN);
  const KP = [
    [0.00, [X0 - 3.96, 0.9, 7.5], [X0 + 5.04, 1.0, 0], 38],
    [0.07, [X0 - 3.26, 1.05, 8.4], [X0 + 5.74, 1.2, 0], 38],
    [0.25, [X0 - 2.26, 1.9, 13.5], [X0 + 0.293 * SPAN, 1.6, 0], 37],
    [0.43, [X0 + 0.066 * SPAN, 2.4, 17.0], [X0 + 0.412 * SPAN, 0.331 * Y1, 0], 36],
    [0.65, [X0 + 0.486 * SPAN, 2.8, 17.5], [X0 + 0.684 * SPAN, 0.475 * Y1, 0], 36],
    [0.86, [X0 + 0.881 * SPAN, 1.8, 20.5], [X0 + 0.61 * SPAN, 0.54 * Y1, -1.2], 35],
    [1.00, [XN + 5.1, 0.86, 22.0], [X0 + 0.563 * SPAN, 0.604 * Y1, -1.8], 35.5],
  ];
  const camPos = new THREE.CatmullRomCurve3(KP.map((k) => new THREE.Vector3(...k[1])), false, 'centripetal');
  const camLook = new THREE.CatmullRomCurve3(KP.map((k) => new THREE.Vector3(...k[2])), false, 'centripetal');
  const KU = KP.map((k) => k[0]);
  const curveT = (u) => {
    let i = 0; while (i < KU.length - 2 && u > KU[i + 1]) i++;
    return clamp((i + clamp((u - KU[i]) / (KU[i + 1] - KU[i]), 0, 1)) / (KU.length - 1));
  };
  const fovAt = (u) => { let i = 0; while (i < KU.length - 2 && u > KU[i + 1]) i++; return lerp(KP[i][3], KP[i + 1][3], clamp((u - KU[i]) / (KU[i + 1] - KU[i]))); };
  const dF = Math.max(0.05, drawFrom), post = Math.max(1.0, dur - drawTo);
  const uRaw = (t) => {
    if (t <= dF) return 0.07 * clamp(t / dF, -0.5, 1);
    if (t <= drawTo) return 0.07 + 0.79 * (headX(t) - X0) / Math.max(1e-3, SPAN);
    const q = clamp((t - drawTo) / post); return 0.86 + 0.14 * lerp(q, ease.out(q), 0.6);   // keeps drifting to the last frame
  };
  // a short symmetric average keeps the camera's speed continuous through the beats
  const uAt = (t) => { let a = 0, w = 0; for (let j = -4; j <= 4; j++) { const ww = 5 - Math.abs(j); a += uRaw(t + j * 0.11) * ww; w += ww; } return clamp(a / w, 0, 1); };
  const tmp = new THREE.Vector3(), tl = new THREE.Vector3(), prj = new THREE.Vector3(), right = new THREE.Vector3();
  const PXF = () => 540 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));   // pixels per world unit at distance 1

  return {
    scene, camera,
    bloom: { strength: 0.7, radius: 0.5, threshold: 0.85 },
    exposure: 1.05,
    update(lt, c) {
      const hx = headX(lt);
      headU.value = hx;
      const hy = curveY(hx);
      // camera
      const u = uAt(lt), ct = curveT(u);
      camPos.getPoint(ct, tmp); camLook.getPoint(ct, tl);
      tmp.x += noise(lt * 0.35 + 3) * 0.05; tmp.y += noise(lt * 0.4 + 9) * 0.03;
      tl.x += noise(lt * 0.3 + 17) * 0.04; tl.y += noise(lt * 0.33 + 29) * 0.03;
      camera.position.copy(tmp); camera.lookAt(tl);
      camera.fov = fovAt(u); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const pxf = PXF();

      const started = smooth(prog(lt, drawFrom - 0.05, drawFrom + 0.3));
      lineParts.forEach(([m, g]) => { m.material.uniforms.uGain.value = g * started; });
      // drawing head flare (kept small: it must never swallow a label)
      const drawing = prog(lt, drawFrom - 0.3, drawFrom + 0.2) * (1 - 0.7 * prog(lt, drawTo, drawTo + 1.0));
      headGlow.position.set(hx, hy, 0.02); headHalo.position.copy(headGlow.position); streak.position.copy(headGlow.position);
      const fl = 0.9 + 0.1 * noise(lt * 7.0);
      headGlow.scale.setScalar(0.5 * fl); headGlow.material.opacity = 0.8 * drawing;
      headHalo.scale.setScalar(1.7); headHalo.material.opacity = 0.12 * drawing;
      streak.scale.set(2.4 * fl, 0.07, 1); streak.material.opacity = 0.3 * drawing;
      dustU.uTime.value = lt; dustU.uHeadPos.value.set(hx, hy, 0);
      guideReveal.value = lerp(X0 - 3, XN + 8, smooth(prog(lt, 0, Math.max(1.0, Math.min(2.5, drawFrom + 0.6)))));
      skyU.uOff.value.set(lt * 0.004, 0); sky.position.copy(camera.position);

      // beacons: fire when the head reaches them (a soft pulse, no blown disc)
      const rects = [];
      beacons.forEach((b, i) => {
        const a = lt - hitT[i];
        const on = smooth(prog(a, -0.05, 0.35));
        const grow = ease.out(prog(a, -0.1, 0.55));
        const pulse = Math.exp(-Math.max(a, 0) * 2.6) * (a > -0.05 ? 1 : 0);
        const breathe = 0.9 + 0.1 * Math.sin(lt * 2.2 + i * 1.7);
        b.parts.forEach((q) => {
          q.colU.uGrow.value = grow; q.colGU.uGrow.value = grow;
          q.colU.uGain.value = 0.7 * q.s * on * (1 + 0.8 * pulse) * breathe;
          q.colGU.uGain.value = 0.12 * q.s * on * (1 + 0.6 * pulse);
          q.beamU.uGrow.value = ease.out(prog(a, 0.15, 1.6)); q.beamU.uGain.value = 0.12 * q.s * on;
          const pilot = i === 0 ? 0.3 * (1 - on) * smooth(prog(lt, 0.1, 0.8)) : 0;
          q.sph.material.uniforms.uGain.value = on + pilot;
          q.glowS.material.opacity = (on * (0.34 + 0.22 * pulse) + pilot * 0.5) * q.s; q.glowS.scale.setScalar(0.75 + 0.4 * pulse);
        });
        const fr = prog(a, 0, 1.3);
        markers[i].material.uniforms.opacity.value = 0.5 * (1 - on);
        floorRings[i].material.uniforms.opacity.value = (a > 0 ? 1 : 0) * (1 - fr) * 0.42; floorRings[i].scale.setScalar(0.5 + 4.2 * ease.out(fr));
        poolU.value[i].set(b.p.x, 0, 1.6 + 0.4 * pulse, on * (0.55 + 0.6 * pulse) * breathe);
        beaU.value[i].set(b.p.x, b.p.y * grow, on * (1 + 0.8 * pulse) * breathe, b.p.y);
        // labels rise in after the beacon fires; scaled so they stay legible from far away
        const L = labels[i], lk = smooth(prog(a, 0.1, 0.75));
        const dist = Math.max(0.5, prj.set(b.p.x, b.p.y, 0).distanceTo(camera.position)), ppu = pxf / dist;
        const sc = Math.max(1, 40 / (0.36 * L.hN * ppu), 15 / (0.36 * L.hS * ppu));
        const rise = (1 - lk) * -0.25 * sc;
        // stack from the bottom: the date's glyphs start ~lift above the point, the number sits on top of it
        const sy = b.p.y + (L.lift - L.sPad * L.hS) * sc + rise;
        const ny = sy + (L.hS * (1 - L.sPad) - L.nPad * L.hN + 0.06) * sc;
        L.sN.scale.set(L.hN * L.nAsp * sc, L.hN * sc, 1); L.sS.scale.set(L.hS * L.sAsp * sc, L.hS * sc, 1);
        L.sN.position.set(b.p.x + L.dx * sc, ny, 0.15);
        L.sS.position.set(b.p.x + L.dx * sc, sy, 0.15);
        prj.set(b.p.x, b.p.y, 0).project(camera);
        const bx = (prj.x + 1) * 960, cx = L.sN.center.x;
        let lo = 0, hi = 0;
        for (const [h, asp, pad] of [[L.hN, L.nAsp, L.nPad], [L.hS, L.sAsp, L.sPad]]) {
          const w = h * asp * sc * ppu, pw = pad * h * sc * ppu;
          lo = Math.min(lo, -cx * w + pw + L.dx * sc * ppu); hi = Math.max(hi, (1 - cx) * w - pw + L.dx * sc * ppu);
        }
        const shift = Math.max(0, 60 - (bx + lo)) - Math.max(0, bx + hi - 1860);
        if (shift !== 0) { right.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(shift / ppu); L.sN.position.add(right); L.sS.position.add(right); }
        const onScreen = smooth(prog(bx, -40, 90)) * smooth(prog(1960 - bx, -40, 90)) * (prj.z < 1 ? 1 : 0);
        L.sN.material.opacity = lk * onScreen; L.sS.material.opacity = lk * 0.92 * onScreen;
        // the label block's screen rectangle (the readout keeps clear of it)
        const by = (1 - prj.y) * 540, stack = (L.lift + L.hS + L.hN * (1 - L.nPad)) * sc * ppu;
        rects[i] = lk * onScreen > 0.05 ? [bx + lo + shift, by - stack, bx + hi + shift, by] : null;
      });

      // live readout and cursor: visible while the head travels between beacons, never over a label
      {
        let near = 1e9; P.forEach((p) => { near = Math.min(near, Math.abs(hx - p.x)); });
        const dist = Math.max(0.5, prj.set(hx, hy, 0).distanceTo(camera.position)), ppu = pxf / dist;
        const hR = Math.max(0.62, 36 / (0.42 * ppu));
        prj.set(hx, hy, 0).project(camera);
        const hxs = (prj.x + 1) * 960, hys = (1 - prj.y) * 540, wR = hR * 2.56 * ppu, hRp = hR * ppu;
        const rr = [hxs - 0.8 * wR, hys - 0.75 * hRp, hxs + 0.05 * wR, hys];
        let clear = 1;
        rects.forEach((q) => {
          if (!q) return;
          const gap = Math.max(q[0] - rr[2], rr[0] - q[2], q[1] - rr[3], rr[1] - q[3]);
          clear = Math.min(clear, smooth(prog(gap, -10, 50)));
        });
        const roK = (lt > drawFrom && lt < drawTo + 0.2 ? 1 : 0) * smooth(prog(near, 0.35, 1.2)) * clear;
        if (roK > 0.001) ro.set(Math.round((hy / HM) * 100));
        ro.sp.scale.set(hR * 2.56, hR, 1); ro.sp.position.set(hx - 0.08 * hR, hy + 0.3 * hR, 0.1);
        ro.sp.material.opacity = roK * 0.95;
        cursor.position.set(hx, 0, 0.01); cursor.scale.y = Math.max(0.01, hy - 0.08); cursorU.uGain.value = 0.32 * roK;
      }

      // axis labels: hidden below a legible size; floor year labels: hidden near the lens
      axisLabels.forEach((A) => {
        const dist = Math.max(0.5, A.m.position.distanceTo(camera.position)), px = A.h * pxf / dist;
        prj.copy(A.m.position).project(camera);
        const sx = (prj.x + 1) * 960;                         // never half-cut at a frame edge
        A.m.material.opacity = 0.55 * smooth(prog(px, 14, 22)) * smooth(prog(sx, 70, 150)) * smooth(prog(1850 - sx, 0, 80)) * (prj.z < 1 ? 1 : 0);
      });
      yearLabels.forEach((m) => {
        prj.copy(m.position).project(camera);
        const y = (1 - prj.y) * 540, dist = m.position.distanceTo(camera.position), px = 0.62 * 0.36 * pxf / dist;
        m.material.opacity = 0.32 * (1 - smooth(prog(y, 760, 860))) * smooth(prog(px, 12, 20)) * (prj.z < 1 ? 1 : 0);
      });
    },
  };
});
