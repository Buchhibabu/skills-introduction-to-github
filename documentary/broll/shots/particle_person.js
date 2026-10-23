// particle_person: a human head-and-shoulders bust in three-quarter view, made of ~50k warm points
// sampled from a sculpted signed-distance field (skull, brow, eyes, nose, lips, jaw, ears, neck, trapezius,
// shoulders, chest). It breathes softly. At dissolveAt the back of the head and shoulders begin to come
// apart: points glow at the edge, lift off and stream away as a river of light toward a cold-blue core in
// the dark distance. It ends with the figure partly gone (the face holds until last).
//
// opts:
//   dissolveAt   local s when points begin to detach (default 1.2, or 25% of the shot if shorter)
//   dissolveDur  s over which the detach front sweeps from the back of the head toward the face
//                (default: what is left of the shot minus 0.8 s, clamped to 1.5..4.5)
//   amount       0..1 how much of the figure is gone at the end of the sweep (default 0.55; 1 = all)
//   travel       s a point takes to reach the core (default 3.2)
//   push         0..1 how far the camera pushes in over the shot (default 0.5)
//
// Overlays: none expected (near silence). The right half above the shoulder line is where the river
// flows; the lower-left corner and the top-left band stay dark if a word must sit on it.
import { THREE, register, rng, noise, ease, smooth, prog, clamp, lerp, glowTexture } from '../kit.js';

// ---------------------------------------------------------------- the bust SDF (units ~ 22 cm, face +z, y up)
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / rx, qy = py / ry, qz = pz / rz;
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1e-6;
  return k0 * (k0 - 1) / k1;
}
function cap(x, y, z, ax, ay, az, bx, by, bz, r1, r2) {
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const t = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz));
  const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * t);
}
function sph(x, y, z, cx, cy, cz, r) { const dx = x - cx, dy = y - cy, dz = z - cz; return Math.sqrt(dx * dx + dy * dy + dz * dz) - r; }

function bust(x, y, z) {
  const ax = Math.abs(x);
  // --- head
  let h = ell(x, y, z, 0, 0.66, -0.04, 0.35, 0.385, 0.425);                      // cranium
  h = smin(h, ell(x, y, z, 0, 0.52, 0.10, 0.31, 0.38, 0.34), 0.10);               // face mass
  h = smin(h, ell(x, y, z, 0, 0.25, 0.10, 0.255, 0.27, 0.30), 0.12);              // lower face / jaw
  h = smin(h, ell(x, y, z, 0, 0.05, 0.255, 0.105, 0.085, 0.095), 0.08);           // chin
  h = smin(h, cap(ax, y, z, 0.25, 0.30, -0.05, 0.095, 0.06, 0.22, 0.05, 0.05), 0.08); // jaw line
  h = smin(h, ell(ax, y, z, 0.19, 0.415, 0.25, 0.10, 0.065, 0.085), 0.06);        // cheekbones
  h = smin(h, cap(ax, y, z, 0.0, 0.585, 0.365, 0.17, 0.59, 0.33, 0.05, 0.035), 0.05); // brow ridge
  h = smax(h, -ell(ax, y, z, 0.125, 0.505, 0.43, 0.075, 0.05, 0.06), 0.06);       // eye sockets (shallow)
  h = smin(h, sph(ax, y, z, 0.122, 0.50, 0.345, 0.062), 0.03);                    // eyes
  h = smin(h, ell(ax, y, z, 0.122, 0.528, 0.39, 0.06, 0.018, 0.035), 0.02);        // upper lids
  h = smin(h, cap(x, y, z, 0, 0.53, 0.395, 0, 0.345, 0.495, 0.03, 0.042), 0.035); // nose bridge -> tip
  h = smin(h, sph(ax, y, z, 0.048, 0.33, 0.43, 0.036), 0.03);                     // nostril wings
  h = smin(h, ell(x, y, z, 0, 0.215, 0.405, 0.095, 0.028, 0.045), 0.025);         // upper lip
  h = smin(h, ell(x, y, z, 0, 0.162, 0.392, 0.085, 0.03, 0.045), 0.025);          // lower lip
  h = smax(h, -ell(x, y, z, 0, 0.19, 0.445, 0.085, 0.006, 0.05), 0.01);           // mouth line
  h = smin(h, ell(ax, y, z, 0.36, 0.47, -0.03, 0.04, 0.13, 0.08), 0.03);          // ears
  // --- neck, shoulders, chest
  let b = cap(x, y, z, 0, 0.14, -0.11, 0, -0.55, -0.06, 0.19, 0.215);            // neck
  b = smin(b, ell(x, y, z, 0, 0.26, -0.24, 0.21, 0.24, 0.19), 0.1);              // nape, under the occiput
  b = smin(b, cap(ax, y, z, 0.08, -0.28, -0.12, 0.74, -0.6, -0.08, 0.13, 0.15), 0.2);  // trapezius
  b = smin(b, sph(ax, y, z, 0.88, -0.76, -0.02, 0.22), 0.18);                     // deltoids
  b = smin(b, ell(x, y, z, 0, -1.2, 0.0, 0.86, 0.72, 0.42), 0.25);                // chest
  b = smin(b, ell(ax, y, z, 0.36, -0.94, 0.17, 0.36, 0.26, 0.2), 0.12);           // pectorals
  b = smin(b, cap(ax, y, z, 0.94, -0.84, -0.02, 1.0, -2.1, 0.0, 0.21, 0.19), 0.12); // upper arms
  b = smin(b, cap(ax, y, z, 0.05, -0.53, 0.17, 0.6, -0.62, 0.07, 0.03, 0.03), 0.06); // clavicles
  return smin(h, b, 0.12);
}

function grad(x, y, z, out) {
  const e = 0.002;
  const a = bust(x + e, y - e, z - e), b = bust(x - e, y - e, z + e), c = bust(x - e, y + e, z - e), d = bust(x + e, y + e, z + e);
  let nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d;
  const l = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
}

/** Sample N points on the bust surface (with normals). Deterministic. */
function sampleBust(N, seed) {
  const R = rng(seed);
  const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3);
  const n = [0, 0, 0];
  let k = 0, guard = 0;
  while (k < N && guard++ < N * 60) {
    let x = lerp(-1.25, 1.25, R()), y = lerp(-1.95, 1.1, R()), z = lerp(-0.62, 0.62, R());
    let d = bust(x, y, z);
    if (Math.abs(d) > 0.07) continue;
    for (let it = 0; it < 4; it++) { grad(x, y, z, n); x -= d * n[0]; y -= d * n[1]; z -= d * n[2]; d = bust(x, y, z); }
    if (Math.abs(d) > 0.004) continue;
    // density: richer on the face and head, thinner on the torso, fading at the bottom of the bust
    const head = y > 0.0, face = head && z > 0.12 && Math.abs(x) < 0.33 && y < 0.72;
    let keep = face ? 1 : head ? 0.75 : 0.42;
    if (y < -1.2) keep *= clamp((y + 1.95) / 0.75) ** 1.5;
    if (R() > keep) continue;
    grad(x, y, z, n);
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    nor[k * 3] = n[0]; nor[k * 3 + 1] = n[1]; nor[k * 3 + 2] = n[2];
    k++;
  }
  return { pos: pos.subarray(0, k * 3), nor: nor.subarray(0, k * 3), count: k };
}

// ---------------------------------------------------------------- shaders
const BODY_VERT = /* glsl */`
uniform float uTime; uniform float uDisAt; uniform float uDisDur; uniform float uAmount; uniform float uTravel;
uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uPerp1; uniform vec3 uPerp2; uniform vec3 uLift; uniform vec3 uStart;
uniform vec3 uKey; uniform vec3 uRim; uniform float uPx; uniform float uSway; uniform float uGain;
attribute vec3 aN; attribute vec4 aR; attribute float aO;
varying vec3 vC; varying float vA;
vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float t){ float u = 1.0 - t; return u*u*u*a + 3.0*u*u*t*b + 3.0*u*t*t*c + t*t*t*d; }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
void main(){
  vec3 p = position, n = aN;
  // breathing: chest and shoulders rise and open slightly; the head rides on top
  float br = sin(uTime * 6.2831853 / 4.4 + 0.8);
  float torso = smoothstep(0.1, -0.6, p.y);
  p.y += br * 0.014 * torso + br * 0.006 * (1.0 - torso);
  p.xz *= 1.0 + br * 0.006 * torso;
  // a slow, small head turn / nod (sway uniform carries noise from JS)
  float headW = smoothstep(-0.2, 0.15, p.y);
  vec3 pivot = vec3(0.0, 0.05, -0.08);
  mat3 hr = rotY(uSway * 0.05) * rotX(uSway * 0.02 - 0.015);
  p = mix(p, pivot + hr * (p - pivot), headW);
  n = normalize(mix(n, hr * n, headW));

  float tD = uDisAt + aO * uDisDur;
  float age = uTime - tD;
  float gone = step(aO, uAmount);                         // only part of the figure leaves
  vec4 mv0 = modelViewMatrix * vec4(p, 1.0);
  vec3 vdir = normalize(-mv0.xyz);
  vec3 nv = normalize(normalMatrix * n);
  // lighting: warm key from the front, cold rim from the core behind
  vec3 nw = n;
  float key = max(dot(nw, normalize(uKey)), 0.0);
  float rim = pow(1.0 - abs(dot(nv, vdir)), 2.0) * (0.35 + 0.65 * max(dot(nw, normalize(uRim)), 0.0));
  float facing = dot(nv, vdir);
  float vis = mix(0.07, 1.0, smoothstep(-0.25, 0.3, facing));
  vec3 warm = vec3(1.0, 0.86, 0.68);
  vec3 cold = vec3(0.45, 0.65, 1.0);
  vec3 col = (warm * (0.08 + 1.45 * pow(key, 1.3)) * vis + cold * rim * 0.6) * uGain;
#ifdef DBG_NORMAL
  col = (n * 0.5 + 0.5) * 0.4;
#endif
#ifdef DBG_KEY
  col = vec3(key, vis, 0.0) * 0.4;
#endif
  float a = 1.0;
  float size = 1.0 + 0.6 * aR.w;
  // the burning edge: points brighten just before they leave
  float edge = gone * exp(-abs(age + 0.08) * 12.0) * step(age, 0.2);
  col += vec3(1.0, 0.78, 0.55) * edge * 0.9 * uGain;
  if (gone > 0.5 && age > 0.0) {
    float T = uTravel * (0.8 + 0.4 * aR.w);
    float s = clamp(age / T, 0.0, 1.0);
    s = s * s * (2.0 - s);                                 // eases off the body, then is drawn in
    vec3 p1 = mix(p + n * 0.06 + uLift * (0.8 + 0.5 * aR.x), uStart + (aR.yzx - 0.5) * vec3(0.5, 0.6, 0.5), 0.6);
    vec3 p2 = uMid + (aR.xyz - 0.5) * vec3(0.5, 0.35, 0.7);
    vec3 p3 = uCore + (aR.zxy - 0.5) * 0.2;
    vec3 q = bez(p, p1, p2, p3, s);
    float ang = aR.y * 6.2831853 + age * (1.5 + 2.0 * aR.z);
    q += (cos(ang) * uPerp1 + sin(ang) * uPerp2) * (0.04 + 0.14 * aR.x) * sin(3.14159 * s);
    p = q;
    float cs = smoothstep(0.1, 1.4, age);
    col = mix(vec3(1.0, 0.86, 0.7) * 0.8, cold * 1.1, cs) * uGain * 2.4;
    a = (1.0 - smoothstep(0.8, 1.0, s)) * (0.45 + 0.4 * aR.z) * smoothstep(0.0, 0.15, age + 0.05);
    size *= mix(1.35, 0.9, s);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * size / -mv.z;
  vC = col; vA = a;
}`;
const BODY_FRAG = /* glsl */`
varying vec3 vC; varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = dot(q, q) * 4.0;
  if (r > 1.0) discard;
  float f = exp(-r * 2.6);
  gl_FragColor = vec4(vC * f * vA, 1.0);
}`;

const SKY_VERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SKY_FRAG = /* glsl */`
uniform vec3 uCoreDir; uniform vec3 uBase; uniform vec3 uGlow; uniform float uGlowK;
varying vec3 vW;
void main(){
  vec3 d = normalize(vW - cameraPosition);
  float g = max(dot(d, uCoreDir), 0.0);
  vec3 c = uBase * (0.75 + 0.25 * smoothstep(-0.4, 0.4, d.y));
  c += uGlow * uGlowK * (pow(g, 14.0) * 0.5 + pow(g, 90.0) * 0.6);
  gl_FragColor = vec4(c, 1.0);
}`;

const DUST_VERT = /* glsl */`
uniform float uTime; uniform float uPx;
attribute vec4 aR;
varying float vA;
void main(){
  vec3 p = position + vec3(sin(uTime * 0.11 + aR.x * 6.28) * 0.3, uTime * 0.03 * (aR.y - 0.3), cos(uTime * 0.09 + aR.z * 6.28) * 0.3);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (0.6 + aR.w) / -mv.z;
  vA = (0.25 + 0.75 * aR.y) * (0.6 + 0.4 * sin(uTime * (0.5 + aR.x) + aR.z * 20.0));
}`;
const DUST_FRAG = /* glsl */`
uniform vec3 uColor; varying float vA;
void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(uColor * exp(-r * 3.0) * vA, 1.0); }`;

// ---------------------------------------------------------------- the shot
register('particle_person', (opts) => {
  const dur = Math.max(0.5, (opts.t1 ?? 6) - (opts.t0 ?? 0));
  const disAt = opts.dissolveAt ?? Math.min(1.2, dur * 0.25);
  const disDur = opts.dissolveDur ?? clamp(dur - disAt - 0.8, 1.5, 4.5);
  const amount = clamp(opts.amount ?? 0.55);
  const travel = opts.travel ?? 3.2;
  const push = opts.push ?? 0.5;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.05, 300);
  const HEAD = new THREE.Vector3(0, 0.5, 0);

  // three-quarter view: camera front-left of the figure, face toward screen left
  const AZ = THREE.MathUtils.degToRad(opts._az ?? 40);
  const camDir = new THREE.Vector3(Math.sin(AZ), 0.06, Math.cos(AZ)).normalize();
  const right = new THREE.Vector3(camDir.z, 0, -camDir.x).normalize();
  const fwd = camDir.clone().negate().setY(0).normalize();
  const CORE = HEAD.clone().addScaledVector(right, 13).addScaledVector(fwd, 24).add(new THREE.Vector3(0, -0.3, 0));
  const MID = HEAD.clone().addScaledVector(right, 3.0).addScaledVector(fwd, 6).add(new THREE.Vector3(0, 0.1, 0));
  const START = HEAD.clone().addScaledVector(right, 0.9).addScaledVector(fwd, 1.0).add(new THREE.Vector3(0, 0.1, 0));
  const riverDir = CORE.clone().sub(MID).normalize();
  const perp1 = new THREE.Vector3().crossVectors(riverDir, new THREE.Vector3(0, 1, 0)).normalize();
  const perp2 = new THREE.Vector3().crossVectors(perp1, riverDir).normalize();

  // ---- sky
  const skyU = { uCoreDir: { value: new THREE.Vector3() }, uBase: { value: new THREE.Color('#06080c') }, uGlow: { value: new THREE.Color('#3f6fb0') }, uGlowK: { value: 0.5 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false }));
  scene.add(sky);

  // ---- body points
  const S = sampleBust(opts._n ?? 52000, 1234);
  const N = S.count, R = rng(99);
  const aR = new Float32Array(N * 4), aO = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < 4; j++) aR[i * 4 + j] = R();
    const x = S.pos[i * 3], y = S.pos[i * 3 + 1], z = S.pos[i * 3 + 2];
    // detach order: back of the head and shoulders first, the face last; ragged organic front
    const back = clamp((z + 0.5) / 1.0);                       // 0 back .. 1 front
    const high = clamp((y + 1.6) / 2.6);                       // 0 bottom .. 1 crown
    const rag = noise(x * 5.1 + y * 3.7 + 11.0) * 0.5 + noise(y * 9.3 - z * 7.1 + 3.0) * 0.3 + noise(z * 13.0 + x * 11.0) * 0.2;
    let o = back * 0.78 + (1 - high) * 0.22 + rag * 0.14 + (aR[i * 4] - 0.5) * 0.05;
    aO[i] = clamp(o, 0, 1);
  }
  // normalise the order to 0..1 so dissolveDur/amount are predictable
  const sorted = Array.from(aO).sort((a, b) => a - b);
  for (let i = 0; i < N; i++) { let lo = 0, hi = N - 1; const v = aO[i]; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; } aO[i] = lo / N; }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S.pos), 3));
  g.setAttribute('aN', new THREE.BufferAttribute(new Float32Array(S.nor), 3));
  g.setAttribute('aR', new THREE.BufferAttribute(aR, 4));
  g.setAttribute('aO', new THREE.BufferAttribute(aO, 1));
  const U = {
    uTime: { value: 0 }, uDisAt: { value: disAt }, uDisDur: { value: disDur }, uAmount: { value: amount }, uTravel: { value: travel },
    uCore: { value: CORE }, uMid: { value: MID }, uStart: { value: START }, uPerp1: { value: perp1 }, uPerp2: { value: perp2 },
    uLift: { value: fwd.clone().multiplyScalar(1.0).addScaledVector(right, 0.7).add(new THREE.Vector3(0, 0.3, 0)) },
    uKey: { value: new THREE.Vector3(-0.55, 0.55, 1.0) },
    uRim: { value: CORE.clone().sub(HEAD).normalize() }, uPx: { value: opts._px ?? 9 }, uSway: { value: 0 }, uGain: { value: opts._gain ?? 0.5 },
  };
  const body = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, uniforms: U, defines: opts._dbg ? { ['DBG_' + opts._dbg.toUpperCase()]: 1 } : {}, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  body.frustumCulled = false;
  scene.add(body);

  // ---- the core: a cold star far away (exponential falloff, faint slow rays)
  const starTex = (() => {
    const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
    const img = x.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const dx = (i + 0.5) / n * 2 - 1, dy = (j + 0.5) / n * 2 - 1, r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const rays = Math.pow(Math.abs(Math.cos(a * 2)), 60) * 0.5 + Math.pow(Math.abs(Math.cos(a * 3 + 0.4)), 120) * 0.25;
      let v = Math.exp(-r * 14) + 0.35 * Math.exp(-r * 4.5) + rays * Math.exp(-r * 3.2) * (1 - r);
      v *= clamp(1 - r);
      const k = (j * n + i) * 4;
      img.data[k] = 255 * Math.min(1, v * 0.85); img.data[k + 1] = 255 * Math.min(1, v * 0.93); img.data[k + 2] = 255 * Math.min(1, v); img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: new THREE.Color(1.4, 1.6, 2.0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  coreGlow.position.copy(CORE); coreGlow.scale.setScalar(6); scene.add(coreGlow);

  // ---- the river's spine: a faint tube of flowing light that appears as the figure gives way
  const spine = new THREE.CubicBezierCurve3(HEAD.clone().addScaledVector(fwd, 0.35).add(new THREE.Vector3(0, 0.1, 0)), START, MID, CORE);
  const ribbonU = { uTime: { value: 0 }, uFlow: { value: 0 }, uColor: { value: new THREE.Color('#6f9de0') } };
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(spine, 160, 0.32, 12, false), new THREE.ShaderMaterial({
    uniforms: ribbonU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vUv = uv; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform float uFlow; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.5);
        float u = vUv.x;
        float streak = 0.55 + 0.45 * sin(u * 70.0 - uTime * 9.0 + sin(u * 13.0 + vUv.y * 6.283) * 2.0);
        float ends = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.9, u);
        float reach = smoothstep(uFlow, uFlow - 0.15, u);
        gl_FragColor = vec4(uColor * f * streak * ends * reach * 0.4 * (0.6 + 0.4 * u), 1.0);
      }`,
  }));
  ribbon.frustumCulled = false; scene.add(ribbon);

  // ---- dust
  const ND = 1400, dp = new Float32Array(ND * 3), dr = new Float32Array(ND * 4), RD = rng(7);
  for (let i = 0; i < ND; i++) {
    dp[i * 3] = lerp(-8, 10, RD()); dp[i * 3 + 1] = lerp(-4, 7, RD()); dp[i * 3 + 2] = lerp(-26, 3, RD());
    for (let j = 0; j < 4; j++) dr[i * 4 + j] = RD();
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('aR', new THREE.BufferAttribute(dr, 4));
  const dustU = { uTime: { value: 0 }, uPx: { value: 12 }, uColor: { value: new THREE.Color('#6d86ad') } };
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);

  const look = new THREE.Vector3(), cpos = new THREE.Vector3();
  return {
    scene, camera,
    bloom: { strength: 0.75, radius: 0.6, threshold: 0.35 },
    exposure: 1.0,
    update(lt, c) {
      U.uTime.value = lt; dustU.uTime.value = lt;
      U.uSway.value = noise(lt * 0.35 + 4.0);
      // debug views for sculpting
      if (opts._view) {
        const v = { front: [0, 0.5, 4.5], side: [4.5, 0.5, 0], back: [0, 0.6, -4.5], '3q': [2.9, 0.8, 3.4] }[opts._view];
        camera.position.set(...v); camera.lookAt(0, 0.1, 0); camera.fov = 34; camera.updateProjectionMatrix();
      } else {
        const k = ease.inOut(c.k);
        const dist = lerp(4.6, 4.6 - 1.2 * push, k);
        cpos.copy(HEAD).addScaledVector(camDir, dist).add(new THREE.Vector3(0, lerp(0.1, 0.18, k), 0));
        cpos.addScaledVector(right, lerp(-0.12, 0.12, k));
        cpos.x += noise(lt * 0.3 + 1) * 0.015; cpos.y += noise(lt * 0.37 + 5) * 0.012;
        look.copy(HEAD).addScaledVector(right, lerp(0.62, 0.55, k)).add(new THREE.Vector3(0, lerp(-0.12, -0.05, k), 0));
        camera.position.copy(cpos); camera.lookAt(look);
        camera.fov = 28; camera.updateProjectionMatrix();
      }
      skyU.uCoreDir.value.copy(CORE).sub(camera.position).normalize();
      const flick = 0.92 + 0.08 * noise(lt * 3.0);
      const pull = smooth(prog(lt, disAt, disAt + disDur * 0.6));
      coreGlow.material.opacity = (0.7 + 0.3 * pull) * flick;
      coreGlow.scale.setScalar(5.5 + 2.5 * pull);
      coreGlow.material.rotation = lt * 0.03;
      skyU.uGlowK.value = 0.22 + 0.2 * pull;
      ribbonU.uTime.value = lt; ribbonU.uFlow.value = 1.2 * ease.out(prog(lt, disAt + 0.3, disAt + 0.3 + travel));
    },
  };
});
