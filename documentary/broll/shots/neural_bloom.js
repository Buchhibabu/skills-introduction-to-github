// neural_bloom: a luminous neural network in the shape of a mind, suspended in warm dawn haze. The two
// hemispheres are drawn by glowing filaments that trace their winding folds (contour lines of a noise
// field traced over a sculpted brain surface), studded with synapse nodes, split by a midline fissure and
// joined by a bright commissure bundle; ganglia and long fibres glow inside, a finely folded cerebellum
// and a brainstem fade below. Signals race along the folds and fibres from the first frame. At lightAt a
// wave of light sweeps through it from the front: filaments strengthen, signals multiply and quicken, and
// new folds and connections draw themselves outward.
//
// opts:
//   lightAt   local s when the network lights up and new connections start growing (default 40% of the shot)
//   wave      s the growth wave takes to cross the network (default: fits what is left of the shot, 0.9..2.2)
//   density   0.5..1.5 scales the number of folds/fibres (default 1)
//   orbit     0..2 scales the camera orbit and dolly (default 1)
//   vignetteComp 0..1 how much the sky pre-compensates the film's CSS vignette ramp, whose 45% start shows
//             as an oval edge on a bright smooth sky (default 1; 0 if the vignette is removed or changed)
//
// Overlays: a text card sits in the left third (x 110-730, y 200-620) with a big line under it (y 800-900):
// that third is soft cream sunlight with only a few far out-of-focus motes. The network lives in the
// centre-right (x ~820-1800).
import { THREE, register, rng, noise, smooth, prog, clamp, lerp } from '../kit.js';

// colours are linear working-space values, pre-ACES: chosen so the tone-mapped result lands on the dawn
// palette (#dc9466..#e9a675 apricot, #f7dcae cream, #fbe8c8 warm white)
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// display-space sRGB colour as a plain vector (no colour management): the sky shader inverts the tone curve
const disp = (hex) => { const n = parseInt(hex.slice(1), 16); return V((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
// three.js ACESFilmicToneMapping matrices (row-major here) and the shot's exposure
const ACES_IN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
const ACES_OUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
const EXPOSURE = 1.0;

// ---------------------------------------------------------------- brain volume (signed distance, approx)
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const k1 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2) || 1e-6;
  return k0 * (k0 - 1) / k1;
}
// x lateral (hemispheres at +-), y up, z toward the face
function cerebrum(x, y, z) {
  const ax = Math.abs(x);
  let d = ell(ax, y, z, 0.8, 0.2, -0.05, 0.86, 1.1, 1.92);
  d = smin(d, ell(ax, y, z, 0.66, 0.05, 1.05, 0.7, 0.88, 0.9), 0.3);      // frontal lobe
  d = smin(d, ell(ax, y, z, 0.98, -0.48, 0.28, 0.56, 0.52, 1.12), 0.32);   // temporal lobe
  d = Math.max(d, -(y + 1.0));                                            // flat underside
  const fissure = Math.max(ax - 0.1, -(y + 0.2));                         // midline gap above the commissure
  return Math.max(d, -fissure);
}
const cerebellum = (x, y, z) => ell(x, y, z, 0, -0.92, -1.3, 1.1, 0.48, 0.68);
function grad(f, p, out, e = 0.004) {
  out.set(f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z), f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z), f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e)).divideScalar(2 * e);
  return out;
}
// 3D value noise (init only): its level sets trace winding bands over the surface = sulci and gyri
function vnoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const h = (i, j, k) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), sx), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), sx), sy),
    l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), sx), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), sx), sy), sz);
}
const gyri = (x, y, z) => {
  const ax = Math.abs(x) + 0.37 * Math.sign(x);                          // not mirror-identical
  const wx = vnoise3(ax * 1.3 + 3.1, y * 1.3, z * 1.3) * 0.6, wy = vnoise3(ax * 1.3, y * 1.3 + 7.3, z * 1.3) * 0.6;
  return vnoise3(ax * 2.9 + wx, y * 2.9 + wy, z * 2.5) + 0.3 * vnoise3(ax * 5.5, y * 5.5 + 5.0, z * 5.0);
};
const folia = (x, y, z) => Math.sin((y + 0.28 * z) * 26 + 1.2 * vnoise3(x * 1.5, y * 1.5, z * 1.5));
const gauss = (R) => { let u = 0; for (let i = 0; i < 4; i++) u += R(); return (u - 2) * 1.2; };

/** Trace contour lines of g = level over the surface f = 0. Returns polylines [{ pts: [Vector3], nrm: [Vector3] }]. */
function traceContours(f, g, level, seeds, { step = 0.075, maxSteps = 70, minLen = 6, gap = 0.06 } = {}) {
  const cell = 0.1, grid = new Map(), gk = (p) => `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
  const near = (p, r, own) => {
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const q of grid.get(`${cx + a},${cy + b},${cz + c}`) || []) if (q.own !== own && q.p.distanceToSquared(p) < r * r) return true;
    }
    return false;
  };
  const nf = V(), ng = V(), t = V();
  const settle = (p) => {
    for (let it = 0; it < 4; it++) {
      const d = f(p.x, p.y, p.z); grad(f, p, nf); const l2 = nf.lengthSq() || 1; p.addScaledVector(nf, -d / l2);
      nf.normalize();
      const gv = g(p.x, p.y, p.z) - level; grad(g, p, ng); ng.addScaledVector(nf, -ng.dot(nf));
      const m2 = ng.lengthSq(); if (m2 < 1e-6) return false;
      p.addScaledVector(ng, -gv / m2);
    }
    return Math.abs(f(p.x, p.y, p.z)) < 0.01 && Math.abs(g(p.x, p.y, p.z) - level) < 0.02;
  };
  const lines = [];
  seeds.forEach((s0, si) => {
    const p0 = s0.clone();
    if (!settle(p0) || near(p0, 0.06, -1)) return;
    const own = si, halves = [];
    let closed = false;
    for (const dirSign of [1, -1]) {
      if (closed) { halves.push([]); continue; }
      const pts = [], p = p0.clone(); let prev = null;
      for (let k = 0; k < maxSteps; k++) {
        grad(f, p, nf).normalize(); grad(g, p, ng);
        t.crossVectors(nf, ng); if (t.lengthSq() < 1e-8) break; t.normalize().multiplyScalar(dirSign);
        if (prev && t.dot(prev) < 0) t.negate();
        prev = t.clone();
        p.addScaledVector(t, step);
        if (!settle(p)) break;
        if (near(p, gap, own)) break;
        if (pts.length > 4 && pts[pts.length - 5].distanceTo(p) < step * 1.5) break;    // stalled
        if (pts.length > 5 && p.distanceTo(p0) < step * 1.2) { pts.push(p0.clone()); closed = true; break; }   // loop closed
        pts.push(p.clone());
      }
      halves.push(pts);
    }
    const pts = [...halves[1].reverse(), p0.clone(), ...halves[0]];
    if (pts.length < minLen) return;
    pts.forEach((p) => { const k = gk(p); if (!grid.has(k)) grid.set(k, []); grid.get(k).push({ p, own }); });
    lines.push({ pts, nrm: pts.map((p) => grad(f, p, V()).normalize()) });
  });
  return lines;
}

// ---------------------------------------------------------------- shaders
const FIL_VERT = /* glsl */`
attribute vec3 aA; attribute vec3 aB; attribute vec3 aC; attribute vec2 aTS; attribute vec4 aE; attribute vec4 aF; attribute vec2 aG; attribute vec3 aN; attribute vec3 aH;
uniform float uTime; uniform float uLight; uniform float uPx; uniform float uFog; uniform float uFocus; uniform float uAper;
uniform vec3 uOrigin; uniform float uWaveR;
varying float vS; varying float vSide; varying float vI; varying float vPh; varying float vSpd; varying float vOn; varying float vTip;
varying float vTail; varying float vPG; varying float vWave; varying float vBase; varying float vCL;
vec3 bez(float t){ float u = 1.0 - t; return u * u * aA + 2.0 * u * t * aC + t * t * aB; }
vec3 dbez(float t){ return 2.0 * (1.0 - t) * (aC - aA) + 2.0 * t * (aB - aC); }
void main(){
  float t = aTS.x, side = aTS.y;
  // aE: width, birth (-1 = always there), grow duration, brightness ; aF: phase, speed (units/s), pulse gate, tail (units)
  // aG: pulse gain, base glow ; aN: surface normal (0 inside) ; aH: arc length at segment start, segment length, curve length
  float grow = aE.y < 0.0 ? 1.0 : clamp((uTime - aE.y) / aE.z, 0.0, 1.0);
  float tt = t * grow;
  vec3 p = bez(tt);
  vec3 pw = (modelMatrix * vec4(p, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 tv = normalize(mat3(modelViewMatrix) * dbez(clamp(tt, 0.001, 0.999)));
  vec3 sd = normalize(cross(tv, normalize(mv.xyz)));
  float d = -mv.z;
  float pxu = uPx / d;                                   // pixels per world unit here
  float w = aE.x;
  float wMin = 0.7 / pxu;                                // keep at least ~1.4 px wide; dim instead of shimmer
  float coc = abs(d - uFocus) * uAper;                   // depth of field: out-of-focus strands widen and dim
  float wr = max(max(w, wMin), coc);
  mv.xyz += sd * wr * side;
  gl_Position = projectionMatrix * mv;
  vS = aH.x + tt * aH.y; vCL = aH.z; vSide = side;
  float fade = smoothstep(-2.05, -1.3, pw.y);            // the brainstem dissolves into the haze
  // the far side of the cortex is dimmer, so the mind reads as a volume and not a tangle
  float fv = dot(normalize(aN), normalize(cameraPosition - pw));
  float facing = length(aN) > 0.5 ? mix(0.16, 0.8, smoothstep(-0.35, 0.4, fv)) + 0.75 * exp(-fv * fv * 12.0) : 1.0;   // rim-lit silhouette
  vI = aE.w * (w / wr) * exp(-uFog * max(d - 6.0, 0.0)) * step(0.0005, grow) * fade * facing;
  vPh = aF.x; vSpd = aF.y; vOn = step(aF.z, 0.42 + 0.52 * uLight); vTail = aF.w; vPG = aG.x;
  vTip = (grow > 0.0 && grow < 0.999) ? smoothstep(0.5, 1.0, t) : 0.0;   // bright growing tip
  float r = length(pw - uOrigin);
  vWave = uWaveR > 0.0 ? exp(-pow((r - uWaveR) / 0.45, 2.0)) * (1.0 - smoothstep(4.0, 6.0, uWaveR)) : 0.0;
  vBase = aG.y * (1.0 + 0.5 * uLight);
}`;
const FIL_FRAG = /* glsl */`
uniform float uClock; uniform vec3 uCol; uniform vec3 uHot;
varying float vS; varying float vSide; varying float vI; varying float vPh; varying float vSpd; varying float vOn; varying float vTip;
varying float vTail; varying float vPG; varying float vWave; varying float vBase; varying float vCL;
void main(){
  float e = 1.0 - abs(vSide);
  float prof = e * e * (3.0 - 2.0 * e);
  // a comet racing along the whole fibre/fold: sharp head, long fading tail, then a pause before the next
  float P = vCL * 1.35 + 1.2;
  float head = fract(vPh + uClock * vSpd / P) * P - 0.3;
  float dx = head - vS;
  float pulse = (dx >= 0.0 ? exp(-dx / vTail) : exp(dx * 26.0)) * vOn;
  vec3 c = uCol * vBase + uHot * (pulse * vPG + vTip * 1.2 + vWave * 0.5);
  gl_FragColor = vec4(c * prof * vI, 1.0);
}`;

const NODE_VERT = /* glsl */`
attribute vec4 aR;  // size, phase, birth (-1 = always), brightness
attribute vec3 aN;
uniform float uTime; uniform float uLight; uniform float uPx; uniform float uFog; uniform float uFocus; uniform float uAper;
uniform vec3 uOrigin; uniform float uWaveR;
varying float vA;
void main(){
  float born = aR.z < 0.0 ? 1.0 : smoothstep(aR.z, aR.z + 0.3, uTime);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 pw = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  float flash = aR.z < 0.0 ? 0.0 : exp(-max(uTime - aR.z, 0.0) * 2.5) * step(aR.z, uTime);
  float wave = uWaveR > 0.0 ? exp(-pow((length(pw - uOrigin) - uWaveR) / 0.45, 2.0)) * (1.0 - smoothstep(4.0, 6.0, uWaveR)) : 0.0;
  float tw = 0.65 + 0.35 * sin(uTime * (1.6 + aR.y * 2.5) + aR.y * 40.0);
  float sz = aR.x * (1.0 + 0.2 * uLight + 0.5 * flash + 0.3 * wave);
  float coc = abs(d - uFocus) * uAper * 3.0;
  float szr = max(sz, coc);
  gl_PointSize = max(2.0, uPx * szr / d);
  float facing = length(aN) > 0.5 ? mix(0.2, 1.0, smoothstep(-0.35, 0.5, dot(aN, normalize(cameraPosition - pw)))) : 0.8;
  vA = aR.w * born * tw * (0.6 + 0.35 * uLight + 0.9 * flash + 0.6 * wave) * exp(-uFog * max(d - 6.0, 0.0)) * pow(sz / szr, 1.5)
     * smoothstep(-2.05, -1.3, pw.y) * facing;
}`;
const NODE_FRAG = /* glsl */`
uniform vec3 uCol; uniform vec3 uHot;
varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;
  float core = exp(-r * r * 22.0);
  float halo = exp(-r * 4.5) * (1.0 - r);
  gl_FragColor = vec4((uHot * core * 0.8 + uCol * halo * 0.35) * vA, 1.0);
}`;

// sky dome centred on the camera, designed in display space: the gradient is written as the final sRGB
// colour and pushed back through an inverse of the renderer's ACES curve, so the palette lands exactly and
// the haze never sits in the flat shoulder of the curve. It also pre-compensates the film's CSS vignette
// (a linear ramp that starts at 45% of the frame ellipse and shows as an oval edge on a bright, smooth sky)
// so the two together give one smooth falloff. Its luminance stays under the bloom threshold.
const SKY_VERT = /* glsl */`
varying vec3 vD;
void main(){ vD = normalize(position); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */`
uniform vec3 uSun; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uCream; uniform vec3 uWhite; uniform float uSunK; uniform float uTime;
uniform sampler2D uNoise; uniform mat3 uOutInv; uniform mat3 uInInv; uniform float uExpInv; uniform float uVig;
varying vec3 vD;
vec3 srgb2lin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 invFit(vec3 y){ vec3 A = 1.0 - 0.983729 * y, B = 0.0245786 - 0.432951 * y, C = -(0.000090537 + 0.238081 * y); return (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A); }
void main(){
  vec3 d = normalize(vD);
  vec3 s = normalize(uSun);
  float x = 1.0 - dot(d, s);                         // 0 at the sun, 2 opposite
  vec3 c = mix(uDeep, uMid, exp(-x * 3.2));
  c = mix(c, uCream, exp(-x * 9.0));
  c = mix(c, uWhite, exp(-x * 40.0) * 0.8 * uSunK);
  // slow haze banks and faint crepuscular rays (texture, so the field is never a flat plate)
  vec2 q = vec2(atan(d.z, d.x) * 0.9549 + uTime * 0.004, d.y * 1.6);
  float n = texture2D(uNoise, q).r;
  c *= 0.965 + 0.07 * n;
  vec3 ax = normalize(cross(s, vec3(0.0, 1.0, 0.0))); vec3 ay = cross(ax, s);
  float ang = atan(dot(d, ay), dot(d, ax));
  float rays = texture2D(uNoise, vec2(ang * 0.6366 + uTime * 0.003, 0.37)).r;
  c *= 1.0 + (smoothstep(0.4, 0.8, rays) - 0.3) * 0.045 * exp(-x * 3.0) * (1.0 - exp(-x * 60.0));
  // one smooth vignette: divide out the CSS ramp, apply a smooth one of the same depth
  vec2 f = gl_FragCoord.xy;
  vec2 e = vec2((f.x - 960.0) / 1357.6, ((1080.0 - f.y) - 518.4) / 794.2);
  float r = length(e);
  float a = 0.62 * clamp((r - 0.45) / 0.55, 0.0, 1.0);
  float S = min(0.07 * log(1.0 + exp((r - 0.45) / 0.07)) / 0.55, 1.0);   // a softened copy of the ramp
  float T = 1.0 - 0.5 * S;                                              // and a little lighter at the corners
  float k = mix(1.0, min(T / (1.0 - a), 1.3), uVig);
  c *= min(k, 0.975 / max(max(c.r, c.g), max(c.b, 1e-3)));            // never push a channel into the clip (keeps the hue)
  vec3 lin = srgb2lin(clamp(c, 0.0, 0.975));
  vec3 u = clamp(uOutInv * lin, 0.0, 1.0);
  gl_FragColor = vec4(max(uInInv * invFit(u), 0.0) * uExpInv, 1.0);
}`;

const MOTE_VERT = /* glsl */`
attribute vec4 aR;
uniform float uTime; uniform float uPx; uniform float uFocus;
varying float vA; varying float vSoft;
void main(){
  vec3 p = position + vec3(sin(uTime * 0.13 + aR.x * 6.28) * 0.25, uTime * (0.04 + 0.05 * aR.y), cos(uTime * 0.11 + aR.z * 6.28) * 0.2);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  float coc = abs(d - uFocus) * 0.02;
  vSoft = clamp(coc / 0.06, 0.0, 1.0);
  gl_PointSize = clamp(uPx * (0.014 + coc) / d, 1.5, 160.0);
  vA = (0.4 + 0.6 * aR.w) * mix(1.0, 0.12, vSoft) * smoothstep(0.6, 2.0, d);
}`;
const MOTE_FRAG = /* glsl */`
uniform vec3 uCol;
varying float vA; varying float vSoft;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;
  float disc = mix(exp(-r * r * 6.0), smoothstep(1.0, 0.7, r) * (0.8 + 0.2 * r), vSoft);
  gl_FragColor = vec4(uCol * disc * vA, 1.0);
}`;

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
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;           // no mip jump at the dome's angular seam
  return t;
}

// ---------------------------------------------------------------- the shot
register('neural_bloom', (opts) => {
  const dur = Math.max(0.5, (opts.t1 ?? 8) - (opts.t0 ?? 0));
  const lightAt = opts.lightAt ?? dur * 0.4;
  const wave = opts.wave ?? clamp((dur - lightAt) * 0.8, 0.9, 2.2);
  const dens = clamp(opts.density ?? 1, 0.5, 1.5);
  const orbit = clamp(opts.orbit ?? 1, 0, 2);
  const R = rng(2026);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 300);
  const noiseTex = fbmTexture(256, 5);
  const UP = V(0, 1, 0);

  // ---- camera path: a steady three-quarter orbit over the front-right of the brain with a slow push in
  const BRAIN = V(0, -0.15, 0);
  const camAt = (k, out, look) => {
    const kk = lerp(k, smooth(k), 0.25);                         // nearly linear: always moving, soft ends
    const az = THREE.MathUtils.degToRad(lerp(6, 6 + 30 * orbit, kk));
    const el = THREE.MathUtils.degToRad(lerp(25, 14, kk));
    const D = lerp(9.6, 9.6 - 1.8 * orbit, kk);
    out.set(Math.cos(az) * Math.cos(el) * D, Math.sin(el) * D, Math.sin(az) * Math.cos(el) * D).add(BRAIN);
    // aim left of the brain so it sits centre-right, leaving the left third for the card
    const fwd = BRAIN.clone().sub(out).normalize();
    const right = V().crossVectors(fwd, UP).normalize();
    look.copy(BRAIN).addScaledVector(right, -0.175 * D).add(V(0, 0.01 * D, 0));
  };
  // the light wave starts at the prefrontal cortex
  const ORIGIN = V(0.45, 0.35, 1.75);
  const waveT = (p) => lightAt + 0.05 + (p.distanceTo(ORIGIN) / 4.2) * wave;

  // ---- geometry records: every filament is a quadratic bezier segment (A, C, B)
  const edges = [], nodes = [];
  const ZERO = V();
  const addEdge = (A, B, C, o) => {
    const len = o.len ?? A.distanceTo(B);
    edges.push({ A, B, C, len, N: o.N || ZERO, w: o.w, birth: o.birth ?? -1, gd: o.gd ?? 0.3 + 0.3 * R() + len * 0.12, br: o.br ?? 1,
      ph: o.ph ?? R(), spd: o.v ?? 1.8, gate: o.gate ?? R(), tail: o.tail ?? 0.3, pg: o.pg ?? 1, base: o.base ?? 0.4,
      s0: o.s0 ?? 0, cl: o.cl ?? len });
  };
  const bend = (A, B, amt, pull = null, pullK = 0) => {
    const len = A.distanceTo(B), m = A.clone().add(B).multiplyScalar(0.5);
    if (pull) m.lerp(pull, pullK);
    return m.add(V(gauss(R), gauss(R), gauss(R)).multiplyScalar(len * amt));
  };
  /** A traced polyline becomes a chain of smooth segments sharing one pulse (phase/speed along its arc length). */
  const addCurve = (line, o) => {
    const P = line.pts, n = P.length;
    const mids = []; for (let k = 0; k < n - 1; k++) mids.push(P[k].clone().add(P[k + 1]).multiplyScalar(0.5));
    const seg = [];                                                 // [A, C, B, normal]
    seg.push([P[0], P[0].clone().lerp(mids[0], 0.5), mids[0], line.nrm[0]]);
    for (let k = 1; k < n - 1; k++) seg.push([mids[k - 1], P[k], mids[k], line.nrm[k]]);
    seg.push([mids[n - 2], mids[n - 2].clone().lerp(P[n - 1], 0.5), P[n - 1], line.nrm[n - 1]]);
    const lens = seg.map(([A, C, B]) => A.distanceTo(C) + C.distanceTo(B));
    const cl = lens.reduce((a, b) => a + b, 0);
    const ph = R(), v = (o.v ?? 1.6) * (0.8 + 0.4 * R()), gate = o.gate ?? R();
    const startB = o.birth ?? -1, gs = o.growSpeed ?? 3.0;
    // a grown curve draws itself from its point nearest the wave origin outward in both directions
    let s = 0;
    const s0s = lens.map((l) => { const a = s; s += l; return a; });
    let originS = 0;
    if (startB >= 0) { let best = 1e9; seg.forEach(([, C], k) => { const d = C.distanceTo(ORIGIN); if (d < best) { best = d; originS = s0s[k]; } }); }
    seg.forEach(([A, C, B, N], k) => {
      let birth = -1, gd = 1, rev = false;
      if (startB >= 0) {
        rev = s0s[k] + lens[k] / 2 < originS;                       // this side grows toward the curve's start
        birth = startB + Math.abs((rev ? s0s[k] + lens[k] : s0s[k]) - originS) / gs; gd = lens[k] / gs;
      }
      addEdge(rev ? B : A, rev ? A : B, C, { N, w: o.w, birth, gd, br: o.br, ph, v, gate, tail: o.tail ?? 0.45, pg: o.pg ?? 1, base: o.base, s0: s0s[k], len: lens[k], cl });
      edges[edges.length - 1].rev = rev;                            // its arc length then runs from the far end
    });
  };

  // ---- the cortex: contour lines of the fold field over each hemisphere
  const seedsOn = (f, n, box) => {
    const out = [], nrm = V();
    let guard = 0;
    while (out.length < n && guard++ < n * 400) {
      const p = V(lerp(box[0], box[1], R()), lerp(box[2], box[3], R()), lerp(box[4], box[5], R()));
      let d = f(p.x, p.y, p.z);
      if (Math.abs(d) > 0.12) continue;
      for (let it = 0; it < 3; it++) { grad(f, p, nrm); p.addScaledVector(nrm, -d / (nrm.lengthSq() || 1)); d = f(p.x, p.y, p.z); }
      if (Math.abs(d) < 0.01) out.push(p);
    }
    return out;
  };
  const cortexSeeds = seedsOn(cerebrum, Math.round(1400 * dens), [-1.8, 1.8, -1.05, 1.35, -2.05, 2.1]);
  const folds = traceContours(cerebrum, gyri, 0, cortexSeeds, { gap: 0.05, maxSteps: 90 });
  const foldsB = traceContours(cerebrum, gyri, 0.38, cortexSeeds.slice().reverse(), { gap: 0.05, maxSteps: 90 })
    .concat(traceContours(cerebrum, gyri, -0.38, cortexSeeds, { gap: 0.05, maxSteps: 90 }));
  const cbSeeds = seedsOn(cerebellum, Math.round(120 * dens), [-1.2, 1.2, -1.45, -0.4, -2.0, -0.6]).filter((p) => cerebellum(p.x, p.y, p.z) < cerebrum(p.x, p.y, p.z) - 0.02);
  const fol = traceContours(cerebellum, folia, 0, cbSeeds, { gap: 0.05, step: 0.06 }).filter((l) => l.pts.every((p) => cerebrum(p.x, p.y, p.z) > 0.0));

  folds.forEach((l) => addCurve(l, { w: 0.0125, br: 1, base: 0.55, v: 1.7, gate: R(), tail: 0.75, pg: 1.9 }));
  foldsB.forEach((l, i) => addCurve(l, i % 2 === 0
    ? { w: 0.0095, br: 0.85, base: 0.4, v: 1.5, tail: 0.6, pg: 1.6 }
    : { w: 0.0095, br: 0.85, base: 0.4, v: 1.7, tail: 0.55, pg: 1.4, birth: waveT(l.pts[Math.floor(l.pts.length / 2)]) - 0.15 }));
  fol.forEach((l) => addCurve(l, { w: 0.005, br: 0.8, base: 0.45, v: 1.2, tail: 0.35, pg: 0.7 }));

  // synapse nodes along the folds (more appear in the bloom)
  [...folds, ...foldsB, ...fol].forEach((l, li) => {
    for (let k = 1; k < l.pts.length - 1; k += 3 + Math.floor(R() * 3)) {
      const p = l.pts[k];
      nodes.push({ p, n: l.nrm[k], size: 0.03 + 0.05 * Math.pow(R(), 3), born: R() < 0.2 ? waveT(p) : -1, br: 0.8 + 0.4 * R() });
    }
  });
  // short bridges between neighbouring folds (the network's cross-links)
  {
    const cell = 0.25, grid = new Map(), gk = (x, y, z) => `${x},${y},${z}`;
    nodes.forEach((n, i) => { const k = gk(Math.floor(n.p.x / cell), Math.floor(n.p.y / cell), Math.floor(n.p.z / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    nodes.forEach((n, i) => {
      if (R() > 0.45) return;
      const cx = Math.floor(n.p.x / cell), cy = Math.floor(n.p.y / cell), cz = Math.floor(n.p.z / cell);
      let best = null, bd = 1e9;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        for (const j of grid.get(gk(cx + a, cy + b, cz + c)) || []) {
          const m = nodes[j], d = n.p.distanceTo(m.p);
          if (j === i || d < 0.1 || d > 0.32 || n.n.dot(m.n) < 0.4 || Math.sign(n.p.x) !== Math.sign(m.p.x)) continue;
          const dd = d + R() * 0.1; if (dd < bd) { bd = dd; best = m; }
        }
      }
      if (!best) return;
      const N = n.n.clone().add(best.n).normalize();
      addEdge(n.p, best.p, bend(n.p, best.p, 0.15).addScaledVector(N, 0.03), { N, w: 0.0045, br: 0.8, base: 0.3, birth: R() < 0.45 ? Math.max(waveT(n.p), n.born, best.born) : Math.max(n.born, best.born), gate: 2, pg: 0 });
    });
  }

  // ---- inside: ganglia (soft glows deep in each hemisphere), the commissure and the brainstem
  const GANG = [[0.3, -0.28, -0.15, 0.13, 14], [0.6, -0.05, 0.4, 0.15, 12], [0.75, -0.62, -0.1, 0.11, 8]];
  GANG.forEach(([gx, gy, gz, sg, n]) => [-1, 1].forEach((s) => {
    const c = V(gx * s, gy, gz);
    for (let j = 0; j < n; j++) {
      nodes.push({ p: c.clone().add(V(gauss(R), gauss(R) * 0.8, gauss(R)).multiplyScalar(sg)), n: V(), size: 0.06 + 0.08 * Math.pow(R(), 2), born: R() < 0.4 ? waveT(c) + 0.2 : -1, br: 0.55 });
    }
  }));
  // the commissure: a thick bright bundle arching across the midline under the fissure
  for (let k = 0; k < Math.round(26 * dens); k++) {
    const z = lerp(-1.0, 1.05, R()), zz = z + gauss(R) * 0.1;
    const A = V(-(0.5 + 0.4 * R()), -0.05 + 0.3 * R(), z), B = V(0.5 + 0.4 * R(), -0.05 + 0.3 * R(), zz);
    const C = V(gauss(R) * 0.04, -0.34 + 0.05 * gauss(R) - 0.1 * (1 - Math.abs(z) / 1.1), (z + zz) / 2);
    addEdge(A, B, C, { w: 0.007, br: 0.8, base: 0.14, gate: R() * 0.6, v: 2.0, tail: 0.4, pg: 1.0 });
  }
  // the brainstem: fibres converging downward, fading into the haze
  for (let k = 0; k < Math.round(20 * dens); k++) {
    const A = V(gauss(R) * 0.3, -0.32 + 0.15 * R(), -0.35 + gauss(R) * 0.2), B = V(gauss(R) * 0.06, -2.05, -0.86 + gauss(R) * 0.05), C = V(gauss(R) * 0.08, -1.05, -0.52);
    addEdge(A, B, C, { w: 0.007, br: 0.85, base: 0.25, gate: R() * 0.7, v: 2.2, tail: 0.4, pg: 1.1 });
  }
  // foreground strands drifting near the lens on the right (parallax; heavily out of focus)
  const mid = { p: V(), l: V() };
  camAt(0.5, mid.p, mid.l);
  const mf = mid.l.clone().sub(mid.p).normalize(), mr = V().crossVectors(mf, UP).normalize(), mu = V().crossVectors(mr, mf);
  const atCam = (sx, sy, d) => mid.p.clone().addScaledVector(mf, d).addScaledVector(mr, sx * d * 0.54).addScaledVector(mu, sy * d * 0.31);
  [[0.62, 1.25, 1.05, 0.2, 3.4], [0.9, -1.3, 1.2, -0.3, 4.2], [1.05, 0.9, 0.75, -0.6, 2.8]].forEach(([x0, y0, x1, y1, d]) => {
    const A = atCam(x0, y0, d), B = atCam(x1, y1, d + 0.6), C = atCam((x0 + x1) / 2 + 0.2, (y0 + y1) / 2 + 0.15, d + 0.25);
    addEdge(A, B, C, { w: 0.01, br: 0.3, base: 0.5, gate: 2, pg: 0, gd: 1 });
  });

  // brightness normalisation: dense bundles would add up to a milky white-out, so each strand is dimmed by
  // the square root of how crowded its neighbourhood is
  {
    const cs = 0.3, g = new Map(), kf = (v) => `${Math.floor(v.x / cs)},${Math.floor(v.y / cs)},${Math.floor(v.z / cs)}`;
    const tmp = V(), samp = (e, t) => { const u = 1 - t; return tmp.set(0, 0, 0).addScaledVector(e.A, u * u).addScaledVector(e.C, 2 * u * t).addScaledVector(e.B, t * t); };
    edges.forEach((e) => { for (const t of [0.25, 0.5, 0.75]) { const k = kf(samp(e, t)); g.set(k, (g.get(k) || 0) + e.len * e.base); } });
    const d0 = [...g.values()].sort((a, b) => a - b)[Math.floor(g.size * 0.6)];
    edges.forEach((e) => {
      let s = 0; for (const t of [0.25, 0.5, 0.75]) s += g.get(kf(samp(e, t)));
      e.br *= clamp(Math.sqrt(d0 / (s / 3)), 0.4, 1.1);
    });
  }

  // ---- filament geometry (segments per edge scale with its length)
  let NV = 0, NI = 0;
  edges.forEach((e) => { e.seg = clamp(Math.round(e.len * 9), 2, 22); NV += (e.seg + 1) * 2; NI += e.seg * 6; });
  const aA = new Float32Array(NV * 3), aB = new Float32Array(NV * 3), aC = new Float32Array(NV * 3), aTS = new Float32Array(NV * 2);
  const aE = new Float32Array(NV * 4), aF = new Float32Array(NV * 4), aG = new Float32Array(NV * 2), aN = new Float32Array(NV * 3), aH = new Float32Array(NV * 3);
  const idx = new Uint32Array(NI);
  let v = 0, ii = 0;
  edges.forEach((e) => {
    const v0 = v;
    for (let s = 0; s <= e.seg; s++) for (const side of [-1, 1]) {
      aA.set([e.A.x, e.A.y, e.A.z], v * 3); aB.set([e.B.x, e.B.y, e.B.z], v * 3); aC.set([e.C.x, e.C.y, e.C.z], v * 3); aN.set([e.N.x, e.N.y, e.N.z], v * 3);
      aTS[v * 2] = s / e.seg; aTS[v * 2 + 1] = side;
      aE.set([e.w, e.birth, e.gd, e.br], v * 4); aF.set([e.ph, e.spd, e.gate, e.tail], v * 4); aG.set([e.pg, e.base], v * 2);
      // a reversed (grown backwards) segment: arc length runs from its far end
      aH.set(e.rev ? [e.s0 + e.len, -e.len, e.cl] : [e.s0, e.len, e.cl], v * 3);
      v++;
    }
    for (let s = 0; s < e.seg; s++) { const a = v0 + s * 2; idx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], ii); ii += 6; }
  });
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NV * 3), 3));
  fg.setAttribute('aA', new THREE.BufferAttribute(aA, 3)); fg.setAttribute('aB', new THREE.BufferAttribute(aB, 3)); fg.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
  fg.setAttribute('aTS', new THREE.BufferAttribute(aTS, 2)); fg.setAttribute('aE', new THREE.BufferAttribute(aE, 4)); fg.setAttribute('aF', new THREE.BufferAttribute(aF, 4));
  fg.setAttribute('aG', new THREE.BufferAttribute(aG, 2)); fg.setAttribute('aN', new THREE.BufferAttribute(aN, 3)); fg.setAttribute('aH', new THREE.BufferAttribute(aH, 3));
  fg.setIndex(new THREE.BufferAttribute(idx, 1));
  const PX = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(34) / 2));
  const U = {
    uTime: { value: 0 }, uClock: { value: 0 }, uLight: { value: 0 }, uPx: { value: PX }, uFog: { value: 0.06 }, uFocus: { value: 9 }, uAper: { value: 0.012 },
    uOrigin: { value: ORIGIN }, uWaveR: { value: 0 },
    uCol: { value: lin(2.4, 0.74, 0.16) }, uHot: { value: lin(4.6, 2.1, 0.62) },
  };
  const fil = new THREE.Mesh(fg, new THREE.ShaderMaterial({ vertexShader: FIL_VERT, fragmentShader: FIL_FRAG, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  fil.frustumCulled = false;

  // ---- node points
  const np = new Float32Array(nodes.length * 3), nr = new Float32Array(nodes.length * 4), nn = new Float32Array(nodes.length * 3);
  nodes.forEach((n, i) => { np.set([n.p.x, n.p.y, n.p.z], i * 3); nr.set([n.size, R(), n.born, n.br], i * 4); nn.set([n.n.x, n.n.y, n.n.z], i * 3); });
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(np, 3)); ng.setAttribute('aR', new THREE.BufferAttribute(nr, 4)); ng.setAttribute('aN', new THREE.BufferAttribute(nn, 3));
  const nodePts = new THREE.Points(ng, new THREE.ShaderMaterial({ vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  nodePts.frustumCulled = false;
  scene.add(fil, nodePts);
  if (typeof window !== 'undefined') window.__nb = { edges: edges.length, nodes: nodes.length, folds: folds.length, foldsB: foldsB.length, fol: fol.length, NV };

  // ---- sky: apricot away from the sun, cream toward it, warm white at the sun (behind the card, top left)
  const skyU = {
    uSun: { value: V(-1, 0.3, 0) }, uDeep: { value: disp('#e9a271') }, uMid: { value: disp('#f2b07c') },
    uCream: { value: disp('#f7dcae') }, uWhite: { value: disp('#faead0') }, uSunK: { value: 1 }, uTime: { value: 0 }, uNoise: { value: noiseTex },
    uOutInv: { value: ACES_OUT.clone().invert() }, uInInv: { value: ACES_IN.clone().invert() }, uExpInv: { value: 0.6 / EXPOSURE }, uVig: { value: opts.vignetteComp ?? 1 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 32), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // ---- motes (some sharp around the network, a few huge soft bokeh discs near the lens on the right)
  const NM = 220, mp = new Float32Array(NM * 3), mrr = new Float32Array(NM * 4), RM = rng(77);
  for (let i = 0; i < NM; i++) {
    const p = i < 12 ? atCam(lerp(0.1, 0.95, RM()), lerp(-0.85, 0.85, RM()), lerp(2.2, 4.4, RM()))
      : V(lerp(-3.4, 3.4, RM()), lerp(-2.6, 2.4, RM()), lerp(-3.2, 3.4, RM()));
    mp.set([p.x, p.y, p.z], i * 3); mrr.set([RM(), RM(), RM(), RM()], i * 4);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aR', new THREE.BufferAttribute(mrr, 4));
  const moteU = { uTime: { value: 0 }, uPx: { value: PX }, uFocus: U.uFocus, uCol: { value: lin(1.5, 0.7, 0.26) } };
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({ vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, uniforms: moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.frustumCulled = false; scene.add(motes);

  // pulse clock: time plus the integral of the bloom level, so signals speed up without jumping
  const LA = lightAt - 0.1, LB = lightAt + 1.0;
  const clock = (t) => {
    const x = prog(t, LA, LB), I = t <= LA ? 0 : t >= LB ? (t - LB) + (LB - LA) * 0.5 : (LB - LA) * (x ** 3 - x ** 4 / 2);
    return t + 0.9 * I;
  };
  const look = V(), sunCam = V();
  const TH = Math.tan(THREE.MathUtils.degToRad(17));
  return {
    scene, camera,
    bloom: { strength: 0.55, radius: 0.5, threshold: 1.9 },
    exposure: EXPOSURE,
    update(lt, c) {
      const L = smooth(prog(lt, LA, LB));
      U.uTime.value = lt; U.uLight.value = L; U.uClock.value = clock(lt);
      U.uWaveR.value = lt > lightAt ? (lt - lightAt) / wave * 4.8 : 0;
      moteU.uTime.value = lt; skyU.uTime.value = lt;
      skyU.uSunK.value = 1 + 0.1 * L;
      camAt(c.k, camera.position, look);
      camera.position.x += noise(lt * 0.31 + 2) * 0.02; camera.position.y += noise(lt * 0.27 + 7) * 0.016;
      camera.lookAt(look);
      camera.updateMatrixWorld();
      U.uFocus.value = camera.position.distanceTo(BRAIN) - 0.8;
      // the sun sits behind the card (upper left) and drifts only a little: the haze is near, not at infinity
      sunCam.set(lerp(-0.5, -0.4, c.k) * TH * 16 / 9, 0.34 * TH, -1).normalize().applyQuaternion(camera.quaternion);
      skyU.uSun.value.copy(sunCam);
      sky.position.copy(camera.position);
    },
  };
});
