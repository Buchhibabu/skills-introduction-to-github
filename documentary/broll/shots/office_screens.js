// office_screens: a dark open-plan office at night. Rows of desks, monitors and empty mesh chairs recede into
// the dark; the monitors switch on in a wave (each screen a generic code / terminal / chat / document UI drawn
// once into a canvas atlas) and throw cold pools of light across the desks, keyboards and chair edges. The room
// itself stays near-black: only what the screens and three warm desk lamps reach is lit. The camera tracks
// sideways at seated eye height, then drifts up, while it keeps the near 'All staff: use AI for everything /
// MANDATORY' memo screen locked in the lower-right third (clear of the memo documents laid over the shot).
//
// opts:
//   waveAt   local seconds when the wave starts (default 0.5). The wave starts at the near memo desk, so the big
//            near screens stutter on first and the wave then rolls back through the room. waveAt <= -waveDur
//            gives a room that is already lit.
//   waveDur  seconds for the wave to reach the back of the room (default 2.2)
//   seed     layout seed (default 3)
//
// Overlays: the upper ~40 % (ceiling, far rows, window band) stays calm and dark; the memo screen sits at about
// x 1450-1850, y 500-760 for the whole shot (lower-right third); the lower-left keeps near desks and a lamp.
//
// Lighting is analytic: a small float texture holds every screen's switch-on time and brightness, and each
// surface shader sums the nearest screens of the row in front of it (with the desk top shadowing what lies below
// it) plus the desk lamps. Glossy desk tops reflect their own screens. Everything is a pure function of time.
import { THREE, register, rng, noise, smooth, clamp, lerp } from '../kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const NR = 6, NC = 19;                    // rows (into depth) x desks per row
const ROW0 = -2.7, RDZ = 3.3;             // screen plane z of row r = ROW0 - r * RDZ
const COL0 = -14.4, CDX = 1.6;            // desk centre x of column c = COL0 + c * CDX
const SY = 1.06;                          // screen centre height
const MEMO = [[0, 11], [1, 10]];          // [row, col] of the memo desks (the first is the hero, locked in frame)
const LAMPS = [[0, 9], [1, 13], [3, 8]];  // desks with a warm lamp (always single-monitor desks)
const CELLW = 512, CELLH = 288, ACOLS = 4, AROWS = 7;
const F = (v) => v.toFixed(3);

// ---------------------------------------------------------------- screen atlas (canvas)
function bakeScreens(seed) {
  const R = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = CELLW * ACOLS; cv.height = 2048;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const kw = ['const', 'let', 'return', 'await', 'import', 'from', 'export', 'function', 'if', 'else', 'for', 'async', 'class', 'new', 'yield'];
  const id = ['data', 'model', 'user', 'query', 'result', 'config', 'items', 'tokens', 'batch', 'request', 'cache', 'embed', 'score', 'train', 'evaluate', 'prompt', 'output', 'context', 'weights', 'logits'];
  const pick = (a) => a[Math.floor(R() * a.length)];
  const lum = [];
  const types = [];
  for (let i = 0; i < ACOLS * AROWS; i++) {
    const x0 = (i % ACOLS) * CELLW, y0 = Math.floor(i / ACOLS) * CELLH;
    g.save(); g.beginPath(); g.rect(x0, y0, CELLW, CELLH); g.clip(); g.translate(x0, y0);
    const type = i < 2 ? 'memo' : ['code', 'code', 'chat', 'chat', 'term', 'doc', 'dash', 'code', 'chat'][Math.floor(R() * 9)];
    types.push(type);
    if (type === 'code') {
      g.fillStyle = '#10161d'; g.fillRect(0, 0, CELLW, CELLH);
      g.fillStyle = '#18212b'; g.fillRect(0, 0, CELLW, 16); g.fillRect(0, 0, 34, CELLH);
      g.fillStyle = '#233140'; g.fillRect(40, 2, 90, 14);
      g.fillStyle = R() < 0.5 ? '#2a6f8a' : '#3a5f8f'; g.fillRect(0, CELLH - 12, CELLW, 12);
      g.font = '17px "IBM Plex Mono"';
      let ind = 0;
      for (let l = 0; l < 11; l++) {
        const y = 40 + l * 21;
        g.fillStyle = '#4d5b6a'; g.fillText(String(l + 1 + Math.floor(R() * 40)).padStart(3), 4, y);
        if (R() < 0.12) continue;
        ind = Math.max(0, Math.min(4, ind + (R() < 0.3 ? 1 : R() < 0.3 ? -1 : 0)));
        let x = 42 + ind * 16;
        const n = 1 + Math.floor(R() * 4);
        for (let w = 0; w < n && x < CELLW - 20; w++) {
          const isK = R() < 0.3, isS = R() < 0.12;
          const s = isS ? `'${pick(id)}'` : isK ? pick(kw) : pick(id) + (R() < 0.3 ? '()' : R() < 0.2 ? '.' + pick(id) : '');
          g.fillStyle = isS ? '#e0a95a' : isK ? '#6cc3bd' : (R() < 0.3 ? '#8fb3e8' : '#c9d3dd');
          g.fillText(s, x, y);
          x += g.measureText(s + ' ').width;
        }
      }
    } else if (type === 'term') {
      g.fillStyle = '#07090b'; g.fillRect(0, 0, CELLW, CELLH);
      g.font = '16px "IBM Plex Mono"';
      for (let l = 0; l < 12; l++) {
        const y = 22 + l * 22, r = R();
        g.fillStyle = r < 0.15 ? '#6cc3bd' : r < 0.2 ? '#f0a63a' : '#9aa5b1';
        const s = r < 0.15 ? `ok  ${pick(id)}/${pick(id)}  ${(R() * 900).toFixed(1)}ms` : r < 0.2 ? `warn ${pick(id)} retry ${Math.floor(R() * 9)}` : `${pick(['epoch', 'step', 'batch', 'loss', 'eval'])} ${Math.floor(R() * 9999)}  ${pick(id)}=${R().toFixed(4)}`;
        g.fillText(s, 6, y);
        if (R() < 0.12) { g.fillStyle = '#1f3a3c'; g.fillRect(300, y - 8, 180, 7); g.fillStyle = '#6cc3bd'; g.fillRect(300, y - 8, 180 * R(), 7); }
      }
    } else if (type === 'memo') {
      // an internal memo, big enough to read at a few metres
      g.fillStyle = '#eef0f2'; g.fillRect(0, 0, CELLW, CELLH);
      g.fillStyle = '#26313c'; g.fillRect(0, 0, CELLW, 22);
      for (let k = 0; k < 3; k++) { g.fillStyle = '#5c6873'; g.beginPath(); g.arc(14 + k * 14, 11, 4, 0, 7); g.fill(); }
      g.fillStyle = '#dfe3e8'; g.fillRect(0, 22, 92, CELLH - 22);
      for (let l = 0; l < 11; l++) { g.fillStyle = l === 1 ? '#3b6f9a' : '#b8c0c9'; g.fillRect(10, 40 + l * 20, 46 + R() * 30, 7); }
      g.fillStyle = '#6a737d'; g.font = '13px Inter'; g.fillText(i === 0 ? 'ALL STAFF  ·  FROM: LEADERSHIP' : 'ALL STAFF  ·  RE: TOOLING POLICY', 108, 46);
      g.fillStyle = '#15191e'; g.font = '600 34px Oswald';
      g.fillText(i === 0 ? 'Use AI for everything.' : 'AI use is now required.', 106, 88);
      g.fillStyle = '#dd4b3e'; g.fillRect(108, 104, 150, 30);
      g.fillStyle = '#ffffff'; g.font = '600 20px Oswald'; g.fillText('MANDATORY', 124, 127);
      for (let l = 0; l < 7; l++) { g.fillStyle = '#9aa3ad'; g.fillRect(108, 154 + l * 16, 330 + R() * 50 - (l % 4 === 3 ? 180 : 0), 6); }
    } else if (type === 'chat') {
      const dark = R() < 0.6;
      g.fillStyle = dark ? '#14181e' : '#eef0f2'; g.fillRect(0, 0, CELLW, CELLH);
      g.fillStyle = dark ? '#0d1014' : '#dfe3e8'; g.fillRect(0, 0, 110, CELLH);
      for (let l = 0; l < 12; l++) { g.fillStyle = dark ? '#3b4450' : '#b8c0c9'; g.fillRect(10, 30 + l * 18, 50 + R() * 40, 6); }
      g.fillStyle = dark ? '#6cc3bd' : '#3b6f9a'; g.fillRect(10, 10, 70, 10);
      let y = 24;
      for (let m = 0; m < 5 && y < CELLH - 50; m++) {
        const user = m % 2 === 0;
        const lines = user ? 1 + Math.floor(R() * 2) : 2 + Math.floor(R() * 4);
        if (user) { g.fillStyle = dark ? '#2a3440' : '#d4dee8'; g.fillRect(CELLW - 40 - 200, y - 4, 200, lines * 12 + 8); }
        for (let l = 0; l < lines; l++) { g.fillStyle = dark ? '#aeb8c2' : '#59626b'; g.fillRect(user ? CELLW - 230 : 130, y + l * 12, (user ? 170 : 300) * (0.6 + 0.4 * R()), 5); }
        y += lines * 12 + 16;
      }
      g.fillStyle = dark ? '#222a33' : '#ffffff'; g.fillRect(130, CELLH - 40, CELLW - 160, 26);
      g.strokeStyle = dark ? '#3b4654' : '#c3cad2'; g.strokeRect(130.5, CELLH - 39.5, CELLW - 161, 25);
      g.fillStyle = dark ? '#6b7682' : '#9aa3ad'; g.font = '11px Inter'; g.fillText('Message...', 140, CELLH - 23);
      g.fillStyle = '#6cc3bd'; g.beginPath(); g.arc(CELLW - 46, CELLH - 27, 8, 0, 7); g.fill();
    } else if (type === 'doc') {
      g.fillStyle = '#d9dde2'; g.fillRect(0, 0, CELLW, CELLH);
      g.fillStyle = '#fbfbfa'; g.fillRect(120, 10, 270, CELLH);
      g.fillStyle = '#2b3036'; g.fillRect(140, 30, 160, 9);
      for (let l = 0; l < 17; l++) { g.fillStyle = '#8f979f'; g.fillRect(140, 52 + l * 13, 220 - (l % 5 === 4 ? 120 : R() * 20), 4); }
    } else {
      g.fillStyle = '#0e1318'; g.fillRect(0, 0, CELLW, CELLH);
      for (let p = 0; p < 4; p++) {
        const px = 10 + (p % 2) * 250, py = 10 + Math.floor(p / 2) * 138;
        g.fillStyle = '#151c24'; g.fillRect(px, py, 240, 128);
        g.strokeStyle = p % 2 ? '#f0a63a' : '#6cc3bd'; g.lineWidth = 2; g.beginPath();
        let v = 60;
        for (let x = 0; x < 220; x += 8) { v = Math.max(15, Math.min(110, v + (R() - 0.48) * 22)); x === 0 ? g.moveTo(px + 10 + x, py + v) : g.lineTo(px + 10 + x, py + v); }
        g.stroke();
        if (p === 3) for (let b = 0; b < 12; b++) { g.fillStyle = '#7b97bd'; const h = 20 + R() * 80; g.fillRect(px + 14 + b * 18, py + 118 - h, 10, h); }
      }
    }
    // average luminance: how much light the screen throws
    const d = g.getImageData(0, 0, CELLW, CELLH).data;
    let s = 0;
    for (let k = 0; k < d.length; k += 64) s += (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255;
    lum.push(s / (d.length / 64));
    g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
  return { tex, lum, types };
}

// ---------------------------------------------------------------- shared GLSL
const COMMON = /* glsl */`
uniform float uTime;
uniform sampler2D tTab;      // NC x NR: r = on time, g = brightness, b = present, a = 0 single, 1 dual, 2 big memo screen
uniform sampler2D tCh;       // NC x NR: chair r = dx, g = dz, b = present
uniform vec4 uLampP[3];      // xyz position, w intensity
uniform vec3 uFog;
uniform float uFogDen;
uniform float uFill;         // 0..1: share of the room's screens that are on (soft bounce light)
varying vec3 vW;
varying vec3 vN;
const float COL0 = ${F(COL0)}, CDX = ${F(CDX)}, ROW0 = ${F(ROW0)}, RDZ = ${F(RDZ)}, SY = ${F(SY)};
float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec4 tab(float c, float r){ return texture2D(tTab, vec2((c + 0.5) / ${NC}.0, (r + 0.5) / ${NR}.0)); }
vec4 chairAt(float c, float r){ return texture2D(tCh, vec2((c + 0.5) / ${NC}.0, (r + 0.5) / ${NR}.0)); }
// screen power: off before its time, a short stutter, then on
float scrOn(float tOn, float seed){
  float dt = uTime - tOn;
  if (dt < 0.0) return 0.0;
  float st = dt < 0.32 ? step(0.45, h11(floor(dt * 24.0) + seed * 17.0)) * 0.9 + 0.1 : 1.0;
  return st * smoothstep(0.0, 0.04, dt);
}
// light from one screen centre S (facing +z) of a desk whose screen plane is at zs; the desk top (y = 0.75)
// shadows the points below it, with a soft penumbra
vec3 scrLight(vec3 p, vec3 n, vec3 S, float I, float dx, float zs){
  vec3 D = S - p;
  float d2 = dot(D, D);
  vec3 l = D * inversesqrt(d2);
  float emit = max(-l.z, 0.0);
  emit = emit * (0.3 + 0.7 * emit);
  float occ = 1.0;
  if (p.y < 0.745) {
    float t = (0.75 - p.y) / max(S.y - p.y, 0.01);
    vec2 h = p.xz + (S.xz - p.xz) * t;
    occ = 1.0 - smoothstep(0.80, 0.72, abs(h.x - dx)) * smoothstep(zs + 0.84, zs + 0.70, h.y);
  }
  float lam = max(dot(n, l) * 0.9 + 0.1, 0.0);
  return vec3(0.60, 0.75, 1.0) * I * lam * emit * occ / (d2 * 1.4 + 0.05);
}
vec3 officeLight(vec3 p, vec3 n){
  // the room is near-black: a trace of night sky from the windows
  vec3 L = vec3(0.0016, 0.0021, 0.0034) * (0.6 + 0.4 * n.y) + vec3(0.0012, 0.0016, 0.0028) * max(-n.z, 0.0);
  // soft bounce that grows as the room's screens come on
  L += vec3(0.008, 0.010, 0.016) * uFill * (0.55 + 0.45 * n.y) * (0.45 + 0.55 * smoothstep(-0.2, 1.2, p.y));
  // the row whose screens are just behind p (screens face +z)
  float rf = (ROW0 - p.z) / RDZ;
  float r = ceil(rf - 0.02);
  if (r >= 0.0 && r < ${NR}.0) {
    float zs = ROW0 - r * RDZ;
    float c0 = floor((p.x - COL0) / CDX + 0.5);
    for (int i = -1; i <= 1; i++) {
      float c = c0 + float(i);
      if (c < 0.0 || c >= ${NC}.0) continue;
      vec4 t = tab(c, r);
      if (t.b < 0.5) continue;
      float I = scrOn(t.r, c + r * 31.0) * t.g;
      if (I <= 0.0) continue;
      float dx = COL0 + c * CDX;
      if (abs(t.a - 1.0) < 0.5) {
        L += scrLight(p, n, vec3(dx - 0.34, SY, zs + 0.02), I * 0.75, dx, zs);
        L += scrLight(p, n, vec3(dx + 0.34, SY, zs + 0.02), I * 0.75, dx, zs);
      } else {
        L += scrLight(p, n, vec3(dx + (mod(c, 3.0) - 1.0) * 0.08, SY, zs + 0.02), I, dx, zs);
      }
    }
  }
  for (int j = 0; j < 3; j++) {
    vec3 D = uLampP[j].xyz - p;
    float d2 = dot(D, D);
    vec3 l = D * inversesqrt(d2);
    // lamp shade: light goes down and out, not up (l points from p up to the bulb)
    float cone = smoothstep(-0.05, 0.6, l.y);
    L += vec3(1.0, 0.60, 0.26) * uLampP[j].w * max(dot(n, l), 0.0) * cone / (d2 * 1.5 + 0.02);
  }
  return L;
}
vec3 fogIt(vec3 c, vec3 wp){
  float d = length(wp - cameraPosition);
  return mix(max(c, vec3(0.0)), uFog, 1.0 - exp(-uFogDen * d));
}
`;

const VERT_PX = /* glsl */`
varying vec3 vL;
varying vec3 vNL;
void main(){
#ifdef USE_INSTANCING
  mat4 m = modelMatrix * instanceMatrix;
#else
  mat4 m = modelMatrix;
#endif
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * normal);
  vL = position; vNL = normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
// vertex-lit variant for small things in shadow (legs, mugs, papers, lamp arms)
const VERT_VX = /* glsl */`
uniform vec3 uAlb;
varying vec3 vCol;
void main(){
#ifdef USE_INSTANCING
  mat4 m = modelMatrix * instanceMatrix;
#else
  mat4 m = modelMatrix;
#endif
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * normal);
  vec3 alb = uAlb;
#ifdef USE_INSTANCING_COLOR
  alb *= instanceColor;
#endif
  vec3 V = normalize(cameraPosition - w.xyz);
  float rim = pow(1.0 - clamp(abs(dot(vN, V)), 0.0, 1.0), 3.0);
  vec3 back = officeLight(w.xyz, normalize(vec3(0.0, 0.3, -1.0)));
  vCol = fogIt(alb * officeLight(w.xyz, vN) + back * rim * 0.12, w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FRAG_VX = /* glsl */`
varying vec3 vCol;
void main(){ gl_FragColor = vec4(vCol, 1.0); }
`;

// desk tops: laminate with grain and per-desk tint, a rounded front edge that catches light, contact shadows
// under keyboard and monitor feet, and a glossy reflection of the desk's own screens
const DESK_FRAG = /* glsl */`
varying vec3 vL;
varying vec3 vNL;
float boxD(vec2 q, vec2 b){ vec2 d = abs(q) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float scrRefl(vec3 p, vec3 R, vec3 S, vec2 hs){
  // the reflected ray against one screen rectangle (half size hs) at plane z = S.z
  float t = (S.z - p.z) / min(R.z, -1e-3);
  vec3 h = p + R * t;
  float w = 0.006 + 0.07 * t;                // glossy blur grows with distance from the reflector
  vec2 e = abs(h.xy - S.xy) - hs;
  return (1.0 - smoothstep(-w, w, max(e.x, e.y))) * step(0.0, t);
}
void main(){
  vec3 n = normalize(vN);
  float c = floor((vW.x - COL0) / CDX + 0.5), r = floor((ROW0 + 0.36 - vW.z) / RDZ + 0.5);
  vec4 t = tab(c, r);
  float dx = COL0 + c * CDX, zs = ROW0 - r * RDZ;
  vec3 L = officeLight(vW, n);
  float tint = h21(vec2(c, r) + 3.1);
  float grain = vn(vec2(vW.x * 2.5, vW.z * 34.0) + vec2(c * 7.0, r * 3.0));
  vec3 alb = mix(vec3(0.22, 0.215, 0.20), vec3(0.27, 0.245, 0.21), tint) * (0.88 + 0.2 * grain);
  vec3 col;
  if (n.y > 0.5) {
    // contact shadows: keyboard, monitor feet (single or dual), a soft darkening toward the back edge
    float kb = boxD(vW.xz - vec2(dx + (mod(c, 3.0) - 1.0) * 0.06, zs + 0.42), vec2(0.22, 0.07));
    float ao = 1.0 - 0.8 * exp(-max(kb, 0.0) / 0.025);
    bool dual = abs(t.a - 1.0) < 0.5, big = t.a > 1.5;
    if (dual) {
      ao *= 1.0 - 0.7 * exp(-max(boxD(vW.xz - vec2(dx - 0.34, zs - 0.05), vec2(0.12, 0.10)), 0.0) / 0.03);
      ao *= 1.0 - 0.7 * exp(-max(boxD(vW.xz - vec2(dx + 0.34, zs - 0.05), vec2(0.12, 0.10)), 0.0) / 0.03);
    } else {
      ao *= 1.0 - 0.7 * exp(-max(boxD(vW.xz - vec2(dx + (mod(c, 3.0) - 1.0) * 0.08, zs - 0.05), vec2(0.12, 0.10)), 0.0) / 0.03);
    }
    ao *= 0.75 + 0.25 * smoothstep(zs - 0.04, zs + 0.25, vW.z);
    col = alb * L * ao;
    // the screens mirrored in the laminate
    vec3 V = normalize(cameraPosition - vW);
    vec3 R = vec3(-V.x, V.y, -V.z);
    float Fr = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
    float I = t.b * scrOn(t.r, c + r * 31.0) * t.g;
    vec2 hs = big ? vec2(0.36, 0.21) : vec2(0.305, 0.1775);
    float refl = dual ? scrRefl(vW, R, vec3(dx - 0.34, SY, zs + 0.02), hs) + scrRefl(vW, R, vec3(dx + 0.34, SY, zs + 0.02), hs)
                      : scrRefl(vW, R, vec3(dx + (mod(c, 3.0) - 1.0) * 0.08, big ? SY + 0.06 : SY, zs + 0.02), hs);
    col += vec3(0.55, 0.68, 0.95) * I * refl * Fr * 0.42 * ao;
    // rounded front edge catching the light
    float edge = smoothstep(zs + 0.735, zs + 0.755, vW.z);
    col += edge * (L * 0.35 + vec3(0.004, 0.005, 0.007));
  } else {
    // the edge band of the desk top
    col = alb * 0.7 * L + vec3(0.002, 0.0025, 0.0035);
  }
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;

// carpet tiles: soft pools where the screens reach past the desks, dark under desks and chairs
const FLOOR_FRAG = /* glsl */`
void main(){
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec2 q = vW.xz / 0.5;
  vec2 f = fract(q);
  float tile = h21(floor(q));
  float lod = smoothstep(0.3, 1.0, fwidth(q.x) * 6.0);
  float seam = (1.0 - smoothstep(0.0, fwidth(q.x) * 1.5 + 0.02, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)))) * (1.0 - lod);
  float stripe = mix(0.85 + 0.15 * step(0.5, fract((tile > 0.5 ? q.x : q.y) * 6.0)), 0.925, lod);
  vec3 alb = vec3(0.09, 0.10, 0.12) * (0.85 + 0.3 * tile) * stripe * (1.0 - seam * 0.35);
  // chairs: a soft contact shadow under each
  float r = floor((ROW0 + 1.25 - vW.z) / RDZ + 0.5);
  float c0 = floor((vW.x - COL0) / CDX + 0.5);
  float ao = 1.0;
  for (int i = -1; i <= 1; i++) {
    float c = c0 + float(i);
    if (c < 0.0 || c >= ${NC}.0 || r < 0.0 || r >= ${NR}.0) continue;
    vec4 ch = chairAt(c, r);
    vec2 cp = vec2(COL0 + c * CDX + ch.r, ROW0 - r * RDZ + 1.05 + ch.g);
    vec2 d = vW.xz - cp;
    ao *= 1.0 - 0.75 * ch.b * exp(-dot(d, d) / 0.07);
  }
  // under the desks
  float zr = floor((ROW0 + 0.36 - vW.z) / RDZ + 0.5);
  float zs = ROW0 - zr * RDZ;
  ao *= 1.0 - 0.6 * smoothstep(zs + 0.95, zs + 0.6, vW.z) * smoothstep(zs - 0.3, zs, vW.z);
  gl_FragColor = vec4(fogIt(alb * officeLight(vW, n) * ao, vW), 1.0);
}
`;
const CEIL_FRAG = /* glsl */`
void main(){
  vec2 q = vW.xz / 0.6;
  vec2 f = fract(q);
  float grid = 1.0 - smoothstep(0.0, fwidth(q.x) * 1.2 + 0.015, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  vec2 pq = vW.xz / vec2(2.4, 3.3);
  vec2 pf = abs(fract(pq) - 0.5);
  float panel = step(pf.x, 0.25) * step(pf.y, 0.18);
  vec3 alb = mix(vec3(0.20, 0.21, 0.22), vec3(0.30, 0.32, 0.34), panel) * (1.0 - grid * 0.5);
  vec3 L = officeLight(vW, vec3(0.0, -1.0, 0.0)) + vec3(0.0015, 0.002, 0.003);
  gl_FragColor = vec4(fogIt(alb * L * 0.35, vW), 1.0);
}
`;
// back wall: a band of windows with a soft, out-of-focus night city behind the glass
const WALL_FRAG = /* glsl */`
uniform float uCity;
vec3 bokeh(vec2 g, float seed, float rad){
  vec2 cell = floor(g);
  vec3 acc = vec3(0.0);
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    vec2 c = cell + vec2(float(i), float(j));
    float h = h21(c + seed);
    if (h < 0.5) continue;
    vec2 ctr = c + 0.5 + (vec2(h21(c + seed + 1.3), h21(c + seed + 2.9)) - 0.5) * 0.9;
    float d = length(g - ctr);
    float disc = smoothstep(rad, rad * 0.62, d) * (0.85 + 0.15 * smoothstep(rad * 0.4, rad * 0.9, d));   // soft, a faint lens rim
    vec3 bc = h < 0.62 ? vec3(1.0, 0.62, 0.30) : (h < 0.85 ? vec3(0.50, 0.66, 1.0) : vec3(0.95, 0.92, 0.85));
    acc += bc * disc * (0.35 + 0.65 * h21(c + seed + 7.7));
  }
  return acc;
}
void main(){
  vec3 n = normalize(vN);
  float y = vW.y;
  float win = step(0.85, y) * step(y, 2.55);
  float mul = 1.0 - smoothstep(0.0, fwidth(vW.x) * 1.5 + 0.01, abs(fract(vW.x / 1.8) - 0.5) * 1.8 - 0.86);
  vec3 col = vec3(0.05, 0.055, 0.06) * officeLight(vW, n);
  if (win > 0.5) {
    // night sky: deep blue above, a warm city glow near the horizon line
    vec3 sky = mix(vec3(0.020, 0.016, 0.018), vec3(0.006, 0.010, 0.022), smoothstep(1.0, 2.5, y));
    vec3 city = sky;
    city += bokeh(vec2(vW.x, y) / vec2(0.62, 0.42), 7.0, 0.42) * 0.05 * smoothstep(2.6, 1.2, y);
    city += bokeh(vec2(vW.x + 9.0, y) / vec2(0.30, 0.22), 19.0, 0.36) * 0.03 * smoothstep(2.0, 0.9, y);
    col = mix(vec3(0.003), city * uCity, mul);       // mul = 1 on the glass, 0 on the mullions
  }
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;
// structural columns: painted concrete, lit on the faces the screens reach
const COLUMN_FRAG = /* glsl */`
void main(){
  vec3 n = normalize(vN);
  vec3 L = officeLight(vW, n) + officeLight(vW, normalize(vec3(n.x, 0.0, -1.0))) * 0.25;
  float m = vn(vW.xy * vec2(3.0, 1.5) + vW.z) * 0.6 + vn(vW.zy * 9.0) * 0.4;
  vec3 alb = vec3(0.22, 0.225, 0.23) * (0.85 + 0.25 * m);
  alb *= 1.0 - 0.45 * step(vW.y, 0.12);
  gl_FragColor = vec4(fogIt(alb * L, vW), 1.0);
}
`;

// screens: content from the atlas, power state from the table
const SCREEN_VERT = /* glsl */`
attribute vec4 aScr;   // x: column, y: row, z: atlas cell, w: second monitor of a dual desk
varying vec2 vUv;
varying vec4 vScr;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz; vN = vec3(0.0, 0.0, 1.0);
  vUv = uv; vScr = aScr;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const SCREEN_FRAG = /* glsl */`
uniform sampler2D tAtlas;
varying vec2 vUv;
varying vec4 vScr;
void main(){
  vec4 sc = floor(vScr + 0.5);     // per-instance ids arrive as interpolated floats: round them
  vec4 t = tab(sc.x, sc.y);
  float seed = sc.x + sc.y * 31.0;
  float on = scrOn(t.r + sc.w * 0.06, seed);
  float dt = uTime - t.r - sc.w * 0.06;
  float content = smoothstep(0.10, 0.36, dt);
  float cell = sc.z;
  vec2 uv = vUv;
  // a few screens scroll (code, logs)
  float scroll = h11(seed + 3.1) < 0.35 ? fract(uTime * 0.05 * (0.5 + h11(seed))) : 0.0;
  uv.y = fract(uv.y + scroll * step(0.5, h11(cell * 1.7)) * step(1.5, cell));
  vec2 a = vec2((mod(cell, 4.0) + uv.x) / 4.0, 1.0 - (floor(cell / 4.0) + (1.0 - uv.y)) * ${CELLH}.0 / 2048.0);
  vec3 img = texture2D(tAtlas, a, 0.4).rgb;
  img = img * img;                                   // to linear-ish
  vec3 back = vec3(0.05, 0.06, 0.085);              // backlight before the content draws
  vec3 col = mix(back, img * 1.3 + 0.012, content) * on;
  vec2 e = abs(vUv - 0.5) * 2.0;
  col *= 1.0 - 0.2 * pow(max(e.x, e.y), 6.0);
  // glass: a faint cold reflection when off
  col += vec3(0.003, 0.0035, 0.005) * (1.0 - on) * (0.4 + 0.6 * vUv.y);
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;
// soft bloom around each screen (our own bloom pass): wide, low and fading with distance, no hard rim
const GLOW_VERT = /* glsl */`
attribute vec4 aScr;
varying vec2 vUv;
varying vec4 vScr;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz; vN = vec3(0.0);
  vUv = uv; vScr = aScr;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const GLOW_FRAG = /* glsl */`
uniform float uGain;
uniform vec2 uSize;
varying vec2 vUv;
varying vec4 vScr;
void main(){
  vec4 sc = floor(vScr + 0.5);
  vec4 t = tab(sc.x, sc.y);
  float dt = uTime - t.r - sc.w * 0.06;
  float on = scrOn(t.r + sc.w * 0.06, sc.x + sc.y * 31.0) * t.g * (0.25 + 0.75 * smoothstep(0.10, 0.36, dt));
  vec2 q = (vUv - 0.5) * uSize;
  vec2 e = max(abs(q) - vec2(0.305, 0.1775), 0.0);
  float d = length(e * vec2(1.0, q.y < 0.0 ? 0.7 : 1.3));     // spreads further down, toward the desk
  float a = exp(-d / 0.06) * 0.22 + exp(-d / 0.22) * 0.08;
  float dist = length(vW - cameraPosition);
  a *= exp(-dist * 0.14);
  gl_FragColor = vec4(vec3(0.55, 0.70, 1.0) * a * on * uGain, 1.0);
}
`;
// monitor bodies: dark plastic, the bezel catches its own screen's spill and a thin highlight on the outer lip
const MON_VERT = /* glsl */`
attribute vec4 aScr;
varying vec4 vScr;
varying vec3 vL;
varying vec3 vNL;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(m) * normal);
  vL = position; vNL = normal; vScr = aScr;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const MON_FRAG = /* glsl */`
varying vec4 vScr;
varying vec3 vL;
varying vec3 vNL;
void main(){
  vec4 sc = floor(vScr + 0.5);
  vec4 t = tab(sc.x, sc.y);
  float on = scrOn(t.r + sc.w * 0.06, sc.x + sc.y * 31.0) * t.g;
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 col = vec3(0.030, 0.031, 0.034) * officeLight(vW, n);
  float rim = pow(1.0 - abs(dot(n, V)), 3.0);
  col += officeLight(vW, normalize(vec3(0.0, 0.3, -1.0))) * rim * 0.10;
  if (vNL.z > 0.5 && vL.y > -0.21) {
    // front bezel (screen half size 0.305 x 0.1775 in this geometry's units)
    vec2 e = abs(vL.xy) - vec2(0.305, 0.1775);
    float dIn = max(max(e.x, e.y), 0.0);
    col += vec3(0.55, 0.68, 1.0) * on * 0.10 * exp(-dIn / 0.004);
    vec2 eo = vec2(0.32, 0.195) - abs(vL.xy);
    float lip = exp(-max(min(eo.x, eo.y), 0.0) / 0.0018);
    col += vec3(0.6, 0.7, 0.85) * lip * (0.012 + 0.05 * uFill + 0.05 * on);
  }
  if (vNL.y > 0.5) col += vec3(0.6, 0.7, 0.85) * (0.004 + 0.02 * uFill);   // top edge
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;
// keyboards: dark keys on a dark deck, the key tops catch the screen light
const KEY_FRAG = /* glsl */`
varying vec3 vL;
varying vec3 vNL;
void main(){
  vec3 n = normalize(vN);
  vec3 L = officeLight(vW, n);
  vec3 col = vec3(0.035, 0.036, 0.04) * L;
  if (vNL.y > 0.5) {
    vec2 q = (vL.xz + vec2(0.22, 0.07)) / vec2(0.44, 0.14) * vec2(16.0, 5.0);
    vec2 f = abs(fract(q) - 0.5);
    float w = fwidth(q.x) + 1e-3;
    float key = (1.0 - smoothstep(0.36 - w, 0.36 + w, f.x)) * (1.0 - smoothstep(0.34 - w, 0.34 + w, f.y));
    key = mix(key, 0.55, smoothstep(0.3, 1.0, w * 3.0));
    col = mix(col * 0.5, vec3(0.07, 0.072, 0.08) * L, key);
  }
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;
// chairs (opaque parts): black plastic and aluminium, a rim of screen light on the silhouette edges
const CHAIR_FRAG = /* glsl */`
varying vec3 vL;
varying vec3 vNL;
void main(){
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float metal = step(vL.y, 0.40);                  // base and gas lift are polished metal
  vec3 alb = mix(vec3(0.045, 0.047, 0.052), vec3(0.16, 0.165, 0.17), metal);
  vec3 col = alb * officeLight(vW, n);
  float rim = pow(1.0 - abs(dot(n, V)), 2.5);
  vec3 back = officeLight(vW, normalize(vec3(n.x * 0.5, 0.35, -1.0)));
  col += back * rim * (0.22 + 0.4 * metal);
  // metal: a specular glint of the screens behind
  col += back * metal * pow(max(dot(reflect(-V, n), normalize(vec3(0.0, 0.4, -1.0))), 0.0), 12.0) * 0.6;
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;
// the woven mesh back: see-through (the screen glow behind it shows through), threads backlit
const MESH_FRAG = /* glsl */`
varying vec3 vL;
varying vec3 vNL;
void main(){
  vec3 n = normalize(vN);
  vec2 q = vec2(vL.x + vL.y, vL.x - vL.y) * 150.0;          // diagonal weave, ~7 mm pitch
  vec2 f = abs(fract(q) - 0.5);
  vec2 w = fwidth(q) + 1e-3;
  float th = max(1.0 - smoothstep(0.16 - w.x, 0.16 + w.x, f.x), 1.0 - smoothstep(0.16 - w.y, 0.16 + w.y, f.y));
  float lodM = smoothstep(0.25, 0.9, max(w.x, w.y));
  float dens = mix(th, 0.55, lodM);
  float a = 0.28 + 0.52 * dens;
  vec3 back = officeLight(vW, normalize(vec3(0.0, 0.3, -1.0)));
  vec3 col = vec3(0.05, 0.052, 0.058) * (officeLight(vW, n) + back * 0.9) + back * 0.05 * dens;
  gl_FragColor = vec4(fogIt(col, vW) * a, a);
}
`;
const LAMPGLOW_FRAG = /* glsl */`
varying vec2 vUv;
uniform float uGain;
void main(){
  vec2 q = (vUv - 0.5) * 2.0;
  float r = length(q);
  float a = exp(-r * r * 5.0) * 0.30 + exp(-r * r * 40.0) * 0.8;
  float d = length(vW - cameraPosition);
  gl_FragColor = vec4(vec3(1.0, 0.64, 0.30) * a * uGain * exp(-uFogDen * d), 1.0);
}
`;
const VERT_UV = /* glsl */`
varying vec2 vUv;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz; vN = vec3(0.0); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// a mesh office chair, built at the origin facing -z (toward its desk)
function chairGeometries() {
  const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
  // backrest outline: a shield with a slight waist, curved around the sitter
  const pts = [[-0.215, 0.0], [-0.195, 0.16], [-0.205, 0.34], [-0.22, 0.48], [-0.16, 0.555], [0.0, 0.57], [0.16, 0.555], [0.22, 0.48], [0.205, 0.34], [0.195, 0.16], [0.215, 0.0], [0.0, -0.02]];
  const bend = (x) => 0.07 * (x / 0.22) * (x / 0.22);
  const tilt = new THREE.Matrix4().makeRotationX(-0.17), place = new THREE.Matrix4().makeTranslation(0, 0.63, 0.23);
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, -bend(x))), true, 'centripetal');
  const frame = new THREE.TubeGeometry(curve, 72, 0.013, 6, true).applyMatrix4(tilt).applyMatrix4(place);
  const shape = new THREE.Shape(curve.getPoints(60).map((p) => new THREE.Vector2(p.x, p.y)));
  const panel = new THREE.ShapeGeometry(shape, 8);
  const pp = panel.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setZ(i, -bend(pp.getX(i)));
  panel.computeVertexNormals();
  panel.applyMatrix4(tilt).applyMatrix4(place);
  const parts = [
    new RoundedBoxGeometry(0.48, 0.07, 0.46, 2, 0.03).translate(0, 0.47, 0),
    new THREE.BoxGeometry(0.05, 0.22, 0.03).translate(0, 0.56, 0.24),                   // spine to the back
    new THREE.CylinderGeometry(0.026, 0.026, 0.34, 10).translate(0, 0.26, 0.02),
    new THREE.CylinderGeometry(0.04, 0.04, 0.10, 10).translate(0, 0.40, 0.02),
    new THREE.BoxGeometry(0.03, 0.18, 0.03).translate(-0.25, 0.6, 0.05), new THREE.BoxGeometry(0.03, 0.18, 0.03).translate(0.25, 0.6, 0.05),
    new RoundedBoxGeometry(0.06, 0.03, 0.25, 2, 0.012).translate(-0.25, 0.70, 0.02), new RoundedBoxGeometry(0.06, 0.03, 0.25, 2, 0.012).translate(0.25, 0.70, 0.02),
  ];
  for (let k = 0; k < 5; k++) {
    parts.push(new THREE.BoxGeometry(0.035, 0.03, 0.3).translate(0, 0.07, 0.15).rotateY(k * Math.PI * 2 / 5));
    parts.push(new THREE.SphereGeometry(0.025, 8, 5).translate(0, 0.025, 0.29).rotateY(k * Math.PI * 2 / 5));
  }
  const body = mergeGeometries([...parts, frame].map((g) => { g = nonIdx(g); g.deleteAttribute('uv'); return g; }));
  const mesh = nonIdx(panel); mesh.deleteAttribute('uv');
  return { body, mesh };
}

register('office_screens', (opts) => {
  const waveAt = opts.waveAt ?? 0.5, waveDur = Math.max(0.05, opts.waveDur ?? 2.2);
  const R = rng(opts.seed ?? 3);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010204);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 80);

  const atlas = bakeScreens(11);
  const memoSet = new Set(MEMO.map(([r, c]) => r * NC + c)), lampSet = new Set(LAMPS.map(([r, c]) => r * NC + c));
  const [hr, hc] = MEMO[0];
  const M = new THREE.Vector3(COL0 + hc * CDX + (hc % 3 - 1) * 0.08, SY, ROW0 - hr * RDZ);    // the hero memo screen

  // ---- screen table: on time / brightness / present / dual per desk
  const tabData = new Float32Array(NC * NR * 4), chData = new Float32Array(NC * NR * 4);
  const origin = new THREE.Vector2(M.x - 0.6, M.z + 0.5);       // the wave starts at the near memo desk and rolls back
  const maxD = Math.hypot(NC * CDX * 0.75, NR * RDZ + 1);
  const desks = [];
  for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
    const x = COL0 + c * CDX, z = ROW0 - r * RDZ;
    const key = r * NC + c;
    const memo = memoSet.has(key), lamp = lampSet.has(key);
    const present = memo || lamp || R() < 0.9 || (r === 0 && c >= 8 && c <= 13) ? 1 : 0;
    const dual = !memo && !lamp && R() < 0.3 ? 1 : 0;
    let cell = 2 + Math.floor(R() * (ACOLS * AROWS - 2));
    if (memo) cell = key === MEMO[0][0] * NC + MEMO[0][1] ? 0 : 1;
    const d = Math.hypot(x - origin.x, z - origin.y) / maxD;
    let tOn = waveAt + waveDur * clamp(d / 0.85) + (R() - 0.5) * 0.16;
    if (memo) tOn = waveAt + (key === MEMO[0][0] * NC + MEMO[0][1] ? 0.0 : 0.22);
    const night = (r === 1 && c === 7) || (r === 3 && c === 10) || (r === 2 && c === 6) || (r === 4 && c === 12) || (r === 2 && c === 14);   // a few screens were never off
    const i = key * 4;
    tabData[i] = night ? -10 : tOn;
    tabData[i + 1] = memo ? 1.25 : 0.35 + 1.5 * atlas.lum[cell];
    tabData[i + 2] = present;
    tabData[i + 3] = memo ? 2 : dual;
    // chairs: empty, pushed back at odd angles; the memo desks' chairs are rolled aside so the screen reads
    const hasChair = R() < 0.9;
    let cx = (R() - 0.5) * 0.3, cz = R() * 0.35, yaw = (R() - 0.5) * 0.8;
    if (memo) { cx = 0.62; cz = 0.3; yaw = -1.1; }       // rolled aside, out of the line of sight
    chData[i] = cx; chData[i + 1] = cz; chData[i + 2] = hasChair ? 1 : 0; chData[i + 3] = yaw;
    desks.push({ r, c, x, z, present, dual, memo, lamp, cell, cell2: 2 + Math.floor(R() * (ACOLS * AROWS - 2)), hasChair, cx, cz, yaw });
  }
  const mkTab = (data) => {
    const t = new THREE.DataTexture(data, NC, NR, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
    return t;
  };
  const tTab = mkTab(tabData), tCh = mkTab(chData);
  // the share of screens lit at time t (drives the soft bounce light): sampled from the table
  const onTimes = desks.filter((d) => d.present).map((d) => tabData[(d.r * NC + d.c) * 4]);
  const fillAt = (t) => onTimes.reduce((a, tOn) => a + clamp((t - tOn) / 0.3), 0) / onTimes.length;

  // lamps beside their monitors (never in front of them)
  const lampPos = LAMPS.map(([r, c]) => new THREE.Vector4(COL0 + c * CDX + 0.70, 1.13, ROW0 - r * RDZ + 0.14, 0.2));

  const shared = {
    uTime: { value: 0 }, tTab: { value: tTab }, tCh: { value: tCh },
    uLampP: { value: lampPos }, uFill: { value: 0 },
    uFog: { value: new THREE.Color(0.0025, 0.0035, 0.006) }, uFogDen: { value: 0.05 },
  };
  const mk = (frag, alb, vert = VERT_PX, extra = {}, params = {}) => new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlb: { value: new THREE.Color(...alb) }, ...extra },
    vertexShader: COMMON + vert, fragmentShader: COMMON + frag, ...params,
  });
  const vx = (alb) => mk(FRAG_VX, alb, VERT_VX);
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), E = new THREE.Euler();
  const place = (im, i, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) => {
    Q.setFromEuler(E.set(0, yaw, 0)); P.set(x, y, z); S.set(sx, sy, sz);
    Mx.compose(P, Q, S); im.setMatrixAt(i, Mx);
  };

  // ---- room
  const W = 80, D0 = 4, D1 = ROW0 - NR * RDZ - 1.5;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D0 - D1), mk(FLOOR_FRAG, [1, 1, 1]));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (D0 + D1) / 2); scene.add(floor);
  // big per-pixel planes last, so desks, chairs and monitors in front of them reject their fragments early
  floor.renderOrder = 3;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D0 - D1), mk(CEIL_FRAG, [1, 1, 1]));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 2.9, (D0 + D1) / 2); scene.add(ceil);
  ceil.renderOrder = 3;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.9), mk(WALL_FRAG, [1, 1, 1], VERT_PX, { uCity: { value: 4.0 } }));
  back.position.set(0, 1.45, D1); scene.add(back);
  back.renderOrder = 3;
  // columns
  {
    const g = new THREE.BoxGeometry(0.55, 2.9, 0.55);
    const cols = [[-6.4, ROW0 - 1.5 * RDZ], [5.6, ROW0 - 3.5 * RDZ], [-0.8, ROW0 - 4.5 * RDZ + 0.2], [10.4, ROW0 - 1.5 * RDZ], [-11.2, ROW0 - 3.5 * RDZ]];
    const im = new THREE.InstancedMesh(g, mk(COLUMN_FRAG, [1, 1, 1]), cols.length);
    cols.forEach(([x, z], i) => place(im, i, x, 1.45, z));
    scene.add(im);
  }

  // ---- desks (tops per pixel, legs / modesty panels vertex lit)
  const nD = desks.length;
  {
    const top = new THREE.InstancedMesh(new THREE.BoxGeometry(1.54, 0.03, 0.8), mk(DESK_FRAG, [1, 1, 1]), nD);
    const legG = mergeGeometries([
      new THREE.BoxGeometry(0.04, 0.72, 0.7).translate(-0.72, 0.36, 0),
      new THREE.BoxGeometry(0.04, 0.72, 0.7).translate(0.72, 0.36, 0),
      new THREE.BoxGeometry(1.4, 0.32, 0.02).translate(0, 0.5, -0.36),
    ]);
    const legs = new THREE.InstancedMesh(legG, vx([0.06, 0.063, 0.068]), nD);
    desks.forEach((d, i) => { place(top, i, d.x, 0.735, d.z + 0.36); place(legs, i, d.x, 0, d.z + 0.36); });
    scene.add(top, legs);
  }

  // ---- monitors
  const scr = [];
  desks.forEach((d) => {
    if (!d.present) return;
    if (d.dual) { scr.push([d, -0.34, d.cell, 0.12, 0, 1]); scr.push([d, 0.34, d.cell2, -0.12, 1, 1]); }
    else scr.push([d, (d.c % 3 - 1) * 0.08, d.cell, 0, 0, d.memo ? 1.18 : 1]);      // the memo desks have a bigger screen
  });
  {
    const n = scr.length;
    const bodyG = mergeGeometries([
      new THREE.BoxGeometry(0.64, 0.39, 0.025).translate(0, 0, -0.013),
      new THREE.BoxGeometry(0.05, 0.3, 0.03).translate(0, -0.27, -0.05),
      new THREE.BoxGeometry(0.24, 0.012, 0.2).translate(0, -0.33, -0.05),
    ]);
    const aScr = new Float32Array(n * 4);
    const body = new THREE.InstancedMesh(bodyG, mk(MON_FRAG, [1, 1, 1], MON_VERT), n);
    const sg = new THREE.PlaneGeometry(0.61, 0.355);
    const screens = new THREE.InstancedMesh(sg, new THREE.ShaderMaterial({
      uniforms: { ...shared, tAtlas: { value: atlas.tex } }, vertexShader: COMMON + SCREEN_VERT, fragmentShader: COMMON + SCREEN_FRAG,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
    }), n);
    const GW = 1.5, GH = 1.15;
    const gg = new THREE.PlaneGeometry(GW, GH);
    const glow = new THREE.InstancedMesh(gg, new THREE.ShaderMaterial({
      uniforms: { ...shared, uGain: { value: 0.16 }, uSize: { value: new THREE.Vector2(GW, GH) } }, vertexShader: COMMON + GLOW_VERT, fragmentShader: COMMON + GLOW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), n);
    scr.forEach(([d, dx, cell, yaw, k, sc], i) => {
      const x = d.x + dx, z = d.z;
      // the big memo monitor keeps its foot on the desk
      place(body, i, x, SY + (sc - 1) * 0.33, z, yaw, sc, sc, 1);
      place(screens, i, x + Math.sin(yaw) * 0.004, SY + (sc - 1) * 0.33, z + Math.cos(yaw) * 0.004, yaw, sc, sc, 1);
      place(glow, i, x + Math.sin(yaw) * 0.002, SY + (sc - 1) * 0.33, z + Math.cos(yaw) * 0.002, yaw, sc, sc, 1);
      aScr.set([d.c, d.r, cell, k], i * 4);
    });
    bodyG.setAttribute('aScr', new THREE.InstancedBufferAttribute(aScr, 4));
    sg.setAttribute('aScr', new THREE.InstancedBufferAttribute(aScr, 4));
    gg.setAttribute('aScr', new THREE.InstancedBufferAttribute(aScr, 4));
    glow.renderOrder = 5;
    scene.add(body, screens, glow);
  }

  // ---- chairs: empty mesh chairs, pushed back at odd angles
  {
    const { body, mesh } = chairGeometries();
    const list = desks.filter((d) => d.hasChair);
    const opq = new THREE.InstancedMesh(body, mk(CHAIR_FRAG, [1, 1, 1]), list.length);
    const msh = new THREE.InstancedMesh(mesh, mk(MESH_FRAG, [1, 1, 1], VERT_PX, {}, {
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }), list.length);
    list.forEach((d, i) => { place(opq, i, d.x + d.cx, 0, d.z + 1.05 + d.cz, d.yaw); place(msh, i, d.x + d.cx, 0, d.z + 1.05 + d.cz, d.yaw); });
    msh.renderOrder = 6;
    scene.add(opq, msh);
  }

  // ---- desk clutter: keyboards, papers, mugs, notebooks
  {
    const kb = desks.filter((d) => d.present);
    const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.018, 0.14), mk(KEY_FRAG, [1, 1, 1]), kb.length);
    kb.forEach((d, i) => place(keys, i, d.x + (d.c % 3 - 1) * 0.06, 0.759, d.z + 0.42, (R() - 0.5) * 0.12));
    const papersList = desks.filter((d) => !d.lamp && R() < 0.5);
    const papers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.21, 0.004, 0.297), vx([0.62, 0.61, 0.58]), papersList.length);
    papers.material.polygonOffset = true; papers.material.polygonOffsetFactor = -1; papers.material.polygonOffsetUnits = -4;
    papersList.forEach((d, i) => place(papers, i, d.x + 0.45 + R() * 0.15, 0.753 + R() * 0.004, d.z + 0.38 + R() * 0.2, (R() - 0.5) * 0.8));
    const mugList = desks.filter(() => R() < 0.4);
    const mugs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 12), vx([0.42, 0.40, 0.38]), mugList.length);
    mugList.forEach((d, i) => place(mugs, i, d.x - 0.55 - R() * 0.1, 0.8, d.z + 0.3 + R() * 0.2));
    const nbList = desks.filter(() => R() < 0.3);
    const nbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.014, 0.22), vx([0.05, 0.06, 0.09]), nbList.length);
    nbList.forEach((d, i) => place(nbs, i, d.x - 0.42 + R() * 0.1, 0.757, d.z + 0.5 + R() * 0.12, (R() - 0.5) * 0.5));
    // monitor cables dropping behind the desks
    const cab = desks.filter((d) => d.present);
    const cables = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 4), vx([0.02, 0.02, 0.02]), cab.length);
    cab.forEach((d, i) => place(cables, i, d.x + 0.03, 0.55, d.z - 0.09));
    scene.add(keys, papers, mugs, nbs, cables);
  }

  // ---- desk lamps: base, arm, shade, warm bulb glow
  let lampGlowRef;
  {
    const shadeG = new THREE.SphereGeometry(0.095, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, -0.06, 0);
    const armG = mergeGeometries([
      new THREE.CylinderGeometry(0.07, 0.08, 0.02, 14).translate(0, 0.01, 0),
      new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6).rotateZ(0.35).translate(0.07, 0.2, 0),
      new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6).rotateZ(-1.1).translate(0.0, 0.42, 0),
    ]);
    const arms = new THREE.InstancedMesh(armG, vx([0.08, 0.08, 0.08]), 3);
    const shades = new THREE.InstancedMesh(shadeG, mk(`void main(){ vec3 n = normalize(vN); float inside = 1.0 - step(0.0, dot(n, normalize(cameraPosition - vW))); vec3 outside = vec3(0.05, 0.035, 0.02) * (0.4 + 0.6 * smoothstep(-0.02, 0.03, vW.y - 1.13)); gl_FragColor = vec4(fogIt(mix(outside, vec3(2.4, 1.4, 0.6), inside), vW), 1.0); }`, [1, 1, 1], VERT_PX, {}, { side: THREE.DoubleSide }), 3);
    const lampGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 0.6), mk(LAMPGLOW_FRAG, [1, 1, 1], VERT_UV, { uGain: { value: 0.8 } }, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 3);
    LAMPS.forEach(([r, c], i) => {
      const p = lampPos[i];
      place(arms, i, p.x + 0.10, 0.75, p.z - 0.05, 2.6);
      place(shades, i, p.x, p.y + 0.06, p.z);
    });
    lampGlow.renderOrder = 7;        // after the see-through chair backs
    lampGlowRef = lampGlow;
    scene.add(arms, shades, lampGlow);
  }

  // ---- camera: a slow sideways track at seated eye height, then a drift up; the hero memo screen stays
  // locked in the lower-right third (the camera pans to hold it there, so the room slides past behind it)
  const aimCam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 80);
  const tgt = new THREE.Vector3(), pv = new THREE.Vector3();
  function aim(pos, nx, ny) {
    aimCam.aspect = camera.aspect; aimCam.updateProjectionMatrix();
    aimCam.position.copy(pos);
    const tanV = Math.tan(THREE.MathUtils.degToRad(aimCam.fov / 2)), tanH = tanV * aimCam.aspect;
    let yaw = Math.atan2(M.x - pos.x, pos.z - M.z), pitch = Math.atan2(M.y - pos.y, Math.hypot(M.x - pos.x, M.z - pos.z));
    yaw -= Math.atan(nx * tanH); pitch -= Math.atan(ny * tanV);
    for (let it = 0; it < 3; it++) {
      tgt.set(pos.x + Math.sin(yaw) * Math.cos(pitch), pos.y + Math.sin(pitch), pos.z - Math.cos(yaw) * Math.cos(pitch));
      aimCam.lookAt(tgt); aimCam.updateMatrixWorld();
      pv.copy(M).project(aimCam);
      yaw += Math.atan((pv.x - nx) * tanH); pitch += Math.atan((pv.y - ny) * tanV);
    }
    return tgt.set(pos.x + Math.sin(yaw) * Math.cos(pitch), pos.y + Math.sin(pitch), pos.z - Math.cos(yaw) * Math.cos(pitch));
  }
  function camAt(lt, k, pos) {
    const tr = 0.15 * smooth(k) + 0.85 * k;
    const up = smooth(clamp((k - 0.3) / 0.7));
    pos.set(lerp(M.x - 1.75, M.x - 0.55, tr) + 0.01 * noise(lt * 0.4 + 4), lerp(1.40, 1.82, up) + 0.008 * noise(lt * 0.5 + 2), lerp(0.55, 0.25, tr));
    return aim(pos, lerp(0.66, 0.70, k), lerp(-0.10, -0.20, up));
  }

  return {
    scene, camera,
    bloom: { strength: 0 },
    exposure: 1.6,
    update(lt, c) {
      shared.uTime.value = lt;
      shared.uFill.value = fillAt(lt);
      const look = camAt(lt, c.k, camera.position);
      camera.lookAt(look);
      // lamp glow cards face the camera
      for (let i = 0; i < 3; i++) {
        const p = lampPos[i];
        Q.copy(camera.quaternion); P.set(p.x, p.y - 0.07, p.z); S.set(1, 1, 1);
        Mx.compose(P, Q, S); lampGlowRef.setMatrixAt(i, Mx);
      }
      lampGlowRef.instanceMatrix.needsUpdate = true;
    },
  };
});
