// server_hall: an endless data-centre aisle. Two walls of black racks covered in thousands of tiny
// status LEDs recede into haze; cable trays overhead, linear fixtures throwing soft shafts, a glossy
// raised floor that mirrors everything (a mirrored copy of the hall under a semi-transparent floor).
//
// opts:
//   mode    'dolly' (default)  slow push down the aisle with a slight crane; vanishing point left of centre
//           'reveal'           starts in the aisle, cranes up and pulls back over a hall of many aisles
//   pulses  [lt, ...]  up to 4 local times (s); a wave of light runs out along the racks from the camera at each
//   speed   pulse wave speed in m/s (default 12)
//
// Rack fronts are baked once into one mipmapped DataTexture (R albedo, G specular mask, B LED intensity,
// A LED id). The shader derives each LED's colour and blink from its id and uTime, so every frame is a
// pure function of time and can be rendered in any order.
import { THREE, register, rng, noise, ease, smooth, clamp, lerp } from '../kit.js';

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
      if (R() < (v === 2 ? 0.12 : 0.08)) {
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
      } else {
        for (let y = by + 6; y < by + bh - 6; y += 4) for (let x = X + 190; x < X + VW - 56; x += 4) surf(x, y, 2, 2, 6, 0);
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
uniform vec2 uPT;          // the two most recent pulse times (local s); -100 = none
uniform vec3 uPO0;
uniform vec3 uPO1;
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
float band1(float dt, vec3 o, vec3 p){
  float x = dt * uPSpeed - length(p.xz - o.xz);
  return smoothstep(-0.5, 0.0, x) * (exp(-max(x, 0.0) / 1.4) + 0.12 * exp(-max(x, 0.0) / 6.0)) * exp(-dt * 0.35) * step(0.0, dt) * 1.6;
}
float pulseBand(vec3 p){
  return band1(uTime - uPT.x, uPO0, p) + band1(uTime - uPT.y, uPO1, p);
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
float blink(float id, float t){
  float r = h11(id * 1.37 + 0.11);
  float r2 = h11(id * 7.13 + 3.7);
  if (r < 0.36) return 1.0;
  if (r < 0.54) return smoothstep(0.30, 0.55, abs(fract(t * (0.35 + r2 * 1.1) + r2 * 7.0) - 0.5) * 2.0);
  if (r < 0.92) return step(0.42, h11(floor(t * (4.0 + r2 * 10.0) + r2 * 31.0) * 0.1371 + id * 0.731));
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
      on = mix(on, 0.62, lodF);
      lc = mix(lc, vec3(0.30, 0.95, 0.85), lodF * 0.75);
      on = max(on, smoothstep(0.1, 0.5, band));
      float gain = uGain * (0.7 + 0.6 * h11(ri * 3.3 + uRow)) * (1.0 + 3.0 * band);
      vec3 led = mix(lc, vec3(0.80, 0.97, 1.0), clamp(band, 0.0, 1.0) * 0.6) * (t.b * t.b * 0.38 + t.g * 0.7) * on * gain;
      float sm = smoothstep(0.09, 0.16, t.r);
      col = vec3(0.86, 0.92, 1.0) * t.r * 0.18 * (dif * 0.8 + 0.025) + vec3(0.7, 0.85, 1.0) * spec * sm * 0.2 + led;
      // light strips along the top and the base of the row: dim teal, they carry the pulse wave
      float fy = fwidth(y) + 0.002;
      float strip = (1.0 - smoothstep(0.0, fy, abs(y - 2.105) - 0.012)) + 0.7 * (1.0 - smoothstep(0.0, fy, abs(y - 0.118) - 0.008));
      col += strip * (vec3(0.10, 0.45, 0.42) * 0.35 + vec3(0.55, 0.95, 1.0) * band * 7.0);
    } else {
      vec2 g = vec2(s, y) / vec2(0.15, 0.11);
      float hc = h21(floor(g) + uRow * 13.0);
      vec2 cl = fract(g) - 0.5;
      float glow = exp(-dot(cl, cl) * 26.0) * step(0.84, hc) * step(0.15, y) * step(y, 2.05);
      col = vec3(0.012, 0.013, 0.016) * (dif + 0.05) * step(abs(ru - 0.5), 0.46) + vec3(0.5, 0.6, 0.7) * spec * 0.04;
      col += mix(vec3(0.3, 0.9, 0.8), vec3(1.0, 0.55, 0.15), step(0.985, hc)) * glow * 0.25 * uGain;
    }
  } else if (n.y > 0.5) {
    col = vec3(0.016, 0.017, 0.02) * (0.5 + 0.8 * fixPer(p.z));
  } else {
    col = vec3(0.022, 0.024, 0.028) * (0.2 + 0.6 * smoothstep(0.0, 2.3, y));
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
    vec3 cab = hc < 0.10 ? vec3(0.30, 0.16, 0.03) : (hc < 0.20 ? vec3(0.04, 0.15, 0.17) : (hc < 0.27 ? vec3(0.05, 0.08, 0.2) : vec3(0.025, 0.026, 0.03)));
    float rung = (1.0 - smoothstep(0.0, fz + 0.004, abs(fract(p.z / 0.3) - 0.5) * 0.3 - 0.012)) * (1.0 - smoothstep(0.3, 1.0, fz / 0.05));
    float rail = step(0.92, abs(xc - 0.5) * 2.0);
    col = mix(cab * (0.8 + 0.2 * sin(p.z * 3.0 + hc * 20.0)), vec3(0.06), max(rail, n.y < 0.0 ? rung * 0.7 : 0.0));
    col *= n.y > 0.0 ? (0.25 + 0.5 * per) : (0.6 + 1.6 * per);
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
  vec3 spill = vec3(0.2, 0.7, 0.7) * exp(-face / 0.18) * 0.02 * cold + vec3(0.6, 0.9, 1.0) * band * exp(-face / 0.45) * 0.12 * cold;
  vec3 col = vec3(0.86, 0.92, 1.0) * f.r * 0.08 * (pool * mix(0.85, 2.6, smoothstep(2.0, 8.0, cameraPosition.y)) + 0.015) + spill;
  float cv = clamp(V.y, 0.0, 1.0);
  float F = 1.0 - cv; F *= F; F *= F * (1.0 - cv);
  float refl = mix(0.30, 0.88, 0.05 + 0.95 * F) * f.g;
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
  a *= smoothstep(1.6, 5.0, d) * exp(-uFogDen * d * 1.1) * uInt;
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

  const Z0 = 4.0, Z1 = -84.0;
  let domeRef, glowReal, glowCount = 0;
  const NA = mode === 'reveal' ? 4 : 1;
  const tR = bakeRacks(1234);
  const tF = bakeFloor();
  const shared = {
    uTime: { value: 0 },
    uFogLow: { value: new THREE.Color(0.004, 0.007, 0.009) },
    uFogHigh: { value: new THREE.Color(0.0015, 0.002, 0.0035) },
    uFogGlow: { value: new THREE.Color(0.010, 0.017, 0.021) },
    uFogDen: { value: mode === 'reveal' ? 0.03 : 0.036 },
    uPT: { value: new THREE.Vector2(-100, -100) },
    uPO0: { value: new THREE.Vector3() },
    uPO1: { value: new THREE.Vector3() },
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
  mirror.scale.y = -1;
  scene.add(world, mirror);

  // rack rows: one long box each, fronts facing the cold aisles at x = 5.2 a
  const rowLen = Z0 - Z1;
  const rackGeo = new THREE.BoxGeometry(1.1, 2.25, rowLen, 1, 6, Math.round(rowLen / 0.3));   // tessellated: lighting and fog are per vertex
  const trayGeo = new THREE.BoxGeometry(0.5, 0.08, rowLen);
  const rackMeshes = [];
  let rowId = 0;
  for (let a = -NA; a <= NA; a++) {
    for (const side of [-1, 1]) {
      const cx = a * 5.2 + side * 1.45;
      rowId++;
      // dolly: neighbouring rows are hidden behind the hero rows, skip them
      if (mode === 'dolly' && a !== 0) continue;
      // in the hero aisle the left wall is kept dimmer (documents sit over the left half)
      const gain = mode === 'dolly' && side === -1 ? 0.6 : 1.0;
      const ex = { tR: { value: tR }, uFront: { value: -side }, uRow: { value: rowId }, uZ0: { value: Z0 }, uGain: { value: gain * 4.0 } };
      for (const [grp, mir] of [[world, false], [mirror, true]]) {
        if (mir && Math.abs(a) > 1) continue;      // far aisles: reflections are not readable from above
        const m = new THREE.Mesh(rackGeo, mat(RACK_FRAG, ex, mir, {}, COMMON + RACK_VERT));
        m.position.set(cx, 1.125, (Z0 + Z1) / 2);
        grp.add(m);
        rackMeshes.push(m);
      }
    }
  }
  // cable trays above every row
  {
    const xs = [];
    for (let a = -NA; a <= NA; a++) for (const side of [-1, 1]) xs.push(a * 5.2 + side * 1.45);
    xs.forEach((x, i) => {
      const tr = new THREE.Mesh(trayGeo, mat(TRAY_FRAG, { uRow: { value: i + 1 } }));
      tr.position.set(x, 2.66, (Z0 + Z1) / 2);
      world.add(tr);
    });
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
        if (uMir > 0.0) a *= 1.0 - smoothstep(-0.4, 0.5, cameraPosition.y - 3.4);
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
      if (mir > 0) glowReal = im;
      scene.add(im);
    }
  }

  // hangers rising into the dark (dolly only: from above they read as rain)
  if (mode === 'dolly') {
    const g = new THREE.BoxGeometry(0.014, 6, 0.014);
    const hm = mat(`void main(){ float per = fixPer(vW.z); vec3 col = vec3(0.03, 0.033, 0.036) * (0.2 + per) * (1.0 - smoothstep(3.6, 7.0, vW.y)); gl_FragColor = vec4(fogIt(col, vW), 1.0); }`);
    const pts = [];
    for (let a = -NA; a <= NA; a++) for (const z of fixZ) {
      pts.push([a * 5.2, z + 0.8], [a * 5.2, z - 0.8]);
      for (const s of [-1, 1]) pts.push([a * 5.2 + s * 1.22, z + 0.3], [a * 5.2 + s * 1.68, z + 0.3]);
    }
    const im = new THREE.InstancedMesh(g, hm, pts.length);
    const M = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { M.makeTranslation(x, 6.45, z); im.setMatrixAt(i, M); });
    world.add(im);
  }

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 140, 80, 140), mat(FLOOR_FRAG, { tF: { value: tF } }, false, {
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
  const look = new THREE.Vector3();
  function camAt(lt, k, dur) {
    if (mode === 'dolly') {
      const dist = clamp(0.95 * dur + 1.8, 4.2, 11);
      const z = 0.6 - dist * (0.12 * smooth(k) + 0.88 * k);
      const y = 1.30 + 0.36 * smooth(k);
      const x = -0.30 + 0.025 * noise(lt * 0.35 + 3.1);
      look.set(x + 0.62 + 0.03 * noise(lt * 0.3 + 9), y - 0.40 - 0.12 * k + 0.02 * noise(lt * 0.25 + 5), z - 8);
      return new THREE.Vector3(x, y, z);
    }
    // rise first (staying in the aisle, clear of the fixture line), then pull back and drift sideways
    const kr = ease.inOut(clamp(k));
    const up = ease.inOut(clamp((k - 0.02) / 0.9));
    const y = lerp(1.45, 9.5, up);
    const back = ease.inOut(clamp((k - 0.08) / 0.92));
    const side = smooth(clamp((y - 3.2) / 5.0));
    look.set(lerp(0.4, 1.6, kr), lerp(1.3, -1.2, up), lerp(-14, -26, back));
    return new THREE.Vector3(lerp(0.45, 2.6, side), y + 0.02 * noise(lt * 0.4), lerp(-1.5, 14, back));
  }

  return {
    scene, camera,
    bloom: { strength: 0 },            // glow is built in (baked LED halos, glow cards): the shared bloom pass costs ~450 ms here
    exposure: 1.5,
    update(lt, c) {
      shared.uTime.value = lt;
      camera.position.copy(camAt(lt, c.k, c.dur));
      camera.lookAt(look);
      camPosU.copy(camera.position);
      domeRef.position.copy(camera.position);
      // seen from above, the real glow cards are fully faded: skip drawing them
      glowReal.count = camera.position.y > 4.0 ? 0 : glowCount;
      placeShafts(camera.position);
      for (const m of rackMeshes) m.renderOrder = -10 + Math.min(9, Math.abs(m.position.x - camera.position.x) / 2);
      // the two most recent pulses that have started
      const started = pulses.filter((tp) => tp <= lt);
      const a = started[started.length - 1], b = started[started.length - 2];
      shared.uPT.value.set(a ?? -100, b ?? -100);
      if (a !== undefined) shared.uPO0.value.copy(camAt(a, clamp(a / c.dur), c.dur));
      if (b !== undefined) shared.uPO1.value.copy(camAt(b, clamp(b / c.dur), c.dur));
    },
  };
});
