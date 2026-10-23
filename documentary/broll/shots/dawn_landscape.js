// dawn_landscape: sunrise over layered mountain ridges. Six ridge lines recede into warm haze, each darkest at
// its forested crest and fading into the valley mist at its base; the sun climbs out from behind a forested
// flank with its light breaking through the tree line in shafts; mist banks drift in the valleys; a few birds
// cross high. The ridges are real geometry at real distances (1.5 to 21 km), so the crane / push gives true
// parallax. The sky is an analytic scattering gradient rendered at low resolution; the god rays are a radial
// blur of the visible sun (occluded by the same ridge and tree geometry), all inside the shot.
//
// opts:
//   mode     'rise' (default): the sun clears the tree line while the camera cranes up and tilts down a touch
//            'wide': wider lens, sun already up, a slow calm push across the valley; birds cross high
//   seed     layout seed for the ridge shapes and forests (default 1)
//   birds    number of birds (default 3 in rise, 5 in wide; 0 = none)
//   mist     valley-mist density multiplier (default 1)
//   rays     god-ray strength multiplier (default 1)
//   sun      [fromDeg, toDeg] sun elevation above the tree line over the shot (default rise [-0.45, 2.1], wide [2.6, 3.3])
//
// Overlays: the centre band (y ~330..720) is open, bright warm sky (brightest just above the ridges), so dark
// statement text reads on it. Ridges and mist sit in the bottom third; birds and cloud stay high.
import { THREE, register, rng, noise, ease, smooth, clamp, lerp } from '../kit.js';

// ---------------------------------------------------------------- build-time helpers (JS)
function noise1(seed) {
  const R = rng(seed), P = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) P[i] = R();
  return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = P[i & 4095], b = P[(i + 1) & 4095]; return a + (b - a) * u; };
}
function ridgeFn(seed, freq, ridged, octaves) {
  const n = noise1(seed);
  return (x) => {
    const p = x * freq + 1000;
    let h = 0, a = 1, s = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      let v = n(p * f + o * 17.3);
      v = lerp(v, 1 - Math.abs(2 * v - 1), ridged * (o === 0 ? 1 : 0.6));
      h += a * v; s += a; a *= 0.47; f *= 2.13;
    }
    return smooth((h / s - 0.12) / 0.8);
  };
}
function canvasTex(c, { repeatX = false, srgb = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  return t;
}

// tree silhouettes: an atlas of 8 cells (spruce / fir / pine / one broadleaf), A = sharp alpha, G = blurred
// alpha (how deep inside the crown a pixel is, for the backlit rim)
function treeAtlas(seed) {
  const CW = 128, CH = 256, N = 8;
  const c = document.createElement('canvas'); c.width = CW * N; c.height = CH;
  const g = c.getContext('2d');
  const R = rng(seed);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  const spruce = (cx, base, H, maxW, droop) => {
    g.fillRect(cx - 2, base - H * 0.3, 4, H * 0.3);
    let y = base - H * 0.06;
    while (y > base - H) {
      const u = (base - y) / H, w = maxW * Math.pow(1 - u, 0.9) * (0.65 + 0.35 * R()) + 2.5;
      const step = 5 + 6 * (1 - u) * R();
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx, y - step * 1.5);
        const tipY = y + step * droop * (0.3 + 0.6 * R());
        const n = 3 + Math.floor(R() * 3);
        for (let j = 0; j <= n; j++) {
          const t = j / n;
          g.lineTo(cx + side * w * t, lerp(y - step * 1.3, tipY, t) + (j % 2 ? -2 : 2) * R());
        }
        g.lineTo(cx + side * w * 0.55, y + step * 0.45);
        g.lineTo(cx, y + step * 0.35);
        g.closePath(); g.fill();
      }
      y -= step;
    }
    g.lineWidth = 2; g.beginPath(); g.moveTo(cx, base - H * 0.95); g.lineTo(cx + (R() - 0.5) * 3, base - H - 5); g.stroke();
  };
  for (let k = 0; k < N; k++) {
    const cx = k * CW + CW / 2, base = CH - 4;
    if (k === 7) {
      // broadleaf: lumpy rounded crown on a short trunk
      g.fillRect(cx - 4, base - 60, 8, 60);
      for (let j = 0; j < 60; j++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 40;
        g.beginPath(); g.arc(cx + Math.cos(a) * r * 1.25, base - 96 + Math.sin(a) * r * 1.15, 9 + R() * 13, 0, Math.PI * 2); g.fill();
      }
    } else if (k === 5 || k === 6) {
      // a clump of three
      spruce(cx - 26, base, CH * (0.55 + 0.15 * R()), 22, 0.8);
      spruce(cx + 24, base, CH * (0.6 + 0.15 * R()), 22, 0.8);
      spruce(cx + (R() - 0.5) * 8, base, CH * (0.84 + 0.12 * R()), 30, 0.8);
    } else {
      spruce(cx, base, CH * (0.86 + R() * 0.1), CW * (k < 2 ? 0.24 : k < 4 ? 0.32 : 0.38) * (0.85 + 0.3 * R()), k < 2 ? 0.6 : 1.0);
    }
  }
  // G = blurred alpha
  const src = g.getImageData(0, 0, c.width, c.height);
  const b = document.createElement('canvas'); b.width = c.width; b.height = c.height;
  const bg = b.getContext('2d'); bg.filter = 'blur(7px)'; bg.drawImage(c, 0, 0);
  const bl = bg.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3];
    src.data[i] = 255; src.data[i + 1] = bl.data[i + 3]; src.data[i + 2] = 255; src.data[i + 3] = a;
  }
  const out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
  out.getContext('2d').putImageData(src, 0, 0);
  const t = canvasTex(out);
  t.premultiplyAlpha = false;
  return { tex: t, cells: N, aspect: CW / CH };
}

// mist bank texture: tileable in x, dense at the bottom, billowy top edge (R = density)
function mistTexture(seed) {
  const Wd = 512, Ht = 128;
  const c = document.createElement('canvas'); c.width = Wd; c.height = Ht;
  const g = c.getContext('2d'), img = g.createImageData(Wd, Ht);
  const R = rng(seed);
  const oct = [8, 16, 32, 64].map((n) => { const a = new Float32Array(n * n); for (let i = 0; i < n * n; i++) a[i] = R(); return { n, a }; });
  const val = (x, y) => {
    let v = 0, amp = 0.55, s = 0;
    for (const { n, a } of oct) {
      const fx = x * n, fy = y * n * 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const q = (i, j) => a[((j % n + n) % n) * n + ((i % n + n) % n)];
      v += amp * lerp(lerp(q(ix, iy), q(ix + 1, iy), sx), lerp(q(ix, iy + 1), q(ix + 1, iy + 1), sx), sy); s += amp; amp *= 0.5;
    }
    return v / s;
  };
  for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) {
    const u = x / Wd, v = y / Ht;                    // v = 0 top
    const n = val(u, v);
    const top = 0.1 + 0.62 * val(u * 0.5 + 0.3, 0.1);   // where the bank's upper edge sits
    const d = Math.pow(clamp((v - top) / 0.55 + (n - 0.5) * 1.4), 1.4) * smooth((1 - v) * 3.2) * smooth(v * 8);
    const i = (y * Wd + x) * 4;
    img.data[i] = Math.round(clamp(d * (0.75 + 0.5 * n)) * 255); img.data[i + 1] = img.data[i + 2] = 0; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c, { repeatX: true });
}

// ---------------------------------------------------------------- shaders
const SCREEN_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// analytic dawn sky, rendered small (it is smooth); below the horizon it continues as the horizon haze,
// which the ridges and mist sample for their aerial perspective
const SKY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uCamR, uCamU, uCamF; uniform float uTanH, uAspect, uTime;
uniform vec3 uSunDir;
uniform vec3 uHor, uHorSun, uMid, uZen, uSunCol;
uniform float uCloud;
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y); }
void main(){
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 d = normalize(uCamF + ndc.x * uTanH * uAspect * uCamR + ndc.y * uTanH * uCamU);
  float e = d.y;
  float cs = dot(d, uSunDir);
  float ang = sqrt(max(0.0, 2.0 * (1.0 - cs)));
  float az = 1.0 - clamp(dot(normalize(d.xz), normalize(uSunDir.xz)), -1.0, 1.0);
  vec3 hor = mix(uHorSun, uHor, smoothstep(0.0, 0.05, az));
  vec3 c = mix(hor, uMid, smoothstep(0.0, 0.085, e));
  c = mix(c, uZen, smoothstep(0.09, 0.32, e));
  // forward scattering: tight hot core, warm halo, a long low band along the horizon toward the sun
  c += uSunCol * (exp(-ang / 0.035) * 0.55 + exp(-ang / 0.12) * 0.45 + exp(-ang / 0.4) * 0.22 * (1.0 - smoothstep(0.05, 0.3, e)));
  c += uSunCol * vec3(1.0, 0.75, 0.55) * 0.35 * exp(-max(e, 0.0) / 0.03) * exp(-az / 0.06);
  // thin high cloud, lit from below near the sun
  if (e > 0.07 && uCloud > 0.0){
    vec2 q = d.xz / e;
    float n = vn2(vec2(q.x * 0.9, q.y * 3.2) + vec2(uTime * 0.01, 0.0)) * 0.6 + vn2(vec2(q.x * 2.7, q.y * 9.0) + vec2(uTime * 0.018, 3.0)) * 0.4;
    float cl = smoothstep(0.58, 0.88, n) * smoothstep(0.13, 0.26, e) * uCloud;
    vec3 lit = mix(vec3(1.0, 0.56, 0.4) * 1.1, vec3(1.0, 0.8, 0.55) * 2.0, exp(-ang / 0.3));
    c = mix(c, lit, cl * 0.3);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// full-res sky: upsampled scattering + the sun disk (limb-darkened)
const SKYQ_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSky; uniform vec2 uSunPx; uniform float uSunRpx;
void main(){
  vec3 c = texture2D(uSky, vUv).rgb;
  float r = length(gl_FragCoord.xy - uSunPx) / uSunRpx;
  float disk = smoothstep(1.03, 0.97, r);
  c += disk * vec3(1.0, 0.86, 0.62) * (28.0 - 9.0 * r * r);
  gl_FragColor = vec4(c, 1.0);
}`;

// one ridge ribbon: coverage from the crest (analytic AA), aerial perspective from the sky behind it,
// darker crest fading into the valley haze, and a backlit rim that burns gold near the sun
const RIDGE_VERT = /* glsl */`
attribute float aCrest;
uniform vec3 uSunDir; uniform float uPxAng;
varying float vCrest; varying float vY; varying float vPx; varying float vSun; varying vec2 vXY;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vCrest = aCrest; vY = w.y; vXY = w.xy;
  vec3 dir = w.xyz - cameraPosition;
  float dist = length(dir);
  vPx = dist * uPxAng;
  float cs = dot(dir / dist, uSunDir);
  vSun = exp(-sqrt(max(0.0, 2.0 * (1.0 - cs))) / 0.09);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RIDGE_FRAG = /* glsl */`
precision highp float;
uniform vec3 uCol; uniform float uHaze, uFade, uAmp, uRim, uOcc;
uniform sampler2D uSky; uniform vec2 uRes; uniform vec3 uSunCol;
varying float vCrest; varying float vY; varying float vPx; varying float vSun; varying vec2 vXY;
void main(){
  float dg = vCrest - vY;
  float cov = clamp(dg / vPx + 0.5, 0.0, 1.0);
  if (cov <= 0.0) discard;
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, cov); return; }
  vec3 hz = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
  float below = clamp(dg / uAmp, 0.0, 1.5);
  float a = uHaze + (1.0 - uHaze) * uFade * smoothstep(0.02, 1.0, below);
  vec3 c = mix(uCol, hz, clamp(a, 0.0, 1.0));
  float rimW = vPx * (1.0 + 4.0 * vSun);
  c += uSunCol * exp(-max(dg, 0.0) / rimW) * (0.015 + 3.0 * vSun * vSun) * uRim;
  gl_FragColor = vec4(c, cov);
}`;

// instanced tree sprites standing on the crest, same tone as their ridge
const TREE_VERT = /* glsl */`
attribute vec2 aVar;            // atlas cell, brightness jitter
uniform float uCells; uniform vec3 uSunDir;
varying vec2 vUv; varying float vSun; varying float vJit;
void main(){
  vUv = vec2((aVar.x + uv.x) / uCells, uv.y);
  vJit = aVar.y;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 dir = normalize(w.xyz - cameraPosition);
  vSun = exp(-sqrt(max(0.0, 2.0 * (1.0 - dot(dir, uSunDir)))) / 0.09);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const TREE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uAtlas; uniform sampler2D uSky; uniform vec2 uRes;
uniform vec3 uCol; uniform float uHaze, uRim, uOcc; uniform vec3 uSunCol;
varying vec2 vUv; varying float vSun; varying float vJit;
void main(){
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.02) discard;
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, t.a); return; }
  vec3 hz = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
  vec3 c = mix(uCol * (0.9 + 0.2 * vJit), hz, uHaze);
  float edge = clamp(1.0 - t.g * 1.25, 0.0, 1.0);
  c += uSunCol * edge * (0.02 + 3.4 * vSun * vSun) * uRim;
  gl_FragColor = vec4(c, t.a);
}`;

// drifting valley mist: two texture taps scrolling at different speeds, lit by the sky behind
const MIST_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uMistT; uniform sampler2D uSky; uniform vec2 uRes; uniform float uTime, uDens, uSpd, uRep, uOcc;
uniform vec3 uSunCol; uniform vec2 uSunPx;
varying vec2 vUv;
void main(){
  float a = texture2D(uMistT, vec2(vUv.x * uRep + uTime * uSpd, 1.0 - vUv.y)).r;
  float b = texture2D(uMistT, vec2(vUv.x * uRep * 1.7 - uTime * uSpd * 0.6 + 0.37, 1.0 - vUv.y * 0.92)).r;
  float m = clamp(a * 0.65 + b * 0.55, 0.0, 1.0) * uDens;
  if (m < 0.004) discard;
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, m * 0.5); return; }
  vec3 hz = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
  float sp = exp(-length(gl_FragCoord.xy - uSunPx) / 520.0);
  vec3 c = hz * 1.06 + uSunCol * sp * 0.35;
  gl_FragColor = vec4(c, m);
}`;
const MIST_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// occlusion source: the visible sun and its glow (screen space), drawn before the occluders
const OCCSUN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uSunUv; uniform float uSunRuv; uniform float uAspect; uniform float uTime;
float h1(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float an(float a){ float x = a * 9.549 * 2.0; float i = floor(x), f = fract(x); return mix(h1(mod(i, 120.0)), h1(mod(i + 1.0, 120.0)), f * f * (3.0 - 2.0 * f)); }
void main(){
  vec2 d = (vUv - uSunUv) * vec2(uAspect, 1.0);
  float r = length(d) / uSunRuv;
  // the corona is broken into soft spokes (light slipping between crowns and rising haze), slowly turning
  float a = atan(d.y, d.x) + 3.14159;
  float spokes = 0.35 + 0.65 * an(a + uTime * 0.006) * (0.6 + 0.4 * an(a * 0.5 - uTime * 0.004 + 1.7));
  float b = smoothstep(1.1, 0.85, r) * 9.0 + (exp(-r / 1.0) * 2.0 + exp(-r / 3.0) * 0.6) * spokes;
  gl_FragColor = vec4(vec3(1.0, 0.8, 0.52) * b * 0.1, 1.0);
}`;
// radial blur toward the sun
const RAY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uOcc; uniform vec2 uSunUv;
void main(){
  vec2 dl = (vUv - uSunUv) * (0.94 / 60.0);
  vec2 uv = vUv; vec3 acc = vec3(0.0); float w = 1.0;
  for (int i = 0; i < 60; i++){ acc += texture2D(uOcc, uv).rgb * w; w *= 0.968; uv -= dl; }
  gl_FragColor = vec4(acc / 60.0 * 2.5, 1.0);
}`;
// rays over the frame: full strength in the open sky, weaker over the ridges, glare near the sun
const RAYQ_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uRays; uniform sampler2D uOcc; uniform float uGain; uniform vec2 uSunPx;
void main(){
  vec3 r = texture2D(uRays, vUv).rgb;
  float sky = texture2D(uOcc, vUv).a;
  float glare = exp(-length(gl_FragCoord.xy - uSunPx) / 90.0);
  gl_FragColor = vec4(r * 4.0 * uGain * max(sky * sky, glare * 0.7), 1.0);
}`;

// ---------------------------------------------------------------- birds
function birdGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 3 * 8), 3));
  return g;
}
function setBird(g, flap, glide) {
  // local frame: +x forward, +y up, +z left wing; metres (gull-sized)
  const span = 0.62, a1 = flap * 0.75 + glide * 0.12, a2 = flap * 1.05 - glide * 0.18;
  const c1 = Math.cos(a1), s1 = Math.sin(a1);
  const elbow = (sgn) => [-0.06, s1 * span * 0.48, sgn * (0.05 + c1 * span * 0.48)];
  const tip = (sgn) => { const e = elbow(sgn), c2 = Math.cos(a2), s2 = Math.sin(a2); return [-0.2, e[1] + s2 * span * 0.55, e[2] + sgn * c2 * span * 0.55]; };
  const p = g.attributes.position.array; let o = 0;
  const tri = (a, b, c) => { for (const v of [a, b, c]) { p[o++] = v[0]; p[o++] = v[1]; p[o++] = v[2]; } };
  const nose = [0.32, 0.01, 0], tail = [-0.3, 0, 0], bl = [0, -0.03, 0.05], br = [0, -0.03, -0.05];
  tri(nose, bl, tail); tri(nose, tail, br);
  for (const sgn of [1, -1]) {
    const e = elbow(sgn), t = tip(sgn), r = [0.1, 0, sgn * 0.05], rb = [-0.12, 0, sgn * 0.05];
    tri(r, e, rb); tri(r, [0.04, e[1], e[2]], e); tri(e, t, [-0.1, e[1], e[2]]);
  }
  g.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- the shot
register('dawn_landscape', (opts) => {
  const mode = opts.mode === 'wide' ? 'wide' : 'rise';
  const seed = opts.seed ?? 1;
  const R = rng(seed * 7919 + 13);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(mode === 'wide' ? 30 : 24, 16 / 9, 1, 100000);
  const W = 1920, H = 1080;
  const sunAzDeg = mode === 'wide' ? 8.5 : 7.5;                   // right third of the frame
  const cam0 = mode === 'wide' ? [-40, 866, 60] : [-20, 845, 0];
  const deg = THREE.MathUtils.degToRad;

  // ---- ridge layers, near to far: distance, mean crest elevation and its spread (deg, seen from cam0),
  // ridgedness, tree spacing / height (m), silhouette colour, haze, valley fade, rim
  const LAY = [
    { d: 1400, el: -6.3, sp: 1.7, rg: 0.15, tsp: 3.0, th: 30, col: '#0f0f19', haze: 0.0, fade: 0.05, rim: 1.0 },
    { d: 2400, el: -4.4, sp: 1.25, rg: 0.2, tsp: 4.4, th: 27, col: '#1b1a2a', haze: 0.05, fade: 0.55, rim: 1.0 },
    { d: 3800, el: -3.0, sp: 0.95, rg: 0.3, tsp: 5.6, th: 30, col: '#29263a', haze: 0.13, fade: 0.62, rim: 0.95 },
    { d: 6000, el: -2.0, sp: 0.72, rg: 0.4, tsp: 7.5, th: 34, col: '#3f3850', haze: 0.25, fade: 0.66, rim: 0.85 },
    { d: 9500, el: -1.25, sp: 0.52, rg: 0.5, tsp: 0, th: 0, col: '#615266', haze: 0.4, fade: 0.66, rim: 0.7 },
    { d: 15000, el: -0.72, sp: 0.36, rg: 0.55, tsp: 0, th: 0, col: '#8a6f78', haze: 0.55, fade: 0.6, rim: 0.55 },
    { d: 24000, el: -0.36, sp: 0.22, rg: 0.6, tsp: 0, th: 0, col: '#b18f8a', haze: 0.7, fade: 0.5, rim: 0.45 },
  ];
  const SH = 2;                                            // the forested flank the sun rises behind
  const hfov = Math.atan(Math.tan(deg(camera.fov / 2)) * W / H);
  const atlas = treeAtlas(seed * 13 + 1);
  const mistT = mistTexture(seed * 17 + 3);

  // low-res sky target (sampled by everything for aerial perspective)
  const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const rtSky = new THREE.WebGLRenderTarget(480, 270, rtOpts);
  const rtOcc = new THREE.WebGLRenderTarget(480, 270, rtOpts), rtRay = new THREE.WebGLRenderTarget(480, 270, rtOpts);
  const res = new THREE.Vector2(W, H);
  const lin = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
  const sunCol = lin('#ffb25e', 1.0);
  const U = {
    sunDir: { value: new THREE.Vector3(0, 0, -1) }, pxAng: { value: 0.0002 }, time: { value: 0 },
    sunPx: { value: new THREE.Vector2() }, sunCol: { value: sunCol }, sky: { value: rtSky.texture }, res: { value: res },
  };

  const occScene = new THREE.Scene();
  const occBlend = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  let crestUnderSun = -1e9;      // world height of the tallest tree tops under the sun (layer SH), for the sun path
  LAY.forEach((l, i) => {
    const dz = l.d + cam0[2];
    const meanY = cam0[1] + dz * Math.tan(deg(l.el));
    const amp = (dz * Math.tan(deg(l.sp))) / 0.3;
    const base = meanY - amp * 0.5;
    const f = ridgeFn(seed * 101 + i * 7, 1 / (amp * 3.2), l.rg, i < 2 ? 6 : 5);
    const xSun = cam0[0] + dz * Math.tan(deg(sunAzDeg));
    // the flank: layer SH climbs toward the right and peaks a little past the sun
    const flank = (x) => (i === SH ? smooth((x - (xSun - dz * 0.33)) / (dz * 0.36)) * (1 - 0.35 * smooth((x - (xSun + dz * 0.06)) / (dz * 0.2))) : 0);
    let flankH = 0;
    const crest0 = (x) => base + amp * f(x);
    if (i === SH) flankH = Math.max(0, cam0[1] + dz * Math.tan(deg(0.3)) - crest0(xSun));
    const crest = (x) => crest0(x) + flankH * flank(x);
    // lowest crest elevation of this layer across the view (the next layer back is cut just below it)
    l.minEl = 90;
    for (let j = 0; j <= 400; j++) {
      const x = cam0[0] + lerp(-1, 1, j / 400) * dz * Math.tan(hfov + deg(6));
      l.minEl = Math.min(l.minEl, THREE.MathUtils.radToDeg(Math.atan2(crest(x) - cam0[1], dz)));
    }
    // ribbon covering the widest view of the shot (camera drift and yaw included)
    const half = (dz + 400) * Math.tan(hfov + deg(4)) + 120;
    const x0 = cam0[0] - half, x1 = cam0[0] + half + 200;
    const pxPerM = (H / 2) / Math.tan(deg(camera.fov / 2)) / dz;
    const n = Math.min(1600, Math.ceil(((x1 - x0) * pxPerM) / 2.5));
    const pos = new Float32Array((n + 1) * 2 * 3), cr = new Float32Array((n + 1) * 2), idx = [];
    const bottom = i === 0 ? base - amp * 4 - 800 : cam0[1] + dz * Math.tan(deg(LAY[i - 1].minEl - 2.2));
    for (let j = 0; j <= n; j++) {
      const x = lerp(x0, x1, j / n), y = crest(x);
      pos.set([x, y + 3 / pxPerM, -l.d, x, bottom, -l.d], j * 6);
      cr[j * 2] = y; cr[j * 2 + 1] = y;
      if (j < n) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCrest', new THREE.BufferAttribute(cr, 1));
    geo.setIndex(idx);
    const mkRidgeMat = (occ) => new THREE.ShaderMaterial({
      uniforms: {
        uCol: { value: new THREE.Color(l.col) }, uHaze: { value: l.haze }, uFade: { value: l.fade }, uAmp: { value: amp },
        uRim: { value: l.rim }, uOcc: { value: occ ? 1 : 0 }, uSky: U.sky, uRes: U.res, uSunCol: U.sunCol, uSunDir: U.sunDir, uPxAng: U.pxAng,
      },
      vertexShader: RIDGE_VERT, fragmentShader: RIDGE_FRAG, transparent: true, depthTest: false, depthWrite: false,
      ...(occ ? occBlend : {}),
    });
    const mesh = new THREE.Mesh(geo, mkRidgeMat(false)); mesh.frustumCulled = false; mesh.renderOrder = 100 - i * 10;
    scene.add(mesh);
    const om = new THREE.Mesh(geo, mkRidgeMat(true)); om.frustumCulled = false; om.renderOrder = 100 - i * 10; occScene.add(om);

    // trees along the crest
    if (l.tsp > 0) {
      const RT = rng(seed * 977 + i * 31);
      const clear = noise1(seed * 59 + i);
      const list = [];
      for (let x = x0; x < x1; x += l.tsp * (0.5 + RT())) {
        const nearSun = i === SH ? Math.exp(-Math.pow((x - xSun) / (dz * 0.045), 2)) : 0;
        const dens = Math.max(nearSun, smooth((clear(x / (l.tsp * 90)) - 0.12) / 0.3));
        if (RT() > dens * 0.97 + 0.02) continue;
        const grove = 0.7 + 0.6 * clear(x / (l.tsp * 11) + 50);
        const h = l.th * (0.5 + 0.55 * RT() + 0.3 * RT() * RT()) * (0.55 + 0.45 * dens) * lerp(grove, 1.15, nearSun) * (1 + 0.9 * nearSun);
        const cell = RT() < 0.012 ? 7 : Math.floor(RT() * 7);
        list.push({ x, h, cell, jit: RT() });
        if (i === SH && Math.abs(x - xSun) < dz * Math.tan(deg(0.5))) crestUnderSun = Math.max(crestUnderSun, crest(x) + h * 0.8);
      }
      const tg = new THREE.PlaneGeometry(1, 1); tg.translate(0, 0.5, 0);
      const aVar = new Float32Array(list.length * 2);
      const mkTreeMat = (occ) => new THREE.ShaderMaterial({
        uniforms: {
          uAtlas: { value: atlas.tex }, uCells: { value: atlas.cells }, uSky: U.sky, uRes: U.res, uCol: { value: new THREE.Color(l.col) },
          uHaze: { value: l.haze }, uRim: { value: l.rim }, uOcc: { value: occ ? 1 : 0 }, uSunCol: U.sunCol, uSunDir: U.sunDir,
        },
        vertexShader: TREE_VERT, fragmentShader: TREE_FRAG, transparent: true, depthTest: false, depthWrite: false,
        ...(occ ? occBlend : {}),
      });
      const im = new THREE.InstancedMesh(tg, mkTreeMat(false), list.length);
      const m4 = new THREE.Matrix4();
      list.forEach((t, j) => {
        const w = t.h * atlas.aspect * (t.cell === 7 ? 1.25 : 1) * (0.85 + 0.3 * t.jit);
        m4.makeScale(w, t.h, 1).setPosition(t.x, crest(t.x) - t.h * 0.18, -l.d + 0.5);
        im.setMatrixAt(j, m4);
        aVar[j * 2] = t.cell; aVar[j * 2 + 1] = t.jit;
      });
      tg.setAttribute('aVar', new THREE.InstancedBufferAttribute(aVar, 2));
      im.frustumCulled = false; im.renderOrder = 100 - i * 10 + 1;
      scene.add(im);
      const oim = new THREE.InstancedMesh(tg, mkTreeMat(true), list.length);
      oim.instanceMatrix = im.instanceMatrix; oim.frustumCulled = false; oim.renderOrder = 100 - i * 10 + 1; occScene.add(oim);
    }

    // valley mist in front of this ridge (two banks at slightly different depths)
    if (i >= 1) {
      for (let b = 0; b < 2; b++) {
        const zz = -(l.d - (l.d - LAY[i - 1].d) * (b ? 0.45 : 0.08));
        const dzz = -zz + cam0[2];
        const hw = (dzz + 400) * Math.tan(hfov + deg(4)) + 200;
        const mh = amp * (0.9 + 0.2 * b);
        const mg = new THREE.PlaneGeometry(hw * 2, mh);
        const mm = new THREE.ShaderMaterial({
          uniforms: {
            uMistT: { value: mistT }, uSky: U.sky, uRes: U.res, uTime: U.time, uDens: { value: (opts.mist ?? 1) * (b ? 0.13 : 0.17) * (i === 1 ? 0.6 : 1) },
            uSpd: { value: (0.0016 + 0.0012 * R()) * (b ? -1 : 1) }, uRep: { value: hw * 2 / (amp * 7) }, uOcc: { value: 0 }, uSunCol: U.sunCol, uSunPx: U.sunPx,
          },
          vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthTest: false, depthWrite: false,
        });
        const mesh = new THREE.Mesh(mg, mm);
        mesh.position.set(cam0[0], base - amp * (0.25 + 0.1 * b) + mh / 2, zz);
        mesh.frustumCulled = false; mesh.renderOrder = 100 - i * 10 + 5 + b;
        scene.add(mesh);
      }
    }
  });

  // ---- sky
  const skyU = {
    uCamR: { value: new THREE.Vector3() }, uCamU: { value: new THREE.Vector3() }, uCamF: { value: new THREE.Vector3() },
    uTanH: { value: 0.2 }, uAspect: { value: W / H }, uTime: U.time, uSunDir: U.sunDir,
    uHor: { value: lin('#e38662', 1.0) }, uHorSun: { value: lin('#ffb766', 1.5) }, uMid: { value: lin('#f6cf98', 0.9) }, uZen: { value: lin('#86a6cc', 1.0) },
    uSunCol: U.sunCol, uCloud: { value: 1 },
  };
  const quad = new THREE.PlaneGeometry(2, 2);
  const oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const skyScene = new THREE.Scene();
  const skyMesh = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SCREEN_VERT, fragmentShader: SKY_FRAG, depthTest: false, depthWrite: false }));
  skyMesh.frustumCulled = false; skyScene.add(skyMesh);
  const skyQU = { uSky: U.sky, uSunPx: U.sunPx, uSunRpx: { value: 30 } };
  const skyQ = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: skyQU, vertexShader: SCREEN_VERT, fragmentShader: SKYQ_FRAG, depthTest: false, depthWrite: false }));
  skyQ.frustumCulled = false; skyQ.renderOrder = -100;
  scene.add(skyQ);

  // ---- god rays: visible sun (occluded by the ridge / tree clones) -> radial blur -> additive over the frame
  const occSunU = { uSunUv: { value: new THREE.Vector2() }, uSunRuv: { value: 0.03 }, uAspect: { value: W / H }, uTime: U.time };
  const occSun = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: occSunU, vertexShader: SCREEN_VERT, fragmentShader: OCCSUN_FRAG, depthTest: false, depthWrite: false }));
  occSun.frustumCulled = false; occSun.renderOrder = -1000; occScene.add(occSun);
  const rayScene = new THREE.Scene();
  const rayU = { uOcc: { value: rtOcc.texture }, uSunUv: occSunU.uSunUv };
  const rayM = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: rayU, vertexShader: SCREEN_VERT, fragmentShader: RAY_FRAG, depthTest: false, depthWrite: false }));
  rayM.frustumCulled = false; rayScene.add(rayM);
  const rayQU = { uRays: { value: rtRay.texture }, uOcc: { value: rtOcc.texture }, uGain: { value: 1 }, uSunPx: U.sunPx };
  const rayQ = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: rayQU, vertexShader: SCREEN_VERT, fragmentShader: RAYQ_FRAG, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  rayQ.frustumCulled = false; rayQ.renderOrder = 500;
  scene.add(rayQ);

  skyQ.onBeforeRender = (renderer) => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rtSky); renderer.render(skyScene, oCam);
    renderer.setRenderTarget(rtOcc); renderer.render(occScene, camera);
    renderer.setRenderTarget(rtRay); renderer.render(rayScene, oCam);
    renderer.setRenderTarget(prev);
  };

  // ---- birds: a loose group crossing high, gull-like flap and glide
  const nBirds = opts.birds ?? (mode === 'wide' ? 5 : 3);
  const RB = rng(seed * 31 + 5);
  const birds = [];
  for (let i = 0; i < nBirds; i++) {
    const g = birdGeometry();
    const m = new THREE.MeshBasicMaterial({ color: 0x2a2026, side: THREE.DoubleSide, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 600;
    scene.add(mesh);
    birds.push({ mesh, g, m, ph: RB() * 10, fr: 2.4 + RB() * 0.7, off: [(RB() - 0.5) * 30 - i * 9, (RB() - 0.5) * 8 + Math.abs(i - (nBirds - 1) / 2) * 3, (RB() - 0.5) * 30], gl: RB() * 10, sc: 0.9 + RB() * 0.25 });
  }

  // ---- sun path: elevation relative to the tree tops under it (seen from cam0)
  const crestEl = THREE.MathUtils.radToDeg(Math.atan2(crestUnderSun - cam0[1], (LAY[SH].d + cam0[2]) / Math.cos(deg(sunAzDeg))));
  const sunR = mode === 'wide' ? 0.8 : 0.72;
  const rel = opts.sun ?? (mode === 'wide' ? [1.05, 1.5] : [-1.3, 1.7]);
  const sunEl = [crestEl + rel[0], crestEl + rel[1]];
  const v3 = new THREE.Vector3(), tmp = new THREE.Vector3(), haze = new THREE.Color(0xd9a48a), dark = new THREE.Color(0x231c26);

  return {
    scene, camera,
    bloom: { strength: 0 },
    exposure: 1.0,
    update(lt, c) {
      const k = c.k;
      U.time.value = lt;
      // ---- camera
      let pos, pitch, yaw = 0, roll;
      if (mode === 'rise') {
        const e = ease.inOut(k);
        pos = [cam0[0] + 40 * k, cam0[1] + 55 * e, cam0[2] - 60 * k];
        pitch = lerp(3.0, 2.3, e);
      } else {
        const e = smooth(k);
        pos = [cam0[0] + 80 * k, cam0[1] + 6 * e, cam0[2] - 320 * k];
        pitch = lerp(3.6, 3.3, e);
        yaw = lerp(-0.5, 0.5, k);
      }
      // the faintest drift of a drone holding position
      pitch += noise(lt * 0.21 + 3) * 0.04; yaw += noise(lt * 0.17 + 9) * 0.05; roll = noise(lt * 0.13 + 1) * 0.07;
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.rotation.set(deg(pitch), deg(-yaw), deg(roll), 'YXZ');
      camera.updateMatrixWorld(true);
      const me = camera.matrixWorld.elements;
      skyU.uCamR.value.set(me[0], me[1], me[2]);
      skyU.uCamU.value.set(me[4], me[5], me[6]);
      skyU.uCamF.value.set(-me[8], -me[9], -me[10]);
      const tanH = Math.tan(deg(camera.fov / 2));
      skyU.uTanH.value = tanH; skyU.uAspect.value = camera.aspect;
      U.pxAng.value = (2 * tanH) / H;
      // ---- sun
      const elDeg = lerp(sunEl[0], sunEl[1], mode === 'rise' ? ease.out(k) * 0.3 + k * 0.7 : k);
      const el = deg(elDeg), az = deg(sunAzDeg);
      U.sunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      v3.copy(U.sunDir.value).multiplyScalar(50000).add(camera.position).project(camera);
      occSunU.uSunUv.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
      U.sunPx.value.set(occSunU.uSunUv.value.x * W, occSunU.uSunUv.value.y * H);
      const rpx = deg(sunR) / (2 * tanH) * H;
      skyQU.uSunRpx.value = rpx;
      occSunU.uSunRuv.value = rpx / H;
      rayQU.uGain.value = (mode === 'rise' ? lerp(4.4, 2.6, k) : 2.6) * (opts.rays ?? 1);
      // ---- birds: they fly at their own speed, centred on the middle of the shot
      const tc = Math.min(c.dur * 0.5, 6), vB = 11;
      for (const b of birds) {
        const fly = cam0[0] - 40 + vB * (lt - tc) + b.off[0];
        const bp = tmp.set(fly, cam0[1] + (mode === 'wide' ? 62 : 52) + b.off[1] + noise(lt * 0.4 + b.ph) * 0.8, -340 + b.off[2]);
        b.mesh.position.copy(bp);
        b.mesh.rotation.set(0.2, -0.5, 0.06 * noise(lt + b.ph));
        b.mesh.scale.setScalar(b.sc * 1.6);
        const bout = smooth((noise(lt * 0.35 + b.gl) + 0.2) * 2.5);
        const ph = (lt * b.fr + b.ph) * Math.PI * 2;
        setBird(b.g, Math.sin(ph) * 0.55 * bout + 0.1, 1 - bout);
        b.m.color.copy(dark).lerp(haze, clamp(bp.distanceTo(camera.position) / 1500) * 0.45);
      }
    },
  };
});
