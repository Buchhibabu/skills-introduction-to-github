// doors_corridor: a long institutional corridor at night. Doors on both sides stand open and warm light
// spills from the rooms across the polished floor and onto the opposite wall. The camera dollies forward.
// At opts.closeAt the doors slam shut in sequence from far to near; each leaf sweeps across its doorway and
// its wedge of light narrows to nothing, until only a thin red exit glow is left at the end.
//
// opts:
//   closeAt   local seconds when the farthest door starts to slam (default 1.4)
//   closeDur  seconds from the first slam to the last (nearest) one (default 1.6)
//
// Light is analytic: for every door near a surface point, a ray from the room lamp through the doorway is
// tested against the opening that the door leaf leaves free at its current angle (soft penumbra), so the
// light wedges follow the leaves exactly. The floor reflects the doorways and the exit sign analytically.
import { THREE, register, rng, noise, ease, smooth, clamp, lerp } from '../kit.js';

const CW = 1.2;            // corridor half width
const CH = 2.7;            // ceiling height
const DW = 0.95, DH = 2.1; // door opening
const LD = 2.3;            // room lamp depth behind the wall
const LY = 1.75;           // room lamp height (a floor lamp, so the spill reaches far across the floor)
const NK = 9;              // doors per side
const SP = 4.0;            // door spacing per side
const ZL0 = -1.6, ZR0 = -3.6;  // first door centre z, left and right
const ZEND = -38.5;        // end wall

const COMMON = /* glsl */`
uniform float uTime;
uniform vec4 uDL[${NK}];   // left doors:  x leaf angle (rad, 0 = shut), y room light, z lamp z offset, w under-door glow
uniform vec4 uDR[${NK}];   // right doors
uniform float uExit;       // exit sign intensity
uniform vec3 uFog;
uniform float uFogDen;
varying vec3 vW;
varying vec3 vN;
const float CW = ${CW.toFixed(3)};
const float DW = ${DW.toFixed(3)};
const float DH = ${DH.toFixed(3)};
const float LD = ${LD.toFixed(3)};
const float LY = ${LY.toFixed(3)};
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 doorData(float s, int k){ return s < 0.0 ? uDL[k] : uDR[k]; }
float doorZ(float s, float k){ return (s < 0.0 ? ${ZL0.toFixed(2)} : ${ZR0.toFixed(2)}) - k * ${SP.toFixed(2)}; }
// warm light reaching p (normal n) from the room behind door k on side s, through whatever the leaf leaves open
vec3 doorLight(vec3 p, vec3 n, float s, float k){
  vec4 d = doorData(s, int(k));
  if (d.y <= 0.001) return vec3(0.0);
  float zc = doorZ(s, k);
  float xw = s * CW;
  vec3 L = vec3(s * (CW + LD), LY, zc + d.z);
  vec3 D = p - L;
  if (D.x * s > -0.05) return vec3(0.0);
  float tw = (xw - L.x) / D.x;
  vec3 h = L + D * tw;
  float hd = 1.0;
  float zh = zc - hd * DW * 0.5;
  float th = d.x;
  float dE = DW * sin(th);
  float Ez = zh + hd * DW * cos(th);
  float zp = dE < LD - 0.02 ? L.z + (Ez - L.z) * LD / (LD - dE) : zh - hd * 9.0;
  float u = (h.z - zh) * hd;
  float up = max((zp - zh) * hd, 0.0);
  float m = 0.012 + 0.05 * (1.0 - tw) / max(tw, 0.05);
  float wz = smoothstep(up - m, up + m, u) * (1.0 - smoothstep(DW - m, DW + m, u));
  float wy = smoothstep(-m, m, h.y) * (1.0 - smoothstep(DH - m * 3.0, DH + m * 3.0, h.y));
  float d2 = dot(D, D);
  vec3 l = -D * inversesqrt(d2);
  float shade = mix(0.25, 1.0, smoothstep(0.05, -0.45, -l.y));     // the shade throws light down and out
  return vec3(1.0, 0.68, 0.38) * d.y * wz * wy * shade * max(dot(n, l), 0.0) / (d2 * 0.35 + 0.3);
}
// lights from the nearest doors on one side
vec3 sideLight(vec3 p, vec3 n, float s){
  float z0 = s < 0.0 ? ${ZL0.toFixed(2)} : ${ZR0.toFixed(2)};
  float kc = floor((z0 - p.z) / ${SP.toFixed(2)} + 0.5);
  vec3 acc = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    float k = kc + float(i);
    if (k < 0.0 || k > ${NK - 1}.0) continue;
    acc += doorLight(p, n, s, k);
  }
  return acc;
}
vec3 exitLight(vec3 p, vec3 n){
  vec3 L = vec3(0.0, 2.38, ${(ZEND + 0.12).toFixed(2)});
  vec3 D = L - p;
  float d2 = dot(D, D);
  vec3 l = D * inversesqrt(d2);
  return vec3(1.0, 0.07, 0.04) * uExit * max(dot(n, l) * 0.85 + 0.15, 0.0) / (d2 + 0.6) * 0.9;
}
// soft bounce: open doors fill the corridor a little around them
vec3 bounce(vec3 p){
  vec3 b = vec3(0.0);
  for (int side = 0; side < 2; side++) {
    float s = side == 0 ? -1.0 : 1.0;
    float z0 = s < 0.0 ? ${ZL0.toFixed(2)} : ${ZR0.toFixed(2)};
    float kc = floor((z0 - p.z) / ${SP.toFixed(2)} + 0.5);
    for (int i = -1; i <= 1; i++) {
      float k = kc + float(i);
      if (k < 0.0 || k > ${NK - 1}.0) continue;
      vec4 d = doorData(s, int(k));
      float dz = p.z - doorZ(s, k);
      float open = smoothstep(0.0, 1.2, d.x);
      b += vec3(1.0, 0.72, 0.45) * d.y * open * 0.012 / (1.0 + dz * dz * 0.8) * (0.5 + 0.5 * smoothstep(2.0 * CW, 0.0, abs(p.x - s * CW)));
    }
  }
  return b;
}
vec3 fogIt(vec3 c, vec3 wp){
  float d = length(wp - cameraPosition);
  return mix(max(c, vec3(0.0)), uFog, 1.0 - exp(-uFogDen * d));
}
`;

const VERT = /* glsl */`
varying vec3 vW;
varying vec3 vN;
#ifdef USE_INSTANCING
attribute vec2 aDoor;
varying vec2 vDoor;
#endif
void main(){
#ifdef USE_INSTANCING
  mat4 m = modelMatrix * instanceMatrix;
  vDoor = aDoor;
#else
  mat4 m = modelMatrix;
#endif
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// shell vertex shader: smooth terms (bounce fill, exit light) per vertex on tessellated panels
const SHELL_VERT = /* glsl */`
varying vec3 vB;
varying vec3 vE;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vB = bounce(w.xyz);
  vE = exitLight(w.xyz, vN);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// corridor walls: painted plaster over a darker wainscot, chair rail, baseboard
const WALL_FRAG = /* glsl */`
varying vec3 vB;
varying vec3 vE;
void main(){
  vec3 p = vW, n = normalize(vN);
  float s = p.x < 0.0 ? -1.0 : 1.0;
  float y = p.y;
  float fy = fwidth(y) + 0.002;
  vec3 alb = vec3(0.46, 0.50, 0.50);
  float wain = 1.0 - smoothstep(1.0 - fy, 1.0 + fy, y);
  alb = mix(alb, vec3(0.20, 0.25, 0.26), wain);
  float rail = (1.0 - smoothstep(0.0, fy, abs(y - 1.0) - 0.025));
  alb = mix(alb, vec3(0.62, 0.62, 0.58), rail);
  float base = 1.0 - smoothstep(0.12 - fy, 0.12 + fy, y);
  alb = mix(alb, vec3(0.06, 0.06, 0.065), base);
  // painted plaster: soft mottling, scuffs and grime toward the floor
  vec2 mq = vec2(p.z, y) * 2.3;
  float mott = mix(h21(floor(mq)), h21(floor(mq) + vec2(1.0, 0.0)), smoothstep(0.0, 1.0, fract(mq.x)));
  float mott2 = h21(floor(vec2(p.z, y) * 9.0));
  alb *= (0.9 + 0.12 * mott) * (0.97 + 0.06 * mott2) * (0.82 + 0.18 * smoothstep(0.1, 0.9, y));
  vec3 L = sideLight(p, n, -s) + vE + vB + vec3(0.006, 0.008, 0.013);
  vec3 col = alb * L;
  // a bright line where the rail catches the light
  col += rail * L * 0.15;
  gl_FragColor = vec4(fogIt(col, p), 1.0);
}
`;

const CEIL_FRAG = /* glsl */`
varying vec3 vB;
varying vec3 vE;
void main(){
  vec3 p = vW;
  vec2 q = vec2(p.x / 0.6, p.z / 0.6);
  vec2 f = fract(q + 0.5);
  float grid = 1.0 - smoothstep(0.0, fwidth(q.y) * 1.2 + 0.02, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  // switched-off fluorescent fittings every 3 m
  float fz = abs(fract((p.z + 0.4) / 3.0) - 0.5) * 3.0;
  float fit = step(abs(p.x), 0.3) * step(fz, 0.62);
  vec3 alb = vec3(0.45, 0.45, 0.44) * (1.0 - grid * 0.4);
  alb = mix(alb, vec3(0.62, 0.64, 0.66), fit);
  vec3 L = vB * 0.8 + vE + vec3(0.004, 0.005, 0.009);
  gl_FragColor = vec4(fogIt(alb * L, p), 1.0);
}
`;

// polished floor: warm wedges, a thin glow under freshly shut doors, analytic reflections of the doorways
const FLOOR_FRAG = /* glsl */`
varying vec3 vB;
varying vec3 vE;
void main(){
  vec3 p = vW;
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(cameraPosition - p);
  // terrazzo-ish tiles
  vec2 q = p.xz / 0.6;
  vec2 f = fract(q);
  float seam = 1.0 - smoothstep(0.0, fwidth(q.y) * 1.3 + 0.015, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  float speck = h21(floor(p.xz * 60.0));
  float lod = smoothstep(0.3, 1.0, fwidth(p.z) * 60.0);
  vec3 alb = vec3(0.28, 0.27, 0.26) * (0.9 + 0.2 * mix(speck, 0.5, lod)) * (1.0 - seam * 0.25);
  vec3 L = sideLight(p, n, -1.0) + sideLight(p, n, 1.0) + vE + vB * 0.6 + vec3(0.005, 0.006, 0.010);
  // light leaking under shut doors
  for (int side = 0; side < 2; side++) {
    float s = side == 0 ? -1.0 : 1.0;
    float z0 = s < 0.0 ? ${ZL0.toFixed(2)} : ${ZR0.toFixed(2)};
    float k = clamp(floor((z0 - p.z) / ${SP.toFixed(2)} + 0.5), 0.0, ${NK - 1}.0);
    vec4 d = doorData(s, int(k));
    float dz = abs(p.z - doorZ(s, k));
    float dx = abs(p.x - s * CW);
    L += vec3(1.0, 0.62, 0.32) * d.w * exp(-dx / 0.07) * (1.0 - smoothstep(DW * 0.45, DW * 0.55, dz)) * 1.5;
  }
  vec3 col = alb * L;
  // reflections: the reflected view ray, tested against the doorways and the exit sign
  vec3 R = reflect(-V, n);
  vec3 refl = vec3(0.0);
  for (int side = 0; side < 2; side++) {
    float s = side == 0 ? -1.0 : 1.0;
    if (R.x * s <= 0.001) continue;
    float t = (s * CW - p.x) / R.x;
    vec3 h = p + R * t;
    float z0 = s < 0.0 ? ${ZL0.toFixed(2)} : ${ZR0.toFixed(2)};
    float k = floor((z0 - h.z) / ${SP.toFixed(2)} + 0.5);
    if (k < 0.0 || k > ${NK - 1}.0) continue;
    vec4 d = doorData(s, int(k));
    float zc = doorZ(s, k);
    float m = 0.03 + 0.05 * t;
    float hd = 1.0;
    float u = (h.z - (zc - hd * DW * 0.5)) * hd;
    float openW = DW * clamp(sin(d.x) * 1.15, 0.0, 1.0);
    float wz = smoothstep(DW - openW - m, DW - openW + m, u) * (1.0 - smoothstep(DW - m, DW + m, u));
    float wy = 1.0 - smoothstep(DH - m * 2.0, DH + m, h.y);
    refl += vec3(1.0, 0.72, 0.45) * d.y * 0.07 * wz * wy * exp(-t * 0.25);
  }
  {
    // exit sign
    float t = (${(ZEND + 0.1).toFixed(2)} - p.z) / min(R.z, -0.001);
    vec3 h = p + R * t;
    vec2 e = abs(h.xy - vec2(0.0, 2.38)) - vec2(0.17, 0.07);
    float m = 0.02 + 0.03 * t;
    refl += vec3(1.0, 0.07, 0.04) * uExit * 0.8 * (1.0 - smoothstep(-m, m, max(e.x, e.y))) * step(0.0, t);
    refl += vec3(1.0, 0.07, 0.04) * uExit * 0.05 * exp(-length(max(e, 0.0)) * 2.0 / (0.3 + 0.1 * t)) * step(0.0, t);
  }
  float cv = clamp(V.y, 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - cv, 5.0);
  col += refl * mix(0.25, 1.0, F) * (1.0 - seam * 0.7);
  gl_FragColor = vec4(fogIt(col, p), 1.0);
}
`;

// rooms: warm interiors seen only through the doorways (BackSide boxes)
const ROOM_FRAG = /* glsl */`
varying vec2 vDoor;
void main(){
  vec3 p = vW, n = -normalize(vN);    // inward
  float s = vDoor.x, k = floor(vDoor.y + 0.5);
  vec4 d = doorData(s, int(k));
  float zc = doorZ(s, k);
  vec3 L = vec3(s * (CW + LD), LY, zc + d.z);
  vec3 D = L - p;
  float d2 = dot(D, D);
  float lam = max(dot(n, D * inversesqrt(d2)), 0.0);
  vec3 alb = vec3(0.50, 0.46, 0.40);
  // back wall: a dark night window with blinds; low cabinets along the walls
  float depth = abs(p.x) - CW;
  if (abs(n.x) > 0.5 && depth > 3.0) {
    float wz = abs(p.z - zc - 0.3);
    float win = step(wz, 0.7) * step(1.0, p.y) * step(p.y, 2.1);
    float blind = 0.6 + 0.4 * step(0.5, fract(p.y * 18.0));
    alb = mix(alb, vec3(0.05, 0.07, 0.10) * blind, win);
  }
  if (abs(n.z) > 0.5) {
    // shelving and a framed board on the side walls
    float shelf = step(0.6, depth) * step(depth, 2.0) * step(0.4, p.y) * step(p.y, 2.0);
    float row = floor(p.y * 2.5);
    float lines = step(0.86, fract(p.y * 2.5));
    float spine = h21(vec2(floor(depth * 28.0), row));
    vec3 book = mix(vec3(0.30, 0.10, 0.07), vec3(0.12, 0.18, 0.22), step(0.5, spine)) * (0.5 + 0.8 * h21(vec2(row, floor(depth * 28.0) + 3.0)));
    book *= step(fract(p.y * 2.5), 0.55 + 0.3 * spine);                 // books of different heights
    alb = mix(alb, mix(book + vec3(0.03, 0.025, 0.02), vec3(0.08, 0.06, 0.05), lines), shelf);
    float board = step(2.3, depth) * step(depth, 3.3) * step(1.1, p.y) * step(p.y, 1.8);
    alb = mix(alb, vec3(0.75, 0.74, 0.70), board);
  }
  if (n.y > 0.5) alb = vec3(0.35, 0.28, 0.22);
  vec3 col = alb * vec3(1.0, 0.70, 0.42) * d.y * (lam / (d2 * 0.5 + 0.6) * 0.5 + 0.035);
  gl_FragColor = vec4(fogIt(col, p), 1.0);
}
`;

// door leaves: painted, lit by their own room on one face, by the corridor on the other
// dust motes: only visible where a door's light passes through the air (the beam is implied by the dust)
const MOTE_VERT = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uCam;
varying float vA;
void main(){
  vec3 p = position;
  p.z = uCam.z + 0.5 - mod(uCam.z + 0.5 - p.z, 9.0);
  float ahead = uCam.z - p.z;
  float t = uTime;
  p.x += sin(t * (0.2 + aSeed.x * 0.3) + aSeed.y * 6.28) * 0.06;
  p.y += sin(t * (0.15 + aSeed.z * 0.2) + aSeed.x * 6.28) * 0.05 - t * 0.01 * aSeed.w;
  p.z += cos(t * (0.17 + aSeed.y * 0.3) + aSeed.z * 6.28) * 0.06;
  vec3 lit = vec3(0.0);
  for (int side = 0; side < 2; side++) {
    float s = side == 0 ? -1.0 : 1.0;
    // light arriving at the mote: the same aperture test as the surfaces, with a normal facing the door
    lit += sideLight(p, vec3(s, 0.0, 0.0), s);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dz = -mv.z;
  float sz = (0.9 + aSeed.w * 1.6) * 260.0 / dz;
  gl_PointSize = clamp(sz, 1.0, 6.0);
  vA = dot(lit, vec3(0.33)) * (0.5 + 0.5 * sin(t * (1.5 + aSeed.w * 3.0) + aSeed.y * 40.0)) * smoothstep(0.5, 1.6, dz) * (1.0 - smoothstep(5.0, 8.5, ahead)) * clamp(sz / gl_PointSize, 0.15, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;
const MOTE_FRAG = /* glsl */`
varying float vA;
void main(){
  float a = 1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vec3(1.0, 0.74, 0.46) * a * vA * 0.6, 1.0);
}
`;

const LEAF_FRAG = /* glsl */`
varying vec2 vDoor;
void main(){
  vec3 p = vW, n = normalize(vN);
  float s = vDoor.x, k = floor(vDoor.y + 0.5);
  vec4 d = doorData(s, int(k));
  float zc = doorZ(s, k);
  vec3 L = vec3(s * (CW + LD), LY, zc + d.z);
  vec3 D = L - p;
  float d2 = dot(D, D);
  float lam = max(dot(n, D * inversesqrt(d2)), 0.0);
  // the room only lights the leaf while it is inside the room
  float inside = smoothstep(0.0, 0.04, (p.x - s * CW) * s);
  vec3 alb = vec3(0.36, 0.30, 0.24);
  // kick plate and lever
  float kick = step(p.y, 0.25);
  alb = mix(alb, vec3(0.5, 0.5, 0.5), kick);
  vec3 col = alb * (vec3(1.0, 0.72, 0.45) * d.y * lam / (d2 * 0.5 + 0.5) * inside + sideLight(p, n, -s) + exitLight(p, n) + bounce(p) * 0.5 + 0.004);
  gl_FragColor = vec4(fogIt(col, p), 1.0);
}
`;
// casings, jamb liners, plaques: corridor-lit trim
const TRIM_FRAG = /* glsl */`
uniform vec3 uAlb;
void main(){
  vec3 p = vW, n = normalize(vN);
  float s = p.x < 0.0 ? -1.0 : 1.0;
  vec3 L = sideLight(p, n, -s) + exitLight(p, n) + bounce(p) + 0.004;
  // jamb liners inside the opening also see their own room
  gl_FragColor = vec4(fogIt(uAlb * L, p), 1.0);
}
`;
const EXIT_FRAG = /* glsl */`
uniform sampler2D tExit;
varying vec2 vUv;
void main(){
  vec3 t = texture2D(tExit, vUv).rgb;
  gl_FragColor = vec4(t * t * vec3(4.0, 0.35, 0.22) * uExit + vec3(0.02, 0.0, 0.0), 1.0);
}
`;
const UV_VERT = /* glsl */`
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normal; vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const GLOW_FRAG = /* glsl */`
varying vec2 vUv;
uniform vec3 uCol;
void main(){
  vec2 q = (vUv - 0.5) * 2.0;
  q.x *= 0.55;
  float r = length(q);
  float a = exp(-r * r * 6.0) * 0.6 + exp(-r * r * 40.0) * 0.4;
  gl_FragColor = vec4(uCol * a * uExit, 1.0);
}
`;

register('doors_corridor', (opts) => {
  const closeAt = opts.closeAt ?? 1.4, closeDur = opts.closeDur ?? 1.6;
  const R = rng(opts.seed ?? 5);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010101);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.08, 80);

  // ---- doors: open angle, hinge side, room brightness, close time (far to near)
  const doors = [];
  for (const s of [-1, 1]) for (let k = 0; k < NK; k++) {
    const z = (s < 0 ? ZL0 : ZR0) - k * SP;
    const open = !(s < 0 && k === 3) && !(s > 0 && k === 5) && !(s > 0 && k === 1);
    doors.push({ s, k, z, open, ang: open ? 1.45 + R() * 0.3 : 0, hd: 1, I: 1.6 + R() * 0.9, lz: 0.35 + R() * 0.7 });
  }
  const openDoors = doors.filter((d) => d.open).sort((a, b) => a.z - b.z);    // farthest first
  openDoors.forEach((d, i) => { d.tc = closeAt + closeDur * (openDoors.length > 1 ? i / (openDoors.length - 1) : 0) + (R() - 0.5) * 0.06; });

  const uDL = Array.from({ length: NK }, () => new THREE.Vector4());
  const uDR = Array.from({ length: NK }, () => new THREE.Vector4());
  const shared = {
    uTime: { value: 0 }, uDL: { value: uDL }, uDR: { value: uDR }, uExit: { value: 1 },
    uFog: { value: new THREE.Color(0.002, 0.002, 0.003) }, uFogDen: { value: 0.03 },
  };
  const mat = (frag, extra = {}, params = {}, vert = VERT) => new THREE.ShaderMaterial({
    uniforms: { ...shared, ...extra }, vertexShader: vert, fragmentShader: COMMON + frag, ...params,
  });

  // leaf angle over time: open, slam (accelerating swing), a small rebound, shut
  const SLAM = 0.24;
  function leafAngle(d, t) {
    if (!d.open) return 0;
    const u = (t - d.tc) / SLAM;
    if (u <= 0) return d.ang;
    if (u < 1) return d.ang * (1 - u * u * u);
    const v = (t - d.tc - SLAM) / 0.16;
    return v < 1 ? 0.05 * Math.sin(Math.PI * v) * (1 - v) : 0;
  }

  // ---- corridor shell: walls are panels between the openings
  const zA = 3.5, zB = ZEND;
  const wallMat = mat(WALL_FRAG, {}, {}, COMMON + SHELL_VERT);
  for (const s of [-1, 1]) {
    const list = doors.filter((d) => d.s === s).sort((a, b) => b.z - a.z);
    let z = zA;
    const addPanel = (z1, z2, y1, y2) => {
      if (z1 - z2 < 0.01) return;
      const g = new THREE.PlaneGeometry(z1 - z2, y2 - y1, Math.max(1, Math.round((z1 - z2) / 0.4)), Math.max(1, Math.round((y2 - y1) / 0.6)));
      const m = new THREE.Mesh(g, wallMat);
      m.renderOrder = -3;                  // shell first: rooms behind the walls are then depth-rejected
      m.rotation.y = -s * Math.PI / 2;
      m.position.set(s * CW, (y1 + y2) / 2, (z1 + z2) / 2);
      scene.add(m);
    };
    for (const d of list) {
      addPanel(z, d.z + DW / 2, 0, CH);
      addPanel(d.z + DW / 2, d.z - DW / 2, DH, CH);
      z = d.z - DW / 2;
    }
    addPanel(z, zB, 0, CH);
  }
  {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * CW, zA - zB, 4, 105), mat(FLOOR_FRAG, {}, {}, COMMON + SHELL_VERT));
    fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, (zA + zB) / 2); fl.renderOrder = -3; scene.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(2 * CW, zA - zB, 4, 105), mat(CEIL_FRAG, {}, {}, COMMON + SHELL_VERT));
    ce.rotation.x = Math.PI / 2; ce.position.set(0, CH, (zA + zB) / 2); ce.renderOrder = -3; scene.add(ce);
    // end wall with a pair of doors under the exit sign
    const end = new THREE.Mesh(new THREE.PlaneGeometry(2 * CW, CH), mat(TRIM_FRAG, { uAlb: { value: new THREE.Color(0.45, 0.47, 0.45) } }));
    end.position.set(0, CH / 2, zB); scene.add(end);
    const ed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 0.04), mat(TRIM_FRAG, { uAlb: { value: new THREE.Color(0.30, 0.25, 0.20) } }));
    ed.position.set(0, 1.05, zB + 0.02); scene.add(ed);
  }

  // ---- rooms, leaves, casings
  const nD = doors.length;
  const aDoor = new Float32Array(nD * 2);
  doors.forEach((d, i) => { aDoor[i * 2] = d.s; aDoor[i * 2 + 1] = d.k; });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), E = new THREE.Euler();
  {
    const g = new THREE.BoxGeometry(3.6, CH, 3.4);
    g.setAttribute('aDoor', new THREE.InstancedBufferAttribute(aDoor, 2));
    const rooms = new THREE.InstancedMesh(g, mat(ROOM_FRAG, {}, { side: THREE.BackSide }), nD);
    doors.forEach((d, i) => { M.makeTranslation(d.s * (CW + 1.8), CH / 2, d.z); rooms.setMatrixAt(i, M); });
    rooms.renderOrder = 2;
    scene.add(rooms);
  }
  const leafG = new THREE.BoxGeometry(0.045, DH - 0.02, DW - 0.02);
  leafG.translate(0, (DH - 0.02) / 2, (DW - 0.02) / 2);            // hinge edge at the origin, leaf along +z
  // lever handle
  const handle = new THREE.BoxGeometry(0.06, 0.025, 0.14).translate(0, 1.0, DW - 0.12);
  const leafAll = mergeBoxes([leafG, handle]);
  leafAll.setAttribute('aDoor', new THREE.InstancedBufferAttribute(aDoor, 2));
  const leaves = new THREE.InstancedMesh(leafAll, mat(LEAF_FRAG), nD);
  scene.add(leaves);
  {
    // casings (architraves) and jamb liners that give the wall its thickness
    const parts = [
      new THREE.BoxGeometry(0.02, DH + 0.07, 0.07).translate(0, (DH + 0.07) / 2, DW / 2 + 0.035),
      new THREE.BoxGeometry(0.02, DH + 0.07, 0.07).translate(0, (DH + 0.07) / 2, -DW / 2 - 0.035),
      new THREE.BoxGeometry(0.02, 0.07, DW + 0.14).translate(0, DH + 0.035, 0),
      new THREE.BoxGeometry(0.14, DH, 0.02).translate(0.07, DH / 2, DW / 2 + 0.01),
      new THREE.BoxGeometry(0.14, DH, 0.02).translate(0.07, DH / 2, -DW / 2 - 0.01),
      new THREE.BoxGeometry(0.14, 0.02, DW).translate(0.07, DH + 0.01, 0),
      // room number plaque
      new THREE.BoxGeometry(0.012, 0.12, 0.16).translate(0, 1.55, -DW / 2 - 0.2),
    ];
    const g = mergeBoxes(parts);
    const cas = new THREE.InstancedMesh(g, mat(TRIM_FRAG, { uAlb: { value: new THREE.Color(0.40, 0.42, 0.40) } }), nD);
    doors.forEach((d, i) => {
      Q.setFromEuler(E.set(0, d.s < 0 ? Math.PI : 0, 0)); P.set(d.s * CW, 0, d.z);
      M.compose(P, Q, S); cas.setMatrixAt(i, M);
    });
    scene.add(cas);
  }

  // ---- furniture silhouettes inside the rooms (a desk and a tall cabinet along the far side wall)
  {
    const g = mergeBoxes([
      new THREE.BoxGeometry(1.0, 0.75, 0.6).translate(1.9, 0.375, -1.3),
      new THREE.BoxGeometry(0.5, 1.9, 0.45).translate(3.0, 0.95, -1.4),
      new THREE.BoxGeometry(0.45, 0.9, 0.45).translate(1.3, 0.45, -0.6),
    ]);
    g.setAttribute('aDoor', new THREE.InstancedBufferAttribute(aDoor, 2));
    const furn = new THREE.InstancedMesh(g, mat(LEAF_FRAG.replace('vec3(0.36, 0.30, 0.24)', 'vec3(0.16, 0.13, 0.10)')), nD);
    doors.forEach((d, i) => {
      Q.setFromEuler(E.set(0, d.s < 0 ? Math.PI : 0, 0)); P.set(d.s * CW, 0, d.z);
      if (d.s < 0) { S.set(1, 1, -1); } else S.set(1, 1, 1);
      M.compose(P, Q, S); furn.setMatrixAt(i, M);
    });
    S.set(1, 1, 1);
    furn.renderOrder = 1;
    scene.add(furn);
  }

  // ---- dust motes in the corridor air (wrapped into a 9 m window ahead of the camera)
  const camPosU = new THREE.Vector3();
  {
    const N = 700, RR = rng(77);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (RR() - 0.5) * 2 * (CW - 0.05);
      pos[i * 3 + 1] = 0.05 + RR() * 2.3;
      pos[i * 3 + 2] = -RR() * 9;
      for (let j = 0; j < 4; j++) seed[i * 4 + j] = RR();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const pm = new THREE.ShaderMaterial({
      uniforms: { ...shared, uCam: { value: camPosU } }, vertexShader: COMMON + MOTE_VERT, fragmentShader: MOTE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, pm);
    pts.frustumCulled = false; pts.renderOrder = 4;
    scene.add(pts);
  }

  // ---- notices pinned to the walls and a fire-extinguisher cabinet (they only read when light hits them)
  {
    const sheets = [];
    const RN = rng(19);
    for (const s of [-1, 1]) for (let k = 0; k < NK; k++) {
      if (RN() < 0.45) continue;
      const z = (s < 0 ? ZL0 : ZR0) - k * SP - 1.25 - RN() * 0.6;
      const n = 1 + Math.floor(RN() * 3);
      for (let j = 0; j < n; j++) sheets.push([s, z - j * 0.24 + (RN() - 0.5) * 0.04, 1.32 + (RN() - 0.5) * 0.12, (RN() - 0.5) * 0.08]);
    }
    const g = new THREE.BoxGeometry(0.004, 0.297, 0.21);
    const im = new THREE.InstancedMesh(g, mat(TRIM_FRAG, { uAlb: { value: new THREE.Color(0.80, 0.78, 0.72) } }), sheets.length);
    sheets.forEach(([s, z, y, r], i) => {
      Q.setFromEuler(E.set(r, 0, 0)); P.set(s * (CW - 0.004), y, z); M.compose(P, Q, S); im.setMatrixAt(i, M);
    });
    scene.add(im);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.28), mat(TRIM_FRAG, { uAlb: { value: new THREE.Color(0.55, 0.06, 0.04) } }));
    cab.position.set(CW - 0.08, 1.1, ZR0 - 4 * SP - 1.6); scene.add(cab);
  }

  // ---- exit sign at the end
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#100'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#fff'; g.font = '64px Oswald'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EXIT', 128, 52);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), mat(EXIT_FRAG, { tExit: { value: tex } }, {}, UV_VERT));
    sign.position.set(0, 2.38, ZEND + 0.08); scene.add(sign);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.17, 0.06), mat(TRIM_FRAG, { uAlb: { value: new THREE.Color(0.2, 0.2, 0.2) } }));
    box.position.set(0, 2.38, ZEND + 0.03); scene.add(box);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.0), mat(GLOW_FRAG, { uCol: { value: new THREE.Color(0.5, 0.03, 0.02) } }, {
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }, UV_VERT));
    glow.position.set(0, 2.38, ZEND + 0.2); glow.renderOrder = 5; scene.add(glow);
  }

  // ---- camera: steady dolly with a jolt at each slam
  const look = new THREE.Vector3();
  function camAt(lt, k) {
    const z = lerp(2.6, 0.0, 0.1 * smooth(k) + 0.9 * k);
    const p = new THREE.Vector3(0.14 + 0.02 * noise(lt * 0.4 + 1), 1.58 + 0.01 * noise(lt * 0.5 + 7), z);
    let jx = 0, jy = 0;
    for (const d of openDoors) {
      const dt = lt - d.tc - SLAM;
      if (dt < 0 || dt > 0.6) continue;
      const a = 0.010 / (1 + Math.abs(z - d.z) / 3) * Math.exp(-dt * 9);
      jx += a * Math.sin(dt * 70 + d.k); jy += a * 0.7 * Math.sin(dt * 55 + d.s);
    }
    p.x += jx; p.y += jy;
    look.set(-0.05 + jx * 0.5, 1.42 + jy, z - 20);
    return p;
  }

  return {
    scene, camera,
    bloom: { strength: 0 },
    exposure: 1.5,
    update(lt, c) {
      shared.uTime.value = lt;
      camera.position.copy(camAt(lt, c.k));
      camPosU.copy(camera.position);
      camera.lookAt(look);
      doors.forEach((d, i) => {
        const th = leafAngle(d, lt);
        // the room light dies with the slam, a sliver leaks under the door for a moment
        const since = d.open ? lt - d.tc - SLAM : -1;
        const I = d.open ? d.I * (since < 0 ? 1 : Math.max(0, 1 - since / 0.35) * 0.0) : 0;
        const under = d.open && since >= 0 ? Math.max(0, 1 - since / 0.5) * 0.6 : 0;
        const v = (d.s < 0 ? uDL : uDR)[d.k];
        v.set(th, d.open ? (since < 0 ? d.I : 0.0) : 0.0, d.lz, under);
        // leaf transform: hinge at the far jamb, swinging into the room
        const zh = d.z - d.hd * DW / 2;
        const phi = Math.atan2(d.s * Math.sin(th), d.hd * Math.cos(th));
        Q.setFromEuler(E.set(0, phi, 0)); P.set(d.s * (CW + 0.03), 0.005, zh);
        M.compose(P, Q, S); leaves.setMatrixAt(i, M);
      });
      leaves.instanceMatrix.needsUpdate = true;

    },
  };
});

// merge non-indexed copies of simple geometries (positions + normals + uvs)
function mergeBoxes(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
