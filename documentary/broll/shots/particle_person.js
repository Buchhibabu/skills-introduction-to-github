// particle_person: a human head-and-shoulders bust in three-quarter view, made of ~55k warm points
// sampled from a sculpted signed-distance field (skull, brow, eyes, nose, lips, jaw, ears, neck, trapezius,
// shoulders, chest), denser on the features. It breathes softly, lit like a sculpture: a warm key on the
// face, a cold rim from the core. At dissolveAt a ragged, curling front starts at the back of the head and
// shoulders: points glow, lift off and are drawn into a tight river of velocity-stretched light that
// flows into a dense cold core in the dark, which swallows it in a slow spiral. The front sweeps for the
// whole of dissolveDur and a thin stream keeps draining the figure until the cut (the face holds longest).
//
// opts:
//   dissolveAt   local s when points begin to detach (default 1.2, or 25% of the shot if shorter)
//   dissolveDur  s over which the detach front sweeps from the back of the head toward the face
//                (default: what is left of the shot minus 0.8 s, clamped to 1.5..4.5)
//   amount       0..1 how much of the figure is gone at the end of the sweep (default 0.45; 1 = all);
//                after the sweep a slow trickle keeps leaving, so the stream never detaches
//   travel       s a point takes to reach the core (default 2.6)
//   push         0..1 how far the camera pushes in over the shot (default 0.5)
//
// Overlays: a word top-centre (y ~110-200) and a footnote bottom-centre (y ~930-970) stay clear: the head
// sits left of centre, the river flows right just above the frame's middle into the core at about
// x 1450, y 420, and the bottom of the bust fades into the dark.
import { THREE, register, rng, noise, ease, smooth, prog, clamp, lerp } from '../kit.js';

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
/** Laplacian of the distance field = 2 x mean curvature: high on the nose, lips, eyes, ears, chin, clavicles. */
function curvature(x, y, z) {
  const e = 0.012, c = bust(x, y, z);
  return (bust(x + e, y, z) + bust(x - e, y, z) + bust(x, y + e, z) + bust(x, y - e, z) + bust(x, y, z + e) + bust(x, y, z - e) - 6 * c) / (e * e);
}
// where the key light lingers: eyes, lips, nose tip
const FEATURES = [[0, 0.19, 0.41, 0.085], [0, 0.35, 0.47, 0.06], [0.16, 0.42, 0.3, 0.08], [-0.16, 0.42, 0.3, 0.08]];   // lips, nose tip, cheekbones

/** Sample N points on the bust surface (with normals and a feature weight). Deterministic. */
function sampleBust(N, seed) {
  const R = rng(seed);
  const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), feat = new Float32Array(N);
  const n = [0, 0, 0];
  let k = 0, guard = 0;
  while (k < N && guard++ < N * 80) {
    let x = lerp(-1.25, 1.25, R()), y = lerp(-1.95, 1.1, R()), z = lerp(-0.62, 0.62, R());
    let d = bust(x, y, z);
    if (Math.abs(d) > 0.07) continue;
    for (let it = 0; it < 4; it++) { grad(x, y, z, n); x -= d * n[0]; y -= d * n[1]; z -= d * n[2]; d = bust(x, y, z); }
    if (Math.abs(d) > 0.004) continue;
    // density: richer on the face and head, thinner on the torso, fading at the bottom of the bust,
    // and denser where the form turns (features read as drawing, flat areas as soft tone)
    const head = y > 0.0, face = head && z > 0.12 && Math.abs(x) < 0.33 && y < 0.72;
    let keep = face ? 1 : head ? 0.72 : 0.4;
    keep *= clamp(0.7 + Math.abs(curvature(x, y, z)) / 60, 0.7, 1.2) / 1.2;
    if (y < -1.2) keep *= clamp((y + 1.95) / 0.75) ** 1.5;
    if (R() > keep) continue;
    grad(x, y, z, n);
    let f = 0;
    for (const [fx, fy, fz, fr] of FEATURES) { const dd = ((x - fx) ** 2 + (y - fy) ** 2 + (z - fz) ** 2) / (fr * fr); f = Math.max(f, Math.exp(-dd)); }
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    nor[k * 3] = n[0]; nor[k * 3 + 1] = n[1]; nor[k * 3 + 2] = n[2];
    feat[k] = f;
    k++;
  }
  return { pos: pos.subarray(0, k * 3), nor: nor.subarray(0, k * 3), feat: feat.subarray(0, k), count: k };
}

// ---------------------------------------------------------------- shaders
// shared by the body points and the stream streaks: pose (breathing, head sway) and the flight path
const COMMON = /* glsl */`
uniform float uTime; uniform float uTravel; uniform float uSway;
uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uPerp1; uniform vec3 uPerp2; uniform vec3 uLift; uniform vec3 uStart;
vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float t){ float u = 1.0 - t; return u*u*u*a + 3.0*u*u*t*b + 3.0*u*t*t*c + t*t*t*d; }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
void pose(inout vec3 p, inout vec3 n){
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
}
// where a detached point is, 'age' s after it left; s = 0..1 along the river
vec3 flight(vec3 p, vec3 n, vec4 r, float age, out float s){
  float T = uTravel * (0.85 + 0.3 * r.w);
  s = clamp(age / T, 0.0, 1.0);
  float e = s * (1.35 - 0.35 * s);                          // leaves briskly, settles into the current
  // tight control points: the points gather into one channel soon after they leave
  vec3 p1 = mix(p + n * 0.1 + uLift * (0.55 + 0.35 * r.x), uStart + (r.yzx - 0.5) * vec3(0.14, 0.18, 0.14), 0.84);
  vec3 p2 = uMid + (r.xyz - 0.5) * vec3(0.26, 0.2, 0.3);
  vec3 p3 = uCore + (r.zxy - 0.5) * 0.05;
  vec3 q = bez(p, p1, p2, p3, e);
  // a gentle braid along the way, then a tightening spiral into the core
  float ang = r.y * 6.2831853 + age * (1.6 + 1.8 * r.z);
  q += (cos(ang) * uPerp1 + sin(ang) * uPerp2) * (0.02 + 0.06 * r.x) * sin(3.14159 * e) * (1.0 - smoothstep(0.7, 1.0, e));
  float sw = smoothstep(0.8, 1.0, e);
  float a2 = r.z * 6.2831853 + age * 5.0;
  q += (cos(a2) * uPerp1 + sin(a2) * vec3(0.0, 1.0, 0.0)) * sw * (1.0 - e) * 3.2 * (0.4 + 0.6 * r.y);
  return q;
}`;

const BODY_VERT = /* glsl */`
${'${COMMON}'}
uniform vec3 uKey; uniform vec3 uRim; uniform float uPx; uniform float uGain;
attribute vec3 aN; attribute vec4 aR; attribute float aT; attribute float aF;
varying vec3 vC; varying float vA;
void main(){
  vec3 p = position, n = aN;
  pose(p, n);
  float age = uTime - aT;
  // just before a point leaves it brightens and curls up off the surface (a burning, lifting edge)
  float pre = smoothstep(-0.45, 0.0, age) * step(age, 0.0);
  p += (n * 0.035 + uLift * 0.03 + (aR.xyz - 0.5) * 0.03) * pre * pre;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 vdir = normalize(-mv.xyz);
  vec3 nv = normalize(normalMatrix * n);
  // lighting: warm key on the face side, cold rim from the core behind
  float key = max(dot(n, normalize(uKey)), 0.0);
  float facing = dot(nv, vdir);
  float rim = pow(1.0 - abs(facing), 2.2) * (0.3 + 0.7 * max(dot(n, normalize(uRim)), 0.0));
  float vis = mix(0.06, 1.0, smoothstep(-0.25, 0.3, facing));
  vec3 warm = vec3(1.0, 0.85, 0.66);
  vec3 cold = vec3(0.45, 0.66, 1.0);
  float lift = 1.0 + 0.22 * aF;                           // eyes, lips and nose tip catch more of the key
  vec3 col = (warm * (0.05 + 1.5 * pow(key, 1.45) * lift) * vis * (0.85 + 0.3 * aR.z) + cold * rim * 0.75) * uGain;
  col += vec3(1.0, 0.8, 0.58) * pre * pre * 1.1 * uGain;
  col *= mix(0.3, 1.0, smoothstep(-1.3, -0.45, position.y));   // the base of the bust falls into the dark (calm footnote band)
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (1.0 + 0.3 * aR.w) / -mv.z * (1.0 + 0.4 * pre);
  vC = col; vA = step(age, 0.0);                           // once it leaves, the stream draws it
}`;
const BODY_FRAG = /* glsl */`
varying vec3 vC; varying float vA;
void main(){
  if (vA < 0.5) discard;
  vec2 q = gl_PointCoord - 0.5;
  float r = dot(q, q) * 4.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(vC * exp(-r * 2.4), 1.0);
}`;

// each detached point is a quad stretched between where it is and where it was a moment ago
const STREAK_VERT = /* glsl */`
${'${COMMON}'}
uniform float uPx; uniform float uGain; uniform vec2 uRes; uniform float uTrail;
attribute vec3 aP; attribute vec3 aN; attribute vec4 aR; attribute float aT; attribute vec2 aCorner;
varying vec3 vC; varying float vA; varying vec2 vUv; varying float vLenPx;
void main(){
  float age = uTime - aT;
  if (age <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
  vec3 p = aP, n = aN;
  pose(p, n);
  float s, s0;
  vec3 q1 = flight(p, n, aR, age, s);
  vec3 q0 = flight(p, n, aR, max(age - uTrail * (0.7 + 0.6 * aR.x), 0.0), s0);
  vec4 c1 = projectionMatrix * modelViewMatrix * vec4(q1, 1.0);
  vec4 c0 = projectionMatrix * modelViewMatrix * vec4(q0, 1.0);
  vec2 a = c0.xy / c0.w * uRes * 0.5, b = c1.xy / c1.w * uRes * 0.5;     // pixels
  vec2 d = b - a; float L = length(d);
  vec2 dir = L > 1e-3 ? d / L : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  // size: most are fine sparks, a few are bright packets
  float big = step(0.94, aR.w);
  float w = max(1.1, uPx * (0.7 + 0.5 * aR.z + 1.4 * big) / c1.w) * mix(1.0, 0.65, s);
  vec2 pix = mix(a - dir * w, b + dir * w, aCorner.x) + nrm * w * aCorner.y;
  gl_Position = vec4(pix / (uRes * 0.5) * c1.w, c1.z, c1.w);
  vUv = vec2(aCorner.x, aCorner.y); vLenPx = L + 2.0 * w;
  // warm as it leaves, cold as it nears the core; dims as it is swallowed
  float cs = smoothstep(0.05, 0.45, s);
  vec3 warm = vec3(1.0, 0.82, 0.62), cold = vec3(0.5, 0.72, 1.0);
  vC = mix(warm, cold, cs) * uGain * (1.3 + 1.7 * big) * (0.6 + 0.6 * aR.y);
  vA = (1.0 - smoothstep(0.86, 1.0, s)) * smoothstep(0.0, 0.12, age) * (0.55 + 0.45 * smoothstep(0.0, 0.25, s));
}`;
const STREAK_FRAG = /* glsl */`
varying vec3 vC; varying float vA; varying vec2 vUv; varying float vLenPx;
void main(){
  if (vA <= 0.002) discard;
  float across = 1.0 - vUv.y * vUv.y;
  float along = pow(vUv.x, 1.6);                           // bright head, fading tail
  gl_FragColor = vec4(vC * vA * across * across * (0.25 + 0.75 * along), 1.0);
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
  vec3 c = uBase * (0.7 + 0.3 * smoothstep(-0.4, 0.4, d.y));
  c += uGlow * uGlowK * (pow(g, 160.0) * 0.5 + pow(g, 1500.0) * 0.6 + pow(g, 30.0) * 0.06);
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

// the core's own matter: a slow, flattened whirl spiralling inward (it pulls; it never pushes out)
const WHIRL_VERT = /* glsl */`
uniform float uTime; uniform float uPx; uniform vec3 uCore; uniform vec3 uAx; uniform vec3 uAy; uniform float uPull;
attribute vec4 aR;
varying float vA; varying float vR;
void main(){
  float u = fract(aR.x + uTime * (0.05 + 0.05 * aR.y) * (1.0 + uPull));
  float r = mix(3.6, 0.15, u * u * (3.0 - 2.0 * u)) * (0.7 + 0.3 * aR.z);
  float ang = aR.w * 6.2831853 + uTime * (0.25 + 0.9 / (r + 0.25)) * (0.8 + 0.4 * aR.y);
  vec3 p = uCore + (cos(ang) * uAx + sin(ang) * uAy) * r + cross(uAx, uAy) * (aR.z - 0.5) * 0.12 * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.5, uPx * (0.6 + 0.6 * aR.z) / -mv.z);
  vR = r;
  vA = smoothstep(0.0, 0.15, u) * (1.0 - smoothstep(0.85, 1.0, u)) * (0.3 + 0.7 * uPull);
}`;
const WHIRL_FRAG = /* glsl */`
uniform vec3 uColor; varying float vA; varying float vR;
void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q) * 4.0; if (r > 1.0) discard;
  gl_FragColor = vec4(uColor * exp(-r * 3.0) * vA * (0.4 + 1.2 * exp(-vR * 1.2)), 1.0); }`;

/** Soft radial glow texture with an exponential profile (no rays, no ring). */
function coreTexture(n, k) {
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
  const img = x.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const r = Math.hypot((i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1);
    const v = Math.exp(-r * k) * clamp(1 - r) ** 2;
    const o = (j * n + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(255 * clamp(v)); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- the shot
register('particle_person', (opts) => {
  const dur = Math.max(0.5, (opts.t1 ?? 6) - (opts.t0 ?? 0));
  const disAt = opts.dissolveAt ?? Math.min(1.2, dur * 0.25);
  const disDur = Math.max(0.3, opts.dissolveDur ?? clamp(dur - disAt - 0.8, 1.5, 4.5));
  const amount = clamp(opts.amount ?? 0.45, 0.02, 1);
  const travel = opts.travel ?? 2.6;
  const push = opts.push ?? 0.5;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.05, 300);
  const HEAD = new THREE.Vector3(0, 0.5, 0);

  // three-quarter view: camera front-left of the figure, face toward screen left
  const AZ = THREE.MathUtils.degToRad(opts._az ?? 40);
  const camDir = new THREE.Vector3(Math.sin(AZ), 0.06, Math.cos(AZ)).normalize();
  const right = new THREE.Vector3(camDir.z, 0, -camDir.x).normalize();
  const fwd = camDir.clone().negate().setY(0).normalize();
  const CORE = HEAD.clone().addScaledVector(right, 11.5).addScaledVector(fwd, 20).add(new THREE.Vector3(0, -1.55, 0));
  const MID = HEAD.clone().addScaledVector(right, 2.6).addScaledVector(fwd, 4.5).add(new THREE.Vector3(0, -0.05, 0));
  const START = HEAD.clone().addScaledVector(right, 0.85).addScaledVector(fwd, 0.85).add(new THREE.Vector3(0, 0.05, 0));
  const riverDir = CORE.clone().sub(MID).normalize();
  const perp1 = new THREE.Vector3().crossVectors(riverDir, new THREE.Vector3(0, 1, 0)).normalize();
  const perp2 = new THREE.Vector3().crossVectors(perp1, riverDir).normalize();

  // ---- sky: near black, a tight cold glow only right around the core
  const skyU = { uCoreDir: { value: new THREE.Vector3() }, uBase: { value: new THREE.Color('#05070b') }, uGlow: { value: new THREE.Color('#4a7cc0') }, uGlowK: { value: 0.5 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false }));
  scene.add(sky);

  // ---- body points
  const S = sampleBust(opts._n ?? 54000, 1234);
  const N = S.count, R = rng(99);
  const aR = new Float32Array(N * 4), aO = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < 4; j++) aR[i * 4 + j] = R();
    const x = S.pos[i * 3], y = S.pos[i * 3 + 1], z = S.pos[i * 3 + 2];
    // detach order: back of the head and shoulders first, the face last; a ragged, tongued front
    const back = clamp((z + 0.5) / 1.0);                       // 0 back .. 1 front
    const high = clamp((y + 1.6) / 2.6);                       // 0 bottom .. 1 crown
    const rag = noise(x * 4.1 + y * 2.7 + 11.0) * 0.45 + noise(y * 7.3 - z * 6.1 + 3.0) * 0.35 + noise(z * 11.0 + x * 9.0 - y * 3.0) * 0.2;
    const tongue = noise(y * 3.1 + x * 1.7 + 41.0);           // long tongues reaching toward the face
    const throat = y < 0.15 && y > -0.75 ? smooth(clamp((z + 0.12) / 0.2)) * 0.28 : 0;   // the front of the neck holds with the face
    aO[i] = back * 0.6 + (1 - high) * 0.06 + Math.max(0, -0.2 - y) * 0.9 + throat + rag * 0.34 + tongue * 0.12 + (aR[i * 4] - 0.5) * 0.06;
  }
  // normalise the order to 0..1 so dissolveDur/amount are predictable
  const sorted = Array.from(aO).sort((a, b) => a - b);
  for (let i = 0; i < N; i++) { let lo = 0, hi = N - 1; const v = aO[i]; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; } aO[i] = lo / N; }
  // leave times: the front sweeps 0..amount over the whole of dissolveDur; past the sweep a slow trickle
  // (the next 12% of the figure over the following ~6 s) keeps the river attached to the figure
  const TRICKLE = 0.12, TRICKLE_S = 6;
  const aT = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const o = aO[i];
    aT[i] = o <= amount ? disAt + disDur * Math.pow(o / amount, 0.92) : o <= amount + TRICKLE ? disAt + disDur + ((o - amount) / TRICKLE) * TRICKLE_S : 1e6;
    const yy = S.pos[i * 3 + 1], xx = S.pos[i * 3], zz = S.pos[i * 3 + 2];
    if (yy < -0.42 + 0.16 * noise(xx * 3.3 + zz * 2.1 + 7.0)) aT[i] = 1e6;   // shoulders and chest stay, behind a ragged edge
  }

  const common = {
    uTime: { value: 0 }, uTravel: { value: travel }, uSway: { value: 0 },
    uCore: { value: CORE }, uMid: { value: MID }, uStart: { value: START }, uPerp1: { value: perp1 }, uPerp2: { value: perp2 },
    uLift: { value: fwd.clone().multiplyScalar(0.9).addScaledVector(right, 0.8).add(new THREE.Vector3(0, 0.25, 0)) },
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S.pos), 3));
  g.setAttribute('aN', new THREE.BufferAttribute(new Float32Array(S.nor), 3));
  g.setAttribute('aR', new THREE.BufferAttribute(aR, 4));
  g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  g.setAttribute('aF', new THREE.BufferAttribute(new Float32Array(S.feat), 1));
  const bodyU = { ...common,
    uKey: { value: new THREE.Vector3(0.4, 0.55, 0.95) },
    uRim: { value: CORE.clone().sub(HEAD).normalize() }, uPx: { value: opts._px ?? 9.2 }, uGain: { value: opts._gain ?? 0.36 } };
  const body = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: BODY_VERT.replace('${COMMON}', COMMON), fragmentShader: BODY_FRAG, uniforms: bodyU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  body.frustumCulled = false;
  scene.add(body);
  const skinIdx = new Uint32Array(Math.floor(N / 5)); for (let i = 0; i < skinIdx.length; i++) skinIdx[i] = i * 5;
  const skinG = g.clone(); skinG.setIndex(new THREE.BufferAttribute(skinIdx, 1));
  const skinU = { ...bodyU, uPx: { value: (opts._px ?? 9.2) * 4.6 }, uGain: { value: (opts._gain ?? 0.36) * 0.26 } };
  const skin = new THREE.Points(skinG, new THREE.ShaderMaterial({ vertexShader: BODY_VERT.replace('${COMMON}', COMMON), fragmentShader: BODY_FRAG.replace('exp(-r * 2.4)', 'exp(-r * 3.5)'), uniforms: skinU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  skin.frustumCulled = false;
  scene.add(skin);

  // ---- the river: one velocity-stretched streak per point that ever leaves
  const leave = []; for (let i = 0; i < N; i++) if (aT[i] < 1e5 && aR[i * 4 + 1] < 0.62) leave.push(i);
  const M = leave.length;
  const sg = new THREE.InstancedBufferGeometry();
  sg.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([0, -1, 1, -1, 1, 1, 0, 1]), 2));
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  sg.setIndex([0, 1, 2, 0, 2, 3]);
  const iP = new Float32Array(M * 3), iN = new Float32Array(M * 3), iR = new Float32Array(M * 4), iT = new Float32Array(M);
  leave.forEach((i, k) => {
    iP.set(S.pos.subarray(i * 3, i * 3 + 3), k * 3); iN.set(S.nor.subarray(i * 3, i * 3 + 3), k * 3);
    iR.set(aR.subarray(i * 4, i * 4 + 4), k * 4); iT[k] = aT[i];
  });
  sg.setAttribute('aP', new THREE.InstancedBufferAttribute(iP, 3)); sg.setAttribute('aN', new THREE.InstancedBufferAttribute(iN, 3));
  sg.setAttribute('aR', new THREE.InstancedBufferAttribute(iR, 4)); sg.setAttribute('aT', new THREE.InstancedBufferAttribute(iT, 1));
  sg.instanceCount = M;
  const streakU = { ...common, uPx: { value: 6.0 }, uGain: { value: 0.11 }, uRes: { value: new THREE.Vector2(1920, 1080) }, uTrail: { value: 0.045 } };
  const streaks = new THREE.Mesh(sg, new THREE.ShaderMaterial({ vertexShader: STREAK_VERT.replace('${COMMON}', COMMON), fragmentShader: STREAK_FRAG, uniforms: streakU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  streaks.frustumCulled = false;
  scene.add(streaks);

  // ---- the river's spine: a thin bright current with a faint halo, flowing toward the core
  const spine = new THREE.CubicBezierCurve3(HEAD.clone().addScaledVector(fwd, 0.25).addScaledVector(right, 0.35).add(new THREE.Vector3(0, 0.08, 0)), START, MID, CORE);
  const ribbonMat = (radius, gain, k) => {
    const u = { uTime: { value: 0 }, uFlow: { value: 0 }, uColor: { value: new THREE.Color('#7fa8e6') }, uGain: { value: gain } };
    const m = new THREE.Mesh(new THREE.TubeGeometry(spine, 160, radius, 10, false), new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vUv = uv; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform float uFlow; uniform vec3 uColor; uniform float uGain; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
        void main(){
          float f = pow(abs(dot(normalize(vN), normalize(vV))), ${k.toFixed(1)});
          float u = vUv.x;
          float streak = 0.5 + 0.5 * sin(u * 90.0 - uTime * 11.0 + sin(u * 17.0 + vUv.y * 6.283) * 2.0);
          float ends = smoothstep(0.0, 0.1, u) * smoothstep(1.0, 0.92, u);
          float reach = smoothstep(uFlow, uFlow - 0.12, u);
          vec3 c = mix(vec3(1.0, 0.82, 0.62), uColor, smoothstep(0.05, 0.4, u));
          gl_FragColor = vec4(c * f * (0.55 + 0.45 * streak) * ends * reach * uGain, 1.0);
        }`,
    }));
    m.frustumCulled = false; scene.add(m);
    return u;
  };
  const ribbons = [ribbonMat(0.12, 0.16, 1.2), ribbonMat(0.34, 0.07, 2.0)];

  // ---- the core: a dense cold mass (layered soft glows, no rays) and a whirl of matter falling into it
  const texTight = coreTexture(128, 9), texSoft = coreTexture(128, 3.5);
  const coreParts = [[texTight, 2.4, new THREE.Color(1.5, 1.8, 2.2)], [texSoft, 5.0, new THREE.Color(0.32, 0.52, 0.95)], [texSoft, 12, new THREE.Color(0.07, 0.12, 0.28)]].map(([t, s, col]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.copy(CORE); sp.scale.setScalar(s); sp.userData.s = s; scene.add(sp); return sp;
  });
  const NW = 2600, wr = new Float32Array(NW * 4), RW = rng(5);
  for (let i = 0; i < NW * 4; i++) wr[i] = RW();
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NW * 3), 3)); wg.setAttribute('aR', new THREE.BufferAttribute(wr, 4));
  const ax = perp1.clone(), ay = perp2.clone().multiplyScalar(0.55).add(riverDir.clone().multiplyScalar(-0.45)).normalize();
  const whirlU = { uTime: { value: 0 }, uPx: { value: 26 }, uCore: { value: CORE }, uAx: { value: ax }, uAy: { value: ay }, uPull: { value: 0 }, uColor: { value: new THREE.Color('#6f9ee6') } };
  const whirl = new THREE.Points(wg, new THREE.ShaderMaterial({ vertexShader: WHIRL_VERT, fragmentShader: WHIRL_FRAG, uniforms: whirlU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  whirl.frustumCulled = false; scene.add(whirl);

  // ---- dust
  const ND = 1200, dp = new Float32Array(ND * 3), dr = new Float32Array(ND * 4), RD = rng(7);
  for (let i = 0; i < ND; i++) {
    dp[i * 3] = lerp(-8, 10, RD()); dp[i * 3 + 1] = lerp(-4, 7, RD()); dp[i * 3 + 2] = lerp(-26, 3, RD());
    for (let j = 0; j < 4; j++) dr[i * 4 + j] = RD();
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('aR', new THREE.BufferAttribute(dr, 4));
  const dustU = { uTime: { value: 0 }, uPx: { value: 12 }, uColor: { value: new THREE.Color('#5d759c') } };
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);

  const look = new THREE.Vector3(), cpos = new THREE.Vector3();
  return {
    scene, camera,
    bloom: { strength: 0.7, radius: 0.6, threshold: 0.4 },
    exposure: 1.0,
    update(lt, c) {
      common.uTime.value = lt; dustU.uTime.value = lt; whirlU.uTime.value = lt;
      common.uSway.value = noise(lt * 0.35 + 4.0);
      // debug views for sculpting
      if (opts._view) {
        const v = { front: [0, 0.5, 4.5], side: [4.5, 0.5, 0], back: [0, 0.6, -4.5], '3q': [2.9, 0.8, 3.4] }[opts._view];
        camera.position.set(...v); camera.lookAt(0, 0.1, 0); camera.fov = 34; camera.updateProjectionMatrix();
      } else {
        const k = lerp(c.k, ease.inOut(c.k), 0.5);
        const dist = lerp(4.6, 4.6 - 1.2 * push, k);
        cpos.copy(HEAD).addScaledVector(camDir, dist).add(new THREE.Vector3(0, lerp(0.1, 0.18, k), 0));
        cpos.addScaledVector(right, lerp(-0.12, 0.12, k));
        cpos.x += noise(lt * 0.3 + 1) * 0.015; cpos.y += noise(lt * 0.37 + 5) * 0.012;
        look.copy(HEAD).addScaledVector(right, lerp(0.62, 0.55, k)).add(new THREE.Vector3(0, lerp(-0.12, -0.05, k), 0));
        camera.position.copy(cpos); camera.lookAt(look);
        camera.fov = 28; camera.updateProjectionMatrix();
      }
      skyU.uCoreDir.value.copy(CORE).sub(camera.position).normalize();
      // the core gathers itself as the stream arrives: denser, a little larger, its whirl quickening
      const fed = smooth(prog(lt, disAt + travel * 0.6, disAt + travel * 0.6 + disDur));
      const flick = 0.94 + 0.06 * noise(lt * 2.3);
      coreParts.forEach((sp, i) => { sp.scale.setScalar(sp.userData.s * (1 + (i === 0 ? 0.35 : 0.2) * fed)); sp.material.opacity = (0.55 + 0.45 * fed) * flick; });
      skyU.uGlowK.value = 0.35 + 0.3 * fed;
      whirlU.uPull.value = 0.25 + 0.75 * fed;
      const flow = 1.15 * smooth(prog(lt, disAt + 0.25, disAt + 0.25 + travel * 1.05));
      ribbons.forEach((u) => { u.uTime.value = lt; u.uFlow.value = flow; });
    },
  };
});
