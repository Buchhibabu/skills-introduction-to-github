// eye_macro: an extreme close-up of a human eye. Iris with radial fibres, crypts, contraction furrows and a
// gold collarette around the pupil inside a teal-grey ciliary zone; a wet cornea whose tear film mirrors the
// world in front of it; sclera with faint vessels; lids with a lash line, a wet lower margin and the crease;
// upper and lower lashes as real strands. First the eye is lit only by a phone held below it: the cold screen
// flickers and scrolls in the reflection, the pupil is wide. At lookAt the eye blinks and looks up: the
// reflection becomes a sunrise over ridges, warm light floods the iris (a caustic crescent opposite the light)
// and the pupil constricts.
//
// opts:
//   lookAt   local seconds of the blink + look-up to the sunrise (default 60% of the shot)
//   blink    true (default) blinks on the look-up; false crossfades the reflection without a blink
//   iris     'teal' (default: teal-grey with a gold collarette) | 'amber' (warm hazel)
//   seed     texture seed (default 3)
//
// Overlays: a text card sits in the left third; the eye is centred at x ~1190 px, the left third holds only
// the soft inner corner and cheek skin (dark in the phone half, warm and soft after the look-up).
import { THREE, register, rng, noise, ease, smooth, clamp, lerp, prog } from '../kit.js';

const W = 1920, H = 1080;

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
function floatTex(data, w, h, { repeatX = false, mips = true } = {}) {
  // data: Float32 linear rgba -> 8-bit sRGB texture (so the GPU decodes it back to linear)
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  const enc = (v) => { v = clamp(v); return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255); };
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = enc(data[i * 4]); img.data[i * 4 + 1] = enc(data[i * 4 + 1]); img.data[i * 4 + 2] = enc(data[i * 4 + 2]);
    img.data[i * 4 + 3] = Math.round(clamp(data[i * 4 + 3]) * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = mips; t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
function rawTex(bytes, w, h) {
  const t = new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// iris in polar coordinates: x = angle (0..1, wraps), y = 0 at the pupil edge .. 1 at the limbus
function irisTexture(seed, kind) {
  const w = 2048, h = 512, n = lattice(seed), d = new Float32Array(w * h * 4);
  const R = rng(seed + 7);
  const crypts = Array.from({ length: 80 }, () => ({ a: R(), r: 0.22 + R() * 0.5, wa: 0.003 + R() * 0.01, wr: 0.03 + R() * 0.07, k: 0.25 + R() * 0.45 }));
  const freckles = Array.from({ length: 5 }, () => ({ a: R(), r: 0.45 + R() * 0.35, s: 0.03 + R() * 0.03 }));
  const cryptsAt = Array.from({ length: 64 }, (_, b) => crypts.filter((k) => { let da = Math.abs((b + 0.5) / 64 - k.a); da = Math.min(da, 1 - da); return da < k.wa * 1.5 + 1 / 64; }));
  const P = kind === 'amber'
    ? { oD: hex('#3b3a24'), oL: hex('#8c8a52'), iD: hex('#4a2a10'), iL: hex('#c0782c'), limb: hex('#1d1a12'), ruff: hex('#24140a') }
    : { oD: hex('#2a3d42'), oL: hex('#86a7a5'), iD: hex('#55331a'), iL: hex('#c99247'), limb: hex('#162127'), ruff: hex('#2a170a') };
  for (let y = 0; y < h; y++) {
    const r = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const a = x / w;
      const warp = (n(a * 16, r * 2 + 11, 16) - 0.5) * 1.6;
      const f1 = n(a * 256 + warp * 2, r * 3.0, 256);
      const f2 = n(a * 512 + warp * 4, r * 7.0 + 31, 256);
      const f3 = n(a * 128 + warp, r * 1.4 + 57, 128);
      const fib = clamp(0.45 * f1 + 0.33 * f2 + 0.22 * f3);
      // collarette: an irregular gold zone around the pupil
      const rc = 0.34 + 0.13 * (n(a * 12, 3.3, 12) - 0.5) + 0.05 * (f3 - 0.5);
      const inner = 1 - smooth((r - rc) / 0.12 + 0.5);
      const outer = mix3(P.oD, P.oL, Math.pow(fib, 1.25));
      const inn = mix3(P.iD, P.iL, Math.pow(fib, 0.9));
      let c = mix3(outer, inn, inner * (0.7 + 0.3 * f1));
      // gold fibres reaching out across the ciliary zone
      const reach = smooth((f2 - 0.66) / 0.22) * (1 - smooth((r - rc - 0.22) / 0.2)) * 0.45;
      c = mix3(c, P.iL, reach);
      // the collarette ridge itself is a little lighter
      c = mix3(c, mix3(P.iL, [1, 1, 1], 0.2), Math.exp(-Math.pow((r - rc) / 0.025, 2)) * 0.35 * fib);
      // crypts (dark lens-shaped pits)
      let dark = 0;
      for (const k of cryptsAt[Math.floor(a * 64)]) {
        let da = Math.abs(a - k.a); da = Math.min(da, 1 - da);
        if (da > k.wa * 1.5) continue;
        const e = Math.pow(da / k.wa, 2) + Math.pow((r - k.r) / k.wr, 2);
        if (e < 1) dark = Math.max(dark, (1 - e) * k.k);
      }
      c = c.map((v) => v * (1 - dark * 0.85));
      // contraction furrows: faint concentric rings in the outer zone
      for (const rf of [0.7, 0.79, 0.87]) c = c.map((v) => v * (1 - 0.22 * Math.exp(-Math.pow((r - rf) / 0.009, 2)) * (0.4 + 0.6 * n(a * 40, rf * 10, 40))));
      // fibre relief: overall light/dark streaks
      c = c.map((v) => v * (0.78 + 0.44 * fib) * (0.85 + 0.3 * n(a * 24, r * 0.8 + 90, 24)));
      // a few pigment freckles
      for (const f of freckles) { let da = Math.abs(a - f.a); da = Math.min(da, 1 - da); const e = (da * da) / (f.s * f.s * 0.12) + Math.pow((r - f.r) / f.s, 2); if (e < 1) c = mix3(c, P.iD, (1 - e) * 0.7); }
      // limbal ring and pupillary ruff
      c = mix3(c, P.limb, Math.pow(smooth((r - 0.8) / 0.2), 1.2));
      c = mix3(c, P.ruff, 1 - smooth(r / 0.06));
      const i = (y * w + x) * 4;
      // relief: fibres stand proud, crypts sink, the collarette is a ridge, the outer zone slopes down
      const relief = 0.5 + 0.28 * (fib - 0.5) - 0.3 * dark + 0.12 * Math.exp(-Math.pow((r - rc) / 0.04, 2)) - 0.08 * r;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = relief;
    }
  }
  return floatTex(d, w, h, { repeatX: true, mips: false });
}

// sclera in eyeball coordinates: q in [-1.15, 1.15] x [-0.62, 0.62]; faint vessels from the corners
function scleraTexture(seed) {
  const w = 1024, h = 552;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const n = lattice(seed);
  const img = g.createImageData(w, h);
  const base = hex('#ece2d6'), pink = hex('#dcb4a6'), grey = hex('#c4bbb3');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const qx = (x / w - 0.5) * 2.3, qy = (0.5 - y / h) * 1.24;
    const edge = smooth((Math.abs(qx) - 0.45) / 0.6);
    let col = mix3(base, pink, edge * 0.55 * (0.6 + 0.8 * n(x / 60, y / 60)));
    col = mix3(col, grey, 0.15 * n(x / 25 + 9, y / 25));
    const enc = (v) => Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
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
      if (Math.hypot(qx, qy) < 0.47) return;
      g.strokeStyle = `rgba(${160 + R() * 40},${60 + R() * 25},${55 + R() * 20},${0.08 + 0.14 * wdt / 3})`;
      g.lineWidth = wdt; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny; ang += (R() - 0.5) * 0.5; wdt = Math.max(0.5, wdt * 0.985);
      if (depth < 3 && R() < 0.05) vessel(x, y, ang + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.6), wdt * 0.7, len * 0.5, depth + 1);
    }
  };
  for (let k = 0; k < 6; k++) {
    const left = k % 2 === 0;
    vessel(left ? R() * 40 : w - R() * 40, h * (0.3 + R() * 0.4), left ? (R() - 0.5) * 0.7 : Math.PI + (R() - 0.5) * 0.7, 1.0 + R() * 1.0, 40 + R() * 40, 0);
  }
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const bg = b.getContext('2d'); bg.filter = 'blur(1.2px)'; bg.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(b);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// skin in eye space: u in [SK.u0, SK.u1], v in [SK.v0, SK.v1]. Baked height = the broad forms (lid crease and
// the fold above it, the lower-lid roll and the cheek, the slope to the nose) + fine lines + pores; RG = normal,
// B = albedo modulation, A = cavity. The lid margins themselves are shaded live in the shader (they move).
const SK = { u0: -1.75, u1: 1.05, v0: -0.8, v1: 0.8, w: 1536, h: 878 };
function skinTexture(seed, lidUpJS, lidLoJS) {
  const { w, h } = SK, n = lattice(seed), hgt = new Float32Array(w * h), alb = new Float32Array(w * h);
  const R = rng(seed + 11);
  const U = (x) => SK.u0 + (x / (w - 1)) * (SK.u1 - SK.u0), V = (y) => SK.v0 + (y / (h - 1)) * (SK.v1 - SK.v0);   // row 0 = bottom
  const px = (SK.u1 - SK.u0) / w;               // units per texel
  for (let y = 0; y < h; y++) {
    const v = V(y);
    for (let x = 0; x < w; x++) {
      const u = U(x);
      const t = clamp((u + 1) / 2), up = lidUpJS(t, 0, 0, 0), lo = lidLoJS(t, 0, 0);
      const wl = 1 - smooth((Math.abs(u) - 0.92) / 0.22);         // lid features fade past the corners
      const dU = v - up, dL = lo - v;
      let ht = 0;
      // broad: the eyeball dome under the lids, the brow above, the cheek below, the nose slope on the left
      ht += 0.2 * Math.exp(-(u * u) / 1.6 - (v * v) / 0.7);
      ht += 0.06 * smooth((v - 0.55) / 0.4) - 0.05 * smooth((-u - 1.2) / 0.6);
      if (dU > 0) {
        ht += wl * (0.035 * Math.exp(-Math.pow((dU - 0.07) / 0.07, 2))                 // the convex lid
          - 0.06 * Math.exp(-Math.pow((dU - 0.205 - 0.03 * u) / 0.028, 2))             // the crease
          + 0.05 * smooth((dU - 0.22 - 0.03 * u) / 0.12));                             // the fold above it
      }
      if (dL > 0) {
        ht += wl * (0.03 * Math.exp(-Math.pow((dL - 0.06) / 0.05, 2))                  // lower lid roll
          - 0.025 * Math.exp(-Math.pow((dL - 0.19) / 0.05, 2)))                        // lid-cheek junction
          + 0.05 * smooth((dL - 0.2) / 0.5);
      }
      // fine lines: a few crow's feet at the outer corner, soft lines under the eye and on the lid
      const ox = u - 1.0, oy = v - 0.03, rr = Math.hypot(ox, oy), an = Math.atan2(oy, ox);
      if (ox > 0.02) ht -= 0.006 * Math.pow(Math.max(0, Math.sin(an * 7 + (n(rr * 4, 1) - 0.5) * 2.5)), 24) * smooth((rr - 0.1) / 0.15);
      if (dL > 0.05 && Math.abs(u) < 1.2) ht -= 0.0025 * Math.pow(Math.max(0, Math.sin(dL * 30 + (n(u * 3, 2) - 0.5) * 6)), 22) * smooth((n(u * 2.5 + 7, dL * 4) - 0.35) / 0.3) * (1 - smooth((dL - 0.35) / 0.2)) * wl;
      // skin grain
      ht += ((n(x / 2.2, y / 2.2) - 0.5) * 0.0012 + (n(x / 7 + 50, y / 7) - 0.5) * 0.002);
      hgt[y * w + x] = ht;
      alb[y * w + x] = 0.5 + (n(x / 60 + 9, y / 60) - 0.5) * 0.3 + (n(x / 16 + 3, y / 16 + 7) - 0.5) * 0.14;
    }
  }
  // pores (fewer and softer on the thin lid skin)
  for (let k = 0; k < 9000; k++) {
    const x = Math.floor(R() * w), y = Math.floor(R() * h), r = 1 + Math.floor(R() * 2), dep = (0.0006 + R() * 0.0009);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const f = 1 - (i * i + j * j) / ((r + 0.6) * (r + 0.6)); if (f > 0) hgt[yy * w + xx] -= dep * f;
    }
  }
  for (let k = 0; k < 60; k++) {
    const x = R() * w, y = R() * h, r = 2 + R() * 5;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = Math.floor(x + i), yy = Math.floor(y + j); if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const f = 1 - (i * i + j * j) / (r * r); if (f > 0) alb[yy * w + xx] -= 0.1 * f;
    }
  }
  const out = new Uint8Array(w * h * 4);
  const sc = 1 / (2 * px) * 0.5;               // slope -> normal xy (exaggerated a touch)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const hx = (hgt[y * w + Math.min(w - 1, x + 1)] - hgt[y * w + Math.max(0, x - 1)]) * sc;
    const hy = (hgt[Math.min(h - 1, y + 1) * w + x] - hgt[Math.max(0, y - 1) * w + x]) * sc;
    out[i * 4] = Math.round(clamp(0.5 - hx * 0.5) * 255);
    out[i * 4 + 1] = Math.round(clamp(0.5 - hy * 0.5) * 255);
    out[i * 4 + 2] = Math.round(clamp(alb[i]) * 255);
    // cavity: local depth vs a blurred neighbourhood (pores and lines darken)
    let m = 0; for (const [a, b] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) m += hgt[clamp(y + b, 0, h - 1) * w + clamp(x + a, 0, w - 1)];
    out[i * 4 + 3] = Math.round(clamp(0.75 + (hgt[i] - m / 4) * 120) * 255);
  }
  return rawTex(out, w, h);
}

// ---------------------------------------------------------------- lid curves (JS mirror of the shader)
// t = 0 at the inner corner (screen left), 1 at the outer corner. Eye units: the opening is 2 wide.
const K_UP = Math.log(0.5) / Math.log(0.45), K_LO = Math.log(0.5) / Math.log(0.56);
function lidUpJS(t, blink, gy, gx) {
  const y0 = lerp(-0.02, 0.045, t);
  const up = y0 + (0.335 + 0.3 * gy) * Math.pow(Math.sin(Math.PI * Math.pow(clamp(t), K_UP)), 0.82) + 0.04 * gx * Math.sin(Math.PI * t);
  const lo = lidLoJS(t, blink, gy);
  return lerp(up, lo + 0.012, blink);
}
function lidLoJS(t, blink, gy) {
  const y0 = lerp(-0.02, 0.045, t);
  return y0 - (0.29 - 0.12 * gy - 0.035 * blink) * Math.pow(Math.sin(Math.PI * Math.pow(clamp(t), K_LO)), 0.9);
}
const GLSL_LIDS = /* glsl */`
const float K_UP = ${K_UP.toFixed(6)}; const float K_LO = ${K_LO.toFixed(6)};
float lidLo(float t, float blink, float gy){
  float y0 = mix(-0.02, 0.045, t);
  return y0 - (0.29 - 0.12 * gy - 0.035 * blink) * pow(sin(3.14159265 * pow(clamp(t, 0.0, 1.0), K_LO)), 0.9);
}
float lidUp(float t, float blink, float gy, float gx){
  float y0 = mix(-0.02, 0.045, t);
  float up = y0 + (0.335 + 0.3 * gy) * pow(sin(3.14159265 * pow(clamp(t, 0.0, 1.0), K_UP)), 0.82) + 0.04 * gx * sin(3.14159265 * t);
  return mix(up, lidLo(t, blink, gy) + 0.012, blink);
}`;

// ---------------------------------------------------------------- the eye shader
const VERT = /* glsl */`void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */`
precision highp float;
uniform vec2 uC; uniform float uS;
uniform vec2 uGaze; uniform float uBlink; uniform float uPupil; uniform float uK; uniform float uEnvK; uniform float uTime;
uniform sampler2D uIris; uniform sampler2D uScl; uniform sampler2D uSkin;
uniform vec3 uL; uniform vec3 uKey; uniform vec3 uAmb;
uniform float uPhone; uniform float uScroll; uniform vec2 uSun;
uniform vec4 uSK;          // skin texture domain u0, v0, 1/(u1-u0), 1/(v1-v0)
uniform vec3 uFall;        // key-light falloff across the frame: direction xy, amount
${GLSL_LIDS}
const float RI = 0.40;      // iris radius
const float RC = 0.56;      // cornea curvature
const float RE = 0.9;       // eyeball

float h1(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

// what the tear film mirrors: a phone in a dark room, then the sunrise
vec3 env(vec3 R){
  float ax = R.x / max(R.z, 0.05), ay = R.y / max(R.z, 0.05);
  vec3 a = vec3(0.008, 0.009, 0.013);
  if (uEnvK < 1.0){
    vec2 pc = vec2(0.05, -0.5), hs = vec2(0.16, 0.3);
    vec2 d = abs(vec2(ax, ay) - pc) - hs + 0.05;
    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.05;
    float ph = smoothstep(0.02, -0.01, sd);
    vec2 sp = (vec2(ax, ay) - pc) / hs;
    float row = sp.y * 1.4 + uScroll;
    float fr = fract(row), id = floor(row);
    float content = mix(1.0, 0.45 + 0.55 * h1(id * 7.31), step(0.1, fr) * step(fr, 0.6));
    content *= 1.0 - 0.4 * step(0.68, fr) * step(fr, 0.72) * step(abs(sp.x + 0.2), 0.6);
    content = mix(content, 0.55, step(0.84, sp.y));
    a += vec3(0.72, 0.84, 1.0) * (6.0 * content * ph + 0.45 * exp(-max(sd, 0.0) / 0.1)) * uPhone;
  }
  vec3 b = vec3(0.0);
  if (uEnvK > 0.0){
    float hz = 0.03 + 0.035 * sin(ax * 6.0 + 1.3) + 0.018 * sin(ax * 15.0 + 0.4);
    float hz2 = 0.08 + 0.04 * sin(ax * 4.0 - 0.7) + 0.02 * sin(ax * 11.0 + 2.0);
    vec3 sky = mix(vec3(1.0, 0.6, 0.3) * 2.4, vec3(0.8, 0.8, 0.9) * 1.0, smoothstep(0.05, 0.9, ay));
    float sd2 = length(vec2(ax, ay) - uSun);
    sky += vec3(1.0, 0.72, 0.4) * exp(-sd2 / 0.08) * 9.0 + vec3(1.0, 0.93, 0.78) * smoothstep(0.042, 0.032, sd2) * 60.0;
    b = sky;
    b = mix(b, mix(sky, vec3(0.6, 0.34, 0.22), 0.7), smoothstep(0.012, -0.012, ay - hz2));
    b = mix(b, vec3(0.16, 0.1, 0.07), smoothstep(0.014, -0.014, ay - hz));
  }
  return mix(a, b, uEnvK);
}

void main(){
  vec2 p = (gl_FragCoord.xy - uC) / uS;
  float aa = 1.3 / uS;
  float t = clamp((p.x + 1.0) * 0.5, 0.0, 1.0);
  float up = lidUp(t, uBlink, uGaze.y, uGaze.x), lo = lidLo(t, uBlink, uGaze.y);
  float inX = smoothstep(1.0 + aa, 1.0 - aa, abs(p.x));
  float open = smoothstep(-aa, aa, up - p.y) * smoothstep(-aa, aa, p.y - lo) * inX * step(0.002, up - lo);
  vec3 L = normalize(uL);
  float dUp = up - p.y, dLo = p.y - lo;

  // ---------------- eyeball
  vec3 eye = vec3(0.0);
  if (open > 0.0){
    vec2 q = p - (vec2(0.02, 0.0) + uGaze);
    float r = length(q);
    vec3 scl = texture2D(uScl, vec2((p.x - uGaze.x) / 2.3 + 0.5, (p.y - uGaze.y) / 1.24 + 0.5)).rgb;
    vec3 Ne = normalize(vec3(q, sqrt(max(RE * RE - r * r, 0.02))));
    // the lid and lashes shade the top of the eyeball, the lower lid a little; the corners turn away
    float aoUp = mix(0.22, 1.0, smoothstep(0.0, 0.16, dUp));
    float aoLo = mix(0.55, 1.0, smoothstep(0.0, 0.06, dLo));
    float ao = aoUp * aoLo * mix(0.5, 1.0, smoothstep(1.0, 0.5, abs(p.x)));
    eye = scl * (uAmb * 1.3 + uKey * (0.2 + 0.8 * max((dot(Ne, L) + 0.25) / 1.25, 0.0))) * mix(0.62, 0.8, uK) * mix(0.5, 1.0, smoothstep(0.25, 0.85, Ne.z));
    if (r < RI + 0.03){
      float rr = clamp((r - uPupil) / (RI - uPupil), 0.0, 1.0);
      float ang = atan(q.y, q.x) / 6.2831853 + 0.5;
      vec4 ia = texture2D(uIris, vec2(ang, 1.0 - rr));
      vec3 ir = ia.rgb;
      // fibre relief from the height channel (screen-space slope), on a shallow cone toward the pupil
      vec2 g = vec2(dFdx(ia.a), dFdy(ia.a)) * 6.0;
      vec3 Ni = normalize(vec3(q * 0.5 - g, 1.0));
      vec3 lit = ir * (uAmb * 1.4 + uKey * (0.15 + 0.85 * max(dot(Ni, L), 0.0))) * (0.75 + 0.5 * ia.a);
      // the cornea focuses the light into a crescent on the far side of the iris
      vec2 l2 = normalize(L.xy + vec2(1e-4));
      float caus = smoothstep(0.05, 0.95, dot(-q / max(r, 1e-3), l2)) * smoothstep(0.35 * RI, 0.8 * RI, r) * smoothstep(RI * 1.02, RI * 0.78, r);
      lit += ir * uKey * caus * (0.3 + 2.2 * uK);
      eye = mix(eye, lit, smoothstep(RI + 0.012, RI - 0.008, r));
      eye = mix(vec3(0.0025), eye, smoothstep(uPupil - 0.007, uPupil + 0.004, r));
    }
    eye *= ao * clamp(1.0 + dot(p, uFall.xy) * uFall.z * 0.7, 0.5, 1.5);
    // the tear film mirrors: sharply on the cornea, softer on the sclera; the lid hides part of the world
    vec3 Nc = r < RI * 1.05 ? normalize(vec3(q, sqrt(max(RC * RC - r * r, 0.0)))) : Ne;
    vec3 Rf = vec3(2.0 * Nc.z * Nc.x, 2.0 * Nc.z * Nc.y, 2.0 * Nc.z * Nc.z - 1.0);
    float fres = 0.035 + 0.5 * pow(1.0 - Nc.z, 4.0);
    float lidOcc = smoothstep(0.0, 0.09, dUp) * smoothstep(0.0, 0.025, dLo);
    eye += env(Rf) * fres * (r < RI * 1.05 ? 1.0 : 0.06) * lidOcc;
    // the pink caruncle in the inner corner
    float cd = length((p - vec2(-0.94, -0.012)) * vec2(0.85, 1.35));
    float car = smoothstep(0.1, 0.045, cd);
    vec3 carC = vec3(0.36, 0.12, 0.11) * (uAmb * 2.2 + uKey * (0.5 + 0.4 * max(dot(normalize(vec3(p - vec2(-0.955, -0.012), 0.06)), L), 0.0)));
    eye = mix(eye, carC + uKey * 0.08 * smoothstep(0.03, 0.0, abs(cd - 0.035)), car * 0.85);
  }

  // ---------------- skin and lids
  vec3 skin = vec3(0.0);
  if (open < 1.0){
    vec2 kuv = (p - uSK.xy) * uSK.zw;
    // macro depth of field: the skin softens away from the iris plane
    float defocus = clamp(length((p - vec2(0.05, -0.02)) * vec2(0.75, 1.2)) * 5.5 - 2.3, 0.0, 5.5);
    vec4 sk = texture2D(uSkin, kuv, defocus);
    float inL = smoothstep(1.12, 0.8, abs(p.x));
    // live lid margins: the rounded edge, the lash line, the wet lower rim
    float mU = smoothstep(0.05, 0.0, -dUp) * step(0.0, -dUp) * inL;    // just above the upper lid line
    float mL = smoothstep(0.045, 0.0, dLo * -1.0) * step(dLo, 0.0) * inL;
    float sL = -dLo;
    float wet = exp(-pow((sL - 0.006) / 0.006, 2.0)) * smoothstep(0.03, 0.16, t) * smoothstep(1.0, 0.9, t);
    vec3 N = normalize(vec3((sk.r - 0.5) * 2.0, (sk.g - 0.5) * 2.0 - 0.55 * mU + 0.55 * mL, 1.0));
    vec3 base = vec3(0.56, 0.34, 0.26) * (0.84 + 0.32 * sk.b);
    base = mix(base, vec3(0.6, 0.27, 0.23), max(mU, mL) * 0.6);
    base *= mix(1.0, 0.86, smoothstep(0.05, 0.25, sL) * (1.0 - smoothstep(0.3, 0.55, sL)) * step(p.y, 0.05));
    float cav = mix(0.5, 1.08, sk.a);
    float wrap = max((dot(N, L) + 0.4) / 1.4, 0.0);
    float fall = clamp(1.0 + dot(p, uFall.xy) * uFall.z, 0.2, 1.6);
    skin = base * (uAmb * 1.25 + uKey * wrap * fall) * cav;
    skin += base * uKey * vec3(0.22, 0.05, 0.02) * (1.0 - abs(dot(N, L)));                 // a little subsurface warmth
    skin *= 1.0 - 0.85 * smoothstep(0.03, 0.0, -dUp) * step(0.0, -dUp) * smoothstep(0.02, 0.12, t) * smoothstep(1.0, 0.9, t);   // lash line
    vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
    float gloss = 0.05 + 0.08 * mU;
    skin += uKey * (pow(max(dot(N, Hh), 0.0), 28.0) * gloss + wet * 1.1 * pow(max(dot(normalize(vec3(0.0, 0.75, 0.66)), Hh), 0.0), 6.0));
  }
  gl_FragColor = vec4(mix(skin, eye, open), 1.0);
}`;

// ---------------------------------------------------------------- lashes (strands in screen space)
const LASH_VERT = /* glsl */`
attribute vec2 aSide;          // across (-1..1), along (0 root .. 1 tip)
attribute float aShade;
varying vec2 vSide; varying float vShade;
void main(){ vSide = aSide; vShade = aShade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LASH_FRAG = /* glsl */`
precision highp float;
uniform vec3 uKey; uniform vec3 uAmb; uniform float uK;
varying vec2 vSide; varying float vShade;
void main(){
  float soft = mix(0.55, 0.0, vSide.y);                    // tips drift out of the focal plane
  float a = smoothstep(1.0, soft, abs(vSide.x)) * mix(1.0, 0.2, pow(vSide.y, 1.4)) * smoothstep(0.0, 0.12, vSide.y) * vShade;
  vec3 c = vec3(0.02, 0.014, 0.012) + uAmb * 0.04 + uKey * (0.05 + 0.12 * uK) * smoothstep(0.2, 1.0, vSide.x) * vSide.y;
  gl_FragColor = vec4(c, a);
}`;

register('eye_macro', (opts) => {
  const seed = opts.seed ?? 3;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, W, H, 0, -10, 10);
  const irisT = irisTexture(seed, opts.iris === 'amber' ? 'amber' : 'teal');
  const sclT = scleraTexture(seed + 1);
  const skinT = skinTexture(seed + 2, lidUpJS, lidLoJS);
  const U = {
    uC: { value: new THREE.Vector2(1190, 545) }, uS: { value: 640 },
    uGaze: { value: new THREE.Vector2() }, uBlink: { value: 0 }, uPupil: { value: 0.18 }, uK: { value: 0 }, uEnvK: { value: 0 }, uTime: { value: 0 },
    uIris: { value: irisT }, uScl: { value: sclT }, uSkin: { value: skinT },
    uL: { value: new THREE.Vector3(0, -0.5, 0.85) }, uKey: { value: new THREE.Vector3() }, uAmb: { value: new THREE.Vector3() },
    uPhone: { value: 1 }, uScroll: { value: 0 }, uSun: { value: new THREE.Vector2(0.3, 0.2) },
    uSK: { value: new THREE.Vector4(SK.u0, SK.v0, 1 / (SK.u1 - SK.u0), 1 / (SK.v1 - SK.v0)) },
    uFall: { value: new THREE.Vector3(0, -1, 0.9) },
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false }));
  quad.frustumCulled = false; quad.renderOrder = 0;
  scene.add(quad);

  // ---- lashes: upper lashes in clumps of 2-5 (three loose rows), sparser lower lashes
  const R = rng(seed * 101 + 9);
  const lashes = [];
  for (let c = 0; c < 52; c++) {
    const tc = 0.04 + 0.94 * Math.pow((c + R() * 0.8) / 52, 0.92);
    const side = Math.abs(tc - 0.47) * 2;                       // 0 in the middle, 1 at the corners
    const n = 2 + Math.floor(R() * 3);
    const len = (0.12 + 0.2 * side + 0.08 * Math.sin(Math.PI * tc)) * (tc < 0.15 ? 0.7 : 1) * (0.8 + 0.4 * R());
    const tilt = lerp(-0.85, 1.05, tc) + (R() - 0.5) * 0.25;
    for (let j = 0; j < n; j++) {
      const stray = R() < 0.07;
      lashes.push({ up: true, t: clamp(tc + (R() - 0.5) * 0.024), row: R() * 0.02, len: len * (0.65 + 0.5 * R()), tilt: tilt + (R() - 0.5) * (stray ? 0.8 : 0.16),
        conv: (R() - 0.5) * 0.015, w: 0.005 + R() * 0.003, shade: 0.7 + 0.3 * R(), dip: 0.03 + R() * 0.035 * (1 - side * 0.5), curl: 0.7 + R() * 0.5 });
    }
  }
  for (let i = 0; i < 40; i++) {
    const t = 0.25 + 0.72 * R();
    lashes.push({ up: false, t, row: R() * 0.012, len: 0.06 + 0.1 * Math.sin(Math.PI * t) + 0.03 * R(), tilt: lerp(-0.2, 0.7, t) + (R() - 0.5) * 0.35,
      conv: 0, w: 0.004 + R() * 0.002, shade: 0.45 + 0.3 * R(), dip: 0.0, curl: 0.4 + R() * 0.3 });
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
  const lmat = new THREE.ShaderMaterial({ uniforms: { uKey: U.uKey, uAmb: U.uAmb, uK: U.uK }, vertexShader: LASH_VERT, fragmentShader: LASH_FRAG, transparent: true, depthTest: false, depthWrite: false });
  const lmesh = new THREE.Mesh(lgeo, lmat); lmesh.frustumCulled = false; lmesh.renderOrder = 10;
  scene.add(lmesh);

  // doomscroll: a swipe every ~1.2 s
  const RS = rng(seed + 77), swipes = Array.from({ length: 64 }, () => ({ dt: 0.8 + RS() * 0.9, amt: 0.6 + RS() * 0.9 }));
  const scrollAt = (t) => {
    let acc = 0, at = 0.3;
    for (const s of swipes) {
      if (t < at) break;
      acc += s.amt * ease.out(clamp((t - at) / 0.32));
      at += s.dt;
    }
    return acc;
  };

  return {
    scene, camera,
    bloom: { strength: 0 },
    exposure: 1.0,
    update(lt, c) {
      const k = c.k;
      const look = opts.lookAt ?? c.dur * 0.6;
      const doBlink = opts.blink !== false;
      U.uTime.value = lt;
      // ---- camera: a slow macro push with the faintest float
      const S = lerp(880, 950, ease.inOut(k));
      U.uS.value = S;
      U.uC.value.set(1250 + noise(lt * 0.35 + 2) * 5 - 16 * k, 560 + noise(lt * 0.3 + 7) * 4);
      // ---- blink, gaze, light
      const blink = doBlink ? (lt < look ? ease.in(prog(lt, look - 0.1, look - 0.02)) : 1 - ease.out(prog(lt, look + 0.03, look + 0.24))) : 0;
      const g = ease.inOut(prog(lt, look - 0.04, look + 0.05));
      const micro = (s) => noise(lt * 2.7 + s) * 0.004 + (Math.floor(lt * 1.7 + s) % 3 === 0 ? 0.003 : 0);
      const gx = lerp(-0.012, 0.06, g) + micro(1), gy = lerp(-0.055, 0.05, g) + micro(5);
      U.uGaze.value.set(gx, gy);
      U.uBlink.value = blink;
      const swap = doBlink ? prog(lt, look - 0.03, look + 0.04) : smooth(prog(lt, look - 0.15, look + 0.3));
      U.uEnvK.value = swap;
      const kL = smooth(prog(lt, look - 0.02, look + 0.7));
      U.uK.value = kL;
      // phone light: flickers with the content; the sunrise is warm, from the upper right
      const scroll = scrollAt(lt);
      U.uScroll.value = scroll;
      const flick = 0.88 + 0.08 * noise(lt * 3.1) + 0.1 * Math.max(0, noise(lt * 0.9 + 4)) - 0.12 * clamp(scroll % 1 < 0.15 ? 1 : 0);
      U.uPhone.value = flick;
      const LA = new THREE.Vector3(0.04, -0.78, 0.62), LB = new THREE.Vector3(0.6, 0.48, 0.64);
      U.uL.value.copy(LA).lerp(LB, kL).normalize();
      const keyA = [0.24, 0.29, 0.38].map((v) => v * flick), keyB = [1.5, 1.1, 0.74];
      U.uKey.value.set(...keyA.map((v, i) => lerp(v, keyB[i], kL)));
      U.uAmb.value.set(lerp(0.022, 0.17, kL), lerp(0.025, 0.12, kL), lerp(0.034, 0.1, kL));
      // the phone lights from below (falls off upward); the sun from the upper right
      U.uFall.value.set(lerp(0.0, 0.55, kL), lerp(-1.0, 0.65, kL), lerp(1.5, 0.7, kL));
      U.uSun.value.set(0.3 - 0.4 * gx, 0.2 - 0.6 * gy);
      // ---- pupil: wide in the dark, hippus with the screen; constricts after the light, then eases back a little
      const rpA = 0.19 * (1 + 0.03 * noise(lt * 0.8 + 3)) - 0.008 * (flick - 0.9);
      const c1 = 1 - Math.exp(-Math.max(0, lt - look - 0.22) / 0.33);
      const c2 = 1 - Math.exp(-Math.max(0, lt - look - 1.1) / 1.2);
      U.uPupil.value = lerp(rpA, 0.105, c1) + 0.012 * c2;
      // ---- lashes follow the lids
      const toPx = (x, y) => [U.uC.value.x + x * S, U.uC.value.y + y * S];
      lashes.forEach((l, i) => {
        const y0 = l.up ? lidUpJS(l.t, blink, gy, gx) + l.row * 0.5 : lidLoJS(l.t, blink, gy) - l.row;
        const x0 = l.t * 2 - 1;
        const sg = l.up ? 1 : -1;
        const L0 = l.len * (l.up ? lerp(1, 0.6, blink) : 1);
        const st = Math.sin(l.tilt), ct = Math.cos(l.tilt);
        // root -> forward and a little down over the eye (foreshortened) -> curls up and out
        const P1 = [x0 + st * L0 * 0.12, y0 - sg * l.dip];
        const P2 = [x0 + st * L0 * 0.55 + l.conv, y0 - sg * l.dip * 0.6 + sg * ct * L0 * 0.25 * l.curl];
        const P3 = [x0 + st * L0 * 0.8 + l.conv, y0 + sg * ct * L0 * (l.up ? lerp(0.75, -0.2, blink) : 0.7)];
        for (let s = 0; s <= SEG; s++) {
          const u = s / SEG, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, cc = 3 * (1 - u) * u * u, d = u ** 3;
          const x = a * x0 + b * P1[0] + cc * P2[0] + d * P3[0], y = a * y0 + b * P1[1] + cc * P2[1] + d * P3[1];
          const dx = 3 * (1 - u) ** 2 * (P1[0] - x0) + 6 * (1 - u) * u * (P2[0] - P1[0]) + 3 * u * u * (P3[0] - P2[0]);
          const dy = 3 * (1 - u) ** 2 * (P1[1] - y0) + 6 * (1 - u) * u * (P2[1] - P1[1]) + 3 * u * u * (P3[1] - P2[1]);
          const dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
          const wv = l.w * lerp(1, 0.3, u) * 0.5 * (1 + 3.2 * u * u * (l.up ? 1 : 0.4)) + 1.0 / S;   // widens as it defocuses
          const [px1, py1] = toPx(x + nx * wv, y + ny * wv), [px2, py2] = toPx(x - nx * wv, y - ny * wv);
          const v = (i * (SEG + 1) + s) * 2;
          lpos[v * 3] = px1; lpos[v * 3 + 1] = py1; lpos[v * 3 + 2] = 0;
          lpos[v * 3 + 3] = px2; lpos[v * 3 + 4] = py2; lpos[v * 3 + 5] = 0;
        }
      });
      lgeo.attributes.position.needsUpdate = true;
    },
  };
});
