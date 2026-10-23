// runner_ridge: a runner in silhouette along a ridge crest at sunrise. Long-lens tracking shot from the slope
// below the trail, the camera low so the runner's torso and head are cut against a bright golden sky and the
// crest itself is the skyline. The runner is an articulated figure (lofted body with calves, glutes and chest,
// shod feet with a toe spring, cupped hands, a head with brow, nose and chin, a swinging ponytail) driven by a
// measured running gait at ~4.8 m/s: knee drive, forward lean, a full arm swing with the hand passing the hip,
// stance feet planted on an undulating trail. The body is rendered into its own anti-aliased mask and
// composited as one merged silhouette, so the backlit rim and the glare bleeding round it follow only the
// outer contour. Behind: lone trees on a near hill slide past (parallax), forested hills and a great range
// recede in warm haze; the sun, a defined disk in a tight glow just ahead of the runner's head, throws god rays
// round the silhouette as the head passes it. Backlit grass along the crest and on the slope in front.
//
// opts:
//   speed    gait cadence multiplier (default 1 = ~184 steps/min, ~4.8 m/s)
//   seed     layout seed (default 2)
//   sunSide  'front' (default: the sun sits just ahead of the head; the head grazes it late in the shot, rays
//            burst round the face) | 'behind' (the head passes squarely across the disk mid-shot)
//   rays     god-ray strength multiplier (default 1)
//   vignetteComp  0..1 how much the frame pre-smooths the film's CSS vignette ramp (default 1)
//
// Overlays: a text card sits in the left third; the runner holds x ~980..1300 (centre-right) and runs to the
// right, the sun is at x ~1260. The left third (x < 760) is open golden sky over hazy distant ridges with the
// dark slope below y ~850, so a card at y 200..620 and a light verb at y 800..900 both read.
import { THREE, register, rng, noise, ease, smooth, clamp, lerp } from '../kit.js';

// ---------------------------------------------------------------- display-space helpers
// three.js ACES filmic as the kit's renderer applies it (exposure 1), and its inverse
const ACES_IN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
const ACES_OUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
const ACES_IN_INV = ACES_IN.clone().invert(), ACES_OUT_INV = ACES_OUT.clone().invert();
const invFit1 = (y) => { const A = 1 - 0.983729 * y, B = 0.0245786 - 0.432951 * y, C = -(0.000090537 + 0.238081 * y); return (-B + Math.sqrt(Math.max(B * B - 4 * A * C, 0))) / (2 * A); };
/** the scene-linear colour the kit's tone mapping turns into this display (sRGB) colour */
function disp(hex) {
  const c = new THREE.Color(hex);
  const v = new THREE.Vector3(c.r, c.g, c.b).applyMatrix3(ACES_OUT_INV);
  v.set(invFit1(clamp(v.x, 0, 0.985)), invFit1(clamp(v.y, 0, 0.985)), invFit1(clamp(v.z, 0, 0.985))).applyMatrix3(ACES_IN_INV).multiplyScalar(0.6);
  return new THREE.Color(Math.max(v.x, 0), Math.max(v.y, 0), Math.max(v.z, 0));
}
const GRADE_GLSL = /* glsl */`
uniform mat3 uAIn, uAOut, uAInInv, uAOutInv; uniform float uVigA, uVigK;
vec3 acesFit(vec3 v){ return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
vec3 acesInvFit(vec3 y){ vec3 A = 1.0 - 0.983729 * y, B = 0.0245786 - 0.432951 * y, C = -(0.000090537 + 0.238081 * y); return (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A); }
vec3 oetf(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 eotf(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
// the film lays a CSS vignette over the frame: a linear ramp from 45% of the frame ellipse (farthest-corner,
// centred at 50% 48%) to 62% black at the corners. Its start shows as an oval edge on a smooth bright sky, so
// divide it out and apply a softened ramp of (nearly) the same depth, in display space.
vec3 vignetteSmooth(vec3 c){
  vec2 e = vec2((gl_FragCoord.x - 960.0) / 1357.6, ((1080.0 - gl_FragCoord.y) - 518.4) / 794.2);
  float r = length(e);
  float a = uVigA * clamp((r - 0.45) / 0.55, 0.0, 1.0);
  float S = min(0.08 * log(1.0 + exp((r - 0.45) / 0.08)) / 0.55, 1.0);
  float m = (1.0 - uVigA * uVigK * S) / (1.0 - a);
  if (abs(m - 1.0) < 0.002) return c;
  vec3 y = clamp(uAOut * acesFit(uAIn * (c / 0.6)), 0.0, 1.0);
  vec3 d = oetf(y);
  d *= min(m, 0.985 / max(max(d.r, d.g), max(d.b, 1e-3)));          // never push a channel into the clip (keeps the hue)
  return max(uAInInv * acesInvFit(clamp(uAOutInv * eotf(d), 0.0, 0.985)), 0.0) * 0.6;
}`;

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

// tree silhouettes (white on transparent): 12 cells. 0-3 spruce/fir of different builds, 4-5 conifer clumps,
// 6-8 rounded broadleaf crowns, 9-10 mixed clumps, 11 a flat-topped pine
const TCW = 128, TCH = 256, TREE_CELLS = 12;
function treeAtlas(seed) {
  const c = document.createElement('canvas'); c.width = TCW * TREE_CELLS; c.height = TCH;
  const g = c.getContext('2d');
  const R = rng(seed);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  const spruce = (cx, base, H, maxW, droop) => {
    g.fillRect(cx - 2, base - H * 0.3, 4, H * 0.3);
    let y = base - H * 0.05;
    while (y > base - H) {
      const u = (base - y) / H, w = maxW * Math.pow(1 - u, 0.85) * (0.6 + 0.4 * R()) + 2.5;
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
    g.lineWidth = 2; g.beginPath(); g.moveTo(cx, base - H * 0.95); g.lineTo(cx + (R() - 0.5) * 3, base - H - 4); g.stroke();
  };
  // a rounded crown that comes down close to the ground (no lollipop trunk), ragged at the edge
  const broadleaf = (cx, base, H, Wd) => {
    g.fillRect(cx - 3, base - H * 0.25, 6, H * 0.25);
    const cy = base - H * 0.52, rx = Wd * 0.5, ry = H * 0.46;
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.5 + (R() - 0.5) * 0.3, rr = 0.42 + 0.22 * R();
      const lx = cx + Math.cos(a) * rx * rr, ly = cy + Math.sin(a) * ry * rr * 0.75 + ry * 0.12;
      for (let j = 0; j < 14; j++) {
        const b = R() * Math.PI * 2, s = Math.sqrt(R());
        g.beginPath(); g.arc(lx + Math.cos(b) * s * rx * 0.45, ly + Math.sin(b) * s * ry * 0.45, (0.13 + R() * 0.16) * Math.min(rx, ry * 1.3), 0, Math.PI * 2); g.fill();
      }
    }
    g.beginPath(); g.ellipse(cx, cy + ry * 0.2, rx * 0.62, ry * 0.55, 0, 0, Math.PI * 2); g.fill();
  };
  const pine = (cx, base, H) => {
    g.lineWidth = 4; g.beginPath(); g.moveTo(cx, base); g.quadraticCurveTo(cx + 6, base - H * 0.5, cx - 2, base - H * 0.74); g.stroke();
    for (let j = 0; j < 30; j++) {
      const x = cx - 2 + (R() - 0.5) * 64, y = base - H * (0.76 + 0.14 * R()) + Math.abs(x - cx) * 0.18;
      g.beginPath(); g.ellipse(x, y, 9 + R() * 9, 6 + R() * 6, 0, 0, Math.PI * 2); g.fill();
    }
    spruce(cx + 30, base, H * 0.5, 18, 0.9);
  };
  for (let k = 0; k < TREE_CELLS; k++) {
    const cx = k * TCW + TCW / 2, base = TCH - 4;
    switch (k) {
      case 0: spruce(cx, base, TCH * 0.93, TCW * 0.3, 0.7); break;
      case 1: spruce(cx, base, TCH * 0.8, TCW * 0.37, 0.9); break;
      case 2: spruce(cx, base, TCH * 0.95, TCW * 0.42, 1.0); break;
      case 3: spruce(cx, base, TCH * 0.66, TCW * 0.44, 1.0); break;
      case 4:
        spruce(cx - 28, base, TCH * (0.5 + 0.12 * R()), 24, 0.8);
        spruce(cx + 26, base, TCH * (0.58 + 0.12 * R()), 24, 0.8);
        spruce(cx + (R() - 0.5) * 8, base, TCH * (0.82 + 0.12 * R()), 32, 0.8); break;
      case 5: spruce(cx - 22, base, TCH * 0.62, 26, 0.9); spruce(cx + 20, base, TCH * 0.88, 30, 0.9); break;
      case 6: broadleaf(cx, base, TCH * 0.55, TCW * 0.88); break;
      case 7: broadleaf(cx, base, TCH * 0.68, TCW * 0.92); break;
      case 8: broadleaf(cx, base, TCH * 0.42, TCW * 0.96); break;
      case 9: broadleaf(cx - 18, base, TCH * 0.46, TCW * 0.62); spruce(cx + 30, base, TCH * 0.8, 26, 0.8); break;
      case 10: spruce(cx - 30, base, TCH * 0.72, 24, 0.8); broadleaf(cx + 16, base, TCH * 0.5, TCW * 0.6); break;
      default: pine(cx, base, TCH * 0.92);
    }
  }
  return c;
}
// weighted cell pick: conifers dominate, broadleaf crowns and mixed clumps break the rhythm
function pickCell(r, far) {
  const w = far ? [0.06, 0.06, 0.05, 0.1, 0.07, 0.06, 0.16, 0.12, 0.16, 0.08, 0.08, 0.0] : [0.12, 0.11, 0.1, 0.09, 0.08, 0.07, 0.1, 0.08, 0.08, 0.08, 0.08, 0.01];
  let acc = 0;
  for (let i = 0; i < w.length; i++) { acc += w[i]; if (r < acc) return i; }
  return 0;
}
// bake one layer's forest into a strip texture: x is world x (x0..x1), y runs from maxTop above the crest
// (row 0) down to maxSink below it; each tree is sheared with the local crest slope so it stands vertical
function bakeStrip(atlasC, list, x0, x1, crest, pxPerM, maxTop, maxSink) {
  const Wc = Math.min(8192, Math.ceil((x1 - x0) * pxPerM * 1.25)), Hc = Math.max(24, Math.ceil((maxTop + maxSink) * pxPerM * 1.25));
  const sx = Wc / (x1 - x0), sy = Hc / (maxTop + maxSink);
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const g = c.getContext('2d');
  for (const t of list) {
    const pc = (t.x - t.w / 2 - x0) * sx, wpx = t.w * sx;
    if (pc + wpx < -4 || pc > Wc + 4) continue;
    const s = (crest(t.x + 2) - crest(t.x - 2)) / 4, b = s * sy / sx;
    const cxp = (t.x - x0) * sx;
    g.setTransform(1, b, 0, 1, 0, -b * cxp);
    g.drawImage(atlasC, t.cell * TCW, 0, TCW, TCH, pc, (maxTop - (1 - t.sink) * t.h) * sy, wpx, t.h * sy);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const src = g.getImageData(0, 0, Wc, Hc);
  const bc = document.createElement('canvas'); bc.width = Wc; bc.height = Hc;
  // the blurred copy (how deep inside the canopy a pixel is) treats the ground below the crest as solid, so the
  // backlit rim only lights edges against the sky, never the strip's lower edge or the tree bases
  const solid = document.createElement('canvas'); solid.width = Wc; solid.height = Hc;
  const sg2 = solid.getContext('2d'); sg2.drawImage(c, 0, 0); sg2.fillStyle = '#fff'; sg2.fillRect(0, Math.floor(maxTop * sy) + 1, Wc, Hc);
  const bg = bc.getContext('2d'); bg.filter = `blur(${Math.max(1.2, 2.2 * pxPerM).toFixed(2)}px)`; bg.drawImage(solid, 0, 0);
  const bl = bg.getImageData(0, 0, Wc, Hc);
  for (let i = 0; i < src.data.length; i += 4) { src.data[i] = 255; src.data[i + 1] = bl.data[i + 3]; src.data[i + 2] = 255; }
  g.putImageData(src, 0, 0);
  const tex = canvasTex(c);
  tex.premultiplyAlpha = false;
  return tex;
}


// ---------------------------------------------------------------- shaders
const SCREEN_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const MESH_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const NOISE_GLSL = /* glsl */`
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y); }`;

// analytic sunrise sky (rendered small), its gradient measured from the hazy horizon of the distant range
const SKY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uCamR, uCamU, uCamF; uniform float uTanH, uAspect, uTime, uHorEl;
uniform vec3 uSunDir;
uniform vec3 uHor, uHorSun, uMid, uPale, uZen, uSunCol;
${NOISE_GLSL}
void main(){
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 d = normalize(uCamF + ndc.x * uTanH * uAspect * uCamR + ndc.y * uTanH * uCamU);
  float e = d.y - uHorEl;
  float cs = dot(d, uSunDir);
  float ang = sqrt(max(0.0, 2.0 * (1.0 - cs)));
  float az = 1.0 - clamp(dot(normalize(d.xz), normalize(uSunDir.xz)), -1.0, 1.0);
  vec3 hor = mix(uHorSun, uHor, smoothstep(0.0, 0.06, az));
  vec3 c = mix(hor, uMid, smoothstep(-0.01, 0.05, e));
  c = mix(c, uPale, smoothstep(0.04, 0.11, e));
  c = mix(c, uZen, smoothstep(0.1, 0.2, e));
  // forward scattering round the sun: radially symmetric and soft
  c += uSunCol * (exp(-ang / 0.008) * 0.35 + exp(-ang / 0.028) * 0.2 + exp(-ang / 0.09) * 0.08);
  // a faint high haze texture so the sky is never a flat plate
  float n = vn2(vec2(d.x / max(d.y, 0.05) * 3.0 + uTime * 0.02, 1.0 / max(d.y, 0.05) * 1.5));
  c *= 0.985 + 0.03 * n;
  gl_FragColor = vec4(c, 1.0);
}`;

// full-res sky: upsampled scattering + the sun disk (limb-darkened, slightly hot) with a tight aureole
const SKYQ_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSky; uniform vec2 uSunPx; uniform float uSunRpx; uniform float uDisk;
void main(){
  vec3 c = texture2D(uSky, vUv).rgb;
  float r = length(gl_FragCoord.xy - uSunPx) / uSunRpx;
  float aa = 1.6 / uSunRpx;
  float disk = smoothstep(1.0 + aa, 1.0 - aa, r);
  c += disk * vec3(1.0, 0.82, 0.52) * uDisk * (1.0 - 0.45 * r * r);
  c += (1.0 - disk) * vec3(1.0, 0.6, 0.27) * (1.0 * exp(-max(r - 1.0, 0.0) * 2.4) + 0.3 * exp(-max(r - 1.0, 0.0) * 0.6));
  gl_FragColor = vec4(c, 1.0);
}`;

// distant ridge ribbons (as in the dawn shot): crest coverage, aerial perspective, valley fade, rim near the sun
const RIDGE_VERT = /* glsl */`
attribute float aCrest;
uniform vec3 uSunDir; uniform float uPxAng;
varying float vCrest; varying float vY; varying float vPx; varying float vSun;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vCrest = aCrest; vY = w.y;
  vec3 dir = w.xyz - cameraPosition;
  float dist = length(dir);
  vPx = dist * uPxAng;
  vSun = exp(-sqrt(max(0.0, 2.0 * (1.0 - dot(dir / dist, uSunDir)))) / 0.03);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RIDGE_FRAG = /* glsl */`
precision highp float;
uniform vec3 uCol; uniform float uHaze, uFade, uAmp, uRim, uOcc;
uniform sampler2D uSky; uniform vec2 uRes; uniform vec3 uSunCol;
varying float vCrest; varying float vY; varying float vPx; varying float vSun;
void main(){
  float dg = vCrest - vY;
  float cov = clamp(dg / vPx + 0.5, 0.0, 1.0);
  if (cov <= 0.0) discard;
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, cov); return; }
  vec3 hz = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
  float below = clamp(dg / uAmp, 0.0, 1.5);
  float a = uHaze + (1.0 - uHaze) * uFade * smoothstep(0.02, 1.0, below);
  vec3 c = mix(uCol, hz, clamp(a, 0.0, 1.0));
  c += uSunCol * exp(-max(dg, 0.0) / (vPx * (1.0 + 4.0 * vSun))) * 1.6 * vSun * vSun * uRim;
  gl_FragColor = vec4(c, cov);
}`;
// a layer's baked forest strip
const STRIP_VERT = /* glsl */`
uniform vec3 uSunDir;
varying vec2 vUv; varying float vSun; varying float vX;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vX = w.x;
  vSun = exp(-sqrt(max(0.0, 2.0 * (1.0 - dot(normalize(w.xyz - cameraPosition), uSunDir)))) / 0.04);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const STRIP_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uStrip; uniform sampler2D uSky; uniform vec2 uRes;
uniform vec3 uCol; uniform float uHaze, uRim, uOcc; uniform vec3 uSunCol;
varying vec2 vUv; varying float vSun; varying float vX;
${NOISE_GLSL}
void main(){
  vec4 t = texture2D(uStrip, vUv);
  if (t.a < 0.02) discard;
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, t.a); return; }
  vec3 hz = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
  vec3 c = mix(uCol * (0.86 + 0.28 * vn2(vec2(vX / 7.0, 0.5))), hz, uHaze);
  c += uSunCol * clamp(1.0 - t.g * 1.25, 0.0, 1.0) * 3.0 * vSun * vSun * uRim;
  gl_FragColor = vec4(c, t.a);
}`;

// occlusion source (screen space): the sun and a modest corona broken into soft spokes
const OCCSUN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uSunUv; uniform float uSunRuv; uniform float uAspect; uniform float uTime;
float h1(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float an(float a){ float x = a * 9.549 * 2.0; float i = floor(x), f = fract(x); return mix(h1(mod(i, 120.0)), h1(mod(i + 1.0, 120.0)), f * f * (3.0 - 2.0 * f)); }
void main(){
  vec2 d = (vUv - uSunUv) * vec2(uAspect, 1.0);
  float r = length(d) / uSunRuv;
  float a = atan(d.y, d.x) + 3.14159;
  float spokes = 0.35 + 0.65 * an(a + uTime * 0.01) * (0.6 + 0.4 * an(a * 0.5 - uTime * 0.007 + 1.7));
  float b = smoothstep(1.1, 0.85, r) * 6.0 + (exp(-r / 1.2) * 1.8 + exp(-r / 4.0) * 0.5) * spokes;
  gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * b * 0.1, 1.0);
}`;
const RAY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uOcc; uniform vec2 uSunUv;
void main(){
  vec2 dl = (vUv - uSunUv) * (0.94 / 44.0);
  vec2 uv = vUv; vec3 acc = vec3(0.0); float w = 1.0;
  for (int i = 0; i < 44; i++){ acc += texture2D(uOcc, uv).rgb * w; w *= 0.958; uv -= dl; }
  gl_FragColor = vec4(acc / 44.0 * 2.5, 1.0);
}`;
const FINAL_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uMain; uniform sampler2D uRays; uniform sampler2D uOcc; uniform float uGain;
${GRADE_GLSL}
void main(){
  vec3 c = texture2D(uMain, vUv).rgb;
  vec3 r = texture2D(uRays, vUv).rgb * uGain;
  r = r / (1.0 + r * 0.9);
  float sky = texture2D(uOcc, vUv).a;
  c += r * mix(0.06, 1.0, sky * sky);
  gl_FragColor = vec4(vignetteSmooth(c), 1.0);
}`;

// ---- the runner, composited from its mask: one merged silhouette, a backlit rim on the outer contour only
// (stronger on edges that face the sun and near it), and the sky's glare bleeding a little over the edge
const RECT_VERT = /* glsl */`
uniform vec4 uRect; uniform vec2 uRes;
void main(){ vec2 p = (position.xy * 0.5 + 0.5) * uRect.zw + uRect.xy; gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0); }`;
const RUNNER_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uMask; uniform vec4 uRect; uniform vec2 uTexel; uniform float uFS;
uniform vec2 uSunPx; uniform vec3 uSunCol; uniform vec3 uBody; uniform float uRimK; uniform float uOcc;
uniform sampler2D uSky; uniform vec2 uRes;
void main(){
  vec2 uv = (gl_FragCoord.xy * uFS - uRect.xy) / uRect.zw;
  float m = texture2D(uMask, uv).r;
  if (uOcc > 0.5){ gl_FragColor = vec4(0.0, 0.0, 0.0, m); return; }
  vec2 toSun = uSunPx - gl_FragCoord.xy; float dS = length(toSun); vec2 sd = toSun / max(dS, 1.0);
  float nearA = 0.0, farA = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < 8; i++){
    float a = float(i) * 0.7853982 + 0.3927;
    vec2 o = vec2(cos(a), sin(a));
    float s1 = texture2D(uMask, uv + o * 1.6 * uTexel).r;
    float s2 = texture2D(uMask, uv + o * 6.5 * uTexel).r;
    nearA += s1; farA += s2; g += o * (s1 + 0.5 * s2);
  }
  nearA /= 8.0; farA /= 8.0;
  if (m < 0.003 && farA < 0.003) discard;
  vec2 nrm = -g / max(length(g), 1e-3);                       // outward edge normal (screen space)
  float facing = clamp(dot(nrm, sd) * 0.5 + 0.5, 0.0, 1.0);
  float prox = 0.12 + 2.0 * exp(-dS / 200.0);
  float rim = m * clamp((1.0 - nearA) * 1.8, 0.0, 1.0) * (0.08 + 1.7 * facing * facing * facing) * prox;
  vec3 hz = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
  vec3 body = mix(uBody, hz, 0.012);
  vec3 col = (body + uSunCol * vec3(1.0, 0.8, 0.55) * rim * uRimK) * m;
  // glare bleeding over the edge just outside the silhouette, near the sun
  col += (1.0 - m) * farA * farA * uSunCol * 0.45 * exp(-dS / 90.0) * uRimK;
  gl_FragColor = vec4(col, m);
}`;
const MASK_FRAG = /* glsl */`precision highp float; void main(){ gl_FragColor = vec4(1.0); }`;

// the trail and the slope below it (JS and GLSL agree exactly: the blades are placed in the vertex shader)
const TRAIL_GLSL = /* glsl */`
float trailY(float x){ return 0.2 * sin(x * 0.19 + 1.3) + 0.1 * sin(x * 0.43 + 0.4) + 0.035 * sin(x * 1.9 + 2.0) + 0.018 * sin(x * 4.7 + 0.7) + 0.008 * sin(x * 11.3); }
float groundY(float x, float z){
  float t = trailY(x);
  if (z > 0.3){ float s = z - 0.3; return t - 0.17 * s - 0.004 * s * s + (0.05 * sin(x * 2.3 + z * 1.7) + 0.035 * sin(x * 5.1 - z * 3.3 + 1.0)) * min(1.0, s / 1.5); }
  if (z > -0.3) return t;
  return t - max(0.0, -0.3 - z) * 0.45 - max(0.0, -1.2 - z) * 0.5;
}`;
// grass blades from a pool that wraps round the camera (only what can be seen is drawn): a strip along +y,
// bent in the vertex shader, some with a seed head; widened to at least ~1.4 px with analytic coverage across
// the blade (no stair-steps), and softened by the lens's depth of field in front of the focus plane
const GRASS_VERT = /* glsl */`
attribute vec4 aG;          // height, lean, phase, width
attribute vec2 aC;          // curl, seed head
uniform float uTime; uniform float uPxK; uniform float uCamX; uniform float uWrap; uniform float uFocus;
varying float vY; varying float vSide; varying float vHalf; varying float vLit; varying float vSoft;
${TRAIL_GLSL}
void main(){
  float y = position.y;
  float h = aG.x;
  vec3 b0 = instanceMatrix[3].xyz;
  float x = uCamX + mod(b0.x - uCamX + 0.5 * uWrap, uWrap) - 0.5 * uWrap;
  vec3 base = vec3(x, groundY(x, b0.z) - 0.012, b0.z);
  float sway = 0.05 * sin(uTime * 1.7 + aG.z) + 0.025 * sin(uTime * 3.3 + aG.z * 1.7);
  float bend = (aG.y + sway) * y * y + aC.x * y * y * y;
  float dist = length(base - cameraPosition);
  float pxPerM = uPxK / dist;
  float coc = 240.0 * abs(1.0 / dist - 1.0 / uFocus);
  float prof = (1.0 - 0.8 * y) + aC.y * 2.4 * smoothstep(0.7, 0.84, y) * (1.0 - smoothstep(0.93, 1.0, y));
  float wPx = aG.w * prof * pxPerM;
  float halfPx = wPx * 0.5 + 0.5 * coc + 1.0;
  vec3 p = base + vec3(position.x * 2.0 * halfPx / pxPerM + bend * h, y * h, 0.0);
  vY = y; vSide = position.x * 2.0 * halfPx; vHalf = wPx * 0.5; vSoft = coc;
  vLit = exp(-max(b0.z - 0.3, 0.0) / 5.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const GRASS_FRAG = /* glsl */`
precision highp float;
uniform vec2 uSunPx; uniform vec3 uSunCol; uniform float uOcc; uniform vec3 uBase; uniform float uGlow;
varying float vY; varying float vSide; varying float vHalf; varying float vLit; varying float vSoft;
void main(){
  float hw = max(vHalf, 0.35), ramp = 1.0 + vSoft;
  float cov = clamp((hw + 0.5 * ramp - abs(vSide)) / ramp, 0.0, 1.0) * min(1.0, (vHalf + 0.3) / (0.65 + 0.25 * vSoft));
  if (cov < 0.01) discard;
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, cov); return; }
  float dS = length(uSunPx - gl_FragCoord.xy);
  vec3 c = uBase + uSunCol * vec3(1.0, 0.76, 0.42) * (0.03 + 1.2 * exp(-dS / 420.0)) * smoothstep(0.3, 1.0, vY) * uGlow * vLit;
  gl_FragColor = vec4(c, cov);
}`;

// ---------------------------------------------------------------- running gait
// joint angles in degrees over one gait cycle (right foot strike at 0, left at 0.5), after published
// sagittal-plane kinematics of running at ~4.5-5 m/s: hip flexion +, knee flexion +, ankle dorsiflexion +
const GAIT = {
  hip: [[0, 33], [0.1, 22], [0.2, 6], [0.3, -11], [0.38, -21], [0.45, -16], [0.55, 6], [0.65, 30], [0.75, 47], [0.85, 51], [0.93, 43]],
  knee: [[0, 18], [0.1, 36], [0.2, 40], [0.3, 25], [0.38, 14], [0.45, 38], [0.55, 82], [0.65, 116], [0.72, 122], [0.8, 102], [0.88, 58], [0.95, 25]],
  ankle: [[0, 2], [0.1, 15], [0.2, 20], [0.3, 9], [0.38, -21], [0.45, -30], [0.55, -16], [0.65, -2], [0.8, 6], [0.92, 3]],
};
function periodic(table, ph) {
  ph = ((ph % 1) + 1) % 1;
  const n = table.length;
  let i = 0; for (let j = 0; j < n; j++) if (table[j][0] <= ph) i = j;
  const k0 = table[(i - 1 + n) % n], k1 = table[i], k2 = table[(i + 1) % n], k3 = table[(i + 2) % n];
  const t1 = k1[0], t2 = k2[0] + (i + 1 >= n ? 1 : 0);
  const u = (ph - t1) / (t2 - t1);
  const p0 = k0[1], p1 = k1[1], p2 = k2[1], p3 = k3[1];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}
const D2R = Math.PI / 180;

// a lofted body part along y: rows [y, front radius (+x), back radius (-x), side radius (z), centre x]
function loft(rows, seg = 18) {
  const pos = [], idx = [];
  rows.forEach(([y, rf, rb, rs, xc = 0]) => {
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(xc + (c >= 0 ? rf : rb) * c, y, rs * s);
    }
  });
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (const [r, end] of [[0, 0], [rows.length - 1, 1]]) {           // caps
    const ci = pos.length / 3, [y, , , , xc = 0] = rows[r];
    pos.push(xc, y, 0);
    for (let j = 0; j < seg; j++) { const a = r * (seg + 1) + j; idx.push(ci, a + (end ? 1 : 0), a + (end ? 0 : 1)); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
// an extruded side profile (x forward, y up), centred in z
function profile(pts, depth, bevel) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g;
}
function buildRunner(mat) {
  const m = (geo) => { const x = new THREE.Mesh(geo, mat); x.frustumCulled = false; return x; };
  const G = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const root = new THREE.Group();
  const pelvis = G(root);
  const rig = { root, pelvis, leg: {}, arm: {}, mark: {} };
  // pelvis and glutes (front +x)
  pelvis.add(m(loft([[-0.13, 0.04, 0.05, 0.1, -0.02], [-0.09, 0.08, 0.11, 0.15, -0.015], [-0.02, 0.092, 0.125, 0.165, -0.01], [0.06, 0.095, 0.1, 0.158], [0.12, 0.09, 0.085, 0.145]])));
  const thighG = loft([[0.02, 0.07, 0.075, 0.075], [-0.08, 0.079, 0.071, 0.074], [-0.2, 0.073, 0.064, 0.066], [-0.32, 0.061, 0.055, 0.056], [-0.42, 0.049, 0.047, 0.048], [-0.47, 0.03, 0.03, 0.03]]);
  const shortsG = loft([[0.03, 0.09, 0.095, 0.092], [-0.08, 0.086, 0.084, 0.086], [-0.17, 0.083, 0.08, 0.082], [-0.18, 0.0, 0.0, 0.0]]);
  const shinG = loft([[0.03, 0.03, 0.03, 0.03], [0.0, 0.046, 0.048, 0.047], [-0.06, 0.044, 0.058, 0.049], [-0.13, 0.04, 0.064, 0.051], [-0.22, 0.034, 0.05, 0.043], [-0.32, 0.027, 0.033, 0.031], [-0.4, 0.023, 0.025, 0.025], [-0.44, 0.02, 0.02, 0.02]]);
  // running shoe: sole with a heel, toe spring, toe box, laces rising to the collar (origin at the ankle joint)
  const shoeG = profile([[-0.066, -0.095], [-0.02, -0.102], [0.08, -0.099], [0.14, -0.093], [0.175, -0.083], [0.192, -0.07], [0.188, -0.06], [0.165, -0.054],
    [0.11, -0.048], [0.05, -0.03], [0.02, -0.012], [-0.04, -0.016], [-0.064, -0.035], [-0.073, -0.065]], 0.084, 0.01);
  for (const [side, z] of [['R', 0.088], ['L', -0.088]]) {
    const hip = G(pelvis, 0, 0, z);
    const thigh = G(hip); thigh.add(m(thighG)); thigh.add(m(shortsG));
    const knee = G(thigh, 0, -0.44, 0);
    knee.add(m(shinG));
    const ankle = G(knee, 0, -0.43, 0);
    ankle.add(m(shoeG));
    const heel = G(ankle, -0.058, -0.1, 0), ball = G(ankle, 0.11, -0.1, 0), toe = G(ankle, 0.18, -0.085, 0);
    rig.leg[side] = { hip, thigh, knee, ankle };
    rig.mark[side] = { heel, ball, toe };
  }
  const spine = G(pelvis, 0, 0.06, 0);
  // torso: belly, chest out front, shoulder blades behind, a loose shirt hem
  spine.add(m(loft([[-0.02, 0.1, 0.098, 0.16], [0.08, 0.098, 0.088, 0.148], [0.18, 0.104, 0.086, 0.15], [0.28, 0.124, 0.098, 0.162], [0.37, 0.136, 0.11, 0.176],
    [0.44, 0.124, 0.114, 0.18], [0.49, 0.09, 0.094, 0.162], [0.53, 0.055, 0.06, 0.09], [0.55, 0.0, 0.0, 0.0]], 20)));
  const neck = G(spine, 0.0, 0.5, 0);
  neck.add(m(loft([[0.0, 0.066, 0.07, 0.065], [0.06, 0.056, 0.058, 0.055], [0.13, 0.055, 0.06, 0.055], [0.19, 0.05, 0.055, 0.05]])));
  const head = G(neck, 0.012, 0.125, 0);
  const skull = m(new THREE.SphereGeometry(1, 22, 16)); skull.scale.set(0.1, 0.115, 0.09); skull.position.set(-0.008, 0.012, 0); head.add(skull);
  const hair = m(new THREE.SphereGeometry(1, 18, 12)); hair.scale.set(0.098, 0.1, 0.096); hair.position.set(-0.022, 0.03, 0); head.add(hair);
  // face profile: brow, nose, lips, chin, jaw
  head.add(m(profile([[0.03, 0.09], [0.075, 0.07], [0.094, 0.04], [0.099, 0.022], [0.092, 0.006], [0.098, -0.006], [0.121, -0.034], [0.116, -0.042], [0.102, -0.046],
    [0.105, -0.058], [0.099, -0.066], [0.103, -0.076], [0.092, -0.088], [0.099, -0.103], [0.088, -0.118], [0.05, -0.122], [0.012, -0.1], [-0.02, -0.05], [0.0, 0.06]], 0.11, 0.012)));
  // ponytail from a tie at the back of the head
  const pony = [];
  let pp = G(head, -0.09, 0.07, 0);
  const pg = [loft([[0.01, 0.032, 0.032, 0.03], [-0.04, 0.038, 0.034, 0.034], [-0.085, 0.032, 0.03, 0.03]]), loft([[0.0, 0.032, 0.03, 0.03], [-0.04, 0.03, 0.027, 0.027], [-0.08, 0.022, 0.02, 0.02]]), loft([[0.0, 0.022, 0.02, 0.02], [-0.05, 0.016, 0.014, 0.014], [-0.085, 0.003, 0.003, 0.003]])];
  for (let i = 0; i < 3; i++) { const seg = G(pp); seg.add(m(pg[i])); pony.push(seg); pp = G(seg, 0, i === 0 ? -0.08 : -0.075, 0); }
  rig.pony = pony;
  const uaG = loft([[0.04, 0.045, 0.045, 0.045], [-0.04, 0.054, 0.052, 0.05], [-0.14, 0.044, 0.046, 0.041], [-0.25, 0.036, 0.036, 0.034], [-0.3, 0.032, 0.032, 0.031]]);
  const faG = loft([[0.03, 0.034, 0.034, 0.033], [-0.06, 0.04, 0.038, 0.036], [-0.17, 0.03, 0.03, 0.028], [-0.25, 0.024, 0.024, 0.024], [-0.27, 0.02, 0.02, 0.02]]);
  // a loosely cupped hand, thumb on top (wrist at the origin, the forearm along -y)
  const handG = profile([[0.012, 0.0], [0.03, -0.03], [0.034, -0.06], [0.028, -0.085], [0.006, -0.098], [-0.018, -0.09], [-0.03, -0.066], [-0.026, -0.035], [-0.018, -0.006]], 0.05, 0.012);
  for (const [side, z] of [['R', 0.185], ['L', -0.185]]) {
    const sh = G(spine, -0.012, 0.455, z);
    sh.add(m(uaG));
    const el = G(sh, 0, -0.29, 0); el.add(m(faG));
    const hand = m(handG); hand.position.set(0.004, -0.255, 0); hand.rotation.z = 0.25; el.add(hand);
    rig.arm[side] = { sh, el };
  }
  rig.spine = spine; rig.neck = neck; rig.head = head;
  return rig;
}
// set every joint for gait phase ph (pelvis at the rig origin)
function poseRunner(rig, ph) {
  for (const [side, off] of [['R', 0], ['L', 0.5]]) {
    const p = ph + off;
    const L = rig.leg[side];
    const hipA = periodic(GAIT.hip, p);
    L.thigh.rotation.set(0, 0, hipA * D2R);
    L.knee.rotation.set(0, 0, -periodic(GAIT.knee, p) * D2R);
    L.ankle.rotation.set(0, 0, periodic(GAIT.ankle, p) * D2R);
    // arms swing against the same-side leg: a full backswing (the hand passes the hip), elbow near 90 deg
    const shF = -1.25 * (hipA - 15) - 3;
    const A = rig.arm[side];
    A.sh.rotation.set((side === 'R' ? 1 : -1) * 0.1, 0.0, shF * D2R);
    A.el.rotation.set(0, 0, (86 + 0.16 * shF) * D2R);
  }
  const w = ph * Math.PI * 2;
  rig.pelvis.rotation.set(0.06 * Math.sin(w), 0.1 * Math.cos(w), -0.1 + 0.025 * Math.sin(2 * w));
  rig.spine.rotation.set(-0.04 * Math.sin(w), -0.16 * Math.cos(w), -0.2 + 0.03 * Math.sin(2 * w + 0.6));
  rig.neck.rotation.set(0.03 * Math.sin(w), 0.08 * Math.cos(w), 0.24);
  // the ponytail lags the bounce and swings with the shoulders
  rig.pony.forEach((s, i) => s.rotation.set(0.22 * Math.sin(w - 0.9 - 0.6 * i), 0, (i === 0 ? -0.9 : 0.42) - 0.2 * Math.sin(2 * w - 1.3 - 0.7 * i)));
}

// ---------------------------------------------------------------- the shot
register('runner_ridge', (opts) => {
  const seed = opts.seed ?? 2;
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(13, 16 / 9, 0.1, 200000);
  const W = 1920, H = 1080;
  const deg = THREE.MathUtils.degToRad;
  const tanH0 = Math.tan(deg(camera.fov / 2));
  const camY0 = -1.3, camZ = 17, pitch0 = 7.55;
  const T = 0.652 / (opts.speed ?? 1);             // gait cycle (s): ~184 steps/min
  const hfov = Math.atan(tanH0 * W / H);
  const pxK = (H / 2) / tanH0;                      // px per metre at 1 m

  // ---- the trail along the crest: long rolls and short bumps (the feet are planted on it)
  const trailLow = (x) => 0.2 * Math.sin(x * 0.19 + 1.3) + 0.1 * Math.sin(x * 0.43 + 0.4);
  const trailY = (x) => trailLow(x) + 0.035 * Math.sin(x * 1.9 + 2.0) + 0.018 * Math.sin(x * 4.7 + 0.7) + 0.008 * Math.sin(x * 11.3);

  // ---- the runner: a white rig for the silhouette mask, and a black copy for the god-ray occlusion
  const sunCol = new THREE.Color('#ffb25e');
  const U = {
    sunDir: { value: new THREE.Vector3(0, 0, -1) }, pxAng: { value: 0.0002 }, time: { value: 0 },
    sunPx: { value: new THREE.Vector2() }, sunCol: { value: sunCol }, res: { value: new THREE.Vector2(W, H) },
  };
  const maskMat = new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: MASK_FRAG, side: THREE.DoubleSide });
  const rig = buildRunner(maskMat);
  const maskScene = new THREE.Scene(); maskScene.add(rig.root);

  // ---- pelvis trajectory from the legs themselves: stance feet stay planted, flight is ballistic
  const NS = 240, bx = { R: [], L: [] }, low = { R: [], L: [] };
  const v3 = new THREE.Vector3();
  for (let i = 0; i < NS; i++) {
    poseRunner(rig, i / NS); rig.root.position.set(0, 0, 0); rig.root.updateMatrixWorld(true);
    for (const s of ['R', 'L']) {
      const mk = rig.mark[s];
      bx[s].push(mk.ball.getWorldPosition(v3).x);
      low[s].push(Math.min(mk.heel.getWorldPosition(v3).y, mk.ball.getWorldPosition(v3).y, mk.toe.getWorldPosition(v3).y));
    }
  }
  const stance = (i) => { const p = i / NS; return p < 0.38 ? 'R' : p >= 0.5 && p < 0.88 ? 'L' : null; };
  const vel = new Float32Array(NS), py = new Float32Array(NS), foot = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const s = stance(i);
    if (s) { const a = bx[s][(i + NS - 1) % NS], b = bx[s][(i + 1) % NS]; vel[i] = -(b - a) / 2; py[i] = -low[s][i]; foot[i] = bx[s][i]; }
  }
  const fill = (a, b) => {     // flight between stance index a (last) and b (first of the next)
    const n = (b - a + NS) % NS;
    for (let j = 1; j < n; j++) {
      const i = (a + j) % NS, u = j / n;
      vel[i] = lerp(vel[a], vel[b % NS], u);
      py[i] = lerp(py[a], py[b % NS], u) + 4 * 0.02 * u * (1 - u);
      foot[i] = lerp(foot[a], foot[b % NS], u);
    }
  };
  fill(Math.round(0.38 * NS) - 1, Math.round(0.5 * NS)); fill(Math.round(0.88 * NS) - 1, NS);
  const px = new Float32Array(NS + 1); for (let i = 0; i < NS; i++) px[i + 1] = px[i] + vel[i];
  const stride = px[NS], speed = stride / T;
  // pelvis x, y (on flat ground) and the x of the supporting (or next) foot, at time t
  const pelvisAt = (t) => {
    const c = t / T, cf = Math.floor(c), f = (c - cf) * NS, i = Math.floor(f), u = f - i, i1 = (i + 1) % NS;
    const x = cf * stride + lerp(px[i], px[i + 1], u);
    return [x, lerp(py[i], py[i1], u), x + lerp(foot[i], foot[i1], u)];
  };
  const runLen = speed * 16 + 30;                  // metres the runner may cover in a long shot, plus margin

  // ---- distant range in haze: ridge ribbons, forests baked into strips; lone trees on the near hill
  const atlasC = treeAtlas(seed * 13 + 1);
  const LAY = [
    { d: 330, el: 4.72, sp: 0.3, rg: 0.2, tsp: 9, th: 13, lone: true, col: '#16121a', haze: 0.06, fade: 0.12, rim: 1.0 },
    { d: 1500, el: 5.4, sp: 0.45, rg: 0.25, tsp: 3.6, th: 12, col: '#231d2b', haze: 0.18, fade: 0.55, rim: 0.9 },
    { d: 4200, el: 5.85, sp: 0.6, rg: 0.4, tsp: 5, th: 15, col: '#3b3246', haze: 0.33, fade: 0.65, rim: 0.8 },
    { d: 9500, el: 6.3, sp: 0.8, rg: 0.6, tsp: 0, th: 0, col: '#5d4e62', haze: 0.48, fade: 0.66, rim: 0.6 },
    { d: 19000, el: 6.65, sp: 0.95, rg: 0.75, tsp: 0, th: 0, col: '#866e79', haze: 0.62, fade: 0.6, rim: 0.5 },
    { d: 36000, el: 6.85, sp: 0.75, rg: 0.7, tsp: 0, th: 0, col: '#ad8f88', haze: 0.75, fade: 0.5, rim: 0.4 },
  ];
  const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const rtSky = new THREE.WebGLRenderTarget(480, 270, rtOpts), rtOcc = new THREE.WebGLRenderTarget(400, 225, rtOpts), rtRay = new THREE.WebGLRenderTarget(400, 225, rtOpts);
  const rtMain = new THREE.WebGLRenderTarget(W, H, rtOpts);
  const MS = 640;                                   // the runner's mask: a full-resolution window round the figure
  const rtMask = new THREE.WebGLRenderTarget(MS, MS, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, samples: 4 });
  U.sky = { value: rtSky.texture };
  const occScene = new THREE.Scene();
  const occBlend = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  LAY.forEach((l, i) => {
    const dz = l.d + camZ;
    const meanY = camY0 + dz * Math.tan(deg(l.el));
    const amp = (dz * Math.tan(deg(l.sp))) / 0.3, base = meanY - amp * 0.5;
    const f = ridgeFn(seed * 101 + i * 7, 1 / (amp * 3.2), l.rg, 6);
    const crest = (x) => base + amp * f(x);
    const half = dz * Math.tan(hfov + deg(3)) + 20;
    const x0 = -half - 10, x1 = runLen + half;
    const pxPerM = pxK / dz;
    const n = Math.min(2400, Math.ceil(((x1 - x0) * pxPerM) / 2.5));
    const pos = new Float32Array((n + 1) * 6), cr = new Float32Array((n + 1) * 2), idx = [];
    const bottom = i === 0 ? camY0 - 60 : camY0 + dz * Math.tan(deg(LAY[i - 1].el - LAY[i - 1].sp * 1.8 - 1.0));
    for (let j = 0; j <= n; j++) {
      const x = lerp(x0, x1, j / n), y = crest(x);
      pos.set([x, y + 3 / pxPerM, -l.d, x, bottom, -l.d], j * 6);
      cr[j * 2] = cr[j * 2 + 1] = y;
      if (j < n) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCrest', new THREE.BufferAttribute(cr, 1));
    geo.setIndex(idx);
    const mk = (occ) => new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(l.col) }, uHaze: { value: l.haze }, uFade: { value: l.fade }, uAmp: { value: amp },
        uRim: { value: l.rim * (l.tsp > 0 ? 0.3 : 1) }, uOcc: { value: occ ? 1 : 0 }, uSky: U.sky, uRes: U.res, uSunCol: U.sunCol, uSunDir: U.sunDir, uPxAng: U.pxAng },
      vertexShader: RIDGE_VERT, fragmentShader: RIDGE_FRAG, transparent: true, depthTest: false, depthWrite: false, ...(occ ? occBlend : {}),
    });
    const mesh = new THREE.Mesh(geo, mk(false)); mesh.frustumCulled = false; mesh.renderOrder = 100 - i * 10; world.add(mesh);
    const om = new THREE.Mesh(geo, mk(true)); om.frustumCulled = false; om.renderOrder = 100 - i * 10; occScene.add(om);
    if (l.tsp > 0) {
      const RT = rng(seed * 977 + i * 31), clear = noise1(seed * 59 + i), groveN = noise1(seed * 61 + i * 3), list = [];
      let maxTop = 0, maxSink = 0;
      for (let x = x0; x < x1; x += l.tsp * (l.lone ? 0.6 + 1.2 * RT() : 0.35 + 0.75 * RT())) {
        let h, cell;
        if (l.lone) {
          // lone trees and small clumps on the near hill
          if (clear(x / 40) < 0.5) continue;
          h = l.th * (0.6 + 0.6 * RT()); cell = [6, 7, 8, 9, 10, 1, 3][Math.floor(RT() * 7)];
        } else {
          const dens = smooth((clear(x / (l.tsp * 70)) - 0.15) / 0.3);
          if (RT() > dens * 0.95 + 0.03) continue;
          h = l.th * (0.55 + 0.4 * RT()) * (0.6 + 0.4 * dens) * (0.55 + 0.75 * groveN(x / (l.tsp * 14) + 50)) * (RT() < 0.035 ? 1.35 : 1);
          cell = pickCell(RT(), l.d > 3000);
        }
        const w = h * (TCW / TCH) * (0.85 + 0.35 * RT()) * (cell >= 6 && cell <= 8 ? 1.15 : 1);
        const z = RT(), sink = 0.16 + 0.2 * z * z;
        list.push({ x, h, w, cell, sink });
        maxTop = Math.max(maxTop, (1 - sink) * h); maxSink = Math.max(maxSink, sink * h);
      }
      maxTop += 1; maxSink += 1;
      const tex = bakeStrip(atlasC, list, x0, x1, crest, Math.min(pxPerM, 2600 / (maxTop + maxSink) / 1.25), maxTop, maxSink);
      const sp = new Float32Array((n + 1) * 6), suv = new Float32Array((n + 1) * 4);
      for (let j = 0; j <= n; j++) {
        const x = lerp(x0, x1, j / n), y = crest(x);
        sp.set([x, y + maxTop, -l.d + 0.5, x, y - maxSink, -l.d + 0.5], j * 6);
        suv.set([j / n, 1, j / n, 0], j * 4);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      sg.setAttribute('uv', new THREE.BufferAttribute(suv, 2));
      sg.setIndex(idx);
      const mkS = (occ) => new THREE.ShaderMaterial({
        uniforms: { uStrip: { value: tex }, uSky: U.sky, uRes: U.res, uCol: { value: new THREE.Color(l.col) }, uHaze: { value: l.haze }, uRim: { value: l.rim },
          uOcc: { value: occ ? 1 : 0 }, uSunCol: U.sunCol, uSunDir: U.sunDir },
        vertexShader: STRIP_VERT, fragmentShader: STRIP_FRAG, transparent: true, depthTest: false, depthWrite: false, ...(occ ? occBlend : {}),
      });
      const sm = new THREE.Mesh(sg, mkS(false)); sm.frustumCulled = false; sm.renderOrder = 100 - i * 10 + 1; world.add(sm);
      const so = new THREE.Mesh(sg, mkS(true)); so.frustumCulled = false; so.renderOrder = 100 - i * 10 + 1; occScene.add(so);
    }
  });

  // ---- the ridge we run on: the trail along the crest, the slope down toward the lens with tussocks and a
  // worn path, the far side dropping away behind
  const gy = (x, z) => {
    const t = trailY(x);
    if (z > 0.3) { const q = z - 0.3; return t - 0.17 * q - 0.004 * q * q + (0.05 * Math.sin(x * 2.3 + z * 1.7) + 0.035 * Math.sin(x * 5.1 - z * 3.3 + 1.0)) * Math.min(1, q / 1.5); }
    if (z > -0.3) return t;
    return t - Math.max(0, -0.3 - z) * 0.45 - Math.max(0, -1.2 - z) * 0.5;
  };
  {
    const ZS = [-6, -3, -1.8, -1.2, -0.8, -0.55, -0.3, 0, 0.3, 0.45, 0.7, 1, 1.5, 2.2, 3, 4, 5.5, 7, 9, 12, 16];
    const x0 = -12, x1 = runLen + 12, nx = Math.min(4000, Math.ceil((x1 - x0) / 0.035)), nz = ZS.length - 1;
    const geo = new THREE.PlaneGeometry(1, 1, nx, nz);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
      const x = lerp(x0, x1, u), z = ZS[Math.round(v * nz)];
      p.setXYZ(i, x, gy(x, z), z);
    }
    const gm = new THREE.ShaderMaterial({
      uniforms: { uSunPx: U.sunPx, uSunCol: U.sunCol, uSky: U.sky, uRes: U.res },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `precision highp float; uniform vec2 uSunPx; uniform vec3 uSunCol; uniform sampler2D uSky; uniform vec2 uRes; varying vec3 vW;
        ${NOISE_GLSL}
        void main(){
          float n = vn2(vW.xz * vec2(1.3, 2.2)) * 0.6 + vn2(vW.xz * vec2(5.0, 7.0) + 3.0) * 0.4;
          vec3 hz = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
          // dark earth and dry grass in the shadow of the crest; the sky fills it a little, more toward the
          // top of the slope; the crest itself catches a warm graze of light
          vec3 c = vec3(0.011, 0.0085, 0.0075) * (0.7 + 0.6 * n) + hz * 0.012 * exp(-max(vW.z, 0.0) / 2.5);
          c += uSunCol * 0.05 * exp(-max(vW.z + 0.2, 0.0) / 0.4) * exp(-length(uSunPx - gl_FragCoord.xy) / 700.0);
          gl_FragColor = vec4(c, 1.0); }`,
      depthTest: false, depthWrite: false, transparent: true,
    });
    const ground = new THREE.Mesh(geo, gm); ground.frustumCulled = false; ground.renderOrder = 200; world.add(ground);
    const og = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }', depthTest: false, depthWrite: false })); og.frustumCulled = false; og.renderOrder = 200; occScene.add(og);
  }

  // ---- grass: a pool of tufts that wraps round the camera. A dense fringe along the crest (the skyline,
  // silhouetted with gold tips, some seed heads), and a meadow on the slope in front, thinning toward the lens
  const bladeGeo = new THREE.BufferGeometry();
  {
    const pos = [], idx = [];
    for (let s = 0; s <= 6; s++) { const y = s / 6; pos.push(-0.5, y, 0, 0.5, y, 0); if (s < 6) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bladeGeo.setIndex(idx);
  }
  const WRAP = 13;
  const blades = [];
  const RG = rng(seed * 53 + 1), clumpN = noise1(seed + 9);
  for (let x = 0; x < WRAP; x += 0.035 + RG() * 0.07) {
    const clump = clumpN(x * 0.9);
    if (clump < 0.28 && RG() < 0.55) continue;
    const n = 2 + Math.floor(RG() * 6), z = -0.75 + RG() * 0.62 + (RG() < 0.2 ? 0.55 : 0);
    for (let j = 0; j < n; j++) {
      const tall = RG() < 0.18;
      blades.push({ x: x + (RG() - 0.5) * 0.07, z: z + (RG() - 0.5) * 0.05, h: (0.09 + 0.36 * RG() * RG()) * (0.45 + 1.0 * clump) * (tall ? 1.6 : 1), lean: (RG() - 0.5) * 0.8 + (j - n / 2) * 0.1,
        curl: (RG() - 0.5) * 0.5, w: 0.005 + RG() * 0.004, head: tall && RG() < 0.6 ? 1 : 0 });
    }
  }
  for (let k = 0; k < 2300; k++) {
    const z = 0.32 + Math.pow(RG(), 1.8) * 9.5, x = RG() * WRAP;
    if (clumpN(x * 0.6 + z * 2.1 + 30) < 0.35) continue;
    const n = 1 + Math.floor(RG() * 4);
    for (let j = 0; j < n; j++) blades.push({ x: x + (RG() - 0.5) * 0.09, z: z + (RG() - 0.5) * 0.05, h: (0.08 + 0.26 * RG() * RG()) * (z < 2 ? 1.2 : 0.9), lean: (RG() - 0.5) * 1.0,
      curl: (RG() - 0.5) * 0.6, w: 0.006 + RG() * 0.006, head: RG() < 0.08 ? 1 : 0 });
  }
  blades.sort((a, b) => a.z - b.z);
  const nBack = blades.filter((b) => b.z < 0).length;
  const grassU = { uTime: U.time, uSunPx: U.sunPx, uSunCol: U.sunCol, uOcc: { value: 0 }, uBase: { value: new THREE.Vector3(0.008, 0.0065, 0.006) }, uGlow: { value: 1 },
    uPxK: { value: pxK }, uCamX: { value: 0 }, uWrap: { value: WRAP }, uFocus: { value: camZ } };
  const grassM = new THREE.ShaderMaterial({ uniforms: grassU, vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true });
  const grassO = new THREE.ShaderMaterial({ uniforms: { ...grassU, uOcc: { value: 1 } }, vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true, ...occBlend });
  const mkGrass = (list, mat, order) => {
    const g = bladeGeo.clone();
    const ag = new Float32Array(list.length * 4), ac = new Float32Array(list.length * 2);
    const im = new THREE.InstancedMesh(g, mat, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((b, i) => { im.setMatrixAt(i, m4.makeTranslation(b.x, 0, b.z)); ag.set([b.h, b.lean, b.x * 3.1, b.w], i * 4); ac.set([b.curl, b.head], i * 2); });
    g.setAttribute('aG', new THREE.InstancedBufferAttribute(ag, 4));
    g.setAttribute('aC', new THREE.InstancedBufferAttribute(ac, 2));
    im.frustumCulled = false; im.renderOrder = order;
    return im;
  };
  const backBlades = blades.slice(0, nBack), frontBlades = blades.slice(nBack);
  world.add(mkGrass(backBlades, grassM, 290));
  world.add(mkGrass(frontBlades, grassM, 310));
  occScene.add(mkGrass(backBlades, grassO, 290));

  // ---- the runner's composite (and its occluder for the rays)
  const runU = { uMask: { value: rtMask.texture }, uRect: { value: new THREE.Vector4(0, 0, MS, MS) }, uTexel: { value: new THREE.Vector2(1 / MS, 1 / MS) }, uRes: U.res,
    uSunPx: U.sunPx, uSunCol: U.sunCol, uBody: { value: new THREE.Vector3(0.006, 0.005, 0.0055) }, uRimK: { value: 1.0 }, uOcc: { value: 0 }, uSky: U.sky, uFS: { value: 1 } };
  const quad = new THREE.PlaneGeometry(2, 2);
  const runQ = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: runU, vertexShader: RECT_VERT, fragmentShader: RUNNER_FRAG, depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
  runQ.frustumCulled = false; runQ.renderOrder = 300; world.add(runQ);
  const runO = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { ...runU, uOcc: { value: 1 }, uFS: { value: W / 400 } }, vertexShader: RECT_VERT, fragmentShader: RUNNER_FRAG, depthTest: false, depthWrite: false, transparent: true, ...occBlend }));
  runO.frustumCulled = false; runO.renderOrder = 300; occScene.add(runO);

  // ---- sky, designed in display space: saturated amber at the hazy horizon, gold and peach, a hint of blue up top
  const skyU = {
    uCamR: { value: new THREE.Vector3() }, uCamU: { value: new THREE.Vector3() }, uCamF: { value: new THREE.Vector3() },
    uTanH: { value: 0.2 }, uAspect: { value: W / H }, uTime: U.time, uSunDir: U.sunDir, uHorEl: { value: deg(6.3) },
    uHor: { value: disp('#f08c48') }, uHorSun: { value: disp('#ffb055') }, uMid: { value: disp('#fbb96e') },
    uPale: { value: disp('#fad6a0') }, uZen: { value: disp('#b4bdd2') }, uSunCol: U.sunCol,
  };
  const oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const skyScene = new THREE.Scene();
  const skyMesh = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SCREEN_VERT, fragmentShader: SKY_FRAG, depthTest: false, depthWrite: false }));
  skyMesh.frustumCulled = false; skyScene.add(skyMesh);
  const skyQU = { uSky: U.sky, uSunPx: U.sunPx, uSunRpx: { value: 30 }, uDisk: { value: 3.0 } };
  const skyQ = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: skyQU, vertexShader: SCREEN_VERT, fragmentShader: SKYQ_FRAG, depthTest: false, depthWrite: false }));
  skyQ.frustumCulled = false; skyQ.renderOrder = -100; world.add(skyQ);
  const occSunU = { uSunUv: { value: new THREE.Vector2() }, uSunRuv: { value: 0.03 }, uAspect: { value: W / H }, uTime: U.time };
  const occSun = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: occSunU, vertexShader: SCREEN_VERT, fragmentShader: OCCSUN_FRAG, depthTest: false, depthWrite: false }));
  occSun.frustumCulled = false; occSun.renderOrder = -1000; occScene.add(occSun);
  const rayScene = new THREE.Scene();
  const rayM = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uOcc: { value: rtOcc.texture }, uSunUv: occSunU.uSunUv }, vertexShader: SCREEN_VERT, fragmentShader: RAY_FRAG, depthTest: false, depthWrite: false }));
  rayM.frustumCulled = false; rayScene.add(rayM);

  // ---- the frame the kit renders: one quad compositing the (multisampled) world, the rays and the grade
  const finalU = {
    uMain: { value: rtMain.texture }, uRays: { value: rtRay.texture }, uOcc: { value: rtOcc.texture }, uGain: { value: 1 },
    uAIn: { value: ACES_IN }, uAOut: { value: ACES_OUT }, uAInInv: { value: ACES_IN_INV }, uAOutInv: { value: ACES_OUT_INV },
    uVigA: { value: 0.62 }, uVigK: { value: 0.6 },
  };
  const scene = new THREE.Scene();
  const finalQ = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: finalU, vertexShader: SCREEN_VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false }));
  finalQ.frustumCulled = false; scene.add(finalQ);
  const maskCam = new THREE.PerspectiveCamera(camera.fov, W / H, 0.1, 200);
  const black = new THREE.Color(0, 0, 0);
  finalQ.onBeforeRender = (renderer) => {
    const prev = renderer.getRenderTarget(), pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha();
    renderer.setClearColor(black, 0);
    renderer.setRenderTarget(rtMask); renderer.clear(); renderer.render(maskScene, maskCam);
    renderer.setRenderTarget(rtSky); renderer.render(skyScene, oCam);
    renderer.setRenderTarget(rtOcc); renderer.render(occScene, camera);
    renderer.setRenderTarget(rtRay); renderer.render(rayScene, oCam);
    renderer.setRenderTarget(rtMain); renderer.render(world, camera);
    renderer.setRenderTarget(prev); renderer.setClearColor(pc, pa);
  };
  const vigEl = typeof document !== 'undefined' ? document.getElementById('vignette') : null;

  // ---- the sun: placed by its screen position for the base camera, just ahead of and above the head
  const behind = opts.sunSide === 'behind';
  const sunScr = behind ? [1170, 405] : [1262, 382];
  {
    const c0 = new THREE.PerspectiveCamera(camera.fov, W / H, 0.1, 10);
    c0.rotation.set(deg(pitch0), 0, 0, 'YXZ'); c0.updateMatrixWorld(true);
    const nd = [(sunScr[0] / W) * 2 - 1, 1 - (sunScr[1] / H) * 2];
    U.sunDir.value.set(nd[0] * tanH0 * (W / H), nd[1] * tanH0, -1).normalize().transformDirection(c0.matrixWorld);
  }
  const phase0 = 0.13;

  return {
    scene, camera,
    bloom: { strength: 0 },
    exposure: 1.0,
    update(lt, c) {
      const k = c.k;
      U.time.value = lt;
      // ---- runner
      const ph = (lt / T + phase0) % 1;
      const [pxr, pyr, fx] = pelvisAt(lt + phase0 * T);
      poseRunner(rig, ph);
      rig.root.position.set(pxr, pyr + trailY(fx) + noise(lt * 0.7) * 0.004, 0);
      rig.root.updateMatrixWorld(true);
      // ---- camera: a tracking vehicle on the slope, the runner drifting from left of centre toward the sun
      const avgX = (lt + phase0 * T) / T * stride;
      const sx = behind ? lerp(980, 1180, ease.inOut(k)) : lerp(1000, 1205, ease.inOut(k));
      const pxPerM0 = pxK / camZ;
      camera.position.set(avgX + 0.06 - (sx - W / 2) / pxPerM0 + noise(lt * 0.6 + 4) * 0.02, camY0 + 0.75 * trailLow(avgX) + noise(lt * 0.9 + 1) * 0.02, camZ);
      camera.rotation.set(deg(pitch0 + noise(lt * 0.5 + 7) * 0.07), deg(noise(lt * 0.4 + 2) * 0.07), deg(noise(lt * 0.3 + 5) * 0.12), 'YXZ');
      camera.updateMatrixWorld(true);
      grassU.uCamX.value = camera.position.x;
      const me = camera.matrixWorld.elements;
      skyU.uCamR.value.set(me[0], me[1], me[2]); skyU.uCamU.value.set(me[4], me[5], me[6]); skyU.uCamF.value.set(-me[8], -me[9], -me[10]);
      skyU.uTanH.value = tanH0; skyU.uAspect.value = camera.aspect; U.pxAng.value = (2 * tanH0) / H;
      // ---- sun on screen
      v3.copy(U.sunDir.value).multiplyScalar(100000).add(camera.position).project(camera);
      occSunU.uSunUv.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
      U.sunPx.value.set(occSunU.uSunUv.value.x * W, occSunU.uSunUv.value.y * H);
      const rpx = deg(0.5) / (2 * tanH0) * H;
      skyQU.uSunRpx.value = rpx; occSunU.uSunRuv.value = rpx / H;
      finalU.uGain.value = 8.0 * (opts.rays ?? 1);
      const vo = vigEl ? parseFloat(vigEl.style.opacity) : 1;
      finalU.uVigA.value = 0.62 * (Number.isFinite(vo) ? vo : 1) * (opts.vignetteComp ?? 1);
      // ---- the runner's mask window: MS x MS px centred on the figure, rendered at full resolution
      v3.set(pxr + 0.05, pyr + trailY(fx) + 0.2, 0).project(camera);
      const cx = Math.round((v3.x * 0.5 + 0.5) * W), cy = Math.round((0.5 - v3.y * 0.5) * H);
      const rx = cx - MS / 2, ry = cy - MS / 2;
      maskCam.position.copy(camera.position); maskCam.quaternion.copy(camera.quaternion);
      maskCam.setViewOffset(W, H, rx, ry, MS, MS); maskCam.updateMatrixWorld(true);
      runU.uRect.value.set(rx, H - ry - MS, MS, MS);
    },
  };
});
