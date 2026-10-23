// dawn_landscape: sunrise over layered mountain ridges. Ridge lines recede into warm haze, each darkest at its
// forested crest and fading into the valley mist at its base; the sun, a defined hot disk in a soft golden
// glow, climbs out from behind a forested flank low in the right third, its light breaking through the tree
// line in shafts; mist banks drift in the valleys; a few gulls cross high in the left half. The ridges are real
// geometry at real distances (0.95 to 24 km), so the crane / push gives true parallax. The sky is an analytic
// scattering gradient designed in display space (clean blue overhead, a pale luminous band, a bright peach band
// at the horizon) rendered at low resolution; the god rays are a radial blur of the visible sun (occluded by
// the same ridge and forest geometry), compressed so the glow never swallows the disk.
//
// Each layer's forest is baked once into a canvas strip that follows the crest (every tree on a layer sits at
// the same depth, so the parallax is exact), so thousands of crowns cost one draw per layer. The frame is
// finished in display space: the rays are added and the film's CSS vignette (read live from #vignette, so
// it matches whatever strength the film or harness applies) is pre-smoothed, so its linear ramp never shows
// as an oval edge on the bright sky.
//
// opts:
//   mode     'rise' (default): the sun clears the tree line while the camera cranes up ~40 m (near ridges sink,
//            the valley opens); 'wide': wider lens, sun just up, a calm crane-and-push over a near forest that
//            slides out of the bottom of frame
//   seed     layout seed for the ridge shapes and forests (default 1)
//   birds    number of gulls (default 3 in rise, 4 in wide; 0 = none)
//   mist     valley-mist density multiplier (default 1)
//   rays     god-ray strength multiplier (default 1)
//   sun      [fromDeg, toDeg] sun elevation relative to the tree tops under it (default rise [-0.95, 1.2], wide [1.0, 1.35])
//   sunY     screen y (px) of the sun centre at the end of the shot (default rise 690, wide 705); keep it >= 650
//            so the sun stays below a centred statement block
//   vignetteComp  0..1 how much the frame pre-smooths the film's CSS vignette ramp (default 1)
//
// Overlays: the centre (x 300..1620, y 260..660) is open, calm, bright warm sky: peach-gold low, pale above,
// so dark-brown statement text reads on it. The sun sits low in the right third (x ~1530..1580, y >= 665)
// below the text block; ridges and mist fill the bottom third; gulls cross high (y 120..300) in the left half.
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

// gull silhouettes seen from below, 15 flap phases + 1 glide pose in a 4x4 atlas (canvas-drawn, so anti-aliased)
function birdAtlas() {
  const CW = 128, CH = 64;
  const c = document.createElement('canvas'); c.width = CW * 4; c.height = CH * 4;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  for (let f = 0; f < 16; f++) {
    const cx = (f % 4) * CW + CW / 2, cy = Math.floor(f / 4) * CH + 30;
    const ph = (f / 15) * Math.PI * 2;
    // the wrist leads, the hand lags; the glide pose is a shallow M
    const eY = f === 15 ? 5 : Math.sin(ph) * 15, tY = f === 15 ? -2 : Math.sin(ph - 0.9) * 25 + 3;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * 5, cy - 2);
      g.quadraticCurveTo(cx + s * 14, cy - eY - 3, cx + s * 25, cy - eY);
      g.quadraticCurveTo(cx + s * 42, cy - (eY + tY) * 0.55 - 2, cx + s * 57, cy - tY);
      g.quadraticCurveTo(cx + s * 40, cy - (eY + tY) * 0.5 + 4, cx + s * 27, cy - eY + 6);
      g.quadraticCurveTo(cx + s * 14, cy - eY * 0.5 + 6, cx + s * 4, cy + 4);
      g.closePath(); g.fill();
    }
    g.beginPath(); g.ellipse(cx, cy + 1, 6, 4.2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx, cy - 3.5, 2.6, 2.8, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(cx - 3, cy + 4); g.lineTo(cx, cy + 10); g.lineTo(cx + 3, cy + 4); g.fill();
  }
  const t = canvasTex(c);
  t.premultiplyAlpha = false;
  return t;
}

// ---------------------------------------------------------------- shaders
const SCREEN_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const NOISE_GLSL = /* glsl */`
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y); }`;

// analytic dawn sky, rendered small (it is smooth); below the horizon it continues as the horizon haze,
// which the ridges and mist sample for their aerial perspective
const SKY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uCamR, uCamU, uCamF; uniform float uTanH, uAspect, uTime;
uniform vec3 uSunDir;
uniform vec3 uHor, uHorSun, uMid, uPale, uZen, uSunCol;
uniform float uCloud;
${NOISE_GLSL}
void main(){
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 d = normalize(uCamF + ndc.x * uTanH * uAspect * uCamR + ndc.y * uTanH * uCamU);
  float e = d.y;
  float cs = dot(d, uSunDir);
  float ang = sqrt(max(0.0, 2.0 * (1.0 - cs)));
  float az = 1.0 - clamp(dot(normalize(d.xz), normalize(uSunDir.xz)), -1.0, 1.0);
  // warm horizon (golden toward the sun), a bright peach band, a pale luminous zone, clean blue overhead
  vec3 hor = mix(uHorSun, uHor, smoothstep(0.0, 0.12, az));
  vec3 c = mix(hor, uMid, smoothstep(-0.01, 0.08, e));
  c = mix(c, uPale, smoothstep(0.06, 0.17, e));
  c = mix(c, uZen, smoothstep(0.13, 0.31, e));
  // forward scattering round the sun: radially symmetric and soft (no cut-off edge anywhere)
  c += uSunCol * (exp(-ang / 0.016) * 0.3 + exp(-ang / 0.055) * 0.16 + exp(-ang / 0.2) * 0.07);
  // the low warm band along the horizon toward the sun
  c += uSunCol * vec3(1.0, 0.75, 0.5) * 0.1 * exp(-abs(e) / 0.03) * exp(-az / 0.1);
  // thin high cloud, lit gold-pink from below near the sun, soft rose away from it
  if (e > 0.06 && uCloud > 0.0){
    vec2 q = d.xz / (e + 0.03);
    float n = vn2(vec2(q.x * 0.5, q.y * 1.5) + vec2(uTime * 0.012, 0.0)) * 0.55 + vn2(vec2(q.x * 1.6, q.y * 3.6) + vec2(uTime * 0.02, 3.0)) * 0.3
            + vn2(vec2(q.x * 4.2, q.y * 8.0) + vec2(uTime * 0.03, 7.0)) * 0.15;
    float cl = smoothstep(0.56, 0.84, n) * smoothstep(0.12, 0.25, e) * uCloud;
    vec3 lit = mix(vec3(0.95, 0.62, 0.55), vec3(1.0, 0.76, 0.5) * 1.4, exp(-ang / 0.35));
    c = mix(c, lit * (0.85 + 0.3 * n), cl * 0.4);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// full-res sky: upsampled scattering + the sun disk (limb-darkened, slightly hot) with a thin aureole
const SKYQ_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSky; uniform vec2 uSunPx; uniform float uSunRpx; uniform float uDisk;
void main(){
  vec3 c = texture2D(uSky, vUv).rgb;
  float r = length(gl_FragCoord.xy - uSunPx) / uSunRpx;
  float aa = 1.8 / uSunRpx;
  float disk = smoothstep(1.0 + aa, 1.0 - aa, r);
  c += disk * vec3(1.0, 0.8, 0.5) * uDisk * (1.0 - 0.45 * r * r);
  c += (1.0 - disk) * vec3(1.0, 0.62, 0.3) * (1.1 * exp(-max(r - 1.0, 0.0) * 2.6) + 0.35 * exp(-max(r - 1.0, 0.0) * 0.7));
  gl_FragColor = vec4(c, 1.0);
}`;

// one ridge ribbon: coverage from the crest (analytic AA), aerial perspective from the sky behind it, darker
// crest fading into the valley haze, a canopy texture on the near slopes, and a backlit rim that only burns
// near the sun
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
  vSun = exp(-sqrt(max(0.0, 2.0 * (1.0 - cs))) / 0.03);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RIDGE_FRAG = /* glsl */`
precision highp float;
uniform vec3 uCol; uniform float uHaze, uFade, uAmp, uRim, uOcc, uTex;
uniform sampler2D uSky; uniform vec2 uRes; uniform vec3 uSunCol;
varying float vCrest; varying float vY; varying float vPx; varying float vSun; varying vec2 vXY;
${NOISE_GLSL}
void main(){
  float dg = vCrest - vY;
  float cov = clamp(dg / vPx + 0.5, 0.0, 1.0);
  if (cov <= 0.0) discard;
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, cov); return; }
  vec3 hz = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
  float below = clamp(dg / uAmp, 0.0, 1.5);
  float a = uHaze + (1.0 - uHaze) * uFade * smoothstep(0.02, 1.0, below);
  vec3 col = uCol;
  if (uTex > 0.0){
    // the near slopes: a canopy of crowns, and soft spurs with haze pooled in the hollows between them
    float crowns = vn2(vXY / vec2(8.0, 6.0)) * 0.65 + vn2(vXY / vec2(3.0, 2.6) + 5.0) * 0.35;
    float spur = vn2(vec2(vXY.x / 120.0 + vXY.y / 160.0, vXY.y / 110.0) + 11.0);
    col *= 1.0 + uTex * (crowns - 0.5) * 1.3;
    a += uTex * 0.08 * smoothstep(0.4, 0.9, spur) * smoothstep(0.03, 0.3, below);
  }
  vec3 c = mix(col, hz, clamp(a, 0.0, 1.0));
  float rimW = vPx * (1.0 + 4.0 * vSun);
  c += uSunCol * exp(-max(dg, 0.0) / rimW) * 1.6 * vSun * vSun * uRim;
  gl_FragColor = vec4(c, cov);
}`;

// a layer's baked forest strip, same tone as its ridge, crowns rim-lit only near the sun
const STRIP_VERT = /* glsl */`
uniform vec3 uSunDir;
varying vec2 vUv; varying float vSun; varying float vX;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vX = w.x;
  vec3 dir = normalize(w.xyz - cameraPosition);
  vSun = exp(-sqrt(max(0.0, 2.0 * (1.0 - dot(dir, uSunDir)))) / 0.035);
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
  float edge = clamp(1.0 - t.g * 1.25, 0.0, 1.0);
  c += uSunCol * edge * 3.4 * vSun * vSun * uRim;
  gl_FragColor = vec4(c, t.a);
}`;

// drifting valley mist: two texture taps scrolling at different speeds, lit by the sky behind
const MIST_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uMistT; uniform sampler2D uSky; uniform vec2 uRes; uniform float uTime, uDens, uSpd, uRep;
uniform vec3 uSunCol; uniform vec2 uSunPx;
varying vec2 vUv;
void main(){
  float a = texture2D(uMistT, vec2(vUv.x * uRep + uTime * uSpd, 1.0 - vUv.y)).r;
  float b = texture2D(uMistT, vec2(vUv.x * uRep * 1.7 - uTime * uSpd * 0.6 + 0.37, 1.0 - vUv.y * 0.92)).r;
  float m = clamp(a * 0.65 + b * 0.55, 0.0, 1.0) * uDens;
  if (m < 0.004) discard;
  vec3 hz = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
  float sp = exp(-length(gl_FragCoord.xy - uSunPx) / 520.0);
  vec3 c = hz * 1.06 + uSunCol * sp * 0.3;
  gl_FragColor = vec4(c, m);
}`;
const MIST_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// occlusion source: the visible sun and a modest corona (screen space), drawn before the occluders
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
  float spokes = 0.3 + 0.7 * an(a + uTime * 0.006) * (0.6 + 0.4 * an(a * 0.5 - uTime * 0.004 + 1.7));
  float b = smoothstep(1.1, 0.85, r) * 6.0 + (exp(-r / 1.2) * 1.6 + exp(-r / 3.5) * 0.45) * spokes;
  gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * b * 0.1, 1.0);
}`;
// radial blur toward the sun
const RAY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uOcc; uniform vec2 uSunUv;
void main(){
  vec2 dl = (vUv - uSunUv) * (0.94 / 44.0);
  vec2 uv = vUv; vec3 acc = vec3(0.0); float w = 1.0;
  for (int i = 0; i < 44; i++){ acc += texture2D(uOcc, uv).rgb * w; w *= 0.96; uv -= dl; }
  gl_FragColor = vec4(acc / 44.0 * 2.5, 1.0);
}`;
// the finished frame: the world + the rays (compressed, so the glow round the sun saturates softly instead
// of clipping; full in the open sky, a little over the ridges), then the vignette smoothing in display space
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
  c += r * mix(0.035, 1.0, sky * sky);
  gl_FragColor = vec4(vignetteSmooth(c), 1.0);
}`;
const BIRD_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uAtlas; uniform float uCell; uniform vec3 uCol;
varying vec2 vUv;
void main(){
  vec2 uv = (vec2(mod(uCell, 4.0), 3.0 - floor(uCell / 4.0)) + vUv) / 4.0;
  float a = texture2D(uAtlas, uv).a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uCol, a);
}`;

// ---------------------------------------------------------------- the shot
register('dawn_landscape', (opts) => {
  const wide = opts.mode === 'wide';
  const seed = opts.seed ?? 1;
  const R = rng(seed * 7919 + 13);
  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(wide ? 30 : 24, 16 / 9, 1, 100000);
  const W = 1920, H = 1080;
  const sunAzDeg = wide ? 16.0 : 12.6;                   // low in the right third, outside a centred text block
  const cam0 = wide ? [-40, 866, 60] : [-20, 845, 0];
  const deg = THREE.MathUtils.degToRad;
  const tanH0 = Math.tan(deg(camera.fov / 2));
  const pxPerDeg = (H / 2) / tanH0 * (Math.PI / 180);
  const push = wide ? 260 : 40;                          // how far the camera travels toward the ridges

  // ---- ridge layers, near to far: distance, mean crest elevation and its spread (deg, seen from cam0),
  // ridgedness, tree spacing / height (m), silhouette colour, haze, valley fade, rim, canopy texture
  const LAY = [
    ...(wide ? [{ d: 950, el: -6.4, sp: 1.6, rg: 0.12, tsp: 2.6, th: 26, col: '#0d0c14', haze: 0.0, fade: 0.06, rim: 1.0, tex: 1.0 }] : []),
    { d: 1400, el: -4.5, sp: 1.5, rg: 0.15, tsp: 3.0, th: 27, col: '#120f1a', haze: 0.02, fade: wide ? 0.1 : 0.12, rim: 1.0, tex: 0.9 },
    { d: 2400, el: -3.1, sp: 1.15, rg: 0.2, tsp: 3.8, th: 25, col: '#1d1a2a', haze: 0.06, fade: 0.55, rim: 1.0, tex: 0.55 },
    { d: 3800, el: -2.15, sp: 0.85, rg: 0.3, tsp: 4.4, th: 22, col: '#2b2739', haze: 0.13, fade: 0.62, rim: 0.95, tex: 0, flank: true },
    { d: 6000, el: -1.4, sp: 0.62, rg: 0.4, tsp: 6.0, th: 20, col: '#41384e', haze: 0.25, fade: 0.66, rim: 0.85, tex: 0 },
    { d: 9500, el: -0.85, sp: 0.46, rg: 0.5, tsp: 0, th: 0, col: '#615164', haze: 0.4, fade: 0.66, rim: 0.7, tex: 0 },
    { d: 15000, el: -0.48, sp: 0.32, rg: 0.55, tsp: 0, th: 0, col: '#8a6e76', haze: 0.55, fade: 0.6, rim: 0.55, tex: 0 },
    { d: 24000, el: -0.22, sp: 0.2, rg: 0.6, tsp: 0, th: 0, col: '#b08d88', haze: 0.7, fade: 0.5, rim: 0.45, tex: 0 },
  ];
  const SH = LAY.findIndex((l) => l.flank);                // the forested flank the sun rises behind
  const hfov = Math.atan(tanH0 * W / H);
  const atlasC = treeAtlas(seed * 13 + 1);
  const mistT = mistTexture(seed * 17 + 3);

  // low-res sky target (sampled by everything for aerial perspective), the occlusion / ray targets, the frame
  const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const rtSky = new THREE.WebGLRenderTarget(480, 270, rtOpts);
  const rtOcc = new THREE.WebGLRenderTarget(400, 225, rtOpts), rtRay = new THREE.WebGLRenderTarget(400, 225, rtOpts);
  const rtMain = new THREE.WebGLRenderTarget(W, H, rtOpts);
  const res = new THREE.Vector2(W, H);
  const sunCol = new THREE.Color('#ffb25e');
  const U = {
    sunDir: { value: new THREE.Vector3(0, 0, -1) }, pxAng: { value: 0.0002 }, time: { value: 0 },
    sunPx: { value: new THREE.Vector2() }, sunCol: { value: sunCol }, sky: { value: rtSky.texture }, res: { value: res },
  };

  const occScene = new THREE.Scene();
  const occBlend = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  let crestUnderSun = -1e9;      // world height of the tallest tree tops under the sun (flank layer), for the sun path
  LAY.forEach((l, i) => {
    const dz = l.d + cam0[2];
    const meanY = cam0[1] + dz * Math.tan(deg(l.el));
    const amp = (dz * Math.tan(deg(l.sp))) / 0.3;
    const base = meanY - amp * 0.5;
    const f = ridgeFn(seed * 101 + i * 7 + (wide ? 3 : 0), 1 / (amp * 3.2), l.rg, i < 2 ? 6 : 5);
    const xSun = cam0[0] + dz * Math.tan(deg(sunAzDeg));
    // the flank climbs toward the right and peaks a little past the sun
    const flank = (x) => (i === SH ? smooth((x - (xSun - dz * 0.36)) / (dz * 0.38)) * (1 - 0.35 * smooth((x - (xSun + dz * 0.06)) / (dz * 0.2))) : 0);
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
    const pxPerM = (H / 2) / tanH0 / Math.max(dz - push, 300);
    const n = Math.min(1600, Math.ceil(((x1 - x0) * pxPerM) / 2.5));
    const pos = new Float32Array((n + 1) * 2 * 3), cr = new Float32Array((n + 1) * 2), idx = [];
    const bottom = i === 0 ? base - amp * 4 - 900 : cam0[1] + dz * Math.tan(deg(LAY[i - 1].minEl - 1.4));
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
        uCol: { value: new THREE.Color(l.col) }, uHaze: { value: l.haze }, uFade: { value: l.fade }, uAmp: { value: amp }, uTex: { value: l.tex },
        uRim: { value: l.rim * (l.tsp > 0 ? 0.3 : 1) }, uOcc: { value: occ ? 1 : 0 }, uSky: U.sky, uRes: U.res, uSunCol: U.sunCol, uSunDir: U.sunDir, uPxAng: U.pxAng,
      },
      vertexShader: RIDGE_VERT, fragmentShader: RIDGE_FRAG, transparent: true, depthTest: false, depthWrite: false,
      ...(occ ? occBlend : {}),
    });
    const mesh = new THREE.Mesh(geo, mkRidgeMat(false)); mesh.frustumCulled = false; mesh.renderOrder = 100 - i * 10;
    world.add(mesh);
    const om = new THREE.Mesh(geo, mkRidgeMat(true)); om.frustumCulled = false; om.renderOrder = 100 - i * 10; occScene.add(om);

    // forest along the crest: groves and clearings, crowns overlapping into a canopy line, a mix of conifers
    // and broadleaf crowns, the odd emergent spire; past ~3 km the fringe is lower and softer
    if (l.tsp > 0) {
      const RT = rng(seed * 977 + i * 31);
      const clear = noise1(seed * 59 + i), groveN = noise1(seed * 61 + i * 3);
      const far = l.d >= 3500;
      const list = [];
      let maxTop = 0, maxSink = 0;
      for (let x = x0; x < x1; x += l.tsp * (0.35 + 0.75 * RT())) {
        const nearSun = i === SH ? Math.exp(-Math.pow((x - xSun) / (dz * 0.05), 2)) : 0;
        const dens = Math.max(nearSun, smooth((clear(x / (l.tsp * 70)) - 0.15) / 0.3));
        if (RT() > dens * 0.95 + 0.03) continue;
        const grove = 0.55 + 0.75 * groveN(x / (l.tsp * 14) + 50);
        const emergent = RT() < 0.035 ? 1.35 : 1;
        const h = l.th * (0.55 + 0.4 * RT()) * (0.6 + 0.4 * dens) * lerp(grove, 1.15, nearSun) * emergent * lerp(far ? 0.72 : 1, 1.7, nearSun);
        const cr = RT(), cell = nearSun > 0.3 ? [3, 4, 5, 2, 9][Math.floor(cr * 5)] : pickCell(cr, far), jit = RT(), z = RT();
        const w = h * (TCW / TCH) * (0.85 + 0.35 * jit) * (cell >= 6 && cell <= 8 ? 1.15 : 1);
        const sink = 0.16 + 0.22 * z * z;          // trees a little down the far side stand lower
        list.push({ x, h, w, cell, sink });
        maxTop = Math.max(maxTop, (1 - sink) * h); maxSink = Math.max(maxSink, sink * h);
        if (i === SH && Math.abs(x - xSun) < dz * Math.tan(deg(0.5))) crestUnderSun = Math.max(crestUnderSun, crest(x) + h * 0.75);
      }
      maxTop += 1; maxSink += 1;
      const tex = bakeStrip(atlasC, list, x0, x1, crest, pxPerM, maxTop, maxSink);
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
      const mkStripMat = (occ) => new THREE.ShaderMaterial({
        uniforms: {
          uStrip: { value: tex }, uSky: U.sky, uRes: U.res, uCol: { value: new THREE.Color(l.col) },
          uHaze: { value: l.haze }, uRim: { value: l.rim }, uOcc: { value: occ ? 1 : 0 }, uSunCol: U.sunCol, uSunDir: U.sunDir,
        },
        vertexShader: STRIP_VERT, fragmentShader: STRIP_FRAG, transparent: true, depthTest: false, depthWrite: false,
        ...(occ ? occBlend : {}),
      });
      const sm = new THREE.Mesh(sg, mkStripMat(false)); sm.frustumCulled = false; sm.renderOrder = 100 - i * 10 + 1; world.add(sm);
      const so = new THREE.Mesh(sg, mkStripMat(true)); so.frustumCulled = false; so.renderOrder = 100 - i * 10 + 1; occScene.add(so);
    }

    // valley mist in front of this ridge (two banks on the nearer valleys, one further back)
    if (i >= 1) {
      const banks = l.d > 5000 ? 1 : 2;
      for (let b = 0; b < banks; b++) {
        const zz = -(l.d - (l.d - LAY[i - 1].d) * (b ? 0.45 : 0.08));
        const dzz = -zz + cam0[2];
        const hw = (dzz + 400) * Math.tan(hfov + deg(4)) + 200;
        const mh = amp * (0.9 + 0.2 * b);
        const mg = new THREE.PlaneGeometry(hw * 2, mh);
        const mm = new THREE.ShaderMaterial({
          uniforms: {
            uMistT: { value: mistT }, uSky: U.sky, uRes: U.res, uTime: U.time, uDens: { value: (opts.mist ?? 1) * (b ? 0.13 : 0.17) * (i === 1 ? 0.7 : 1) * (banks === 1 ? 1.3 : 1) },
            uSpd: { value: (0.0016 + 0.0012 * R()) * (b ? -1 : 1) }, uRep: { value: hw * 2 / (amp * 7) }, uSunCol: U.sunCol, uSunPx: U.sunPx,
          },
          vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthTest: false, depthWrite: false,
        });
        const mesh = new THREE.Mesh(mg, mm);
        mesh.position.set(cam0[0], base - amp * (0.25 + 0.1 * b) + mh / 2, zz);
        mesh.frustumCulled = false; mesh.renderOrder = 100 - i * 10 + 5 + b;
        world.add(mesh);
      }
    }
  });

  // ---- sky, designed in display space (what the frame shows before the sun's glow is added)
  const skyU = {
    uCamR: { value: new THREE.Vector3() }, uCamU: { value: new THREE.Vector3() }, uCamF: { value: new THREE.Vector3() },
    uTanH: { value: 0.2 }, uAspect: { value: W / H }, uTime: U.time, uSunDir: U.sunDir,
    uHor: { value: disp('#efa684') }, uHorSun: { value: disp('#fcc68c') }, uMid: { value: disp('#f6d7b0') },
    uPale: { value: disp('#eee7d6') }, uZen: { value: disp('#7fa6d8') },
    uSunCol: U.sunCol, uCloud: { value: 1 },
  };
  const quad = new THREE.PlaneGeometry(2, 2);
  const oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const skyScene = new THREE.Scene();
  const skyMesh = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SCREEN_VERT, fragmentShader: SKY_FRAG, depthTest: false, depthWrite: false }));
  skyMesh.frustumCulled = false; skyScene.add(skyMesh);
  const skyQU = { uSky: U.sky, uSunPx: U.sunPx, uSunRpx: { value: 30 }, uDisk: { value: 6.0 } };
  const skyQ = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: skyQU, vertexShader: SCREEN_VERT, fragmentShader: SKYQ_FRAG, depthTest: false, depthWrite: false }));
  skyQ.frustumCulled = false; skyQ.renderOrder = -100;
  world.add(skyQ);

  // ---- god rays: visible sun (occluded by the ridge / forest clones) -> radial blur -> added in the final pass
  const occSunU = { uSunUv: { value: new THREE.Vector2() }, uSunRuv: { value: 0.03 }, uAspect: { value: W / H }, uTime: U.time };
  const occSun = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: occSunU, vertexShader: SCREEN_VERT, fragmentShader: OCCSUN_FRAG, depthTest: false, depthWrite: false }));
  occSun.frustumCulled = false; occSun.renderOrder = -1000; occScene.add(occSun);
  const rayScene = new THREE.Scene();
  const rayM = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uOcc: { value: rtOcc.texture }, uSunUv: occSunU.uSunUv }, vertexShader: SCREEN_VERT, fragmentShader: RAY_FRAG, depthTest: false, depthWrite: false }));
  rayM.frustumCulled = false; rayScene.add(rayM);

  // ---- the frame the kit renders: one quad that composites the world, the rays and the grade
  const finalU = {
    uMain: { value: rtMain.texture }, uRays: { value: rtRay.texture }, uOcc: { value: rtOcc.texture }, uGain: { value: 1 },
    uAIn: { value: ACES_IN }, uAOut: { value: ACES_OUT }, uAInInv: { value: ACES_IN_INV }, uAOutInv: { value: ACES_OUT_INV },
    uVigA: { value: 0.62 }, uVigK: { value: 0.6 },
  };
  const scene = new THREE.Scene();
  const finalQ = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: finalU, vertexShader: SCREEN_VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false }));
  finalQ.frustumCulled = false; scene.add(finalQ);
  finalQ.onBeforeRender = (renderer) => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rtSky); renderer.render(skyScene, oCam);
    renderer.setRenderTarget(rtOcc); renderer.render(occScene, camera);
    renderer.setRenderTarget(rtRay); renderer.render(rayScene, oCam);
    renderer.setRenderTarget(rtMain); renderer.render(world, camera);
    renderer.setRenderTarget(prev);
  };
  const vigEl = typeof document !== 'undefined' ? document.getElementById('vignette') : null;

  // ---- gulls: a loose group crossing high in the left half, flapping in bouts and gliding
  const nBirds = opts.birds ?? (wide ? 4 : 3);
  const RB = rng(seed * 31 + 5);
  const bTex = birdAtlas();
  const birds = [];
  const bGeo = new THREE.PlaneGeometry(1, 0.5);
  const birdCol = new THREE.Color(0x0f0b0e).lerp(new THREE.Color(0xc89a8a), 0.18);
  for (let i = 0; i < nBirds; i++) {
    const u = { uAtlas: { value: bTex }, uCell: { value: 0 }, uCol: { value: birdCol } };
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: MIST_VERT, fragmentShader: BIRD_FRAG, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(bGeo, m); mesh.frustumCulled = false; mesh.renderOrder = 600;
    world.add(mesh);
    // camera-space flight: distance, lateral start offset, height (screen y), speed, flap rate
    birds.push({ mesh, u, D: (wide ? 70 : 76) + RB() * 10, x0: -i * (wide ? 9 : 6.5) - RB() * 4, yPx: (wide ? 175 : 190) + i * 26 + RB() * 30 - (i % 2) * 40,
      v: (wide ? 5.6 : 9.0) + RB() * 1.0, fr: 2.6 + RB() * 0.6, ph: RB(), gl: RB() * 10, span: 1.25 + RB() * 0.2 });
  }

  // ---- sun path: elevation relative to the tree tops under it (seen from cam0)
  const crestEl = THREE.MathUtils.radToDeg(Math.atan2(crestUnderSun - cam0[1], (LAY[SH].d + cam0[2]) / Math.cos(deg(sunAzDeg))));
  const sunR = wide ? 0.78 : 0.72;
  const rel = opts.sun ?? (wide ? [1.0, 1.35] : [-0.95, 1.2]);
  const sunEl = [crestEl + rel[0], crestEl + rel[1]];
  // pitch that puts the sun at sunY at the end of the shot
  const sunY = opts.sunY ?? (wide ? 705 : 690);
  const pitchEnd = sunEl[1] + (sunY - H / 2) / pxPerDeg;
  const v3 = new THREE.Vector3();

  return {
    scene, camera,
    bloom: { strength: 0 },
    exposure: 1.0,
    update(lt, c) {
      const k = c.k;
      U.time.value = lt;
      // ---- camera
      let pos, pitch, yaw = 0, roll;
      if (!wide) {
        const e = ease.inOut(k);
        pos = [cam0[0] + 30 * k, cam0[1] + 42 * e, cam0[2] - push * k];
        pitch = lerp(pitchEnd + 0.22, pitchEnd, e);
      } else {
        const e = smooth(k);
        pos = [cam0[0] + 30 * k, cam0[1] + 36 * e, cam0[2] - push * e];
        pitch = lerp(pitchEnd + 0.2, pitchEnd, e);
        yaw = lerp(-0.25, 0.25, k);
      }
      // the faintest drift of a drone holding its line
      pitch += noise(lt * 0.21 + 3) * 0.035; yaw += noise(lt * 0.17 + 9) * 0.04; roll = noise(lt * 0.13 + 1) * 0.06;
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.rotation.set(deg(pitch), deg(-yaw), deg(roll), 'YXZ');
      camera.updateMatrixWorld(true);
      const me = camera.matrixWorld.elements;
      skyU.uCamR.value.set(me[0], me[1], me[2]);
      skyU.uCamU.value.set(me[4], me[5], me[6]);
      skyU.uCamF.value.set(-me[8], -me[9], -me[10]);
      skyU.uTanH.value = tanH0; skyU.uAspect.value = camera.aspect;
      U.pxAng.value = (2 * tanH0) / H;
      // ---- sun
      const elDeg = lerp(sunEl[0], sunEl[1], !wide ? ease.out(k) * 0.3 + k * 0.7 : k);
      const el = deg(elDeg), az = deg(sunAzDeg);
      U.sunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      v3.copy(U.sunDir.value).multiplyScalar(50000).add(camera.position).project(camera);
      occSunU.uSunUv.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
      U.sunPx.value.set(occSunU.uSunUv.value.x * W, occSunU.uSunUv.value.y * H);
      const rpx = deg(sunR) / (2 * tanH0) * H;
      skyQU.uSunRpx.value = rpx;
      occSunU.uSunRuv.value = rpx / H;
      // rays strongest while the sun is breaking through the trees, calmer once it is clear
      finalU.uGain.value = (!wide ? lerp(7.5, 1.8, smooth(k * 1.3)) : 1.6) * (opts.rays ?? 1);
      // the film's vignette strength right now (the engine sets it before the shots update; the harness leaves it at 1)
      const vo = vigEl ? parseFloat(vigEl.style.opacity) : 1;
      finalU.uVigA.value = 0.62 * (Number.isFinite(vo) ? vo : 1) * (opts.vignetteComp ?? 1);
      // ---- gulls (camera space, so the crane does not throw them around)
      for (const b of birds) {
        const xs = b.x0 + b.v * lt - b.D * tanH0 * camera.aspect * 1.1;
        const yc = b.D * tanH0 * (H / 2 - b.yPx) / (H / 2) + noise(lt * 0.35 + b.gl) * 0.8 + 0.12 * lt;
        v3.set(xs, yc, -b.D);
        camera.localToWorld(v3);
        b.mesh.position.copy(v3);
        b.mesh.quaternion.copy(camera.quaternion);
        b.mesh.rotateZ(0.08 * noise(lt * 0.7 + b.ph * 9));
        b.mesh.scale.set(b.span, b.span, 1);
        const bout = noise(lt * 0.32 + b.gl) > -0.35;
        const ph = (lt * b.fr + b.ph) % 1;
        b.u.uCell.value = bout ? Math.floor(ph * 15) % 15 : 15;
      }
    },
  };
});
