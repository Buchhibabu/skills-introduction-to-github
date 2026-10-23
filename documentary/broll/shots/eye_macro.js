// eye_macro: a macro photograph of a human eye. The eye sits in the right two thirds of the frame (the iris at
// x ~1330), the inner corner just right of the left third, the nose side and cheek falling away soft and dark.
// The lids, the lid crease, the rounded lid margins, the lower waterline and the tear meniscus are all shaped
// live from the current lid curves (so a blink is a rounded lid sweeping over the globe, not a paper cut-out);
// the skin has subsurface warmth, pores and a broken sheen. The iris has wavy stromal fibres, crypts, a broken
// collarette, contraction furrows and a soft limbal ring, under a wet corneal dome that mirrors the world in
// front of it: first a phone held below the eye (a bright cool screen whose feed scrolls and flickers, bent by
// the cornea, with halation) and a dim room window; the eye reads, makes micro-saccades, blinks once, the
// pupil wide. At lookAt the eye blinks and looks up into a sunrise: the reflection becomes a warm sun over a
// soft horizon, warm light floods the iris (a caustic crescent opposite the light), the pupil constricts.
// The camera pushes in slowly and racks focus from the lashes to the iris at the start.
//
// opts:
//   lookAt   local seconds of the blink + look-up to the sunrise (default 60% of the shot)
//   blink    true (default) blinks on the look-up; false crossfades the reflection without a blink
//   iris     'teal' (default: blue-grey-green with a muted hazel ring) | 'amber' (warm hazel)
//   seed     texture seed (default 3)
//   vignetteComp  0..1 how much the frame pre-smooths the film's CSS vignette ramp (default 1)
//
// Overlays: a card sits in the left third (x 110..730, y 200..620) with a verb below it (y ~800..900): that
// zone holds only soft, defocused skin of the nose side and cheek, darker than the eye (the phone light falls
// off to the left); the inner corner starts at x ~790.
import { THREE, register, rng, noise, ease, smooth, clamp, lerp, prog } from '../kit.js';

const W = 1920, H = 1080;

// ---------------------------------------------------------------- display-space finishing (vignette smoothing)
const ACES_IN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
const ACES_OUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
const ACES_IN_INV = ACES_IN.clone().invert(), ACES_OUT_INV = ACES_OUT.clone().invert();
const GRADE_GLSL = /* glsl */`
uniform mat3 uAIn, uAOut, uAInInv, uAOutInv; uniform float uVigA, uVigK;
vec3 acesFit(vec3 v){ return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
vec3 acesInvFit(vec3 y){ vec3 A = 1.0 - 0.983729 * y, B = 0.0245786 - 0.432951 * y, C = -(0.000090537 + 0.238081 * y); return (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A); }
vec3 oetf(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 eotf(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
// (this frame is mid-dark, so the display-space ratio is applied as its linear-light equivalent)
vec3 vignetteSmooth(vec3 c){
  vec2 e = vec2((gl_FragCoord.x - 960.0) / 1357.6, ((1080.0 - gl_FragCoord.y) - 518.4) / 794.2);
  float r = length(e);
  float a = uVigA * clamp((r - 0.45) / 0.55, 0.0, 1.0);
  float S = min(0.08 * log(1.0 + exp((r - 0.45) / 0.08)) / 0.55, 1.0);
  float m = (1.0 - uVigA * uVigK * S) / (1.0 - a);
  return c * pow(m, 2.4);
}`;

// ---------------------------------------------------------------- JS noise for the textures
function lattice(seed, n = 256) {
  const R = rng(seed), P = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) P[i] = R();
  // periodic value noise: period px in x (must divide n), y wraps at n
  return (x, y, px = n) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % n) + n) % n, y1 = (y0 + 1) % n;
    const a = P[y0 * n + x0], b = P[y0 * n + x1], c = P[y1 * n + x0], d = P[y1 * n + x1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };            // linear
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const enc = (v) => { v = clamp(v); return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255); };
function floatTex(data, w, h, { repeatX = false } = {}) {
  // data: Float32 linear rgb + alpha -> 8-bit sRGB texture (the GPU decodes it back to linear), mipmapped
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = enc(data[i * 4]); img.data[i * 4 + 1] = enc(data[i * 4 + 1]); img.data[i * 4 + 2] = enc(data[i * 4 + 2]);
    img.data[i * 4 + 3] = Math.round(clamp(data[i * 4 + 3]) * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = false;
  t.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}

// iris in polar coordinates: x = angle (0..1, wraps), y = 0 at the pupil edge .. 1 at the limbus.
// RGB = colour, A = relief (fibres stand proud, crypts sink, the collarette is a ridge)
function irisTexture(seed, kind) {
  const w = 2048, h = 512, n = lattice(seed, 1024), d = new Float32Array(w * h * 4);
  const R = rng(seed + 7);
  const P = kind === 'amber'
    ? { oD: hex('#3a3622'), oL: hex('#8c8656'), iD: hex('#4a2c14'), iL: hex('#a8713a'), limb: hex('#1e1a12'), ruff: hex('#24150b') }
    : { oD: hex('#2b3e44'), oL: hex('#7c9a9e'), iD: hex('#3d3328'), iL: hex('#7d6e57'), limb: hex('#18242a'), ruff: hex('#22170f') };
  const crypts = Array.from({ length: 90 }, () => { const nearC = R() < 0.65; return { a: R(), r: nearC ? 0.3 + R() * 0.16 : 0.45 + R() * 0.32, wa: 0.003 + R() * 0.008, wr: 0.025 + R() * 0.06, k: 0.3 + R() * 0.45 }; });
  const freckles = Array.from({ length: 4 }, () => ({ a: R(), r: 0.5 + R() * 0.3, s: 0.02 + R() * 0.025 }));
  const cryptsAt = Array.from({ length: 64 }, (_, b) => crypts.filter((k) => { let da = Math.abs((b + 0.5) / 64 - k.a); da = Math.min(da, 1 - da); return da < k.wa * 1.5 + 1 / 64; }));
  for (let y = 0; y < h; y++) {
    const r = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const a = x / w;
      // angular warp: the stromal fibres wave and weave instead of running dead straight
      const warp = (n(a * 16, r * 2.5 + 11, 16) - 0.5) * 0.03 + (n(a * 64, r * 7 + 3, 64) - 0.5) * 0.009;
      const u = a + warp;
      const f1 = n(u * 512, r * 5 + 40, 512), f2 = n(u * 1024, r * 11 + 70, 1024), f3 = n(u * 128, r * 1.6 + 90, 128);
      const fib = clamp(0.5 * f1 + 0.3 * f2 + 0.2 * f3);
      const bund = smooth((n(u * 64, r * 1.3 + 5, 64) - 0.3) / 0.45);           // trabecular bundles
      // the collarette: a wavy, broken border between the pupillary and ciliary zones
      const rc = 0.31 + 0.11 * (n(a * 16, 2.7, 16) - 0.5) + 0.05 * (n(a * 64, 8.1, 64) - 0.5);
      const inner = 1 - smooth((r - rc) / 0.07 + 0.5);
      const outer = mix3(P.oD, P.oL, Math.pow(fib, 1.15) * (0.55 + 0.45 * bund));
      const inn = mix3(P.iD, P.iL, Math.pow(fib, 0.95));
      let c = mix3(outer, inn, inner * (0.42 + 0.35 * f3) * (0.7 + 0.6 * n(a * 32, 4.4, 32)));
      // the hazel of the pupillary zone bleeds out along some strands, mottled
      c = mix3(c, inn, smooth((f1 - 0.62) / 0.25) * (1 - smooth((r - rc - 0.12) / 0.2)) * 0.3 * (0.5 + n(a * 32, r * 3 + 21, 32)));
      const ridge = Math.exp(-Math.pow((r - rc) / 0.022, 2)) * (0.3 + 0.7 * n(a * 128, 9.9, 128));
      c = mix3(c, mix3(c, [0.9, 0.85, 0.75], 0.35), ridge * 0.5);
      // crypts: dark lens-shaped pits showing the pigmented layer behind, with a lighter lip
      let dark = 0, lip = 0;
      for (const k of cryptsAt[Math.floor(a * 64)]) {
        let da = Math.abs(a - k.a); da = Math.min(da, 1 - da);
        if (da > k.wa * 1.6) continue;
        const e = Math.pow(da / k.wa, 2) + Math.pow((r - k.r) / k.wr, 2);
        if (e < 1) dark = Math.max(dark, (1 - e) * k.k); else if (e < 1.6) lip = Math.max(lip, (1.6 - e) * 0.5 * k.k);
      }
      c = c.map((v) => v * (1 - dark * 0.8) * (1 + lip * 0.35));
      // contraction furrows: broken concentric arcs in the outer zone
      let fur = 0;
      for (const rf of [0.66, 0.75, 0.84]) {
        const off = (n(a * 32, rf * 20, 32) - 0.5) * 0.02;
        fur += Math.exp(-Math.pow((r - rf - off) / 0.008, 2)) * smooth((n(a * 32, rf * 13 + 50, 32) - 0.4) / 0.2);
      }
      c = c.map((v) => v * (1 - 0.28 * fur) * (0.8 + 0.4 * fib));
      for (const f of freckles) { let da = Math.abs(a - f.a); da = Math.min(da, 1 - da); const e = (da * da) / (f.s * f.s * 0.12) + Math.pow((r - f.r) / f.s, 2); if (e < 1) c = mix3(c, P.iD, (1 - e) * 0.6); }
      // soft limbal ring, pupillary ruff
      c = mix3(c, P.limb, Math.pow(smooth((r - 0.8) / 0.2), 1.6) * 0.85);
      c = mix3(c, P.ruff, 1 - smooth(r / 0.055));
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      d[i + 3] = clamp(0.5 + 0.3 * (fib - 0.5) + 0.12 * bund - 0.35 * dark + 0.14 * ridge - 0.06 * r - 0.12 * fur);
    }
  }
  return floatTex(d, w, h, { repeatX: true });
}

// sclera in eyeball coordinates (q in [-1.15, 1.15] x [-0.62, 0.62]): warm off-white, pinker and greyer toward
// the corners, faint branching vessels
function scleraTexture(seed) {
  const w = 1024, h = 552;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const n = lattice(seed);
  const img = g.createImageData(w, h);
  const base = hex('#e9e0d4'), pink = hex('#d8ad9e'), grey = hex('#c6c0b8'), blue = hex('#cfd3d6');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const qx = (x / w - 0.5) * 2.3, qy = (0.5 - y / h) * 1.24, rq = Math.hypot(qx, qy);
    const edge = smooth((Math.abs(qx) - 0.45) / 0.6);
    let col = mix3(base, pink, edge * 0.5 * (0.6 + 0.8 * n(x / 60, y / 60)));
    col = mix3(col, grey, 0.18 * n(x / 25 + 9, y / 25));
    col = mix3(col, blue, 0.35 * Math.exp(-Math.pow((rq - 0.45) / 0.06, 2)));      // limbal translucency
    const i = (y * w + x) * 4;
    img.data[i] = enc(col[0]); img.data[i + 1] = enc(col[1]); img.data[i + 2] = enc(col[2]); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const R = rng(seed + 3);
  g.lineCap = 'round';
  const vessel = (x, y, ang, wdt, len, depth) => {
    for (let s = 0; s < len; s++) {
      const nx = x + Math.cos(ang) * 6, ny = y + Math.sin(ang) * 6;
      const qx = (nx / w - 0.5) * 2.3, qy = (0.5 - ny / h) * 1.24;
      if (Math.hypot(qx, qy) < 0.5) return;
      g.strokeStyle = `rgba(${170 + R() * 35},${58 + R() * 25},${55 + R() * 20},${0.12 + 0.2 * wdt / 3})`;
      g.lineWidth = wdt; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny; ang += (R() - 0.5) * 0.5; wdt = Math.max(0.5, wdt * 0.985);
      if (depth < 3 && R() < 0.05) vessel(x, y, ang + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), wdt * 0.7, len * 0.5, depth + 1);
    }
  };
  for (let k = 0; k < 12; k++) {
    const left = k % 2 === 0;
    vessel(left ? R() * 40 : w - R() * 40, h * (0.3 + R() * 0.4), left ? (R() - 0.5) * 0.7 : Math.PI + (R() - 0.5) * 0.7, 1.0 + R() * 1.0, 40 + R() * 40, 0);
  }
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const bg = b.getContext('2d'); bg.filter = 'blur(1.1px)'; bg.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(b);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// skin micro-detail in eye space (u in [SK.u0, SK.u1], v in [SK.v0, SK.v1]): fine lines at the outer corner and
// under the eye, pores and grain. RG = normal, B = albedo mottling, A = cavity. The broad forms (globe, lids,
// crease, margins) are not baked: the shader computes them live from the lid curves.
const SK = { u0: -2.7, u1: 1.2, v0: -1.15, v1: 1.15, w: 1600, h: 944 };
function skinTexture(seed) {
  const { w, h } = SK, n = lattice(seed), hgt = new Float32Array(w * h), alb = new Float32Array(w * h);
  const R = rng(seed + 11);
  const U = (x) => SK.u0 + (x / (w - 1)) * (SK.u1 - SK.u0), V = (y) => SK.v0 + (y / (h - 1)) * (SK.v1 - SK.v0);   // row 0 = bottom
  const px = (SK.u1 - SK.u0) / w;
  for (let y = 0; y < h; y++) {
    const v = V(y);
    for (let x = 0; x < w; x++) {
      const u = U(x);
      let ht = 0;
      // crow's feet fanning from the outer corner, soft lines under the eye
      const ox = u - 1.0, oy = v - 0.06, rr = Math.hypot(ox, oy), an = Math.atan2(oy, ox);
      if (ox > 0.02) ht -= 0.005 * Math.pow(Math.max(0, Math.sin(an * 7 + (n(rr * 4, 1) - 0.5) * 2.5)), 24) * smooth((rr - 0.08) / 0.15);
      const dl = -0.33 - v;
      if (dl > 0.05 && Math.abs(u) < 1.1) ht -= 0.002 * Math.pow(Math.max(0, Math.sin(dl * 28 + (n(u * 3, 2) - 0.5) * 6)), 22) * smooth((n(u * 2.5 + 7, dl * 4) - 0.35) / 0.3) * (1 - smooth((dl - 0.4) / 0.2));
      ht += (n(x / 2.2, y / 2.2) - 0.5) * 0.0011 + (n(x / 7 + 50, y / 7) - 0.5) * 0.0018;
      hgt[y * w + x] = ht;
      alb[y * w + x] = 0.5 + (n(x / 70 + 9, y / 70) - 0.5) * 0.32 + (n(x / 18 + 3, y / 18 + 7) - 0.5) * 0.14;
    }
  }
  for (let k = 0; k < 11000; k++) {
    const x = Math.floor(R() * w), y = Math.floor(R() * h), r = 1 + Math.floor(R() * 2), dep = (0.0006 + R() * 0.0009);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const f = 1 - (i * i + j * j) / ((r + 0.6) * (r + 0.6)); if (f > 0) hgt[yy * w + xx] -= dep * f;
    }
  }
  for (let k = 0; k < 70; k++) {
    const x = R() * w, y = R() * h, r = 2 + R() * 5;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = Math.floor(x + i), yy = Math.floor(y + j); if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const f = 1 - (i * i + j * j) / (r * r); if (f > 0) alb[yy * w + xx] -= 0.08 * f;
    }
  }
  const out = new Uint8Array(w * h * 4);
  const sc = 1 / (2 * px) * 0.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const hx = (hgt[y * w + Math.min(w - 1, x + 1)] - hgt[y * w + Math.max(0, x - 1)]) * sc;
    const hy = (hgt[Math.min(h - 1, y + 1) * w + x] - hgt[Math.max(0, y - 1) * w + x]) * sc;
    out[i * 4] = Math.round(clamp(0.5 - hx * 0.5) * 255);
    out[i * 4 + 1] = Math.round(clamp(0.5 - hy * 0.5) * 255);
    out[i * 4 + 2] = Math.round(clamp(alb[i]) * 255);
    let m = 0; for (const [a, b] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) m += hgt[clamp(y + b, 0, h - 1) * w + clamp(x + a, 0, w - 1)];
    out[i * 4 + 3] = Math.round(clamp(0.75 + (hgt[i] - m / 4) * 120) * 255);
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- lid curves (JS mirror of the shader)
// t = 0 at the inner corner (screen left), 1 at the outer corner. Eye units: the opening is 2 wide. The upper
// lid peaks a little nasal of centre, the lower lid dips a little temporal; the outer corner sits higher.
const K_UP = Math.log(0.5) / Math.log(0.44), K_LO = Math.log(0.5) / Math.log(0.58);
const ycJS = (t) => lerp(-0.05, 0.075, t);
const bumpU = (t) => Math.pow(Math.max(Math.sin(Math.PI * Math.pow(clamp(t), K_UP)), 0), 0.78);
const bumpL = (t) => Math.pow(Math.max(Math.sin(Math.PI * Math.pow(clamp(t), K_LO)), 0), 0.88);
function lidsJS(t, blink, gx, gy, squint) {
  const bu = bumpU(t), bl = bumpL(t);
  const upO = ycJS(t) + (0.335 + 0.28 * gy) * bu + 0.03 * gx * Math.sin(Math.PI * t);
  const lo = ycJS(t) - (0.325 - 0.12 * gy - 0.06 * squint) * bl;
  return [lerp(upO, lo + 0.02 * bl, blink), lo];
}
const GLSL_LIDS = /* glsl */`
const float K_UP = ${K_UP.toFixed(6)}; const float K_LO = ${K_LO.toFixed(6)};
float ycF(float t){ return mix(-0.05, 0.075, t); }
float bumpU(float t){ return pow(max(sin(3.14159265 * pow(clamp(t, 0.0, 1.0), K_UP)), 0.0), 0.78); }
float bumpL(float t){ return pow(max(sin(3.14159265 * pow(clamp(t, 0.0, 1.0), K_LO)), 0.0), 0.88); }
// upper margin (with the blink), lower margin, the crease line (anchored to the open lid), lid-bump weights
void lids(float t, out float up, out float lo, out float crease, out float bu){
  bu = bumpU(t); float bl = bumpL(t);
  float upO = ycF(t) + (0.335 + 0.28 * uGaze.y) * bu + 0.03 * uGaze.x * sin(3.14159265 * t);
  lo = ycF(t) - (0.325 - 0.12 * uGaze.y - 0.06 * uSquint) * bl;
  up = mix(upO, lo + 0.02 * bl, uBlink);
  crease = ycF(t) + (0.335 + 0.2 * uGaze.y) * bu + 0.2 * bu + 0.012;
}`;

// ---------------------------------------------------------------- the eye shader
const VERT = /* glsl */`void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */`
precision highp float;
uniform vec2 uC; uniform float uS;
uniform vec2 uGaze; uniform float uBlink; uniform float uSquint; uniform float uPupil; uniform float uK; uniform float uEnvK; uniform float uTime;
uniform float uFocus;
uniform sampler2D uIris; uniform sampler2D uScl; uniform sampler2D uSkin;
uniform vec3 uL; uniform vec3 uKey; uniform vec3 uAmb; uniform vec3 uFill;
uniform float uPhone; uniform float uScroll; uniform vec2 uSun;
uniform vec4 uSK;          // skin texture domain u0, v0, 1/(u1-u0), 1/(v1-v0)
uniform vec3 uFall;        // key-light falloff across the frame: direction xy, amount
${GLSL_LIDS}
${GRADE_GLSL}
const float RI = 0.4;       // iris radius
const float RC = 0.54;      // corneal curvature
const float RE = 0.86;      // the globe
const vec2 E0 = vec2(0.03, -0.02);

float h1(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float sdRect(vec2 p, vec2 b, float r){ vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }

// what the tear film mirrors (R: reflected direction; blur widens every edge for the rougher sclera)
vec3 gGlow = vec3(0.0);
vec3 env(vec3 R, float blur){
  float iz = 1.0 / max(R.z, 0.08);
  vec2 a2 = R.xy * iz;
  vec3 a = vec3(0.004, 0.005, 0.007);
  if (uEnvK < 1.0){
    // the phone below the eye: a bright cool screen with a feed scrolling on it, a dark bezel, halation
    vec2 pc = vec2(-0.05, -1.08), hs = vec2(0.4, 1.0);
    float sd = sdRect(a2 - pc, hs, 0.06);
    float ew = 0.015 + blur * 0.12;
    float scr = smoothstep(ew, -ew, sd);
    vec2 sp = (a2 - pc) / hs;                                  // -1..1 across the screen
    float row = sp.y * 1.6 + uScroll;                         // feed cards scroll upward
    float fr = fract(row), id = floor(row);
    float card = step(0.06, fr) * step(fr, 0.94);
    float img = step(0.12, fr) * step(fr, 0.58) * step(abs(sp.x), 0.86);         // a photo in each card
    float imgB = 0.25 + 0.55 * h1(id * 7.31);                                     // its brightness
    float txt = step(0.66, fr) * step(fr, 0.88) * step(0.5, fract(fr * 22.0)) * step(sp.x, 0.5 - 0.4 * h1(id * 3.1 + floor(fr * 11.0)));
    float content = card * mix(1.0, imgB, img) * (1.0 - 0.55 * txt);
    content = mix(content, 0.75, step(0.86, sp.y));                              // status bar
    content = mix(content, 0.5, blur);
    vec3 hue = mix(vec3(1.0, 0.72, 0.5), vec3(0.45, 0.7, 1.0), h1(id * 2.17));    // the photos have colour
    vec3 tint = mix(vec3(0.62, 0.8, 1.0), hue, img * card * 0.8 * (1.0 - blur));
    vec3 screen = tint * 34.0 * content * uPhone;
    a += screen * scr;
    gGlow += vec3(0.62, 0.78, 1.0) * uPhone * (1.0 - uEnvK) * (exp(-max(sd, 0.0) / (0.09 + blur * 0.2)) * mix(0.75, 1.0, content) + 0.25 * exp(-max(sd, 0.0) / 0.35));
    // a dim window across the room, upper left
    float wd = sdRect(a2 - vec2(-0.85, 0.62), vec2(0.28, 0.2), 0.03);
    a += vec3(0.75, 0.82, 0.9) * 2.2 * smoothstep(0.02 + blur * 0.15, -0.02 - blur * 0.15, wd);
    a *= (1.0 - uEnvK);
  }
  vec3 b = vec3(0.0);
  if (uEnvK > 0.0){
    // the sunrise: a dim warm sky, a soft horizon with ridges below it, and the sun itself
    float hz = 0.0 + 0.04 * sin(a2.x * 5.0 + 1.3) + 0.02 * sin(a2.x * 13.0 + 0.4);
    float sky = smoothstep(-0.06 - blur * 0.2, 0.06 + blur * 0.2, a2.y - hz);
    vec3 skyC = mix(vec3(1.0, 0.55, 0.28) * 1.6, vec3(0.55, 0.55, 0.62) * 0.7, smoothstep(0.0, 0.9, a2.y));
    b = mix(vec3(0.05, 0.03, 0.02), skyC, sky);
    float sd2 = length(a2 - uSun);
    b += vec3(1.0, 0.92, 0.78) * 70.0 * smoothstep(0.075 + blur * 0.2, 0.05, sd2) * (1.0 - blur * 0.8);
    gGlow += vec3(1.0, 0.72, 0.42) * uEnvK * (exp(-sd2 / (0.1 + blur * 0.3)) * 1.2 + 0.2 * exp(-sd2 / 0.4));
    b *= uEnvK;
  }
  return a + b;
}

// skin height (eye units, toward the camera): the globe under the lids, the socket, brow and nose side,
// the rounded upper margin, the crease and the fold over it, the lower-lid roll and the lid-cheek junction
float skinH(vec2 p, float up, float lo, float crease, float bu){
  vec2 g = (p - E0) * vec2(0.88, 1.12);
  float d2 = dot(g, g);
  float h = 0.3 * exp(-d2 * 1.45) + 0.1 * exp(-d2 * 0.5) + 0.07 * exp(-d2 * 4.0);
  h -= 0.025 * exp(-((p.y + 0.62) * (p.y + 0.62)) / 0.02) * smoothstep(1.3, 0.2, abs(p.x + 0.1));
  h += 0.1 * smoothstep(0.5, 1.0, p.y) - 0.05 * smoothstep(0.9, 1.4, p.y);
  h += 0.12 * smoothstep(-1.0, -2.2, p.x) * (1.0 - 0.4 * smoothstep(0.0, 1.0, abs(p.y + 0.1)));
  float tt = clamp((p.x + 1.0) * 0.5, 0.0, 1.0);
  float wl = smoothstep(0.0, 0.12, tt) * (1.0 - smoothstep(0.9, 1.0, tt));
  float bw = bu * smoothstep(0.02, 0.3, tt) * (1.0 - smoothstep(0.82, 1.0, tt));
  float du = p.y - up, dl = lo - p.y;
  float md = max(max(du, dl), max(abs(p.x) - 1.0, 0.0) * 0.7);           // distance-ish to the opening, corners included
  float upperW = smoothstep(-0.03, 0.03, p.y - 0.5 * (up + lo));
  h -= mix(0.016, 0.03, upperW) * (1.0 - smoothstep(-0.005, 0.045, md));
  float relax = 1.0 - 0.75 * uBlink;
  h -= 0.016 * exp(-((p.y - crease) * (p.y - crease)) / (0.0014 + 0.003 * uBlink)) * bw * relax;
  h += 0.03 * smoothstep(crease - 0.03, crease + 0.18, p.y) * bw * (0.4 + 0.6 * relax);
  h += 0.013 * exp(-((dl - 0.055) * (dl - 0.055)) / 0.0016) * wl;
  h -= 0.012 * exp(-((dl - 0.21) * (dl - 0.21)) / 0.0028) * wl;
  return h;
}

void main(){
  vec2 p = (gl_FragCoord.xy - uC) / uS;
  float px = 1.0 / uS;
  float aa = 1.2 * px;
  float t = clamp((p.x + 1.0) * 0.5, 0.0, 1.0);
  float up, lo, crease, bu;
  lids(t, up, lo, crease, bu);
  float inX = smoothstep(1.0 + aa, 1.0 - aa, abs(p.x));
  float open = smoothstep(-aa, aa, up - p.y) * smoothstep(-aa, aa, p.y - lo) * inX * step(0.0015, up - lo);
  vec3 L = normalize(uL);
  float dUp = up - p.y, dLo = p.y - lo;
  float fall = pow(clamp(1.0 + dot(p, uFall.xy) * uFall.z, 0.06, 1.9), 1.5);
  vec3 col = vec3(0.0);

  // ---------------- skin and lids
  if (open < 1.0){
    // live height field -> normal (finite differences; the lid curves are re-evaluated for the x step)
    float h0 = skinH(p, up, lo, crease, bu);
    vec3 N = normalize(vec3(-dFdx(h0) / px, -dFdy(h0) / px, 1.0));
    // macro depth of field: the skin softens away from the iris plane (texture footprint grows)
    float defocus = clamp(length((p - vec2(0.05, -0.02)) * vec2(0.62, 1.05)) * 2.6 - 1.25, 0.0, 6.0) + (1.0 - uFocus) * 0.6;
    vec2 kuv = (p - uSK.xy) * uSK.zw;
    vec2 dk = vec2(px * uSK.z, px * uSK.w) * exp2(defocus);
    vec4 sk = textureGrad(uSkin, kuv, vec2(dk.x, 0.0), vec2(0.0, dk.y));
    vec2 dn = (sk.rg - 0.5) * 2.0 * mix(1.0, 0.25, clamp(defocus / 3.0, 0.0, 1.0));
    N = normalize(N + vec3(dn, 0.0));
    float inL = 1.0 - smoothstep(0.95, 1.12, abs(p.x));
    // the lid margins: the wet lower waterline (pink, glossy), the lash lines (dark roots)
    float dl = -dLo, du = -dUp;
    float water = smoothstep(-0.002, 0.004, dl) * (1.0 - smoothstep(0.016, 0.024, dl)) * smoothstep(0.04, 0.16, t) * (1.0 - smoothstep(0.9, 0.99, t)) * (1.0 - uBlink * 0.8);
    float lashLo = exp(-((dl - 0.027) * (dl - 0.027)) / 0.00005) * smoothstep(0.2, 0.35, t) * (1.0 - smoothstep(0.92, 1.0, t));
    float lashUp = (1.0 - smoothstep(0.004, 0.02, du)) * step(-0.002, du) * smoothstep(0.03, 0.12, t) * (1.0 - smoothstep(0.93, 1.0, t));
    // albedo: light skin with mottling; redder round the rims and in the thin lid skin, a touch of shadow in the crease
    vec3 alb = vec3(0.55, 0.385, 0.31) * (0.86 + 0.28 * sk.b);
    alb = mix(alb, vec3(0.6, 0.32, 0.28), smoothstep(0.35, 0.75, 1.0 - sk.b) * 0.18);
    alb *= 1.0 - 0.1 * exp(-((p.y + 0.5) * (p.y + 0.5)) / 0.03) * smoothstep(1.2, 0.3, abs(p.x));
    float rimRed = exp(-max(du, 0.0) / 0.05) * step(0.0, du) + exp(-max(dl, 0.0) / 0.07) * step(0.0, dl);
    alb = mix(alb, vec3(0.6, 0.31, 0.27), rimRed * 0.5 * inL);
    alb = mix(alb, vec3(0.6, 0.33, 0.3), water * 0.7);
    float cav = mix(0.62, 1.05, sk.a);
    float ndl = dot(N, L);
    vec3 wrap = clamp((vec3(ndl) + vec3(0.5, 0.28, 0.2)) / vec3(1.5, 1.28, 1.2), 0.0, 1.0);    // red scatters further
    vec3 skin = alb * (uAmb + uFill * max(N.z, 0.0) + uKey * wrap * fall) * cav;
    // a broken sheen: oilier and drier patches, pores breaking it up
    vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
    float oil = 0.4 + 0.6 * smoothstep(0.35, 0.75, sk.b);
    skin += uKey * fall * (pow(max(dot(N, Hh), 0.0), 40.0) * 0.12 + pow(max(dot(N, Hh), 0.0), 8.0) * 0.025) * oil * smoothstep(0.55, 1.0, sk.a);
    // the waterline glistens (mirrors the light), the lash lines are dense dark roots
    vec3 Nw = normalize(vec3(0.0, 0.6, 0.8));
    if (water > 0.001) skin += water * env(vec3(2.0 * Nw.z * Nw.x, 2.0 * Nw.z * Nw.y, 2.0 * Nw.z * Nw.z - 1.0), 0.6) * 0.03;
    skin *= 1.0 - 0.8 * max(lashUp, lashLo * 0.6) * inL;
    col = skin;
  }

  // ---------------- the eyeball
  if (open > 0.0){
    vec2 ic = E0 + uGaze;
    vec2 qi = p - ic;
    float r = length(qi);
    vec2 qe = p - E0 - uGaze * 0.6;
    vec3 Ne = normalize(vec3(qe, sqrt(max(RE * RE - dot(qe, qe), 0.02))));
    vec3 scl = texture2D(uScl, vec2((p.x - uGaze.x) / 2.3 + 0.5, (p.y - uGaze.y) / 1.24 + 0.5)).rgb;
    // the upper lid and lashes shade the top of the globe, the lower lid a little; the corners turn away
    float aoUp = mix(0.18, 1.0, smoothstep(0.0, 0.15, dUp));
    float aoLo = mix(0.5, 1.0, smoothstep(0.0, 0.05, dLo));
    float turn = mix(0.35, 1.0, smoothstep(0.2, 0.8, Ne.z));
    vec3 eye = scl * (uAmb * 1.1 + uFill * 0.6 + uKey * max(dot(Ne, L) * 0.6 + 0.4, 0.0) * fall) * 0.82 * turn;
    if (r < RI * 1.06){
      // iris through the cornea: polar texture with analytic footprint (no seam), softened by the rack focus
      float span = RI - uPupil;
      float rr = clamp((r - uPupil) / span, 0.0, 1.0);
      float ang = atan(qi.y, qi.x) / 6.2831853 + 0.5;
      vec2 dq = vec2(px, 0.0), dqy = vec2(0.0, px);
      float rs = max(r, 1e-3);
      vec2 gx = vec2((qi.x * dq.y - qi.y * dq.x) / (rs * rs * 6.2831853), dot(qi, dq) / (rs * span));
      vec2 gy = vec2((qi.x * dqy.y - qi.y * dqy.x) / (rs * rs * 6.2831853), dot(qi, dqy) / (rs * span));
      float blurI = exp2((1.0 - uFocus) * 3.2);
      vec4 ia = textureGrad(uIris, vec2(ang, 1.0 - rr), gx * blurI, gy * blurI);
      vec3 ir = ia.rgb;
      vec3 Ni = normalize(vec3(qi * 0.45, 1.0));
      vec3 lit = ir * (uAmb * 1.3 + uFill * 0.8 + uKey * (0.2 + 0.8 * max(dot(Ni, L), 0.0)) * fall) * (0.72 + 0.56 * ia.a);
      // the cornea focuses the light into a crescent on the far side of the iris
      vec2 l2 = normalize(L.xy + vec2(1e-4));
      float caus = smoothstep(0.0, 0.9, dot(-qi / rs, l2)) * smoothstep(0.35 * RI, 0.8 * RI, r) * smoothstep(RI * 1.0, RI * 0.76, r);
      lit += ir * uKey * caus * (0.25 + 1.1 * uK) * fall;
      // depth under the dome: the corneoscleral overhang shades the iris rim
      lit *= mix(1.0, 0.55, smoothstep(0.84 * RI, 1.0 * RI, r));
      eye = mix(eye, lit, smoothstep(RI + 0.016, RI - 0.012, r));
      eye = mix(vec3(0.003, 0.0025, 0.0025), eye, smoothstep(uPupil - 0.006, uPupil + 0.005, r));
    }
    eye *= aoUp * aoLo;
    // the tear film mirrors: sharply on the corneal dome, a soft broken sheen on the sclera; the lids and lashes
    // hide part of the world
    float corn = smoothstep(RI * 1.08, RI * 0.97, r);
    vec3 Nc = normalize(vec3(qi, sqrt(max(RC * RC - r * r, 0.0))));
    vec3 Rf = vec3(2.0 * Nc.z * Nc.x, 2.0 * Nc.z * Nc.y, 2.0 * Nc.z * Nc.z - 1.0);
    float fres = 0.025 + 0.55 * pow(1.0 - Nc.z, 5.0);
    vec3 Rs = vec3(2.0 * Ne.z * Ne.x, 2.0 * Ne.z * Ne.y, 2.0 * Ne.z * Ne.z - 1.0);
    float lidOcc = smoothstep(0.0, 0.07, dUp) * smoothstep(0.0, 0.015, dLo);
    gGlow = vec3(0.0);
    vec3 refl = corn > 0.0 ? env(Rf, 0.0) * fres * corn : vec3(0.0);
    vec3 halo = gGlow * corn * 0.14;
    refl += env(Rs, 0.85) * 0.012 * (1.0 - corn);
    eye += refl * lidOcc + halo * mix(0.4, 1.0, lidOcc);
    // the tear meniscus along the lower lid catches the light
    float men = exp(-((dLo - 0.006) * (dLo - 0.006)) / 0.00002) * smoothstep(0.05, 0.18, t) * (1.0 - smoothstep(0.88, 0.98, t));
    vec3 Nm = normalize(vec3(0.0, -0.75, 0.66));
    if (men > 0.001) eye += men * env(vec3(2.0 * Nm.z * Nm.x, 2.0 * Nm.z * Nm.y, 2.0 * Nm.z * Nm.z - 1.0), 0.4) * 0.05;
    // the caruncle and plica in the inner corner: a soft wet pink mound, not a disc
    vec2 cc = p - vec2(-0.925, -0.04);
    float cd = length(cc * vec2(1.0, 1.5));
    float car = smoothstep(0.085, 0.035, cd);
    vec3 Ncar = normalize(vec3(cc * vec2(1.0, 1.5) * 7.0, 1.0));
    vec3 carC = mix(vec3(0.56, 0.3, 0.27), vec3(0.6, 0.42, 0.38), smoothstep(0.02, 0.07, cd)) * (uAmb * 1.6 + uFill + uKey * (0.35 + 0.65 * max(dot(Ncar, L), 0.0)) * fall);
    carC += uKey * fall * pow(max(dot(Ncar, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 50.0) * 0.5;
    float plx = (p.x + 0.84 + 0.05 * p.y) / 0.022;
    float plica = exp(-plx * plx) * 0.35 * smoothstep(0.12, 0.0, abs(p.y + 0.03));
    eye = mix(eye, carC, car * 0.85);
    eye = mix(eye, vec3(0.45, 0.24, 0.22) * (uAmb * 1.5 + uFill + uKey * 0.5 * fall), plica * (1.0 - car));
    col = mix(col, eye, open);
  }
  gl_FragColor = vec4(vignetteSmooth(col), 1.0);
}`;

// ---------------------------------------------------------------- lashes (strands in screen space)
const LASH_VERT = /* glsl */`
attribute vec2 aSide;          // across (-1..1), along (0 root .. 1 tip)
attribute float aShade;
varying vec2 vSide; varying float vShade;
void main(){ vSide = aSide; vShade = aShade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LASH_FRAG = /* glsl */`
precision highp float;
uniform vec3 uKey; uniform vec3 uAmb; uniform float uK; uniform float uDefocus;
varying vec2 vSide; varying float vShade;
void main(){
  // tips drift out of the focal plane toward the lens: softer and fainter
  float soft = clamp(0.5 * pow(vSide.y, 1.4) * uDefocus + 0.1, 0.1, 0.9);
  float a = smoothstep(1.0, 1.0 - soft * 2.0, abs(vSide.x)) * mix(1.0, 0.4, pow(vSide.y, 1.6) * uDefocus) * smoothstep(0.0, 0.06, vSide.y) * vShade;
  vec3 c = vec3(0.007, 0.0055, 0.005) + uAmb * 0.02 + uKey * (0.012 + 0.05 * uK) * smoothstep(0.2, 1.0, vSide.x) * vSide.y;
  gl_FragColor = vec4(c, a);
}`;

register('eye_macro', (opts) => {
  const seed = opts.seed ?? 3;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, W, H, 0, -10, 10);
  const irisT = irisTexture(seed, opts.iris === 'amber' ? 'amber' : 'teal');
  const sclT = scleraTexture(seed + 1);
  const skinT = skinTexture(seed + 2);
  const U = {
    uC: { value: new THREE.Vector2(1310, 530) }, uS: { value: 560 },
    uGaze: { value: new THREE.Vector2() }, uBlink: { value: 0 }, uSquint: { value: 0 }, uPupil: { value: 0.18 }, uK: { value: 0 }, uEnvK: { value: 0 }, uTime: { value: 0 },
    uFocus: { value: 1 },
    uIris: { value: irisT }, uScl: { value: sclT }, uSkin: { value: skinT },
    uL: { value: new THREE.Vector3(0, -0.5, 0.85) }, uKey: { value: new THREE.Vector3() }, uAmb: { value: new THREE.Vector3() }, uFill: { value: new THREE.Vector3() },
    uPhone: { value: 1 }, uScroll: { value: 0 }, uSun: { value: new THREE.Vector2(0.3, 0.2) },
    uSK: { value: new THREE.Vector4(SK.u0, SK.v0, 1 / (SK.u1 - SK.u0), 1 / (SK.v1 - SK.v0)) },
    uFall: { value: new THREE.Vector3(0, -1, 0.9) },
    uAIn: { value: ACES_IN }, uAOut: { value: ACES_OUT }, uAInInv: { value: ACES_IN_INV }, uAOutInv: { value: ACES_OUT_INV }, uVigA: { value: 0.62 }, uVigK: { value: 0.7 },
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false }));
  quad.frustumCulled = false; quad.renderOrder = 0;
  scene.add(quad);
  const vigEl = typeof document !== 'undefined' ? document.getElementById('vignette') : null;

  // ---- lashes: upper lashes in clumps of 3-6 rooted along the margin, sparser and shorter lower lashes
  const R = rng(seed * 101 + 9);
  const lashes = [];
  for (let c = 0; c < 44; c++) {
    const tc = 0.07 + 0.89 * Math.pow((c + R() * 0.7) / 44, 0.95);
    const n = 2 + Math.floor(R() * 4);
    const len = (0.22 + 0.2 * smooth((tc - 0.05) / 0.5) - 0.08 * smooth((tc - 0.86) / 0.14)) * (0.85 + 0.3 * R());
    const fan = lerp(-0.45, 0.85, tc) + (R() - 0.5) * 0.2;                   // inner lashes lean in, outer fan out
    const curl = 2.0 + R() * 0.7, tip = (R() - 0.5) * 0.015;               // the clump's tips converge
    for (let j = 0; j < n; j++) {
      const stray = R() < 0.06;
      lashes.push({ up: true, t: clamp(tc + (R() - 0.5) * 0.022), row: R() * 0.006, len: len * (0.7 + 0.45 * R()), fan: fan + (R() - 0.5) * (stray ? 0.6 : 0.12), conv: tip,
        w: 0.0036 + R() * 0.002, shade: 0.8 + 0.2 * R(), th0: -0.5 - R() * 0.2, curl: Math.min(curl * (0.85 + 0.3 * R()), 1.9) });
    }
  }
  for (let i = 0; i < 36; i++) {
    const t = 0.28 + 0.68 * R();
    lashes.push({ up: false, t, row: R() * 0.004, len: 0.05 + 0.06 * Math.sin(Math.PI * (t - 0.2) / 0.8) + 0.02 * R(), fan: lerp(0.2, 1.1, t) + (R() - 0.5) * 0.35,
      conv: 0, w: 0.0026 + R() * 0.0014, shade: 0.35 + 0.25 * R(), th0: -0.25 - R() * 0.2, curl: -0.7 - R() * 0.5 });
  }
  const SEG = 9;
  const nV = lashes.length * (SEG + 1) * 2;
  const lpos = new Float32Array(nV * 3), lside = new Float32Array(nV * 2), lshade = new Float32Array(nV);
  const lidx = [];
  lashes.forEach((l, i) => {
    for (let s = 0; s <= SEG; s++) {
      const v = (i * (SEG + 1) + s) * 2;
      lside.set([-1, s / SEG, 1, s / SEG], v * 2);
      lshade[v] = lshade[v + 1] = l.shade;
      if (s < SEG) lidx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  });
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
  lgeo.setAttribute('aSide', new THREE.BufferAttribute(lside, 2));
  lgeo.setAttribute('aShade', new THREE.BufferAttribute(lshade, 1));
  lgeo.setIndex(lidx);
  const lU = { uKey: U.uKey, uAmb: U.uAmb, uK: U.uK, uDefocus: { value: 1 } };
  const lmat = new THREE.ShaderMaterial({ uniforms: lU, vertexShader: LASH_VERT, fragmentShader: LASH_FRAG, transparent: true, depthTest: false, depthWrite: false });
  const lmesh = new THREE.Mesh(lgeo, lmat); lmesh.frustumCulled = false; lmesh.renderOrder = 10;
  scene.add(lmesh);

  // doomscroll: a swipe every ~1.1 s
  const RS = rng(seed + 77), swipes = Array.from({ length: 64 }, () => ({ dt: 0.7 + RS() * 0.8, amt: 0.6 + RS() * 0.9 }));
  const scrollAt = (t) => {
    let acc = 0, at = 0.25;
    for (const s of swipes) {
      if (t < at) break;
      acc += s.amt * ease.out(clamp((t - at) / 0.3));
      at += s.dt;
    }
    return acc;
  };
  // reading saccades: small rightward hops along a line, a return sweep, the occasional vertical jump
  const RC = rng(seed + 91), sacc = [];
  { let tt = 0.15, x = 0, y = 0, n = 0;
    while (tt < 40) { n++; if (n % 5 === 0) { x = 0; y = (RC() - 0.5) * 0.012; } else x += 0.008 + RC() * 0.008; sacc.push({ t: tt, x, y }); tt += 0.22 + RC() * 0.3; } }
  const saccAt = (t) => {
    let x = 0, y = 0;
    for (const s of sacc) { if (s.t > t) break; const k = smooth((t - s.t) / 0.045); x = lerp(x, s.x, k); y = lerp(y, s.y, k); }
    return [x, y];
  };
  const LA = new THREE.Vector3(0.05, -0.8, 0.6), LB = new THREE.Vector3(0.6, 0.48, 0.64), Lv = new THREE.Vector3();

  return {
    scene, camera,
    bloom: { strength: 0 },
    exposure: 1.0,
    update(lt, c) {
      const k = c.k;
      const look = opts.lookAt ?? c.dur * 0.6;
      const doBlink = opts.blink !== false;
      U.uTime.value = lt;
      // ---- camera: a slow macro push centred on the iris, a breath of float; a rack from the lashes to the iris
      const S = lerp(540, 615, ease.inOut(k));
      U.uS.value = S;
      const anchor = [1328 + noise(lt * 0.35 + 2) * 4, 548 + noise(lt * 0.3 + 7) * 3];
      U.uC.value.set(anchor[0] - 0.03 * S, anchor[1] + 0.02 * S);
      const focus = lerp(0.35, 1, smooth(prog(lt, 0.15, Math.min(1.5, look * 0.4))));
      U.uFocus.value = focus;
      lU.uDefocus.value = lerp(0.35, 1.0, focus);
      // ---- blinks: a natural one early in the phone half, then the blink into the look-up
      const blinkAt = (t0, close, open) => (lt < t0 ? 0 : lt < t0 + close ? ease.in(prog(lt, t0, t0 + close)) : 1 - ease.out(prog(lt, t0 + close + 0.02, t0 + close + 0.02 + open)));
      const early = look > 2.6 ? Math.min(1.7, look * 0.35) : -10;
      let blink = Math.max(blinkAt(early, 0.09, 0.2), 0);
      if (doBlink) blink = Math.max(blink, lt < look ? ease.in(prog(lt, look - 0.1, look - 0.01)) : 1 - ease.out(prog(lt, look + 0.03, look + 0.25)));
      // ---- gaze: reading the phone (micro-saccades), then up and to the right, toward the sunrise
      const g = ease.inOut(prog(lt, look - 0.05, look + 0.08));
      const [sx, sy] = saccAt(Math.min(lt, look));
      const drift = (s) => noise(lt * 1.3 + s) * 0.003;
      const gx = lerp(-0.02 + sx, 0.065 + noise(lt * 0.6 + 4) * 0.004, g) + drift(1);
      const gy = lerp(-0.06 + sy, 0.05, g) + drift(5);
      U.uGaze.value.set(gx, gy);
      U.uBlink.value = blink;
      U.uSquint.value = 0.35 * smooth(prog(lt, look + 0.3, look + 1.2));
      const swap = doBlink ? prog(lt, look - 0.03, look + 0.04) : smooth(prog(lt, look - 0.15, look + 0.3));
      U.uEnvK.value = swap;
      const kL = smooth(prog(lt, look - 0.02, look + 0.6));
      U.uK.value = kL;
      // ---- the phone: the feed scrolls; the light on the face follows how bright the screen is
      const scroll = scrollAt(lt);
      U.uScroll.value = scroll;
      const fr = scroll % 1;
      const flick = 0.86 + 0.06 * noise(lt * 3.1) + 0.1 * Math.max(0, noise(lt * 0.9 + 4)) - 0.14 * Math.exp(-Math.pow((fr - 0.35) / 0.12, 2)) + 0.05 * noise(lt * 11);
      U.uPhone.value = flick;
      Lv.copy(LA).lerp(LB, kL).normalize(); U.uL.value.copy(Lv);
      const keyA = [0.43, 0.45, 0.48].map((v) => v * flick), keyB = [1.4, 1.02, 0.7];
      U.uKey.value.set(...keyA.map((v, i) => lerp(v, keyB[i], kL)));
      U.uAmb.value.set(lerp(0.009, 0.075, kL), lerp(0.009, 0.052, kL), lerp(0.011, 0.045, kL));
      U.uFill.value.set(lerp(0.01, 0.04, kL), lerp(0.012, 0.03, kL), lerp(0.018, 0.026, kL));
      // the phone lights from below (falls off upward and to the left); the sun from the upper right
      U.uFall.value.set(lerp(0.3, 0.55, kL), lerp(-1.05, 0.45, kL), lerp(1.0, 0.8, kL));
      U.uSun.value.set(0.38 - 0.4 * gx, 0.28 - 0.6 * gy);
      // ---- pupil: wide in the dark with hippus and a flinch on bright cards; constricts after the light
      const rpA = 0.185 * (1 + 0.03 * noise(lt * 0.8 + 3)) - 0.012 * (flick - 0.9);
      const c1 = 1 - Math.exp(-Math.max(0, lt - look - 0.25) / 0.3);
      const c2 = 1 - Math.exp(-Math.max(0, lt - look - 1.1) / 1.2);
      U.uPupil.value = lerp(rpA, 0.1, c1) + 0.012 * c2;
      const vo = vigEl ? parseFloat(vigEl.style.opacity) : 1;
      U.uVigA.value = 0.62 * (Number.isFinite(vo) ? vo : 1) * (opts.vignetteComp ?? 1);
      // ---- lashes follow the lids: rooted at the margin, they come toward the lens and curl up (upper) or down
      const squint = U.uSquint.value;
      const toPx = (x, y) => [U.uC.value.x + x * S, U.uC.value.y + y * S];
      lashes.forEach((l, i) => {
        const [upY, loY] = lidsJS(l.t, blink, gx, gy, squint);
        const x0 = l.t * 2 - 1;
        const y0 = l.up ? upY + 0.003 + l.row : loY - 0.025 - l.row;
        // the strand leaves the margin toward the lens (a little down), then curls up (upper) or down (lower);
        // seen from the front its forward run vanishes, so it reads short and curved, overlapping the eye top.
        // Closing, the lid margin rolls down and the whole fan with it.
        const th0 = l.th0 - (l.up ? blink * 1.1 : 0);
        const L0 = l.len;
        let x = x0, y = y0, z = 0;
        const pts = [];
        for (let s = 0; s <= SEG; s++) {
          const u = s / SEG;
          pts.push([x, y, z]);
          const th = th0 + l.curl * u * (l.up ? 1 : 1);
          const ds = L0 / SEG;
          y += Math.sin(th) * ds; z += Math.cos(th) * ds;
          x += (Math.sin(l.fan) * (0.75 + 0.5 * u) + l.conv * 6 * u) * ds;
        }
        for (let s = 0; s <= SEG; s++) {
          const u = s / SEG, [xx, yy, zz] = pts[s];
          const [xa, ya] = pts[Math.max(0, s - 1)], [xb, yb] = pts[Math.min(SEG, s + 1)];
          const dx = xb - xa, dy = yb - ya, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
          // a tapering strand that widens as it comes toward the lens and leaves the focal plane
          const wv = l.w * lerp(1, 0.35, u) * 0.5 + zz * zz * 0.08 * lU.uDefocus.value + 1.1 / S;
          const [px1, py1] = toPx(xx + nx * wv, yy + ny * wv), [px2, py2] = toPx(xx - nx * wv, yy - ny * wv);
          const v = (i * (SEG + 1) + s) * 2;
          lpos[v * 3] = px1; lpos[v * 3 + 1] = py1; lpos[v * 3 + 2] = 0;
          lpos[v * 3 + 3] = px2; lpos[v * 3 + 4] = py2; lpos[v * 3 + 5] = 0;
        }
      });
      lgeo.attributes.position.needsUpdate = true;
    },
  };
});
