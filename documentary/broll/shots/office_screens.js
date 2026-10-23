// office_screens: a dark open-plan office at night. Rows of desks, monitors and empty chairs recede into
// the dark; the monitors switch on in a wave (each screen a generic code / terminal / chat / document UI
// drawn once into a canvas atlas) and throw cold light across desks, chairs and carpet. A few desk lamps
// stay warm. The camera tracks sideways at desk height, then drifts up.
//
// opts:
//   waveAt   local seconds when the first screens start lighting (default 0.5)
//   waveDur  seconds for the wave to cross the whole floor (default 2.2)
//   seed     layout seed (default 3)
//
// Lighting is analytic: a small float texture holds every screen's switch-on time and brightness, and each
// surface shader sums the three nearest screens of the row in front of it plus the desk lamps. Everything
// is a pure function of time.
import { THREE, register, rng, noise, ease, smooth, clamp, lerp } from '../kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const NR = 6, NC = 15;                    // rows (into depth) x desks per row
const ROW0 = -2.7, RDZ = 3.3;             // screen plane z of row r = ROW0 - r * RDZ
const COL0 = -11.2, CDX = 1.6;            // desk centre x of column c = COL0 + c * CDX
const SY = 1.06;                          // screen centre height
const CELLW = 512, CELLH = 288, ACOLS = 4, AROWS = 7;

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
    } else if (type === 'chat' || type === 'memo') {
      const dark = type === 'chat' && R() < 0.6;
      g.fillStyle = dark ? '#14181e' : '#eef0f2'; g.fillRect(0, 0, CELLW, CELLH);
      g.fillStyle = dark ? '#0d1014' : '#dfe3e8'; g.fillRect(0, 0, 110, CELLH);
      g.font = '10px Inter';
      for (let l = 0; l < 12; l++) { g.fillStyle = dark ? '#3b4450' : '#b8c0c9'; g.fillRect(10, 30 + l * 18, 50 + R() * 40, 6); }
      g.fillStyle = dark ? '#6cc3bd' : '#3b6f9a'; g.fillRect(10, 10, 70, 10);
      if (type === 'memo') {
        g.fillStyle = '#20252b'; g.font = '17px Inter'; g.fillText('All staff: use AI for everything', 126, 34);
        g.font = '10px Inter'; g.fillStyle = '#6a737d'; g.fillText('From: Leadership    To: Everyone', 126, 52);
        for (let l = 0; l < 13; l++) { g.fillStyle = '#9aa3ad'; g.fillRect(126, 70 + l * 14, 300 + R() * 70 - (l % 4 === 3 ? 200 : 0), 5); }
        g.fillStyle = '#dd4b3e'; g.fillRect(126, 252, 90, 18); g.fillStyle = '#fff'; g.font = '10px Inter'; g.fillText('MANDATORY', 134, 265);
      } else {
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
      }
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
    // measure average luminance for the light it throws
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
uniform sampler2D tTab;      // NC x NR: r = on time, g = brightness, b = present, a = dual
uniform vec4 uLampP[3];      // xyz position, w intensity
uniform vec3 uFog;
uniform float uFogDen;
varying vec3 vW;
varying vec3 vN;
float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 tab(float c, float r){ return texture2D(tTab, vec2((c + 0.5) / ${NC}.0, (r + 0.5) / ${NR}.0)); }
// screen power: off before its time, a short stutter, then on
float scrOn(float tOn, float seed){
  float dt = uTime - tOn;
  if (dt < 0.0) return 0.0;
  float st = dt < 0.28 ? step(0.45, h11(floor(dt * 30.0) + seed * 17.0)) * 0.9 + 0.1 : 1.0;
  return st * smoothstep(0.0, 0.05, dt);
}
vec3 officeLight(vec3 p, vec3 n){
  vec3 L = vec3(0.030, 0.038, 0.060) * (0.55 + 0.45 * n.y) + vec3(0.02, 0.03, 0.055) * max(-n.z, 0.0) + vec3(0.010, 0.012, 0.018);
  // the row whose screens are just behind p (screens face +z)
  float rf = (${ROW0.toFixed(2)} - p.z) / ${RDZ.toFixed(2)};
  float r = ceil(rf - 0.02);
  if (r >= 0.0 && r < ${NR}.0) {
    float c0 = floor((p.x - ${COL0.toFixed(2)}) / ${CDX.toFixed(2)} + 0.5);
    for (int i = -1; i <= 1; i++) {
      float c = c0 + float(i);
      if (c < 0.0 || c >= ${NC}.0) continue;
      vec4 t = tab(c, r);
      float I = scrOn(t.r, c + r * 31.0) * t.g * t.b;
      vec3 S = vec3(${COL0.toFixed(2)} + c * ${CDX.toFixed(2)}, ${SY.toFixed(2)}, ${ROW0.toFixed(2)} - r * ${RDZ.toFixed(2)} + 0.02);
      vec3 D = S - p;
      float d2 = dot(D, D);
      vec3 l = D * inversesqrt(d2);
      float emit = max(-l.z, 0.0);
      emit = emit * (0.4 + 0.6 * emit);
      L += vec3(0.62, 0.76, 1.0) * I * max(dot(n, l) * 0.8 + 0.2, 0.0) * emit / (d2 + 0.12) * 0.7;
    }
  }
  for (int j = 0; j < 3; j++) {
    vec3 D = uLampP[j].xyz - p;
    float d2 = dot(D, D);
    vec3 l = D * inversesqrt(d2);
    // lamp shade: light goes down and out, not up
    float cone = smoothstep(-0.2, 0.6, -l.y);
    L += vec3(1.0, 0.62, 0.26) * uLampP[j].w * max(dot(n, l), 0.0) * cone / (d2 + 0.05);
  }
  return L;
}
vec3 fogIt(vec3 c, vec3 wp){
  float d = length(wp - cameraPosition);
  return mix(max(c, vec3(0.0)), uFog, 1.0 - exp(-uFogDen * d));
}
`;

const VERT_PX = /* glsl */`
varying vec3 vW;
varying vec3 vN;
void main(){
#ifdef USE_INSTANCING
  mat4 m = modelMatrix * instanceMatrix;
#else
  mat4 m = modelMatrix;
#endif
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
// vertex-lit variant for small objects (chairs, monitor bodies, clutter)
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
  vec3 back = officeLight(w.xyz, normalize(vec3(0.0, 0.25, -1.0)));
  vCol = fogIt(alb * officeLight(w.xyz, vN) + back * rim * 0.22, w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FRAG_VX = /* glsl */`
varying vec3 vCol;
void main(){ gl_FragColor = vec4(vCol, 1.0); }
`;

// desk tops: per pixel, slightly glossy laminate with a fake reflection of the screen glow
const DESK_FRAG = /* glsl */`
uniform vec3 uAlb;
void main(){
  vec3 n = normalize(vN);
  vec3 L = officeLight(vW, n);
  vec3 col = uAlb * L;
  if (n.y > 0.5) {
    // glossy streak: the screen light reflected toward the camera
    vec3 V = normalize(cameraPosition - vW);
    col += L * 0.05 * pow(max(V.y, 0.0), 0.3) * (1.0 - V.y);
  }
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;

// carpet and walls (per pixel)
const FLOOR_FRAG = /* glsl */`
void main(){
  vec3 n = normalize(vN);
  vec2 q = vW.xz / 0.5;
  vec2 f = fract(q);
  float tile = h21(floor(q));
  float seam = 1.0 - smoothstep(0.0, fwidth(q.x) * 1.5 + 0.02, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  float stripe = 0.85 + 0.15 * step(0.5, fract((tile > 0.5 ? q.x : q.y) * 6.0));
  stripe = mix(stripe, 0.925, smoothstep(0.3, 1.0, fwidth(q.x) * 6.0));
  vec3 alb = vec3(0.10, 0.11, 0.13) * (0.85 + 0.3 * tile) * stripe * (1.0 - seam * 0.35);
  gl_FragColor = vec4(fogIt(alb * officeLight(vW, n), vW), 1.0);
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
  vec3 alb = mix(vec3(0.20, 0.21, 0.22), vec3(0.32, 0.34, 0.36), panel) * (1.0 - grid * 0.5);
  vec3 L = officeLight(vW, vec3(0.0, -1.0, 0.0)) + vec3(0.002, 0.003, 0.005);
  gl_FragColor = vec4(fogIt(alb * L * 0.38, vW), 1.0);
}
`;
const WALL_FRAG = /* glsl */`
uniform float uCity;
void main(){
  vec3 n = normalize(vN);
  // window band with a soft, out-of-focus night city behind the glass
  float y = vW.y;
  float win = step(0.85, y) * step(y, 2.55);
  float mul = 1.0 - smoothstep(0.0, fwidth(vW.x) * 1.5 + 0.01, abs(fract(vW.x / 1.8) - 0.5) * 1.8 - 0.86);
  vec3 col = vec3(0.05, 0.055, 0.06) * officeLight(vW, n);
  if (win > 0.5) {
    vec2 g = vec2(vW.x / 0.9, y / 0.5);
    vec2 cell = floor(g);
    vec3 city = vec3(0.012, 0.018, 0.03) * (0.6 + 0.4 * smoothstep(2.5, 0.8, y));
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), 0.0);
      float h = h21(c + 7.0);
      vec2 ctr = c + vec2(0.5) + (vec2(h21(c + 1.3), h21(c + 2.9)) - 0.5) * 0.8;
      float d = length((g - ctr) * vec2(1.0, 1.8));
      vec3 bc = h < 0.55 ? vec3(0.9, 0.6, 0.3) : (h < 0.8 ? vec3(0.5, 0.65, 0.9) : vec3(0.85, 0.85, 0.8));
      city += bc * exp(-d * d * 7.0) * step(0.35, h) * 0.05;
    }
    col = mix(city * uCity, vec3(0.006), mul);
  }
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;

// screens: content from the atlas, power state from the table
const SCREEN_VERT = /* glsl */`
attribute vec4 aScr;   // x: column, y: row, z: atlas cell, w: dual offset seed
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
  float content = smoothstep(0.08, 0.32, dt);
  float cell = sc.z;
  vec2 uv = vUv;
  // a few screens scroll (code, logs)
  float scroll = h11(seed + 3.1) < 0.35 ? fract(uTime * 0.05 * (0.5 + h11(seed))) : 0.0;
  uv.y = fract(uv.y + scroll * step(0.5, h11(cell * 1.7)));
  vec2 a = vec2((mod(cell, 4.0) + uv.x) / 4.0, 1.0 - (floor(cell / 4.0) + (1.0 - uv.y)) * ${CELLH}.0 / 2048.0);
  vec3 img = texture2D(tAtlas, a, 0.4).rgb;
  img = img * img;                                   // to linear-ish
  vec3 back = vec3(0.04, 0.05, 0.07);               // backlight before content
  vec3 col = mix(back, img * 1.25 + 0.015, content) * on;
  // glass: faint reflection when off, vignette at the panel edges
  vec2 e = abs(vUv - 0.5) * 2.0;
  col *= 1.0 - 0.25 * pow(max(e.x, e.y), 6.0);
  vec3 V = normalize(cameraPosition - vW);
  col += vec3(0.010, 0.012, 0.016) * (1.0 - on) * (0.5 + 0.5 * vUv.y);
  // a blinking caret on chat screens
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}
`;
// soft glow behind every screen (replaces bloom) and on the desk in front of it
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
varying vec2 vUv;
varying vec4 vScr;
void main(){
  vec4 sc = floor(vScr + 0.5);
  vec4 t = tab(sc.x, sc.y);
  float dt = uTime - t.r - sc.w * 0.06;
  float on = scrOn(t.r + sc.w * 0.06, sc.x + sc.y * 31.0) * t.g * (0.2 + 0.8 * smoothstep(0.08, 0.32, dt));
  vec2 q = (vUv - 0.5) * 2.0;
  vec2 b = max(abs(q) - vec2(0.53, 0.49), 0.0) / vec2(0.47, 0.51);
  float a = exp(-dot(b, b) * 9.0) * (1.0 - step(abs(q.x), 0.53) * step(abs(q.y), 0.49));
  float d = length(vW - cameraPosition);
  a *= exp(-uFogDen * d * 1.2);
  gl_FragColor = vec4(vec3(0.55, 0.70, 1.0) * a * on * uGain, 1.0);
}
`;
const VERT_UV = /* glsl */`
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz; vN = vec3(0.0); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const LAMPGLOW_FRAG = /* glsl */`
varying vec2 vUv;
uniform float uGain;
void main(){
  vec2 q = (vUv - 0.5) * 2.0;
  float r = length(q);
  float a = exp(-r * r * 4.0) * 0.35 + exp(-r * r * 30.0);
  float d = length(vW - cameraPosition);
  gl_FragColor = vec4(vec3(1.0, 0.66, 0.30) * a * uGain * exp(-uFogDen * d), 1.0);
}
`;

register('office_screens', (opts) => {
  const waveAt = opts.waveAt ?? 0.5, waveDur = opts.waveDur ?? 2.2;
  const R = rng(opts.seed ?? 3);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 80);

  const atlas = bakeScreens(11);
  let lampGlowRef;

  // ---- screen table: on time / brightness / present / dual per desk
  const tabData = new Float32Array(NC * NR * 4);
  const origin = new THREE.Vector2(-3.5, ROW0 - (NR - 1) * RDZ - 1.5);     // the wave starts at the back and rolls toward the camera
  const maxD = Math.hypot(NC * CDX * 0.6, NR * RDZ + 2);
  const desks = [];
  for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
    const x = COL0 + c * CDX, z = ROW0 - r * RDZ;
    const present = R() < 0.9 ? 1 : 0;
    const dual = R() < 0.3 ? 1 : 0;
    const cell = Math.floor(R() * ACOLS * AROWS);
    // memo screens close to the camera
    const cellF = (r === 0 && (c === 7 || c === 9)) ? (c === 7 ? 0 : 1) : cell;
    const d = Math.hypot(x - origin.x, z - origin.y) / maxD;
    const tOn = waveAt + waveDur * clamp((d - 0.15) / 0.8) + (R() - 0.5) * 0.18;
    const night = (r === 1 && c === 5) || (r === 3 && c === 8) || (r === 2 && c === 4) || (r === 4 && c === 9) || (r === 0 && c === 4) || (r === 1 && c === 8);   // a few screens were never off
    const i = (r * NC + c) * 4;
    tabData[i] = night ? -10 : tOn;
    tabData[i + 1] = 0.35 + 1.6 * atlas.lum[cellF];
    tabData[i + 2] = present;
    tabData[i + 3] = dual;
    desks.push({ r, c, x, z, present, dual, cell: cellF, cell2: Math.floor(R() * ACOLS * AROWS), yaw: (R() - 0.5) * 0.7, cx: (R() - 0.5) * 0.25, cz: R() * 0.35 });
  }
  const tTab = new THREE.DataTexture(tabData, NC, NR, THREE.RGBAFormat, THREE.FloatType);
  tTab.minFilter = tTab.magFilter = THREE.NearestFilter; tTab.needsUpdate = true;

  // lamps: three warm desk lamps left on
  const lampDesks = [[0, 5], [1, 9], [3, 6]];
  const lampPos = lampDesks.map(([r, c]) => new THREE.Vector4(COL0 + c * CDX + 0.52, 1.16, ROW0 - r * RDZ + 0.42, 0.16));

  const shared = {
    uTime: { value: 0 }, tTab: { value: tTab },
    uLampP: { value: lampPos },
    uFog: { value: new THREE.Color(0.004, 0.006, 0.010) }, uFogDen: { value: 0.045 },
  };
  const mk = (frag, alb, vert = VERT_PX, extra = {}, params = {}) => new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlb: { value: new THREE.Color(...alb) }, ...extra },
    vertexShader: (vert === VERT_PX || vert === VERT_UV ? '' : COMMON) + vert, fragmentShader: COMMON + frag, ...params,
  });
  const vx = (alb) => mk(FRAG_VX, alb, VERT_VX);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), E = new THREE.Euler();
  const place = (im, i, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) => {
    Q.setFromEuler(E.set(0, yaw, 0)); P.set(x, y, z); S.set(sx, sy, sz);
    M.compose(P, Q, S); im.setMatrixAt(i, M);
  };

  // ---- room
  const W = 70, D0 = 4, D1 = ROW0 - NR * RDZ - 1.5;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D0 - D1), mk(FLOOR_FRAG, [1, 1, 1]));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (D0 + D1) / 2); scene.add(floor);
  // big per-pixel planes last, so desks, chairs and monitors in front of them reject their fragments early
  floor.renderOrder = 3;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D0 - D1), mk(CEIL_FRAG, [1, 1, 1]));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 2.9, (D0 + D1) / 2); scene.add(ceil);
  ceil.renderOrder = 3;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.9), mk(WALL_FRAG, [1, 1, 1], VERT_PX, { uCity: { value: 1.0 } }));
  back.position.set(0, 1.45, D1); scene.add(back);
  back.renderOrder = 3;
  back.material.uniforms.uCity.value = 3.5;
  // columns
  {
    const g = new THREE.BoxGeometry(0.55, 2.9, 0.55);
    const cols = [[-5.6, ROW0 - 1.5 * RDZ], [4.0, ROW0 - 3.5 * RDZ], [-1.2, ROW0 - 4.5 * RDZ + 0.2], [9.5, ROW0 - 1.5 * RDZ]];
    const im = new THREE.InstancedMesh(g, mk(DESK_FRAG, [0.16, 0.165, 0.17]), cols.length);
    cols.forEach(([x, z], i) => place(im, i, x, 1.45, z));
    scene.add(im);
  }

  // ---- desks (tops per pixel, legs/modesty panels vertex lit)
  const live = desks;
  const nD = live.length;
  {
    const top = new THREE.InstancedMesh(new THREE.BoxGeometry(1.54, 0.03, 0.8), mk(DESK_FRAG, [0.24, 0.22, 0.20]), nD);
    const legG = mergeGeometries([
      new THREE.BoxGeometry(0.04, 0.72, 0.7).translate(-0.72, 0.36, 0),
      new THREE.BoxGeometry(0.04, 0.72, 0.7).translate(0.72, 0.36, 0),
      new THREE.BoxGeometry(1.4, 0.32, 0.02).translate(0, 0.5, -0.36),
    ]);
    const legs = new THREE.InstancedMesh(legG, vx([0.08, 0.085, 0.09]), nD);
    live.forEach((d, i) => { place(top, i, d.x, 0.735, d.z + 0.36); place(legs, i, d.x, 0, d.z + 0.36); });
    scene.add(top, legs);
  }

  // ---- monitors
  const scr = [];
  live.forEach((d) => {
    if (!d.present) return;
    if (d.dual) { scr.push([d, -0.34, d.cell, 0.12, 0]); scr.push([d, 0.34, d.cell2, -0.12, 1]); }
    else scr.push([d, (d.c % 3 - 1) * 0.08, d.cell, 0, 0]);
  });
  {
    const n = scr.length;
    const bodyG = mergeGeometries([
      new THREE.BoxGeometry(0.64, 0.39, 0.025).translate(0, 0, -0.013),
      new THREE.BoxGeometry(0.05, 0.3, 0.03).translate(0, -0.27, -0.05),
      new THREE.BoxGeometry(0.24, 0.012, 0.2).translate(0, -0.33, -0.05),
    ]);
    const body = new THREE.InstancedMesh(bodyG, vx([0.05, 0.05, 0.055]), n);
    const sg = new THREE.PlaneGeometry(0.61, 0.355);
    const aScr = new Float32Array(n * 4);
    const screens = new THREE.InstancedMesh(sg, new THREE.ShaderMaterial({
      uniforms: { ...shared, tAtlas: { value: atlas.tex } }, vertexShader: COMMON + SCREEN_VERT, fragmentShader: COMMON + SCREEN_FRAG,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
    }), n);
    const gg = new THREE.PlaneGeometry(1.15, 0.72);
    const glow = new THREE.InstancedMesh(gg, new THREE.ShaderMaterial({
      uniforms: { ...shared, uGain: { value: 0.07 } }, vertexShader: COMMON + GLOW_VERT, fragmentShader: COMMON + GLOW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), n);
    scr.forEach(([d, dx, cell, yaw, k], i) => {
      const x = d.x + dx, z = d.z;
      place(body, i, x, SY, z, yaw);
      place(screens, i, x + Math.sin(yaw) * 0.004, SY, z + Math.cos(yaw) * 0.004, yaw);
      place(glow, i, x, SY, z - 0.03, yaw);
      aScr.set([d.c, d.r, cell, k], i * 4);
    });
    sg.setAttribute('aScr', new THREE.InstancedBufferAttribute(aScr, 4));
    gg.setAttribute('aScr', new THREE.InstancedBufferAttribute(aScr, 4));
    glow.renderOrder = 5;
    scene.add(body, screens, glow);
  }

  // ---- chairs: empty, pushed back at odd angles
  {
    const seat = new RoundedBoxGeometry(0.48, 0.07, 0.46, 2, 0.03).translate(0, 0.47, 0);
    const backG = new RoundedBoxGeometry(0.46, 0.56, 0.06, 2, 0.03);
    backG.rotateX(-0.16); backG.translate(0, 0.86, 0.25);
    const parts = [seat, backG,
      new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8).translate(0, 0.27, 0.02),
      new THREE.BoxGeometry(0.035, 0.18, 0.035).translate(-0.25, 0.6, 0.05), new THREE.BoxGeometry(0.035, 0.18, 0.035).translate(0.25, 0.6, 0.05),
      new THREE.BoxGeometry(0.05, 0.025, 0.24).translate(-0.25, 0.69, 0.02), new THREE.BoxGeometry(0.05, 0.025, 0.24).translate(0.25, 0.69, 0.02)];
    for (let k = 0; k < 5; k++) {
      const leg = new THREE.BoxGeometry(0.035, 0.03, 0.3).translate(0, 0.07, 0.15);
      leg.rotateY(k * Math.PI * 2 / 5);
      parts.push(leg);
      const wheel = new THREE.SphereGeometry(0.025, 6, 4).translate(0, 0.025, 0.29);
      wheel.rotateY(k * Math.PI * 2 / 5);
      parts.push(wheel);
    }
    const chairG = mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g));
    chairG.computeVertexNormals();
    const chairs = live.filter((d) => R() < 0.92);
    const im = new THREE.InstancedMesh(chairG, vx([0.07, 0.075, 0.085]), chairs.length);
    chairs.forEach((d, i) => place(im, i, d.x + d.cx, 0, d.z + 1.05 + d.cz, d.yaw));
    scene.add(im);
  }

  // ---- desk clutter: keyboards, papers, mugs, notebooks
  {
    const kb = live.filter((d) => d.present);
    const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.018, 0.14), vx([0.06, 0.06, 0.065]), kb.length);
    kb.forEach((d, i) => place(keys, i, d.x + (d.c % 3 - 1) * 0.06, 0.76, d.z + 0.42, (R() - 0.5) * 0.15));
    const papersList = live.filter(() => R() < 0.55);
    const papers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.21, 0.004, 0.297), vx([0.75, 0.74, 0.70]), papersList.length);
    papers.material.polygonOffset = true; papers.material.polygonOffsetFactor = -1; papers.material.polygonOffsetUnits = -4;
    papersList.forEach((d, i) => place(papers, i, d.x + 0.45 + R() * 0.15, 0.754 + R() * 0.006, d.z + 0.35 + R() * 0.2, (R() - 0.5) * 0.8));
    const mugList = live.filter(() => R() < 0.4);
    const mugs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 10), vx([0.5, 0.48, 0.45]), mugList.length);
    mugList.forEach((d, i) => place(mugs, i, d.x - 0.55 - R() * 0.1, 0.8, d.z + 0.3 + R() * 0.2));
    scene.add(keys, papers, mugs);
  }

  // ---- desk lamps: base, arm, shade, warm bulb glow
  {
    const shadeG = new THREE.SphereGeometry(0.095, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, -0.06, 0);
    const armG = mergeGeometries([
      new THREE.CylinderGeometry(0.07, 0.08, 0.02, 14).translate(0, 0.01, 0),
      new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6).rotateZ(0.35).translate(0.07, 0.2, 0),
      new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6).rotateZ(-1.1).translate(0.0, 0.42, 0),
    ]);
    const arms = new THREE.InstancedMesh(armG, vx([0.08, 0.08, 0.08]), 3);
    const shades = new THREE.InstancedMesh(shadeG, mk(`void main(){ vec3 n = normalize(vN); float inside = 1.0 - step(0.0, dot(n, normalize(cameraPosition - vW))); vec3 outside = vec3(0.05, 0.035, 0.02) * (0.4 + 0.6 * smoothstep(-0.02, 0.03, vW.y - 1.16)); gl_FragColor = vec4(fogIt(mix(outside, vec3(2.4, 1.4, 0.6), inside), vW), 1.0); }`, [1, 1, 1], VERT_PX, {}, { side: THREE.DoubleSide }), 3);
    const lampGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.7), mk(LAMPGLOW_FRAG, [1, 1, 1], VERT_UV, { uGain: { value: 0.9 } }, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 3);
    lampDesks.forEach(([r, c], i) => {
      const x = COL0 + c * CDX + 0.62, z = ROW0 - r * RDZ + 0.2;
      place(arms, i, x, 0.75, z, 2.6);
      const p = lampPos[i];
      place(shades, i, p.x, p.y + 0.06, p.z);
      place(lampGlow, i, p.x, p.y - 0.08, p.z);
    });
    lampGlow.renderOrder = 6;
    lampGlowRef = lampGlow;
    scene.add(arms, shades, lampGlow);
  }

  // ---- camera: sideways track at desk height, then a drift up
  const look = new THREE.Vector3();
  function camAt(lt, k) {
    const tr = 0.15 * smooth(k) + 0.85 * k;
    const x = lerp(-1.9, 1.7, tr);
    const up = ease.inOut(clamp((k - 0.4) / 0.6));
    const y = lerp(1.2, 1.78, up) + 0.012 * noise(lt * 0.5 + 2);
    const z = 1.0 + 0.3 * up;
    look.set(x - 1.6 + 0.4 * tr, y - 0.30 - 0.45 * up, z - 9);
    return new THREE.Vector3(x, y, z);
  }

  return {
    scene, camera,
    bloom: { strength: 0 },
    exposure: 1.85,
    update(lt, c) {
      shared.uTime.value = lt;
      camera.position.copy(camAt(lt, c.k));
      camera.lookAt(look);
      // lamp glow cards face the camera
      for (let i = 0; i < 3; i++) {
        const p = lampPos[i];
        Q.copy(camera.quaternion); P.set(p.x, p.y - 0.08, p.z); S.set(1, 1, 1);
        M.compose(P, Q, S); lampGlowRef.setMatrixAt(i, M);
      }
      lampGlowRef.instanceMatrix.needsUpdate = true;
    },
  };
});
