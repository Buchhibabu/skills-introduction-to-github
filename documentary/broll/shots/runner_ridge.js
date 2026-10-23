// runner_ridge: a runner in silhouette along a ridge crest at sunrise. Long-lens tracking shot from the slope
// below the trail: the runner (an articulated figure driven by a measured running gait: hip, knee, ankle,
// arm swing, trunk lean, pelvis rotation, ground-planted stance feet, a swinging ponytail) crosses the frame
// against a great range in warm haze; backlit grass glows along the crest, lone trees on a nearer hill slide
// past behind (parallax), out-of-focus grass streaks through the foreground, and the low sun throws god rays
// around the runner's own silhouette.
//
// opts:
//   speed    gait cadence multiplier (default 1 = ~176 steps/min)
//   seed     layout seed (default 2)
//   sunSide  'front' (default: the sun sits just ahead of the runner's head) | 'behind' (the body eclipses it)
//   rays     god-ray strength multiplier (default 1)
//
// Overlays: a text card sits in the left third; the runner holds x ~1060..1260 (centre-right) and runs to the
// right, the left third is open sky, haze and soft distant ridges.
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
  float glare = exp(-length(gl_FragCoord.xy - uSunPx) / 70.0);
  gl_FragColor = vec4(r * 4.0 * uGain * max(sky * sky, 0.35), 1.0);
}`;

// ---------------------------------------------------------------- running gait
// joint angles in degrees over one gait cycle (right foot strike at 0, left at 0.5), after published
// sagittal-plane running kinematics: hip flexion +, knee flexion +, ankle dorsiflexion +
const GAIT = {
  hip: [[0, 29], [0.1, 19], [0.2, 4], [0.3, -10], [0.38, -18], [0.45, -13], [0.55, 4], [0.65, 23], [0.75, 38], [0.85, 42], [0.93, 36]],
  knee: [[0, 15], [0.1, 32], [0.2, 37], [0.3, 24], [0.38, 13], [0.45, 32], [0.55, 70], [0.65, 106], [0.72, 112], [0.8, 94], [0.88, 54], [0.95, 22]],
  ankle: [[0, 3], [0.1, 15], [0.2, 19], [0.3, 9], [0.38, -18], [0.45, -27], [0.55, -14], [0.65, -2], [0.8, 6], [0.92, 4]],
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

// a tapered limb hanging along -y from its proximal joint, with rounded ends and an optional muscle bulge
function limbGeo(len, r0, r1, bulge = 0, at = 0.5, seg = 14) {
  const pts = [];
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r1, -len - Math.cos(a) * r1)); }
  for (let i = 1; i < 14; i++) {
    const t = i / 14, r = lerp(r1, r0, t) + bulge * Math.exp(-Math.pow((t - at) / 0.2, 2));
    pts.push(new THREE.Vector2(r, -len + t * len));
  }
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0)); }
  return new THREE.LatheGeometry(pts, seg);
}
function latheProfile(prof, seg = 18) { return new THREE.LatheGeometry(prof.map(([y, r]) => new THREE.Vector2(r, y)), seg); }

// silhouette with a backlit rim on the edges that face the sun (screen space)
const BODY_VERT = /* glsl */`
varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const BODY_FRAG = /* glsl */`
precision highp float;
uniform vec2 uSunPx; uniform vec3 uSunCol; uniform float uRim; uniform float uOcc; uniform vec3 uBase;
varying vec3 vN; varying vec3 vV;
void main(){
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0); return; }
  vec3 N = normalize(vN), V = normalize(vV);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  vec2 toSun = uSunPx - gl_FragCoord.xy; float dS = length(toSun);
  float face = clamp(dot(normalize(N.xy + vec2(1e-4)), toSun / max(dS, 1.0)), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 6.0) * (0.05 + 0.6 * face * face) * (0.2 + 1.0 * exp(-dS / 340.0));
  gl_FragColor = vec4(uBase + uSunCol * rim * uRim, 1.0);
}`;

const SHELL_VERT = /* glsl */`
uniform float uInflate;
void main(){ vec3 p = position + normal * uInflate; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const SHELL_FRAG = /* glsl */`
precision highp float;
uniform vec2 uSunPx; uniform vec3 uSunCol; uniform vec2 uCenterPx;
void main(){
  vec2 toSun = uSunPx - gl_FragCoord.xy; float dS = length(toSun);
  vec2 out2 = gl_FragCoord.xy - uCenterPx;                 // which side of the figure this edge is on
  float face = clamp(dot(normalize(out2 + vec2(1e-3)), toSun / max(dS, 1.0)) * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(uSunCol * (0.06 + 1.6 * pow(face, 3.0)) * (0.35 + 1.4 * exp(-dS / 420.0)), 1.0);
}`;
function buildRunner(mat, shellMat) {
  const m = (geo) => {
    const x = new THREE.Mesh(geo, mat); x.frustumCulled = false;
    if (shellMat) { const sh = new THREE.Mesh(geo, shellMat); sh.frustumCulled = false; sh.renderOrder = 299; x.add(sh); }
    return x;
  };
  const G = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const root = new THREE.Group();
  const pelvis = G(root);
  const hips = m(new THREE.SphereGeometry(1, 18, 12)); hips.scale.set(0.105, 0.1, 0.15); hips.position.set(-0.012, 0.06, 0); pelvis.add(hips);
  const rig = { root, pelvis, leg: {}, arm: {}, mark: {} };
  const thighG = limbGeo(0.44, 0.078, 0.05, 0.012, 0.65), shinG = limbGeo(0.43, 0.048, 0.03, 0.016, 0.72);
  const shortsG = latheProfile([[-0.2, 0.0], [-0.2, 0.098], [-0.1, 0.094], [0.0, 0.09], [0.03, 0.0]]);
  const shoeG = new THREE.CapsuleGeometry(0.032, 0.155, 4, 10); shoeG.rotateZ(Math.PI / 2);
  for (const [side, z] of [['R', 0.088], ['L', -0.088]]) {
    const hip = G(pelvis, 0, 0, z);
    const thigh = G(hip); thigh.add(m(thighG)); thigh.add(m(shortsG));
    const knee = G(thigh, 0, -0.44, 0);
    const shin = m(shinG); shin.position.x = -0.008; knee.add(shin);
    const ankle = G(knee, 0, -0.43, 0);
    const shoe = m(shoeG); shoe.position.set(0.055, -0.05, 0); shoe.scale.set(1, 0.9, 1.15); ankle.add(shoe);
    const heel = G(ankle, -0.06, -0.085, 0), ball = G(ankle, 0.12, -0.085, 0), toe = G(ankle, 0.17, -0.07, 0);
    rig.leg[side] = { hip, thigh, knee, ankle };
    rig.mark[side] = { heel, ball, toe };
  }
  const spine = G(pelvis, 0, 0.06, 0);
  const torso = m(latheProfile([[0, 0.0], [0.0, 0.122], [0.08, 0.118], [0.17, 0.11], [0.29, 0.135], [0.39, 0.155], [0.45, 0.152], [0.5, 0.125], [0.535, 0.06], [0.55, 0.0]], 20));
  torso.scale.set(0.95, 1, 1.15); spine.add(torso);
  const neck = G(spine, 0.0, 0.52, 0);
  const neckM = m(limbGeo(0.1, 0.05, 0.048)); neckM.rotation.z = Math.PI; neck.add(neckM);
  const head = G(neck, 0.015, 0.13, 0);
  const skull = m(new THREE.SphereGeometry(1, 20, 14)); skull.scale.set(0.102, 0.118, 0.09); head.add(skull);
  const jaw = m(new THREE.SphereGeometry(1, 14, 10)); jaw.scale.set(0.07, 0.06, 0.065); jaw.position.set(0.04, -0.06, 0); head.add(jaw);
  // ponytail: three segments from the back of the head
  const pony = [];
  let pp = G(head, -0.085, 0.035, 0);
  const pg = [limbGeo(0.075, 0.036, 0.03), limbGeo(0.07, 0.03, 0.022), limbGeo(0.065, 0.022, 0.012)];
  for (let i = 0; i < 3; i++) { const seg = G(pp); seg.add(m(pg[i])); pony.push(seg); pp = G(seg, 0, i === 0 ? -0.075 : -0.07, 0); }
  rig.pony = pony;
  const uaG = limbGeo(0.29, 0.047, 0.036, 0.008, 0.6), faG = limbGeo(0.26, 0.036, 0.025, 0.006, 0.75);
  for (const [side, z] of [['R', 0.185], ['L', -0.185]]) {
    const sh = G(spine, -0.01, 0.465, z);
    sh.add(m(uaG));
    const delt = m(new THREE.SphereGeometry(1, 14, 10)); delt.scale.set(0.06, 0.07, 0.055); delt.position.set(0, -0.02, 0); sh.add(delt);
    const el = G(sh, 0, -0.29, 0); el.add(m(faG));
    const hand = m(new THREE.SphereGeometry(1, 12, 8)); hand.scale.set(0.038, 0.052, 0.03); hand.position.set(0.012, -0.285, 0); el.add(hand);
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
    L.thigh.rotation.set(0, 0, periodic(GAIT.hip, p) * D2R);
    L.knee.rotation.set(0, 0, -periodic(GAIT.knee, p) * D2R);
    L.ankle.rotation.set(0, 0, periodic(GAIT.ankle, p) * D2R);
    // arms swing against the same-side leg; the elbow folds more as the arm comes forward
    const shF = -1.35 * (periodic(GAIT.hip, p) - 12) + 2;
    const A = rig.arm[side];
    A.sh.rotation.set((side === 'R' ? 1 : -1) * 0.12, 0.0, shF * D2R);
    A.el.rotation.set(0, 0, (80 + 0.3 * shF) * D2R);
  }
  const w = ph * Math.PI * 2;
  rig.pelvis.rotation.set(0.06 * Math.sin(w), 0.1 * Math.cos(w), -0.06 + 0.02 * Math.sin(2 * w));
  rig.spine.rotation.set(-0.04 * Math.sin(w), -0.17 * Math.cos(w), -0.15 + 0.025 * Math.sin(2 * w + 0.6));
  rig.neck.rotation.set(0.03 * Math.sin(w), 0.08 * Math.cos(w), 0.17);
  // the ponytail lags the bounce and swings with the shoulders
  rig.pony.forEach((s, i) => s.rotation.set(0.22 * Math.sin(w - 0.9 - 0.6 * i), 0, (i === 0 ? -0.55 : 0.18) - 0.26 * Math.sin(2 * w - 1.3 - 0.7 * i)));
}

// grass blade (strip along +y, 4 segments), bent in the vertex shader
const GRASS_VERT = /* glsl */`
attribute vec4 aG;          // height, lean, phase, width
uniform float uTime;
varying float vY; varying vec2 vScr; varying float vLit;
void main(){
  float y = position.y;     // 0..1 along the blade
  float h = aG.x;
  float bend = (aG.y + 0.06 * sin(uTime * 1.7 + aG.z) + 0.03 * sin(uTime * 3.1 + aG.z * 1.7)) * y * y;
  vec3 p = vec3(position.x * aG.w * (1.0 - 0.85 * y) + bend * h, y * h, 0.0);
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vY = y;
  vLit = exp(-max(instanceMatrix[3].z - 0.2, 0.0) / 1.4);   // blades down the slope are in the ridge's shadow
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const GRASS_FRAG = /* glsl */`
precision highp float;
uniform vec2 uSunPx; uniform vec3 uSunCol; uniform float uOcc; uniform vec3 uBase; uniform float uGlow;
varying float vY; varying float vLit;
void main(){
  if (uOcc > 0.5) { gl_FragColor = vec4(0.0); return; }
  float dS = length(uSunPx - gl_FragCoord.xy);
  // backlit blades let the low sun through: the upper blade glows gold
  vec3 c = uBase + uSunCol * vec3(1.0, 0.78, 0.45) * (0.05 + 0.9 * exp(-dS / 520.0)) * smoothstep(0.15, 1.0, vY) * uGlow * vLit;
  gl_FragColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- the shot
register('runner_ridge', (opts) => {
  const seed = opts.seed ?? 2;
  const R = rng(seed * 7919 + 3);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(13, 16 / 9, 0.1, 200000);
  const W = 1920, H = 1080;
  const deg = THREE.MathUtils.degToRad;
  const camY = -1.0, camZ = 17, pitch0 = 7.4;
  const T = 0.68 / (opts.speed ?? 1);              // gait cycle (s): ~176 steps/min
  const hfov = Math.atan(Math.tan(deg(camera.fov / 2)) * W / H);

  // ---- the runner (and an identical black copy for the god-ray occlusion pass)
  const sunCol = new THREE.Color('#ffb25e');
  const U = {
    sunDir: { value: new THREE.Vector3(0, 0, -1) }, pxAng: { value: 0.0002 }, time: { value: 0 },
    sunPx: { value: new THREE.Vector2() }, sunCol: { value: sunCol }, res: { value: new THREE.Vector2(W, H) },
  };
  const bodyMat = new THREE.ShaderMaterial({ uniforms: { uSunPx: U.sunPx, uSunCol: U.sunCol, uRim: { value: 1.5 }, uOcc: { value: 0 }, uBase: { value: new THREE.Vector3(0.007, 0.006, 0.0065) } }, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, transparent: true });
  const bodyOcc = new THREE.ShaderMaterial({ uniforms: { uSunPx: U.sunPx, uSunCol: U.sunCol, uRim: { value: 0 }, uOcc: { value: 1 }, uBase: { value: new THREE.Vector3() } }, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, depthTest: false, depthWrite: false });
    const shellMat = new THREE.ShaderMaterial({ uniforms: { uSunPx: U.sunPx, uSunCol: U.sunCol, uCenterPx: { value: new THREE.Vector2() }, uInflate: { value: 0.0075 } },
    vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, transparent: true, depthTest: false, depthWrite: false });
  const rig = buildRunner(bodyMat, shellMat), rigO = buildRunner(bodyOcc);
  scene.add(rig.root);
  rig.root.traverse((o) => { if (o.isMesh && o.material === bodyMat) o.renderOrder = 300; });

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
  const vel = new Float32Array(NS), py = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const s = stance(i);
    if (s) { const a = bx[s][(i + NS - 1) % NS], b = bx[s][(i + 1) % NS]; vel[i] = -(b - a) / 2; py[i] = -low[s][i]; }
  }
  const fill = (a, b) => {     // flight between stance index a (last) and b (first of the next)
    const n = (b - a + NS) % NS;
    for (let j = 1; j < n; j++) {
      const i = (a + j) % NS, u = j / n;
      vel[i] = lerp(vel[a], vel[b % NS], u);
      py[i] = lerp(py[a], py[b % NS], u) + 4 * 0.012 * u * (1 - u);
    }
  };
  fill(Math.round(0.38 * NS) - 1, Math.round(0.5 * NS)); fill(Math.round(0.88 * NS) - 1, NS);
  const px = new Float32Array(NS + 1); for (let i = 0; i < NS; i++) px[i + 1] = px[i] + vel[i];
  const stride = px[NS], speed = stride / T;
  const pelvisAt = (t) => {
    const c = t / T, cf = Math.floor(c), f = (c - cf) * NS, i = Math.floor(f), u = f - i;
    return [cf * stride + lerp(px[i], px[i + 1], u), lerp(py[i], py[(i + 1) % NS], u)];
  };

  // ---- distant range in haze: ridge ribbons (as in the dawn shot), forest on the nearer ones
  const atlas = treeAtlas(seed * 13 + 1);
  const LAY = [
    { d: 320, el: 3.9, sp: 0.35, rg: 0.2, tsp: 7, th: 15, dens: 0.08, col: '#141219', haze: 0.04, fade: 0.25, rim: 1.0 },
    { d: 1500, el: 4.6, sp: 0.6, rg: 0.25, tsp: 3.5, th: 11, dens: 1, col: '#211e2c', haze: 0.14, fade: 0.55, rim: 0.9 },
    { d: 4200, el: 5.6, sp: 0.9, rg: 0.4, tsp: 5, th: 15, dens: 1, col: '#3a3347', haze: 0.3, fade: 0.65, rim: 0.8 },
    { d: 9500, el: 6.6, sp: 1.2, rg: 0.6, tsp: 0, th: 0, col: '#5d5063', haze: 0.47, fade: 0.66, rim: 0.6 },
    { d: 19000, el: 7.4, sp: 1.4, rg: 0.75, tsp: 0, th: 0, col: '#86707a', haze: 0.62, fade: 0.6, rim: 0.5 },
    { d: 36000, el: 7.7, sp: 1.1, rg: 0.7, tsp: 0, th: 0, col: '#ae9089', haze: 0.75, fade: 0.5, rim: 0.4 },
  ];
  const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const rtSky = new THREE.WebGLRenderTarget(480, 270, rtOpts), rtOcc = new THREE.WebGLRenderTarget(480, 270, rtOpts), rtRay = new THREE.WebGLRenderTarget(480, 270, rtOpts);
  U.sky = { value: rtSky.texture };
  const occScene = new THREE.Scene();
  occScene.add(rigO.root);
  const occBlend = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const runLen = 5.5 * 16 + 30;                  // metres the runner may cover in a long shot, plus margin
  LAY.forEach((l, i) => {
    const meanY = camY + l.d * Math.tan(deg(l.el));
    const amp = (l.d * Math.tan(deg(l.sp))) / 0.3, base = meanY - amp * 0.5;
    const f = ridgeFn(seed * 101 + i * 7, 1 / (amp * 3.2), l.rg, 6);
    const crest = (x) => base + amp * f(x);
    const half = (l.d + camZ) * Math.tan(hfov + deg(3)) + 20;
    const x0 = -half - 10, x1 = runLen + half;
    const pxPerM = (H / 2) / Math.tan(deg(camera.fov / 2)) / (l.d + camZ);
    const n = Math.min(2400, Math.ceil(((x1 - x0) * pxPerM) / 2.5));
    const pos = new Float32Array((n + 1) * 6), cr = new Float32Array((n + 1) * 2), idx = [];
    const bottom = i === 0 ? camY - 50 : camY + (l.d + camZ) * Math.tan(deg(LAY[i - 1].el - LAY[i - 1].sp * 1.8 - 1.5));
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
        uRim: { value: l.rim }, uOcc: { value: occ ? 1 : 0 }, uSky: U.sky, uRes: U.res, uSunCol: U.sunCol, uSunDir: U.sunDir, uPxAng: U.pxAng },
      vertexShader: RIDGE_VERT, fragmentShader: RIDGE_FRAG, transparent: true, depthTest: false, depthWrite: false, ...(occ ? occBlend : {}),
    });
    const mesh = new THREE.Mesh(geo, mk(false)); mesh.frustumCulled = false; mesh.renderOrder = 100 - i * 10; scene.add(mesh);
    const om = new THREE.Mesh(geo, mk(true)); om.frustumCulled = false; om.renderOrder = 100 - i * 10; occScene.add(om);
    if (l.tsp > 0) {
      const RT = rng(seed * 977 + i * 31), clear = noise1(seed * 59 + i), list = [];
      for (let x = x0; x < x1; x += l.tsp * (0.5 + RT())) {
        const dens = l.dens < 1 ? (clear(x / 40) > 1 - l.dens * 1.6 ? 1 : 0) : smooth((clear(x / (l.tsp * 90)) - 0.12) / 0.3);
        if (RT() > dens * 0.97 + 0.01) continue;
        const h = l.th * (0.5 + 0.6 * RT() + 0.3 * RT() * RT()) * (0.55 + 0.45 * dens);
        list.push({ x, h, cell: RT() < (i === 0 ? 0.25 : 0.015) ? 7 : Math.floor(RT() * 7), jit: RT() });
      }
      const tg = new THREE.PlaneGeometry(1, 1); tg.translate(0, 0.5, 0);
      const aVar = new Float32Array(list.length * 2);
      const mkT = (occ) => new THREE.ShaderMaterial({
        uniforms: { uAtlas: { value: atlas.tex }, uCells: { value: atlas.cells }, uSky: U.sky, uRes: U.res, uCol: { value: new THREE.Color(l.col) },
          uHaze: { value: l.haze }, uRim: { value: l.rim }, uOcc: { value: occ ? 1 : 0 }, uSunCol: U.sunCol, uSunDir: U.sunDir },
        vertexShader: TREE_VERT, fragmentShader: TREE_FRAG, transparent: true, depthTest: false, depthWrite: false, ...(occ ? occBlend : {}),
      });
      const im = new THREE.InstancedMesh(tg, mkT(false), Math.max(1, list.length));
      const m4 = new THREE.Matrix4();
      list.forEach((t, j) => {
        const w = t.h * atlas.aspect * (t.cell === 7 ? 1.25 : 1) * (0.85 + 0.3 * t.jit);
        im.setMatrixAt(j, m4.makeScale(w, t.h, 1).setPosition(t.x, crest(t.x) - t.h * 0.18, -l.d + 0.5));
        aVar[j * 2] = t.cell; aVar[j * 2 + 1] = t.jit;
      });
      im.count = list.length;
      tg.setAttribute('aVar', new THREE.InstancedBufferAttribute(aVar, 2));
      im.frustumCulled = false; im.renderOrder = 100 - i * 10 + 1; scene.add(im);
      const oim = new THREE.InstancedMesh(tg, mkT(true), Math.max(1, list.length)); oim.count = list.length;
      oim.instanceMatrix = im.instanceMatrix; oim.frustumCulled = false; oim.renderOrder = 100 - i * 10 + 1; occScene.add(oim);
    }
  });

  // ---- the ridge we run on: the trail along the crest, the slope down toward the lens
  // the trail is flat (the feet are planted at y = 0); in front the slope falls toward the lens, behind it the
  // crest rolls gently and then drops away, so the feet stay against the bright distance
  const hump = (x) => 0.05 * Math.sin(x * 0.45 + 1.0) + 0.04 * Math.sin(x * 1.55) + 0.03 * Math.sin(x * 0.19 + 3.0) - 0.03;
  const gy = (x, z) => {
    if (z > 0.3) return -0.16 * (z - 0.3) - 0.05 * Math.sin(x * 0.21 + z * 0.4) * Math.min(1, (z - 0.3) / 3);
    if (z > -0.3) return 0;
    return hump(x) * smooth((-0.3 - z) / 0.3) - Math.max(0, -0.8 - z) * 0.6;
  };
  {
    const ZS = [-4, -2.6, -1.8, -1.35, -1.1, -0.95, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3, 0, 0.3, 0.45, 0.7, 1, 1.5, 2.2, 3, 4, 5.5, 7, 9, 12, 16];
    const nx = 420, nz = ZS.length - 1, x0 = -30, x1 = runLen + 30;
    const geo = new THREE.PlaneGeometry(1, 1, nx, nz);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
      const x = lerp(x0, x1, u), z = ZS[Math.round(v * nz)];
      p.setXYZ(i, x, gy(x, z), z);
    }
    geo.computeVertexNormals();
    const gm = new THREE.ShaderMaterial({
      uniforms: { uSunPx: U.sunPx, uSunCol: U.sunCol },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `precision highp float; uniform vec2 uSunPx; uniform vec3 uSunCol; varying vec3 vW;
        void main(){
          float n = 0.5 + 0.25 * sin(vW.x * 1.3 + vW.z * 2.1) * sin(vW.x * 0.47 - vW.z * 0.9);
          vec3 c = vec3(0.02, 0.017, 0.015) * (0.8 + 0.4 * n);
          // the crest catches a warm graze of light; the slope falls into shadow toward the lens
          c += uSunCol * 0.05 * exp(-max(vW.z + 0.4, 0.0) / 1.2) * exp(-length(uSunPx - gl_FragCoord.xy) / 900.0);
          gl_FragColor = vec4(c, 1.0); }`,
      depthTest: true, depthWrite: true, transparent: true,
    });
    const ground = new THREE.Mesh(geo, gm); ground.frustumCulled = false; ground.renderOrder = 200;
    scene.add(ground);
    const og = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }', depthTest: false, depthWrite: false })); og.frustumCulled = false; og.renderOrder = 200; occScene.add(og);
  }

  // ---- grass: blades along the crest (silhouetted, backlit gold), tufts on the slope
  const bladeGeo = new THREE.BufferGeometry();
  {
    const pos = [], idx = [];
    for (let s = 0; s <= 4; s++) { const y = s / 4; pos.push(-0.5, y, 0, 0.5, y, 0); if (s < 4) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bladeGeo.setIndex(idx);
  }
  const blades = [];
  const RG = rng(seed * 53 + 1);
  for (let x = -25; x < runLen + 25; x += 0.045 + RG() * 0.06) {
    const clump = noise1(seed + 9)(x * 0.6);
    const n = 1 + Math.floor(RG() * 3);
    for (let j = 0; j < n + 1; j++) blades.push({ x: x + (RG() - 0.5) * 0.08, z: -0.35 - RG() * 0.45, h: (0.12 + 0.42 * RG() * RG()) * (0.35 + 1.2 * clump), lean: (RG() - 0.5) * 0.8, w: 0.007 + RG() * 0.006 });
  }
  for (let x = -25; x < runLen + 25; x += 0.05 + RG() * 0.08) blades.push({ x, z: 0.28 + RG() * 0.2, h: 0.04 + 0.11 * RG() * RG(), lean: (RG() - 0.5) * 0.8, w: 0.007 + RG() * 0.005 });
  for (let k = 0; k < 1800; k++) {
    const z = 0.35 + Math.pow(RG(), 1.6) * 9, x = -25 + RG() * (runLen + 50);
    blades.push({ x, z, h: (0.06 + 0.16 * RG() * RG()) * (0.7 + z * 0.06), lean: (RG() - 0.5) * 0.9, w: 0.008 + RG() * 0.008 });
  }
  const grassU = { uTime: U.time, uSunPx: U.sunPx, uSunCol: U.sunCol, uOcc: { value: 0 }, uBase: { value: new THREE.Vector3(0.012, 0.011, 0.009) }, uGlow: { value: 1 } };
  const grassM = new THREE.ShaderMaterial({ uniforms: grassU, vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true });
  const grassO = new THREE.ShaderMaterial({ uniforms: { ...grassU, uOcc: { value: 1 } }, vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  const ag = new Float32Array(blades.length * 4);
  const gIm = new THREE.InstancedMesh(bladeGeo.clone(), grassM, blades.length);
  const m4 = new THREE.Matrix4();
  // crest blades behind the runner are drawn before it, slope blades after it (they are nearer the lens)
  blades.sort((a, b) => a.z - b.z);
  blades.forEach((b, i) => { gIm.setMatrixAt(i, m4.makeTranslation(b.x, gy(b.x, b.z) - 0.01, b.z)); ag.set([b.h, b.lean, b.x * 3.1, b.w], i * 4); });
  gIm.geometry.setAttribute('aG', new THREE.InstancedBufferAttribute(ag, 4));
  gIm.frustumCulled = false; gIm.renderOrder = 290; scene.add(gIm);
  const nBack = blades.filter((b) => b.z < 0).length;
  const gFront = new THREE.InstancedMesh(gIm.geometry, grassM, blades.length);
  gFront.instanceMatrix = gIm.instanceMatrix; gFront.frustumCulled = false; gFront.renderOrder = 310; scene.add(gFront);
  gIm.count = nBack;
  // the front set skips the back blades by drawing a range: emulate with a second geometry offset
  gFront.geometry = gIm.geometry.clone();
  {
    const off = gFront.geometry.attributes.aG.array.slice(nBack * 4);
    const mats = gIm.instanceMatrix.array.slice(nBack * 16);
    gFront.geometry.setAttribute('aG', new THREE.InstancedBufferAttribute(off, 4));
    gFront.instanceMatrix = new THREE.InstancedBufferAttribute(mats, 16);
    gFront.count = blades.length - nBack;
  }
  const gOcc = new THREE.InstancedMesh(gIm.geometry, grassO, nBack); gOcc.instanceMatrix = gIm.instanceMatrix; gOcc.count = nBack; gOcc.frustumCulled = false; gOcc.renderOrder = 290; occScene.add(gOcc);

  // ---- out-of-focus grass sweeping past the lens
  const fgTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d'), RR = rng(seed + 21);
    g.filter = 'blur(9px)'; g.strokeStyle = '#000'; g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = 40 + RR() * 430, h = 120 + RR() * 120, lean = (RR() - 0.5) * 90;
      g.lineWidth = 6 + RR() * 9; g.beginPath(); g.moveTo(x, 256); g.quadraticCurveTo(x + lean * 0.3, 256 - h * 0.6, x + lean, 256 - h); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); return t;
  })();
  const fg = [];
  const RF = rng(seed + 33);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: fgTex, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, color: 0x0d0b0a }));
    m.frustumCulled = false; m.renderOrder = 400;
    const z = 11.6 + RF() * 1.6, s = 0.9 + RF() * 0.6;
    m.scale.set(s, s, 1);
    fg.push({ m, x: i * 3.1 + RF() * 1.2, z, s });
    scene.add(m);
  }

  // ---- sky, sun, god rays
  const skyU = {
    uCamR: { value: new THREE.Vector3() }, uCamU: { value: new THREE.Vector3() }, uCamF: { value: new THREE.Vector3() },
    uTanH: { value: 0.2 }, uAspect: { value: W / H }, uTime: U.time, uSunDir: U.sunDir,
    uHor: { value: new THREE.Color('#e38662') }, uHorSun: { value: new THREE.Color('#ffb766').multiplyScalar(1.5) }, uMid: { value: new THREE.Color('#f6cf98').multiplyScalar(0.92) },
    uZen: { value: new THREE.Color('#86a6cc') }, uSunCol: U.sunCol, uCloud: { value: 0.7 }, uHorEl: { value: deg(7.2) },
  };
  const quad = new THREE.PlaneGeometry(2, 2), oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const skyScene = new THREE.Scene();
  const skyMesh = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SCREEN_VERT, fragmentShader: SKY_FRAG.replace('float e = d.y;', 'uniform float uHorEl;\n  float e = d.y - uHorEl;').replace('void main(){\n  vec2 ndc', 'uniform float uHorEl;\nvoid main(){\n  vec2 ndc').replace('uniform float uHorEl;\n  float e', '  float e'), depthTest: false, depthWrite: false }));
  skyMesh.frustumCulled = false; skyScene.add(skyMesh);
  const skyQU = { uSky: U.sky, uSunPx: U.sunPx, uSunRpx: { value: 30 } };
  const skyQ = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: skyQU, vertexShader: SCREEN_VERT, fragmentShader: SKYQ_FRAG, depthTest: false, depthWrite: false }));
  skyQ.frustumCulled = false; skyQ.renderOrder = -100; scene.add(skyQ);
  const occSunU = { uSunUv: { value: new THREE.Vector2() }, uSunRuv: { value: 0.03 }, uAspect: { value: W / H }, uTime: U.time };
  const occSun = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: occSunU, vertexShader: SCREEN_VERT, fragmentShader: OCCSUN_FRAG, depthTest: false, depthWrite: false }));
  occSun.frustumCulled = false; occSun.renderOrder = -1000; occScene.add(occSun);
  const rayScene = new THREE.Scene();
  const rayM = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uOcc: { value: rtOcc.texture }, uSunUv: occSunU.uSunUv }, vertexShader: SCREEN_VERT, fragmentShader: RAY_FRAG, depthTest: false, depthWrite: false }));
  rayM.frustumCulled = false; rayScene.add(rayM);
  const rayQU = { uRays: { value: rtRay.texture }, uOcc: { value: rtOcc.texture }, uGain: { value: 1 }, uSunPx: U.sunPx };
  const rayQ = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: rayQU, vertexShader: SCREEN_VERT, fragmentShader: RAYQ_FRAG, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  rayQ.frustumCulled = false; rayQ.renderOrder = 150; scene.add(rayQ);
  skyQ.onBeforeRender = (renderer) => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rtSky); renderer.render(skyScene, oCam);
    renderer.setRenderTarget(rtOcc); renderer.render(occScene, camera);
    renderer.setRenderTarget(rtRay); renderer.render(rayScene, oCam);
    renderer.setRenderTarget(prev);
  };

  const sunEl = opts.sunSide === 'behind' ? 7.9 : 9.75, sunAz = opts.sunSide === 'behind' ? 1.0 : 3.45;
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
      const [pxr, pyr] = pelvisAt(lt + phase0 * T);
      const hipH = 0.93;
      for (const r of [rig, rigO]) {
        poseRunner(r, ph);
        r.root.position.set(pxr, pyr + noise(lt * 0.7) * 0.005, 0);
        r.root.updateMatrixWorld(true);
      }
      // ---- camera: tracking vehicle on the slope, losing a little ground; long lens, slight float
      const avgX = (lt + phase0 * T) / T * stride;
      camera.position.set(avgX - 0.55 - 0.55 * ease.inOut(k) + noise(lt * 0.6 + 4) * 0.03, camY + noise(lt * 0.9 + 1) * 0.025, camZ);
      camera.rotation.set(deg(pitch0 + noise(lt * 0.5 + 7) * 0.08), deg(noise(lt * 0.4 + 2) * 0.08), deg(noise(lt * 0.3 + 5) * 0.12), 'YXZ');
      camera.updateMatrixWorld(true);
      const me = camera.matrixWorld.elements;
      skyU.uCamR.value.set(me[0], me[1], me[2]); skyU.uCamU.value.set(me[4], me[5], me[6]); skyU.uCamF.value.set(-me[8], -me[9], -me[10]);
      const tanH = Math.tan(deg(camera.fov / 2));
      skyU.uTanH.value = tanH; skyU.uAspect.value = camera.aspect; U.pxAng.value = (2 * tanH) / H;
      // ---- sun
      U.sunDir.value.set(Math.sin(deg(sunAz)) * Math.cos(deg(sunEl)), Math.sin(deg(sunEl)), -Math.cos(deg(sunAz)) * Math.cos(deg(sunEl))).normalize();
      v3.copy(U.sunDir.value).multiplyScalar(100000).add(camera.position).project(camera);
      occSunU.uSunUv.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5);
      U.sunPx.value.set(occSunU.uSunUv.value.x * W, occSunU.uSunUv.value.y * H);
      v3.set(pxr, pyr + 0.35, 0).project(camera);
      shellMat.uniforms.uCenterPx.value.set((v3.x * 0.5 + 0.5) * W, (v3.y * 0.5 + 0.5) * H);
      const rpx = deg(0.62) / (2 * tanH) * H;
      skyQU.uSunRpx.value = rpx; occSunU.uSunRuv.value = rpx / H;
      rayQU.uGain.value = 3.2 * (opts.rays ?? 1);
      // ---- foreground grass streaks by (it is ~5 m from the lens)
      for (const f of fg) {
        const span = 12.4, rel = ((f.x - camera.position.x * 1.0) % span + span) % span - span / 2;
        f.m.position.set(camera.position.x + rel, -0.95 + 0.25 * f.s * (-0.1 + 0.25 * Math.sin(f.x * 1.7)), f.z);
      }
    },
  };
});
