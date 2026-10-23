// server_hall: an endless data-centre aisle. Two walls of black racks covered in thousands of tiny
// status LEDs recede into haze; cable trays overhead, linear fixtures throwing soft shafts, roof trusses and
// ducts high above, a glossy raised floor that mirrors everything (a mirrored copy of the hall under a
// semi-transparent floor).
//
// opts:
//   mode    'dolly' (default)  slow push down the aisle with a slight crane. The camera sits right of the aisle
//                              centre and looks a little left, so the vanishing point (and the bright haze and
//                              fixture line) sits at ~65 % of frame width and the dimmed left wall fills the left
//                              half: a document over the left half sits on calm, dark racks.
//           'reveal'           starts in the aisle, cranes up past the trusses and pulls back over a finite hall of
//                              many aisles (cross aisles, columns, row-end panels, cooling units on lit end walls);
//                              ease-in with a linear tail, so the camera is still travelling at the cut.
//   pulses  [lt, ...]  up to 4 local times (s); at each a wide bright wave races out along the racks from below
//                      the camera (LEDs saturate inside it, the faces, rack tops and floor light up with it)
//   speed   pulse wave speed in m/s (default 12)
//
// Rack fronts are baked once into one mipmapped DataTexture (R albedo, G specular mask, B LED intensity,
// A LED id). The shader derives each LED's colour and blink from its id and uTime, so every frame is a
// pure function of time and can be rendered in any order.
import { THREE, register, rng, noise, ease, smooth, clamp, lerp } from '../kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- baked rack atlas
// 4 rack variants side by side; each 512 px wide (0.6 m) x 2048 px tall (2.25 m).
const AW = 2048, AH = 2048, VW = 512;
function bakeRacks(seed) {
  const R = rng(seed);
  const T = new Uint8Array(AW * AH * 4);
  // write selected channels of a rectangle (null = keep)
  const rect = (x0, y0, w, h, r, g, b, a) => {
    x0 = Math.round(x0); y0 = Math.round(y0); w = Math.round(w); h = Math.round(h);
    for (let y = Math.max(0, y0); y < Math.min(AH, y0 + h); y++) {
      let i = (y * AW + Math.max(0, x0)) * 4;
      for (let x = Math.max(0, x0); x < Math.min(AW, x0 + w); x++, i += 4) {
        if (r !== null) T[i] = r;
        if (g !== null) T[i + 1] = g;
        if (b !== null) T[i + 2] = Math.max(T[i + 2], b);
        if (a !== null) T[i + 3] = a;
      }
    }
  };
  const surf = (x, y, w, h, alb, spec) => rect(x, y, w, h, alb, spec, null, null);
  const led = (x, y, w, h, id) => {
    id = id || 1 + Math.floor(R() * 250);
    rect(x - 7, y - 7, w + 14, h + 14, null, null, 0, id);                 // id dilated over the halo
    rect(x - 1, y - 1, w + 2, h + 2, null, null, 60, id);
    rect(x, y, w, h, null, null, 255, id);
  };
  for (let v = 0; v < 4; v++) {
    const X = v * VW;
    surf(X, 0, VW, AH, 14, 20);
    surf(X, 0, 26, AH, 22, 120); surf(X + VW - 26, 0, 26, AH, 22, 120);
    surf(X + 24, 0, 2, AH, 40, 255); surf(X + VW - 26, 0, 2, AH, 40, 255);
    for (let y = 6; y < 104; y += 6) surf(X + 30, y, VW - 60, 3, 6, 10);
    surf(X + 26, 1892, VW - 52, 156, 26, 90);
    surf(X + 26, 1892, VW - 52, 2, 50, 255);
    if (v !== 3) { rect(X + 190, 1955, 96, 34, 10, 40, 60, 255); for (let i = 0; i < 4; i++) rect(X + 198 + i * 22, 1963, 14, 18, null, null, 150, 255); }
    const U = 40.4, y0 = 109;
    let u = 0;
    while (u < 44) {
      const kind = v === 2 ? (R() < 0.75 ? 'switch' : 'patch') : v === 1 ? 'storage' : (v === 3 ? 'gpu' : (R() < 0.45 ? 'c1' : 'c2'));
      let size = { switch: 1, patch: 1, storage: 2, gpu: 4, c1: 1, c2: 2 }[kind];
      if (u + size > 44) size = 44 - u;
      const by = y0 + u * U, bh = size * U;
      if (R() < (v === 2 ? 0.10 : 0.05)) {
        surf(X + 26, by, VW - 52, bh, 10, 20);
        surf(X + 26, by + bh - 2, VW - 52, 1, 24, 120);
        u += size; continue;
      }
      const base = 24 + Math.floor(R() * 12);
      surf(X + 26, by + 1, VW - 52, bh - 2, base, 70);
      surf(X + 26, by + bh - 3, VW - 52, 2, base + 24, 255);
      surf(X + 26, by, VW - 52, 1, 4, 0);
      surf(X + 28, by + 3, 14, bh - 6, base + 14, 200);
      surf(X + VW - 42, by + 3, 14, bh - 6, base + 14, 200);
      if (kind === 'switch') {
        for (let row = 0; row < 2; row++) for (let i = 0; i < 24; i++) {
          const px = X + 62 + i * 15.5 + Math.floor(i / 6) * 4, py = by + 6 + row * 17;
          surf(px, py, 11, 9, 4, 0);
          led(px + 1 + (row ? 0 : 6), py + (row ? -3 : 10), 3, 2);
        }
        led(X + 470, by + 26, 4, 3); led(X + 470, by + 14, 4, 3);
      } else if (kind === 'patch') {
        for (let i = 0; i < 24; i++) surf(X + 62 + i * 16, by + 14, 11, 12, 6, 0);
        for (let i = 0; i < 24; i++) if (R() < 0.6) surf(X + 63 + i * 16, by + 2, 9, bh - 4, 8 + Math.floor(R() * 30), 30);
      } else if (kind === 'storage') {
        for (let i = 0; i < 12; i++) {
          const dx = X + 48 + i * 35.5;
          surf(dx, by + 4, 1, bh - 8, 6, 0);
          for (let y = by + 18; y < by + bh - 8; y += 4) surf(dx + 4, y, 26, 2, base - 10, 30);
          led(dx + 6, by + 6, 6, 3); led(dx + 20, by + 6, 3, 3);
        }
      } else if (kind === 'gpu') {
        for (let y = by + 8; y < by + bh - 8; y += 5) for (let x = X + 140; x < X + VW - 60; x += 5) surf(x + ((y / 5) % 2) * 2, y, 3, 3, 6, 0);
        led(X + 52, by + bh - 22, 4, 4); led(X + 52, by + bh - 34, 4, 4); led(X + 64, by + bh - 22, 4, 4);
        surf(X + 50, by + 10, 70, 30, base - 6, 40);
        for (let i = 0; i < 2; i++) led(X + 56 + i * 30, by + 16, 18, 3);
        // per-GPU status column and a row of link LEDs along the bottom lip
        for (let i = 0; i < 8; i++) led(X + 130, by + 12 + i * 18, 3, 3);
        for (let i = 0; i < 10; i++) led(X + 150 + i * 30, by + bh - 7, 5, 2);
      } else {
        for (let y = by + 6; y < by + bh - 6; y += 4) for (let x = X + 190; x < X + VW - 56; x += 4) surf(x, y, 2, 2, 6, 0);
        // drive-bay activity LEDs along the lower lip of every U, a status pair on the right
        const nl = size === 2 ? 12 : 8;
        for (let i = 0; i < nl; i++) led(X + 196 + i * (size === 2 ? 21 : 31), by + bh - 8, 4, 2);
        if (size === 2) for (let i = 0; i < 6; i++) led(X + 200 + i * 42, by + 6, 3, 2);
        const nb = size === 2 ? 4 : 2;
        for (let i = 0; i < nb; i++) {
          const dx = X + 56 + (i % 2) * 64, dy = by + 4 + Math.floor(i / 2) * (bh / 2);
          surf(dx, dy, 60, bh / (size === 2 ? 2 : 1) - 8, base + 6, 60);
          led(dx + 50, dy + 3, 5, 2);
        }
        led(X + 44, by + bh / 2 - 2, 4, 3); led(X + 44, by + bh / 2 - 9, 4, 3);
        led(X + 460, by + 8, 3, 3); led(X + 452, by + 8, 3, 3);
      }
      u += size;
    }
  }
  // G = soft halo: the LED channel blurred (3 box passes ~ gaussian, radius ~7 px), replaces bloom
  const n = AW * AH;
  let a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = T[i * 4 + 2];
  const box = (src, dst, r, horiz) => {
    const inv = 1 / (2 * r + 1);
    for (let line = 0; line < AH; line++) {
      let acc = 0;
      const at = (k) => horiz ? line * AW + k : k * AW + line;
      for (let k = -r; k <= r; k++) acc += src[at(Math.min(AW - 1, Math.max(0, k)))];
      for (let k = 0; k < AW; k++) {
        dst[at(k)] = acc * inv;
        acc += src[at(Math.min(AW - 1, k + r + 1))] - src[at(Math.max(0, k - r))];
      }
    }
  };
  for (let pass = 0; pass < 2; pass++) { box(a, b, 3, true); box(b, a, 3, false); }
  for (let i = 0; i < n; i++) T[i * 4 + 1] = Math.min(255, Math.round(a[i] * 2.2));
  const t = new THREE.DataTexture(T, AW, AH, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

// floor tile texture: 2x2 tiles (1.2 m), one perforated; R albedo, G reflectivity
function bakeFloor() {
  const N = 256, buf = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const tx = x % 128, ty = y % 128;
    const tile = (x >> 7) + 2 * (y >> 7);
    let a = 150 + ((tile * 37) % 23), refl = 225;
    const seam = Math.min(tx, 127 - tx, ty, 127 - ty);
    if (seam < 1) { a = 40; refl = 50; } else if (seam < 2) { a = 190; refl = 150; }
    if (tile === 1 && seam > 7) {
      const hx = (tx - 7) % 6, hy = (ty - 7) % 6;
      if (hx > 1 && hx < 5 && hy > 1 && hy < 5) { a = 25; refl = 40; }
    }
    buf[i] = a; buf[i + 1] = refl; buf[i + 2] = 0; buf[i + 3] = 255;
  }
  const t = new THREE.DataTexture(buf, N, N, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- shaders
const COMMON = /* glsl */`
uniform float uTime;
uniform vec3 uFogLow;
uniform vec3 uFogHigh;
uniform vec3 uFogGlow;
uniform float uFogDen;
uniform vec4 uPT;          // up to four pulse times (local s); -100 = none
uniform vec3 uPO[4];       // pulse origins (camera position at the pulse)
uniform float uPSpeed;
uniform float uFixOff;
varying vec3 vW;
varying vec3 vN;
float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 fogIt(vec3 c, vec3 wp){
  c = max(c, vec3(0.0));
  vec3 dv = wp - cameraPosition;
  float d = length(dv);
  float f = 1.0 - exp(-uFogDen * d);
  float dz = max(-dv.z / max(d, 1e-4), 0.0);
  dz *= dz; dz *= dz; dz *= dz;
  vec3 fc = mix(uFogLow, uFogHigh, smoothstep(0.5, 7.0, abs(wp.y))) + uFogGlow * dz * (1.0 - smoothstep(0.0, 6.0, abs(wp.y)));
  return mix(c, fc, f);
}
vec4 fogParams(vec3 wp){
  vec3 dv = wp - cameraPosition;
  float d = length(dv);
  float dz = max(-dv.z / max(d, 1e-4), 0.0);
  dz *= dz; dz *= dz; dz *= dz;
  vec3 fc = mix(uFogLow, uFogHigh, smoothstep(0.5, 7.0, abs(wp.y))) + uFogGlow * dz * (1.0 - smoothstep(0.0, 6.0, abs(wp.y)));
  return vec4(fc, 1.0 - exp(-uFogDen * d));
}
// one wave: a crisp leading edge, a hot front and a wide soft tail behind it, fading as it travels
float band1(float dt, vec3 o, vec3 p){
  if (dt < 0.0) return 0.0;
  float x = dt * uPSpeed - length(p.xz - o.xz);       // metres behind the front
  float xp = max(x, 0.0);
  return smoothstep(-0.6, 0.0, x) * (1.8 * exp(-xp / 0.6) + 0.8 * exp(-xp / 4.0)) * exp(-dt * 0.5) * smoothstep(0.0, 0.06, dt) * (1.0 - smoothstep(16.0, 32.0, x));
}
float pulseBand(vec3 p){
  // pulses are sorted and unused slots hold -100: skip the work when nothing is running
  if (uPT.x < -50.0) return 0.0;
  float b = band1(uTime - uPT.x, uPO[0], p);
  if (uPT.y > -50.0) b += band1(uTime - uPT.y, uPO[1], p);
  if (uPT.z > -50.0) b += band1(uTime - uPT.z, uPO[2], p);
  if (uPT.w > -50.0) b += band1(uTime - uPT.w, uPO[3], p);
  return b;
}
float fixPer(float z){ float c = 0.5 + 0.5 * cos(6.2831853 * (z - uFixOff) / 2.4); return c * c; }
`;

const VERT = /* glsl */`
varying vec3 vW;
varying vec3 vN;
void main(){
#ifdef USE_INSTANCING
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
#else
  vec4 w = modelMatrix * vec4(position, 1.0);
#endif
  vW = w.xyz;
  vN = normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const RACK_VERT = /* glsl */`
uniform float uFront;
varying vec4 vFog;      // rgb fog colour, a fog amount
varying vec3 vLit;      // x diffuse, y specular, z pulse band
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normal;
  vec3 p = vec3(w.x, abs(w.y), w.z);
  vec3 n = normal;
#ifdef MIRROR
  vec3 C = vec3(cameraPosition.x, -cameraPosition.y, cameraPosition.z);
#else
  vec3 C = cameraPosition;
#endif
  vec3 V = normalize(C - p);
  bool front = n.x * uFront > 0.5;
  float lightI = abs(n.x) > 0.5 ? (front ? 1.0 : 0.22) : 0.3;
  float per = fixPer(p.z);
  float dif = lightI * (0.22 + 0.78 * smoothstep(0.1, 2.4, p.y)) * (0.5 + 0.5 * per);
  float zf = floor((p.z - uFixOff) / 2.4 + 0.5) * 2.4 + uFixOff;
  vec3 Lp = normalize(vec3(p.x + n.x * 0.9, 3.4, zf) - p);
  float spec = pow(max(dot(reflect(-V, n), Lp), 0.0), 16.0) * lightI;
  vLit = vec3(dif, spec, pulseBand(p));
  vFog = fogParams(w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const RACK_FRAG = /* glsl */`
uniform sampler2D tR;
varying vec4 vFog;
varying vec3 vLit;
uniform float uFront;
uniform float uRow;
uniform float uZ0;
uniform float uGain;
uniform float uCx;
float blink(float id, float t){
  float r = h11(id * 1.37 + 0.11);
  float r2 = h11(id * 7.13 + 3.7);
  if (r < 0.46) return 1.0;
  if (r < 0.66) return smoothstep(0.30, 0.55, abs(fract(t * (0.30 + r2 * 0.9) + r2 * 7.0) - 0.5) * 2.0);
  if (r < 0.93) return step(0.40, h11(floor(t * (1.8 + r2 * 5.0) + r2 * 31.0) * 0.1371 + id * 0.731));
  return 0.05;
}
vec3 ledCol(float id){
  float r = h11(id * 3.91 + 1.3);
  if (r < 0.035) return vec3(1.0, 0.36, 0.04);   // rare amber
  if (r < 0.040) return vec3(1.0, 0.10, 0.06);   // very rare red
  if (r < 0.45) return vec3(0.12, 1.0, 0.78);    // teal
  if (r < 0.62) return vec3(0.22, 0.45, 1.0);    // cold blue
  return vec3(0.70, 0.90, 1.0);                  // cool white
}
void main(){
  vec3 p = vec3(vW.x, abs(vW.y), vW.z);
  vec3 n = vN;
  vec3 col;
  float y = p.y;
  float dif = vLit.x, spec = vLit.y, band = vLit.z;
  if (abs(n.x) > 0.5) {
    float s = uZ0 - p.z;
    float ri = floor(s / 0.6);
    float ru = (s - ri * 0.6) / 0.6;
    float rs = h21(vec2(ri * 1.13, uRow * 7.7));
    bool front = n.x * uFront > 0.0;
    if (front) {
      float u = rs > 0.5 ? ru : 1.0 - ru;
      vec2 uv = vec2((floor(rs * 4.0) + u) * 0.25, y / 2.25);
#ifdef MIRROR
      vec4 t = texture2D(tR, uv, 0.8);
      vec4 t2 = texture2D(tR, uv + vec2(0.0, 0.018), 2.2);
      t.b = t.b * 0.7 + t2.b * 0.6;
      t.g = t.g * 0.8 + t2.g * 0.8;
#else
      vec4 t = texture2D(tR, uv);
#endif
      vec2 tp = vec2(fwidth(uv.x), fwidth(uv.y)) * 2048.0;
      float lodF = smoothstep(1.0, 3.5, log2(max(max(tp.x, tp.y), 1.0)));
      float id = floor(t.a * 255.0 + 0.5);
      float lid = id + ri * 37.0 + uRow * 101.0;
      float on = id > 254.5 ? 1.0 : blink(lid, uTime);
      vec3 lc = id > 254.5 ? vec3(0.25, 0.8, 0.72) * 0.5 : ledCol(lid);
      // a few racks are powered down or half empty: breaks the perfect regularity
      float rk = h21(vec2(ri * 2.71 + 0.3, uRow * 3.17));
      on *= rk < 0.06 ? 0.0 : (rk < 0.16 ? step(0.5, h11(lid * 0.37)) : 1.0);
      on = mix(on, 0.62 * step(0.06, rk), lodF);
      lc = mix(lc, vec3(0.30, 0.95, 0.85), lodF * 0.75);
      float bs = clamp(band, 0.0, 1.5);
      on = max(on, smoothstep(0.05, 0.35, band));
      float gain = uGain * (0.7 + 0.6 * h11(ri * 3.3 + uRow)) * (1.0 + 5.0 * bs);
      vec3 led = mix(lc, vec3(0.80, 0.97, 1.0), clamp(band, 0.0, 1.0) * 0.7) * (t.b * t.b * 0.38 + t.g * 0.7) * on * gain;
      float sm = smoothstep(0.09, 0.16, t.r);
      // brushed bezels and handles catch a soft sheen of the aisle light; strongest on the upper units
      float sheen = sm * (0.35 + 0.65 * smoothstep(0.6, 2.0, y)) * dif;
      col = vec3(0.86, 0.92, 1.0) * t.r * 0.26 * (dif * 0.8 + 0.03) + vec3(0.7, 0.85, 1.0) * (spec * 0.45 + sheen * 0.012) * sm + led;
      // the pulse washes the whole face as it passes
      col += vec3(0.35, 0.75, 1.0) * bs * (0.03 + 1.6 * t.r * t.r);
      // light strips along the top and the base of the row: dim, they carry the pulse wave
      float fy = fwidth(y) + 0.002;
      float strip = (1.0 - smoothstep(0.0, fy, abs(y - 2.105) - 0.012)) + 0.7 * (1.0 - smoothstep(0.0, fy, abs(y - 0.118) - 0.008));
      col += strip * (vec3(0.16, 0.36, 0.36) * 0.22 + vec3(0.55, 0.95, 1.0) * band * 5.0);
    } else {
      vec2 g = vec2(s, y) / vec2(0.15, 0.11);
      float hc = h21(floor(g) + uRow * 13.0);
      vec2 cl = fract(g) - 0.5;
      float glow = exp(-dot(cl, cl) * 26.0) * step(0.84, hc) * step(0.15, y) * step(y, 2.05);
      col = vec3(0.012, 0.013, 0.016) * (dif + 0.05) * step(abs(ru - 0.5), 0.46) + vec3(0.5, 0.6, 0.7) * spec * 0.04;
      col += mix(vec3(0.3, 0.9, 0.8), vec3(1.0, 0.55, 0.15), step(0.985, hc)) * glow * 0.25 * uGain;
    }
  } else if (n.y > 0.5) {
    // rack roofs seen from above: one panel per rack, a cable bundle along the back, a top-of-rack box on some
    float s = uZ0 - p.z;
    float ri = floor(s / 0.6), ru = fract(s / 0.6);
    float xr = (p.x - uCx) * uFront / 1.1 + 0.5;          // 0 at the back (hot aisle), 1 at the front
    float fz = fwidth(s) / 0.6 + 0.004;
    float seam = 1.0 - smoothstep(0.0, fz * 1.5, min(ru, 1.0 - ru) - 0.01);
    float hb = h21(vec2(ri * 1.7, uRow * 5.3));
    float box = step(0.55, hb) * step(0.12, ru) * step(ru, 0.88) * step(0.30, xr) * step(xr, 0.72);
    float cab = 1.0 - smoothstep(0.05, 0.08, abs(xr - 0.16));
    vec3 c0 = vec3(0.016, 0.017, 0.020) * (0.8 + 0.4 * hb);
    c0 = mix(c0, vec3(0.006, 0.0065, 0.007), cab * 0.8);
    c0 = mix(c0, vec3(0.030, 0.032, 0.036), box);
    c0 *= 1.0 - 0.5 * seam;
    col = c0 * (0.45 + 1.1 * fixPer(p.z)) + vec3(0.45, 0.8, 1.0) * band * (0.07 + 0.10 * seam) * (1.0 - 0.6 * cab);
    col += vec3(0.25, 0.75, 0.7) * box * step(0.9, hb) * step(abs(ru - 0.5), 0.05) * step(abs(xr - 0.66), 0.02) * 0.6;   // a status dot
  } else {
    // row-end panels: a framed end door with a small lit status display and a light bar across the top
    float xr = (p.x - uCx) / 1.1 + 0.5;
    float fw = fwidth(y) + 0.002;
    col = vec3(0.026, 0.028, 0.032) * (0.25 + 0.75 * smoothstep(0.0, 2.3, y));
    float frame = 1.0 - (step(0.06, xr) * step(xr, 0.94) * step(0.06, y) * step(y, 2.05));
    col = mix(col, vec3(0.05, 0.053, 0.058) * (0.4 + 0.6 * smoothstep(0.0, 2.3, y)), frame);
    float disp = step(0.58, xr) * step(xr, 0.88) * step(1.38, y) * step(y, 1.58);
    float lines = step(0.5, fract(y * 60.0)) * step(0.62, xr) * step(xr, 0.62 + 0.2 * h21(vec2(floor(y * 60.0), uRow)));
    col += disp * (vec3(0.05, 0.16, 0.18) + vec3(0.3, 0.85, 0.8) * lines * 0.6);
    col += vec3(0.75, 0.88, 1.0) * (1.0 - smoothstep(0.0, fw, abs(y - 2.16) - 0.012)) * step(0.04, xr) * step(xr, 0.96) * 0.9;
    col += vec3(0.5, 0.85, 1.0) * band * 0.08;
  }
#ifdef MIRROR
  col *= 0.8;
#endif
  gl_FragColor = vec4(mix(max(col, vec3(0.0)), vFog.rgb, vFog.a), 1.0);
}
`;

const FIX_FRAG = /* glsl */`
uniform float uInt;
void main(){
  vec3 p = vec3(vW.x, abs(vW.y), vW.z);
  float band = pulseBand(p);
  float down = vN.y < -0.5 ? 1.0 : 0.0;
  vec3 col = mix(vec3(0.02, 0.022, 0.026), vec3(0.85, 0.94, 1.0) * uInt * (1.0 + 0.8 * band), down);
#ifdef MIRROR
  col *= 0.18;
#endif
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;

const TRAY_FRAG = /* glsl */`
uniform float uRow;
void main(){
  vec3 p = vec3(vW.x, abs(vW.y), vW.z);
  vec3 n = vN;
  float per = fixPer(p.z);
  vec3 col;
  float fz = fwidth(p.z);
  if (abs(n.y) > 0.5) {
    float xc = fract((p.x + 50.0) / 0.5);
    float hc = h21(vec2(floor(xc * 18.0), uRow));
    vec3 cab = hc < 0.07 ? vec3(0.075, 0.055, 0.03) : (hc < 0.14 ? vec3(0.03, 0.05, 0.055) : vec3(0.018, 0.019, 0.022) * (0.8 + 0.5 * h21(vec2(floor(xc * 18.0), uRow + 3.0))));
    float rung = (1.0 - smoothstep(0.0, fz + 0.004, abs(fract(p.z / 0.3) - 0.5) * 0.3 - 0.012)) * (1.0 - smoothstep(0.3, 1.0, fz / 0.05));
    float rail = step(0.92, abs(xc - 0.5) * 2.0);
    float bundle = 0.75 + 0.25 * sin(p.z * 2.3 + hc * 20.0) * sin(p.z * 0.71 + hc * 7.0);
    col = mix(cab * bundle, vec3(0.07, 0.072, 0.075), max(rail, rung * (n.y < 0.0 ? 0.7 : 0.45)));
    col *= n.y > 0.0 ? (0.35 + 0.6 * per) : (0.6 + 1.6 * per);
    col += vec3(0.45, 0.8, 0.95) * pulseBand(p) * (rail * 0.25 + 0.02);
  } else {
    float slot = mix(0.6 + 0.4 * step(0.5, fract(p.z / 0.06)), 0.8, smoothstep(0.3, 1.0, fz / 0.06));
    col = vec3(0.05, 0.053, 0.058) * slot * (0.5 + 1.5 * per);
  }
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;

const FLOOR_VERT = /* glsl */`
varying vec4 vFog;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = vec3(0.0, 1.0, 0.0);
  vFog = fogParams(w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FLOOR_FRAG = /* glsl */`
uniform sampler2D tF;
uniform float uReflK;      // mirror-world reflections fade out as the camera rises
varying vec4 vFog;
void main(){
  vec3 p = vW;
  vec3 V = normalize(cameraPosition - p);
  vec2 f = texture2D(tF, p.xz / 1.2).rg;
  float xc = floor(p.x / 5.2 + 0.5) * 5.2;
  float dx = abs(p.x - xc);
  float cold = 1.0 - smoothstep(0.85, 0.95, dx);
  float hot = 1.0 - smoothstep(0.55, 0.65, abs(dx - 2.6));
  float per = fixPer(p.z);
  float pool = cold * exp(-dx * dx / 0.4) * (0.25 + 0.75 * per) + hot * 0.15 * (0.4 + 0.6 * per);
  float band = pulseBand(p);
  float face = abs(dx - 0.9);
  vec3 spill = vec3(0.2, 0.7, 0.7) * exp(-face / 0.18) * 0.02 * cold + vec3(0.45, 0.82, 1.0) * band * (exp(-face / 0.5) * 0.28 * cold + 0.06) * (0.5 + 0.5 * f.r / 0.6);
  vec3 col = vec3(0.86, 0.92, 1.0) * f.r * 0.08 * (pool * mix(0.85, 2.6, smoothstep(2.0, 8.0, cameraPosition.y)) + 0.015) + spill;
  float cv = clamp(V.y, 0.0, 1.0);
  float F = 1.0 - cv; F *= F; F *= F * (1.0 - cv);
  float refl = mix(0.30, 0.88, 0.05 + 0.95 * F) * f.g * uReflK;
  col = mix(col, vFog.rgb, vFog.a) * (1.0 - refl);
  gl_FragColor = vec4(col, 1.0 - refl);
}
`;

// cylindrical billboards for the light shafts (cheap, one layer)
const SHAFT_VERT = /* glsl */`
attribute vec2 aUv;
varying vec2 vUv;
varying vec3 vW;
varying vec3 vN;
void main(){
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 tc = cameraPosition - c;
  vec3 right = normalize(vec3(tc.z, 0.0, -tc.x));
  vec3 w = c + right * position.x + vec3(0.0, position.y, 0.0);
  vUv = uv;
  vW = w;
  vN = vec3(0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;
const SHAFT_FRAG = /* glsl */`
uniform float uInt;
varying vec2 vUv;
void main(){
  float h = vUv.y;                         // 1 at the fixture, 0 at the floor
  float halfW = mix(1.0, 0.12, h);
  float u = abs(vUv.x - 0.5) * 2.0 / halfW;
  float a = (1.0 - smoothstep(0.15, 1.0, u)) * (0.12 + 0.88 * h * h) * smoothstep(0.0, 0.1, 1.0 - h);
  float d = length(vW - cameraPosition);
  a *= smoothstep(1.6, 5.0, d) * exp(-uFogDen * d * 1.1) * uInt * (1.0 - smoothstep(2.1, 2.9, cameraPosition.y));
  a *= 0.85 + 0.15 * sin(uTime * 0.7 + vW.z * 0.9 + vW.x);
  gl_FragColor = vec4(vec3(0.55, 0.68, 0.80) * a, 1.0);
}
`;

const MOTE_VERT = /* glsl */`
uniform float uTime;
uniform float uFixOff;
uniform vec3 uCam;
attribute vec4 aSeed;
varying float vA;
void main(){
  vec3 p = position;
  p.z = uCam.z + 1.0 - mod(uCam.z + 1.0 - p.z, 14.0);
  float ahead = uCam.z - p.z;
  float t = uTime;
  p.x += sin(t * (0.13 + aSeed.x * 0.2) + aSeed.y * 6.28) * 0.10;
  p.y += sin(t * (0.09 + aSeed.z * 0.15) + aSeed.x * 6.28) * 0.08 + t * 0.015 * (aSeed.w - 0.5);
  p.z += cos(t * (0.11 + aSeed.y * 0.2) + aSeed.z * 6.28) * 0.10;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dz = -mv.z;
  float zf = floor((p.z - uFixOff) / 2.4 + 0.5) * 2.4 + uFixOff;
  vec2 q = vec2(p.x / (0.12 + 0.2 * (3.4 - p.y)), (p.z - zf) / (0.35 + 0.25 * (3.4 - p.y)));
  float lit = exp(-dot(q, q)) * smoothstep(0.3, 2.4, p.y);
  float tw = 0.55 + 0.45 * sin(t * (1.3 + aSeed.w * 2.5) + aSeed.y * 30.0);
  float sz = (0.8 + aSeed.w * 1.2) * 300.0 / dz;
  gl_PointSize = clamp(sz, 1.0, 7.0);
  vA = lit * 1.3 * tw * smoothstep(0.5, 1.8, dz) * (1.0 - smoothstep(7.0, 12.0, ahead)) * clamp(sz / gl_PointSize, 0.2, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;
const MOTE_FRAG = /* glsl */`
varying float vA;
void main(){
  float a = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vec3(0.8, 0.88, 0.95) * a * vA, 1.0);
}
`;

register('server_hall', (opts) => {
  const mode = opts.mode === 'reveal' ? 'reveal' : 'dolly';
  const pulses = (opts.pulses || []).slice(0, 4).sort((a, b) => a - b);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010203);
  const camera = new THREE.PerspectiveCamera(mode === 'reveal' ? 40 : 35, 16 / 9, 0.05, 260);

  // dolly: an endless aisle dissolving into haze. reveal: a finite hall (rows end before a lit end wall)
  const Z0 = 4.0, Z1 = mode === 'reveal' ? -58.0 : -84.0, ZW = -61.0;
  let domeRef, glowReal, glowMir, glowCount = 0;
  const NA = mode === 'reveal' ? 4 : 1;
  const tR = bakeRacks(1234);
  const tF = bakeFloor();
  const shared = {
    uTime: { value: 0 },
    uFogLow: { value: mode === 'reveal' ? new THREE.Color(0.007, 0.011, 0.014) : new THREE.Color(0.004, 0.007, 0.009) },
    uFogHigh: { value: mode === 'reveal' ? new THREE.Color(0.006, 0.009, 0.012) : new THREE.Color(0.0015, 0.002, 0.0035) },
    uFogGlow: { value: mode === 'reveal' ? new THREE.Color(0.014, 0.022, 0.028) : new THREE.Color(0.010, 0.017, 0.021) },
    uFogDen: { value: mode === 'reveal' ? 0.027 : 0.036 },
    uPT: { value: new THREE.Vector4(-100, -100, -100, -100) },
    uPO: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uPSpeed: { value: opts.speed ?? 12 },
    uFixOff: { value: 0.9 },
  };
  const mat = (frag, extra = {}, mirror = false, params = {}, vert = VERT) => new THREE.ShaderMaterial({
    uniforms: { ...shared, ...extra },
    vertexShader: vert, fragmentShader: COMMON + frag,
    defines: mirror ? { MIRROR: 1 } : {},
    ...params,
  });

  // backdrop: dark dome with a cold haze band along the horizon, so the far hall dissolves instead of ending
  {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), new THREE.ShaderMaterial({
      uniforms: { uHaze: { value: new THREE.Color(mode === 'reveal' ? 0.016 : 0.010, mode === 'reveal' ? 0.026 : 0.017, mode === 'reveal' ? 0.032 : 0.021) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: 'uniform vec3 uHaze; varying vec3 vD; void main(){ vec3 d = normalize(vD); float e = d.y; float h = exp(-abs(e - 0.01) * 9.0) * (0.55 + 0.45 * max(-d.z, 0.0)); gl_FragColor = vec4(uHaze * h + vec3(0.001, 0.0015, 0.0025), 1.0); }',
      side: THREE.BackSide, depthWrite: false,
    }));
    dome.renderOrder = -100;
    dome.frustumCulled = false;
    domeRef = dome;
    scene.add(dome);
  }
  const world = new THREE.Group(), mirror = new THREE.Group();
  const reflK = { value: 1 };
  mirror.scale.y = -1;
  scene.add(world, mirror);

  // rack rows, fronts facing the cold aisles at x = 5.2 a. In the reveal every row is cut by two cross aisles,
  // starts and ends at slightly different places, and some rows miss a few racks: no perfect circuit-board grid.
  const CROSS = [-19.8, -38.4];          // cross-aisle centres (2.4 m wide)
  function rowSegments(a, rowId) {
    if (mode === 'dolly') return [[Z0, Z1]];
    const Rr = rng(900 + rowId * 7);
    const start = a === 0 ? Z0 : Z0 - Math.floor(Rr() * 4) * 0.6;
    const end = Z1 + Math.floor(Rr() * 9) * 0.6;
    const cuts = [[start, CROSS[0] + 1.2], [CROSS[0] - 1.2, CROSS[1] + 1.2], [CROSS[1] - 1.2, end]];
    const out = [];
    for (const [z0, z1] of cuts) {
      if (Math.abs(a) > 0 && Rr() < 0.28) {                 // a gap of 2-4 missing racks
        const g0 = z0 - (3 + Math.floor(Rr() * ((z0 - z1) / 0.6 - 8))) * 0.6, g1 = g0 - (2 + Math.floor(Rr() * 3)) * 0.6;
        out.push([z0, g0], [g1, z1]);
      } else out.push([z0, z1]);
    }
    return out;
  }
  const rackMeshes = [];
  const rows = [];
  let rowId = 0;
  for (let a = -NA; a <= NA; a++) {
    for (const side of [-1, 1]) {
      const cx = a * 5.2 + side * 1.45;
      rowId++;
      // dolly: neighbouring rows are hidden behind the hero rows, skip them
      if (mode === 'dolly' && a !== 0) continue;
      const segs = rowSegments(a, rowId);
      rows.push({ cx, rowId, segs });
      // in the hero aisle the left wall is kept dimmer (documents sit over the left half)
      const gain = mode === 'dolly' && side === -1 ? 0.55 : 1.0;
      for (const [z0, z1] of segs) {
        const len = z0 - z1;
        const geo = new THREE.BoxGeometry(1.1, 2.25, len, 1, 6, Math.max(1, Math.round(len / 0.3)));   // tessellated: lighting and fog are per vertex
        const ex = { tR: { value: tR }, uFront: { value: -side }, uRow: { value: rowId }, uZ0: { value: z0 }, uGain: { value: gain * 4.0 }, uCx: { value: cx } };
        for (const [grp, mir] of [[world, false], [mirror, true]]) {
          if (mir && Math.abs(a) > 1) continue;      // far aisles: reflections are not readable from above
          const m = new THREE.Mesh(geo, mat(RACK_FRAG, ex, mir, {}, COMMON + RACK_VERT));
          m.position.set(cx, 1.125, (z0 + z1) / 2);
          grp.add(m);
          rackMeshes.push(m);
        }
      }
    }
  }
  // cable trays above every row (they bridge the small gaps but stop at the cross aisles)
  {
    let i = 0;
    for (let a = -NA; a <= NA; a++) for (const side of [-1, 1]) {
      const x = a * 5.2 + side * 1.45;
      i++;
      const spans = mode === 'dolly' ? [[Z0, Z1]] : [[Z0, CROSS[0] + 1.0], [CROSS[0] - 1.0, CROSS[1] + 1.0], [CROSS[1] - 1.0, Z1 + 2.0]];
      for (const [z0, z1] of spans) {
        const tr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, z0 - z1), mat(TRAY_FRAG, { uRow: { value: i } }));
        tr.position.set(x, 2.66, (z0 + z1) / 2);
        world.add(tr);
      }
    }
  }

  // building: roof trusses across the hall, round supply ducts along the hot aisles, and (reveal) columns at the
  // cross aisles, side and end walls lined with cooling units, a roof deck. Lit from below by the aisle fixtures.
  {
    const XW = NA * 5.2 + 4.4;                 // side walls
    const STRUCT_FRAG = /* glsl */`
      uniform vec3 uAlb;
      uniform float uKind;     // 0 steel, 1 duct, 2 concrete column
      void main(){
        vec3 p = vW, n = normalize(vN);
        vec3 V = normalize(cameraPosition - p);
        float below = max(-n.y, 0.0), side = 1.0 - abs(n.y);
        // light from the fixture rows below: strongest on undersides and on faces near fixture height
        float h = p.y;
        float L = 0.012 + below * 0.09 * exp(-max(h - 3.4, 0.0) * 0.16) + side * 0.05 * exp(-abs(h - 3.4) * 0.30) * (0.4 + 0.6 * fixPer(p.z));
        vec3 col = uAlb * L;
        if (uKind > 0.5 && uKind < 1.5) {
          // galvanized duct: a soft sheen line and seams every 1.5 m
          float seam = 1.0 - smoothstep(0.0, fwidth(p.z) * 1.5 + 0.01, abs(fract(p.z / 1.5) - 0.5) * 1.5 - 0.70);
          col *= 1.0 - 0.35 * seam;
          col += vec3(0.5, 0.6, 0.7) * pow(1.0 - abs(dot(n, V)), 4.0) * 0.012;
        }
        if (uKind > 1.5) {
          // concrete column: a darker plinth, a painted stripe at head height, faint mottling
          col *= 0.85 + 0.3 * fract(sin(dot(floor(p.xy * vec2(3.0, 2.0)), vec2(12.9898, 78.233))) * 43758.5453) * 0.3;
          col = mix(col, uAlb * L * 0.45, step(h, 0.35));
          col = mix(col, vec3(0.30, 0.22, 0.06) * L * 1.6, step(abs(h - 1.6), 0.08));
        }
        gl_FragColor = vec4(fogIt(col, vW), 1.0);
      }`;
    const smat = (alb, kind) => mat(STRUCT_FRAG, { uAlb: { value: new THREE.Color(...alb) }, uKind: { value: kind } });
    // trusses: Warren trusses spanning the hall every 7.2 m
    const parts = [];
    const span = 2 * XW, nP = Math.round(span / 2.6), pw = span / nP;
    parts.push(new THREE.BoxGeometry(span, 0.24, 0.24).translate(0, 10.6, 0), new THREE.BoxGeometry(span, 0.22, 0.22).translate(0, 9.4, 0));
    const dl = Math.hypot(pw, 1.2), da = Math.atan2(1.2, pw);
    for (let i = 0; i < nP; i++) {
      const x = -XW + i * pw;
      parts.push(new THREE.BoxGeometry(0.1, 1.2, 0.1).translate(x, 10.0, 0));
      parts.push(new THREE.BoxGeometry(dl, 0.09, 0.09).rotateZ(i % 2 ? da : -da).translate(x + pw / 2, 10.0, 0));
    }
    // purlins along z at the top chord level
    const trussG = mergeGeometries(parts);
    const tz = [];
    for (let z = Z0 + 2.0; z > (mode === 'reveal' ? ZW : Z1); z -= 7.2) tz.push(z);
    const trusses = new THREE.InstancedMesh(trussG, smat([0.20, 0.21, 0.22], 0), tz.length);
    const M = new THREE.Matrix4();
    tz.forEach((z, i) => { M.makeTranslation(0, 0, z); trusses.setMatrixAt(i, M); });
    world.add(trusses);
    // ducts above every other hot aisle
    const dz0 = Z0 + 3, dz1 = mode === 'reveal' ? ZW : Z1;
    const ductG = new THREE.CylinderGeometry(0.5, 0.5, dz0 - dz1, 18, Math.round((dz0 - dz1) / 1.5), true).rotateX(Math.PI / 2);
    const dxs = [];
    for (let a = -NA - 1; a <= NA; a++) if (((a % 2) + 2) % 2 === 1) dxs.push(a * 5.2 + 2.6);
    const ducts = new THREE.InstancedMesh(ductG, smat([0.30, 0.31, 0.33], 1), dxs.length);
    dxs.forEach((x, i) => { M.makeTranslation(x, 8.5, (dz0 + dz1) / 2); ducts.setMatrixAt(i, M); });
    world.add(ducts);
    if (mode === 'reveal') {
      // columns at the cross aisles and along the front walkway, every other hot aisle
      const cpos = [];
      for (let a = -NA - 1; a <= NA; a++) if (((a % 2) + 2) % 2 === 0) for (const z of [...CROSS, ZW + 1.6]) cpos.push([a * 5.2 + 2.6, z]);
      const cols = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 12.5, 0.7).translate(0, 6.25, 0), smat([0.34, 0.34, 0.33], 2), cpos.length);
      cpos.forEach(([x, z], i) => { M.makeTranslation(x, 0, z); cols.setMatrixAt(i, M); });
      world.add(cols);
      // walls: dark panels, a row of cooling units with lit louvres and status displays, wall-washers above
      const WALL_FRAG = /* glsl */`
        uniform float uAlong;     // 0: wall runs along z (side walls), 1: along x (end wall)
        void main(){
          vec3 p = vW;
          float u = mix(p.z, p.x, uAlong) + 100.0;
          float cu = mod(u, 4.8);
          float y = p.y;
          float fw = fwidth(y) + 0.003;
          vec3 col = vec3(0.022, 0.024, 0.027) * (0.5 + 0.5 * smoothstep(0.0, 2.0, y));
          float pil = 1.0 - smoothstep(0.0, fwidth(u) * 1.5 + 0.02, abs(cu - 0.0) - 0.25);
          col *= 1.0 - 0.4 * pil;
          // wall-washer cones from fixtures under the roof
          float cone = exp(-pow((cu - 2.4) / (0.5 + 0.18 * (11.5 - y)), 2.0)) * smoothstep(11.6, 9.0, y) * smoothstep(0.0, 3.0, y);
          col += vec3(0.55, 0.68, 0.85) * cone * 0.15;
          // cooling unit: a tall cabinet with a louvred grille and a small lit display
          float unit = step(0.5, cu) * step(cu, 4.3) * step(y, 2.5);
          float louv = step(0.45, fract(y * 9.0)) * step(0.7, cu) * step(cu, 4.1) * step(0.25, y) * step(y, 1.7);
          vec3 uc = vec3(0.05, 0.055, 0.06) + vec3(0.30, 0.42, 0.50) * louv * 1.1;
          float disp = step(3.3, cu) * step(cu, 3.9) * step(1.95, y) * step(y, 2.2);
          uc += vec3(0.25, 0.85, 0.8) * disp * 2.5;
          uc += vec3(0.75, 0.88, 1.0) * (1.0 - smoothstep(0.0, fw, abs(y - 2.42) - 0.02)) * step(0.6, cu) * step(cu, 4.2) * 3.0;
          col = mix(col, uc, unit);
          gl_FragColor = vec4(fogIt(col, p), 1.0);
        }`;
      const wm = (along) => mat(WALL_FRAG, { uAlong: { value: along } });
      const H = 12.5, LZ = Z0 + 30 - ZW;
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(LZ, H), wm(0));
        w.rotation.y = -sx * Math.PI / 2; w.position.set(sx * XW, H / 2, (Z0 + 30 + ZW) / 2);
        world.add(w);
      }
      const ew = new THREE.Mesh(new THREE.PlaneGeometry(2 * XW, H), wm(1));
      ew.position.set(0, H / 2, ZW); world.add(ew);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(2 * XW, LZ), mat(`void main(){ vec3 c = vec3(0.012, 0.013, 0.015) * (0.6 + 0.4 * step(0.5, fract(vW.x / 1.2))); gl_FragColor = vec4(fogIt(c, vW), 1.0); }`));
      roof.rotation.x = Math.PI / 2; roof.position.set(0, H, (Z0 + 30 + ZW) / 2);
      world.add(roof);
    }
  }

  // fixtures
  const fixGeo = new THREE.BoxGeometry(0.12, 0.05, 1.7);
  const fixZ = [];
  for (let z = 0.9 + 2.4; z > Z1 + 1; z -= 2.4) fixZ.push(z);
  for (const [grp, mir] of [[world, false], [mirror, true]]) {
    const cold = new THREE.InstancedMesh(fixGeo, mat(FIX_FRAG, { uInt: { value: 3.4 } }, mir), fixZ.length * (2 * NA + 1));
    const hot = new THREE.InstancedMesh(fixGeo, mat(FIX_FRAG, { uInt: { value: 1.2 } }, mir), fixZ.length * (2 * NA + 2));
    const M = new THREE.Matrix4();
    let ic = 0, ih = 0;
    for (let a = -NA; a <= NA; a++) for (const z of fixZ) { M.makeTranslation(a * 5.2, 3.425, z); cold.setMatrixAt(ic++, M); }
    for (let a = -NA - 1; a <= NA; a++) for (const z of fixZ) { M.makeTranslation(a * 5.2 + 2.6, 3.425, z); hot.setMatrixAt(ih++, M); }
    grp.add(cold, hot);
  }
  // soft glow cards around every fixture (our own bloom); the mirrored copy gives soft floor reflections
  {
    const GLOW_VERT = /* glsl */`
      uniform float uMir;
      varying vec2 vUv;
      varying vec3 vW;
      varying vec3 vN;
      void main(){
        vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        c.y *= uMir;
        vec3 tc = cameraPosition - c;
        vec3 up = vec3(0.0, 0.0, 1.0);                       // fixtures run along z
        vec3 side = normalize(cross(up, tc));
        vec3 w = c + side * position.x + up * position.y;
        vUv = uv; vW = w; vN = vec3(0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`;
    const GLOW_FRAG = /* glsl */`
      uniform float uInt;
      uniform float uMir;
      varying vec2 vUv;
      void main(){
        vec2 q = (vUv - 0.5) * 2.0;
        float r = length(vec2(q.x, max(abs(q.y) - 0.45, 0.0) / 0.55));
        float a = exp(-r * r * 5.0) + 0.35 * exp(-r * r * 40.0);
        float d = length(vW - cameraPosition);
        a *= exp(-uFogDen * d * 1.6) * smoothstep(0.8, 2.5, d) * (1.0 + 0.8 * pulseBand(vec3(vW.x, abs(vW.y), vW.z)));
        // real cards fade before the camera reaches fixture height (edge-on they smear into a white band)
        if (uMir > 0.0) a *= 1.0 - smoothstep(2.3, 3.0, cameraPosition.y);
        else a *= 1.0 - smoothstep(2.6, 3.3, cameraPosition.y);
        gl_FragColor = vec4(vec3(0.72, 0.86, 1.0) * a * uInt, 1.0);
      }`;
    const g = new THREE.PlaneGeometry(1.1, 3.0);
    for (const mir of [1, -1]) {
      const list = [];
      const span = mir < 0 ? Math.min(NA, 1) : NA;
      for (let a = -span; a <= span; a++) for (const z of fixZ) list.push([a * 5.2, z, 1]);
      const gm = new THREE.ShaderMaterial({
        uniforms: { ...shared, uMir: { value: mir }, uInt: { value: mir > 0 ? 0.55 : (mode === 'reveal' ? 0.3 : 0.5) } },
        vertexShader: GLOW_VERT, fragmentShader: COMMON + GLOW_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const im = new THREE.InstancedMesh(g, gm, list.length);
      const M = new THREE.Matrix4();
      list.forEach(([x, z], i) => { M.makeTranslation(x, 3.39, z); im.setMatrixAt(i, M); });
      if (mir > 0) glowCount = list.length;
      im.frustumCulled = false;
      im.renderOrder = mir > 0 ? 4 : 0;
      if (mir > 0) glowReal = im; else glowMir = im;
      scene.add(im);
    }
  }

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 140, 80, 140), mat(FLOOR_FRAG, { tF: { value: tF }, uReflK: reflK }, false, {
    transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }, COMMON + FLOOR_VERT));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -30);
  floor.renderOrder = 1;
  scene.add(floor);

  // shafts: camera-facing soft wedges under the fixtures of the hero aisle (all aisles in reveal)
  let shafts;
  {
    const g = new THREE.PlaneGeometry(1.8, 3.35);
    g.translate(0, -3.35 / 2, 0);
    const sm = mat(SHAFT_FRAG, { uInt: { value: mode === 'reveal' ? 0.10 : 0.12 } }, false, {
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }, SHAFT_VERT);
    shafts = new THREE.InstancedMesh(g, sm, 40);
    shafts.renderOrder = 2;
    shafts.frustumCulled = false;
    scene.add(shafts);
  }
  // place shafts under the fixtures just ahead of the camera (pure function of camera position)
  const SM = new THREE.Matrix4();
  function placeShafts(cp) {
    let i = 0;
    const span = mode === 'reveal' ? (cp.y < 3.0 ? 1 : -1) : 0;
    for (let a = -span; a <= span; a++) for (const z of fixZ) {
      const ahead = cp.z - z;
      if (ahead < -1.5 || ahead > (mode === 'reveal' ? 30 : 20) || i >= 40) continue;
      SM.makeTranslation(a * 5.2, 3.38, z);
      shafts.setMatrixAt(i++, SM);
    }
    shafts.count = i;
    shafts.instanceMatrix.needsUpdate = true;
  }

  // dust motes (world-anchored, wrapped into a 14 m window ahead of the camera)
  const camPosU = new THREE.Vector3();
  {
    const N = 900, R = rng(41);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (R() - 0.5) * 1.7;
      pos[i * 3 + 1] = 0.1 + R() * 3.2;
      pos[i * 3 + 2] = -R() * 14;
      for (let j = 0; j < 4; j++) seed[i * 4 + j] = R();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const pm = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uFixOff: shared.uFixOff, uCam: { value: camPosU } },
      vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, pm);
    pts.renderOrder = 3;
    pts.frustumCulled = false;
    scene.add(pts);
  }

  // ---------------------------------------------------------------- camera
  // ease in, then hold a constant speed to the cut (never settles into a held frame)
  const eil = (k, k0) => { k = clamp(k); const f = k < k0 ? k * k / (2 * k0) : k - k0 / 2; return f / (1 - k0 / 2); };
  function camAt(lt, k, dur, pos, look) {
    if (mode === 'dolly') {
      // right of the aisle centre, looking a little left: the vanishing point sits at ~65 % of frame width and
      // the dimmed left wall fills the left half behind the document
      const dist = clamp(0.95 * dur + 1.8, 4.2, 11);
      const z = 0.6 - dist * (0.12 * smooth(k) + 0.88 * k);
      const y = 1.30 + 0.36 * smooth(k);
      const x = 0.30 + 0.025 * noise(lt * 0.35 + 3.1);
      look.set(x - 1.36 + 0.03 * noise(lt * 0.3 + 9), y - 0.40 - 0.12 * k + 0.02 * noise(lt * 0.25 + 5), z - 8);
      return pos.set(x, y, z);
    }
    // reveal: rise out of the aisle past the fixture line and the trusses while pulling back and drifting right
    const up = eil(k, 0.30), back = eil((k - 0.04) / 0.96, 0.36), drift = eil(k, 0.45);
    const y = lerp(1.45, 7.2, up);
    pos.set(lerp(0.45, 2.2, drift), y + 0.02 * noise(lt * 0.4), lerp(-1.5, 15.5, back));
    look.set(lerp(0.4, 1.6, drift), lerp(1.3, -0.6, up), lerp(-14, -31, back));
    return pos;
  }

  const lookV = new THREE.Vector3(), tmpV = new THREE.Vector3();
  return {
    scene, camera,
    bloom: { strength: 0 },            // glow is built in (baked LED halos, glow cards): the shared bloom pass costs ~450 ms here
    exposure: 1.5,
    update(lt, c) {
      shared.uTime.value = lt;
      camAt(lt, c.k, c.dur, camera.position, lookV);
      camera.lookAt(lookV);
      camPosU.copy(camera.position);
      domeRef.position.copy(camera.position);
      // seen from above, the real glow cards are fully faded: skip drawing them
      glowReal.count = camera.position.y > 4.0 ? 0 : glowCount;
      reflK.value = 1 - smooth((camera.position.y - 3.4) / 1.4);
      mirror.visible = glowMir.visible = reflK.value > 0;
      placeShafts(camera.position);
      for (const m of rackMeshes) m.renderOrder = -10 + Math.min(9, Math.abs(m.position.x - camera.position.x) / 2);
      // pulses that have started; each runs out from where the camera was at that moment
      for (let i = 0; i < 4; i++) {
        const tp = pulses[i];
        const on = tp !== undefined && tp <= lt;
        shared.uPT.value.setComponent(i, on ? tp : -100);
        if (on) {
          const o = camAt(tp, clamp(tp / c.dur), c.dur, shared.uPO.value[i], tmpV);
          if (mode === 'reveal') { tmpV.sub(o).setY(0).normalize(); o.addScaledVector(tmpV, 10); }
        }
      }
    },
  };
});
