// feedback_stream: "Your feedback becomes signal." Far below, a city-sized sea of tiny warm lights (people
// on phones). Out of its densest districts, streams of small glowing tokens (speech bubbles / thumbs-up
// glyphs, each a bright head with a short trail) lift off, bundle into columns, merge into a few trunks and
// are swallowed by a lit intake slot across the face of a towering obsidian monolith. The monolith is
// ribbed and panelled, with a faint inner lattice that wakes up and brightens as it absorbs the streams.
// Tokens cool from warm human amber to machine teal and speed up as they are pulled in. The camera cranes
// up and tilts from the sea to the core; at the end the core fills the upper third and runs out of frame,
// the warm horizon of the city holds the bottom of frame.
//
// opts:
//   icon   'bubble' | 'thumb' | 'mixed' (default 'mixed')   glyph carried by the tokens
//   rate   0..2 token density (default 1)
//   seed   layout seed (default 11)
// Composition: the core and its intake own the top band (intake at y ~180 at the end), the sea and horizon
// own the bottom band; in the middle band (y ~300-780) tokens are dimmed to faint threads in screen space,
// so a paper document (left) and an index card (right) sit on calm dark.
// Everything is a pure function of time (frames can be rendered out of order).
import { THREE, register, rng, noise, ease, smooth, clamp, lerp } from '../kit.js';

const TAU = Math.PI * 2;
const CORE = { x: 90, z: -560, w: 340, d: 120, y0: -60, y1: 1500, intake: 470 };
const FRONT = CORE.z + CORE.d / 2;           // front face z
const TRUNK_X = [-0.37, -0.18, 0.0, 0.19, 0.36].map((f) => CORE.x + f * CORE.w);

// ---------------------------------------------------------------- helpers
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
// glyph atlas (512 x 512): top row sharp (bubble, thumb), bottom row defocused; each glyph is a crisp
// white core with a soft halo in the alpha channel
function glyphAtlas() {
  const [c, g] = canvas(512, 512);
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const bubble = () => {
    rr(44, 62, 168, 108, 44); g.fill();
    g.beginPath(); g.moveTo(78, 150); g.quadraticCurveTo(84, 186, 56, 206); g.quadraticCurveTo(104, 196, 122, 160); g.closePath(); g.fill();
  };
  const bubbleCut = () => { for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(94 + i * 34, 116, 10, 0, TAU); g.fill(); } };
  const thumb = () => {
    rr(40, 120, 38, 94, 9); g.fill();                                              // cuff
    rr(88, 112, 116, 102, 24); g.fill();                                           // fist
    g.beginPath(); g.moveTo(92, 124); g.bezierCurveTo(98, 92, 118, 70, 122, 40);   // thumb
    g.bezierCurveTo(124, 22, 150, 20, 154, 40); g.bezierCurveTo(158, 62, 150, 88, 146, 116); g.closePath(); g.fill();
  };
  const thumbCut = () => {
    g.lineWidth = 7; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(160, 140 + i * 24); g.lineTo(206, 140 + i * 24); g.stroke(); }
    g.lineWidth = 8; g.beginPath(); g.moveTo(83, 116); g.lineTo(83, 218); g.stroke();
  };
  const draw = (ox, oy, shape, cut, blur) => {
    g.save(); g.translate(ox, oy);
    g.filter = blur ? 'blur(7px)' : 'blur(1px)';
    g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    g.globalAlpha = 1; shape();
    g.globalCompositeOperation = 'destination-out'; cut(); g.globalCompositeOperation = 'source-over';
    g.restore();
  };
  draw(0, 0, bubble, bubbleCut, false); draw(256, 0, thumb, thumbCut, false);
  draw(0, 256, bubble, bubbleCut, true); draw(256, 256, thumb, thumbCut, true);
  g.filter = 'none';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function glowTex(stops) {
  const [c, g] = canvas(128, 128), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, a] of stops) r.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// shared haze (per vertex): exp2 fog towards a colour that warms near the horizon (city glow) and cools upward
const HAZE = `
uniform vec3 uFogLo, uFogHi, uGlowCol; uniform float uFogDen;
vec3 hazeCol(vec3 vd) { return mix(uFogLo, uFogHi, smoothstep(-0.05, 0.45, vd.y)) + uGlowCol * (exp(-abs(vd.y + 0.01) * 14.0) + 0.35 * exp(-abs(vd.y) * 4.0)); }
float hazeF(float d) { return 1.0 - exp(-uFogDen * uFogDen * d * d); }`;

register('feedback_stream', (opts) => {
  const icon = ['bubble', 'thumb', 'mixed'].includes(opts.icon) ? opts.icon : 'mixed';
  const rate = clamp(opts.rate ?? 1, 0, 2);
  const seed = opts.seed ?? 11;
  const R = rng(seed * 977 + 5);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06080b);
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 1, 8000);
  const HU = {
    uFogLo: { value: new THREE.Color(0x100d0b) }, uFogHi: { value: new THREE.Color(0x04060a) },
    uGlowCol: { value: new THREE.Color(0xd08a4c).multiplyScalar(0.12) }, uFogDen: { value: 0.00075 },
  };

  // ---- sky dome: night haze, warm light-pollution band at the horizon, cold above
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), new THREE.ShaderMaterial({
    uniforms: { ...HU },
    vertexShader: `varying vec3 vD;\nvoid main(){ vec4 w = modelMatrix * vec4(position, 1.0); vD = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vD;\n${HAZE}\nvoid main(){ vec3 d = normalize(vD); gl_FragColor = vec4(hazeCol(d), 1.0); }`,
    side: THREE.BackSide, depthWrite: false,
  }));
  sky.renderOrder = -2; scene.add(sky);

  // ---- the sea: ~44k phone lights in city-like districts, twinkling; dark ground plane under them
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000, 80, 80), new THREE.ShaderMaterial({
    uniforms: { ...HU },
    vertexShader: `varying vec3 vC; varying float vF;\n${HAZE}\nvoid main(){ vec4 w = modelMatrix * vec4(position, 1.0); vec3 d = w.xyz - cameraPosition; float fd = length(d); vC = hazeCol(d / fd); vF = hazeF(fd); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vC; varying float vF; void main(){ gl_FragColor = vec4(mix(vec3(0.007, 0.006, 0.006), vC, vF), 1.0); }`,
  }));
  ground.rotation.x = -Math.PI / 2; ground.renderOrder = -1; scene.add(ground);
  const districts = [];
  for (let i = 0; i < 34; i++) districts.push({ x: (R() - 0.5) * 5200, z: -400 - Math.pow(R(), 0.8) * 3600 + 700, r: 180 + R() * 420, ang: R() * Math.PI, blk: 55 + R() * 45, w: 0.5 + R() * 0.8 });
  for (let i = 0; i < 10; i++) districts.push({ x: (R() - 0.5) * 2600, z: -900 - R() * 2200, r: 260 + R() * 380, ang: R() * Math.PI, blk: 50 + R() * 40, w: 1.1 });
  // the hot districts the streams lift out of (dense, under the camera's first look)
  const HOT = [[-200, 130, 210], [10, -60, 230], [270, 150, 210], [350, -250, 230], [-90, -330, 210], [170, -430, 180]];
  for (const [x, z, r] of HOT) districts.push({ x, z, r, ang: R() * Math.PI, blk: 40 + R() * 20, w: 2.6 });
  const wsum = districts.reduce((a, d) => a + d.w, 0);
  const pickD = () => { let q = R() * wsum; for (const d of districts) { q -= d.w; if (q <= 0) return d; } return districts[0]; };
  const nSea = 44000, sP = new Float32Array(nSea * 3), sS = new Float32Array(nSea * 4);
  for (let i = 0; i < nSea; i++) {
    const D = pickD();
    let u = (R() - 0.5) * 2 * D.r, v = (R() - 0.5) * 2 * D.r; const kind = R();
    if (kind < 0.55) { if (R() < 0.5) u = Math.round(u / D.blk) * D.blk + (R() - 0.5) * 2; else v = Math.round(v / D.blk) * D.blk + (R() - 0.5) * 2; }   // street lights
    else if (kind < 0.62) { v = Math.round(v / (D.blk * 4)) * D.blk * 4 + (R() - 0.5) * 3; }                                                     // arterial roads
    if (u * u + v * v > D.r * D.r * (0.6 + 0.4 * R())) { u *= 0.5; v *= 0.5; }
    const ca = Math.cos(D.ang), sa = Math.sin(D.ang);
    sP.set([D.x + u * ca - v * sa, 0.5, D.z + u * sa + v * ca], i * 3);
    const street = kind < 0.62;
    sS.set([R(), (street ? 0.55 : 0.25) + Math.pow(R(), 4) * 2.4, R() < (street ? 0.04 : 0.2) ? 1 : 0, street ? 0.4 + R() * 0.3 : R()], i * 4);   // phase, brightness, cool?, size
  }
  const seaG = new THREE.BufferGeometry();
  seaG.setAttribute('position', new THREE.BufferAttribute(sP, 3)); seaG.setAttribute('aS', new THREE.BufferAttribute(sS, 4));
  const seaMat = new THREE.ShaderMaterial({
    uniforms: { ...HU, uT: { value: 0 }, uScale: { value: 600 } },
    vertexShader: `attribute vec4 aS; uniform float uT, uScale; varying vec3 vCol; varying float vA;\n${HAZE}
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * w; float d = -mv.z;
  float s = uScale * (0.5 + 0.8 * aS.w) / d; float px = max(s, 1.6);
  float tw = 0.7 + 0.3 * sin(uT * (0.8 + 2.2 * aS.x) + aS.x * 60.0) * sin(uT * 0.37 + aS.x * 13.0);
  vA = aS.y * tw * min(1.0, (s * s) / (px * px) + 0.4) * (1.0 - hazeF(d) * 0.6);
  vCol = aS.z > 0.5 ? vec3(0.7, 0.82, 1.0) : mix(vec3(1.0, 0.78, 0.48), vec3(1.0, 0.58, 0.22), fract(aS.x * 7.13));
  gl_PointSize = min(px, 6.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vCol; varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; gl_FragColor = vec4(vCol * vA * exp(-r * 2.5) * 1.6, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sea = new THREE.Points(seaG, seaMat); sea.frustumCulled = false; scene.add(sea);

  // ---- the core: a ribbed obsidian monolith with panel seams, an inner lattice and an intake slot
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { ...HU, uGlow: { value: 0.3 }, uT: { value: 0 }, uTrunk: { value: TRUNK_X }, uHit: { value: [0, 0, 0, 0, 0] }, uKey: { value: new THREE.Vector3(0.75, 0.45, 0.35).normalize() } },
    vertexShader: `varying vec3 vW, vN, vC; varying float vF;\n${HAZE}
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vec3 d = w.xyz - cameraPosition; float fd = length(d); vC = hazeCol(d / fd); vF = hazeF(fd); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uGlow, uT; uniform float uTrunk[5], uHit[5]; uniform vec3 uKey; varying vec3 vW, vN, vC; varying float vF;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float h = vW.y, dI = h - ${CORE.intake.toFixed(1)};
  float facing = step(0.5, N.z);
  // large cladding panels on whichever face this is (x along the face, h up), each with its own sheen
  float fx = abs(N.z) > 0.5 ? vW.x : vW.z;
  vec2 pc = vec2(fx / 56.0, h / 84.0); float pv = h2(floor(pc));
  // glossy black: reflects the warm city glow low down and the cold sky high up
  vec3 Rv = reflect(-V, N);
  vec3 refl = mix(vec3(0.045, 0.03, 0.017), vec3(0.006, 0.01, 0.016), smoothstep(-0.25, 0.35, Rv.y));
  vec3 col = vec3(0.0025, 0.003, 0.0038) + refl * (0.05 + 0.7 * fr) * (0.6 + 0.7 * pv);
  // a cold moonlight key from up-right: catches the ribs' flanks and the monolith's right face
  col += vec3(0.05, 0.085, 0.11) * pow(max(dot(N, uKey), 0.0), 4.0) * (0.75 + 0.5 * pv);
  col += vec3(0.2, 0.55, 0.6) * fr * 0.04 * (0.4 + uGlow);
  // hairline seams between the panels
  vec2 g = abs(fract(pc) - 0.5) * vec2(56.0, 84.0);
  float seam = max(exp(-pow(28.0 - g.x, 2.0) * 2.0), exp(-pow(42.0 - g.y, 2.0) * 2.0));
  col *= 1.0 - 0.5 * seam;
  // inner lattice: vertical light lines that wake up as the core absorbs, pulses running up from the slot
  float lx = abs(fract(fx / 14.0) - 0.5) * 14.0;
  float line = exp(-pow(7.0 - lx, 2.0) * 3.0);
  float pulse = pow(0.5 + 0.5 * sin(dI * 0.06 - uT * 3.0 + floor(fx / 14.0) * 1.7), 12.0);
  col += vec3(0.25, 0.85, 0.8) * line * uGlow * exp(-max(dI, 0.0) / 160.0) * step(12.0, dI) * (0.006 + 0.3 * pulse) * facing;
  col += vec3(0.25, 0.85, 0.8) * seam * uGlow * exp(-abs(dI) / 60.0) * 0.02 * facing;
  // the city's glow lights the foot of the monolith; the top is lost in the night
  col += vec3(0.035, 0.02, 0.01) * exp(-max(h, 0.0) / 150.0) * (0.35 + 0.65 * facing);
  col *= mix(1.0, 0.45, smoothstep(650.0, 1300.0, h));
  // rib fronts carry a soft vertical sheen of the slot light
  float rib = step(${(FRONT + 0.5).toFixed(1)}, vW.z) * facing;
  col += vec3(0.3, 0.8, 0.76) * rib * exp(-abs(dI) / 30.0) * 0.07 * (0.3 + uGlow);
  // light spilling from the slot onto the face around it, and onto the lintel's underside / the sill's top
  col += vec3(0.3, 0.8, 0.76) * facing * exp(-abs(dI) / 16.0) * 0.06 * (0.3 + uGlow);
  float lipF = max(0.0, -N.y) * step(0.0, dI) + max(0.0, N.y) * step(dI, 0.0);
  col += vec3(0.35, 0.9, 0.85) * lipF * exp(-abs(abs(dI) - 10.0) / 2.5) * 0.6 * (0.3 + uGlow);
  // the intake slot: a thin band of light across the front face, hot where the trunks enter
  float slot = smoothstep(5.0, 3.2, abs(dI)) * facing;
  float hot = 0.0;
  for (int i = 0; i < 5; i++) hot += exp(-pow((vW.x - uTrunk[i]) / 14.0, 2.0)) * uHit[i];
  float ripple = 0.8 + 0.2 * sin(vW.x * 0.09 - uT * 3.0);
  col = mix(col, vec3(0.42, 0.95, 0.9) * (0.25 + 0.55 * uGlow) * (0.55 * ripple + 1.5 * hot), slot);
  gl_FragColor = vec4(mix(col, vC, vF * 0.3), 1.0);
}`,
  });
  const coreParts = [];
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d, 1, Math.max(1, Math.round(h / 40)), 1); g.translate(x, y, z); coreParts.push(g); };
  box(CORE.w, CORE.y1 - CORE.y0, CORE.d, CORE.x, (CORE.y0 + CORE.y1) / 2, CORE.z);
  // vertical ribs on the front face, interrupted by the slot; a heavy lintel above and sill below it
  for (let i = 0; i < 9; i++) {
    const x = CORE.x - CORE.w / 2 + 18 + i * ((CORE.w - 36) / 8), w = i % 4 === 0 ? 9 : 5, dz = i % 4 === 0 ? 6 : 3.5;
    box(w, CORE.intake - 12 - CORE.y0, dz, x, (CORE.y0 + CORE.intake - 12) / 2, FRONT + dz / 2);
    box(w, CORE.y1 - CORE.intake - 12, dz, x, (CORE.intake + 12 + CORE.y1) / 2, FRONT + dz / 2);
  }
  box(CORE.w + 6, 6, 9, CORE.x, CORE.intake + 13, FRONT + 4.5);
  box(CORE.w + 6, 5, 7, CORE.x, CORE.intake - 12.5, FRONT + 3.5);
  const core = new THREE.Mesh(mergeBoxes(coreParts), coreMat); scene.add(core);
  // haze glow around the slot (it grows as the core absorbs)
  const softT = glowTex([[0, 1], [0.3, 0.35], [1, 0]]);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softT, color: new THREE.Color(0.3, 0.8, 0.76), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.2, fog: false }));
  halo.position.set(CORE.x, CORE.intake, FRONT + 20); halo.scale.set(CORE.w * 1.25, 46, 1); scene.add(halo);
  const slotHaze = new THREE.Sprite(new THREE.SpriteMaterial({ map: softT, color: new THREE.Color(0.25, 0.7, 0.68), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.05, fog: false }));
  slotHaze.position.set(CORE.x, CORE.intake - 20, FRONT + 70); slotHaze.scale.set(CORE.w * 1.7, 220, 1); scene.add(slotHaze);
  const footHaze = new THREE.Sprite(new THREE.SpriteMaterial({ map: softT, color: new THREE.Color(0.9, 0.55, 0.28), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.1, fog: false }));
  footHaze.position.set(CORE.x, 40, FRONT + 90); footHaze.scale.set(1100, 260, 1); scene.add(footHaze);

  // ---- streams: tributaries lift out of the hot districts, bundle into columns, merge into five trunks
  const ribs = [];
  HOT.forEach(([hx, hz, hr], ci) => {
    const nT = 3 + Math.floor(R() * 3);
    const trunkOf = clamp(Math.round(((hx + 200) / 550) * 4), 0, 4);
    const col = new THREE.Vector3(hx + (R() - 0.5) * 40, 190 + R() * 80, hz - 40 - R() * 60);   // where the cluster's column bundles
    for (let j = 0; j < nT; j++) {
      const t = clamp(trunkOf + (R() < 0.3 ? (R() < 0.5 ? -1 : 1) : 0), 0, 4);
      const a = R() * TAU, rr = Math.sqrt(R()) * hr * 0.55;
      const O = new THREE.Vector3(hx + Math.cos(a) * rr, 0, hz + Math.sin(a) * rr);
      const I = new THREE.Vector3(TRUNK_X[t] + (R() - 0.5) * 6, CORE.intake + (R() - 0.5) * 6, FRONT + 1);
      const side = Math.sign(TRUNK_X[t] - CORE.x) || (R() < 0.5 ? -1 : 1);
      const C1 = col.clone().add(new THREE.Vector3((R() - 0.5) * 30, (R() - 0.5) * 30, (R() - 0.5) * 30));
      const C2 = new THREE.Vector3(TRUNK_X[t] + side * (10 + R() * 25), CORE.intake - 170 + (R() - 0.5) * 30, FRONT + 70 + (R() - 0.5) * 30);
      ribs.push({ O, C1, C2, I, t, speed: 0.055 + R() * 0.04, width: 3 + R() * 10, count: Math.round(30 + R() * 70), bright: 0.6 + R() * 0.8 });
    }
  });
  const atlas = glyphAtlas();
  const per = { aO: 3, aI: 3, aC1: 3, aC2: 3, aT: 4, aJ: 4 };
  const toks = [];
  for (const rb of ribs) {
    // tokens travel in bursts: a few packets per ribbon plus loose singles
    const bursts = Array.from({ length: 3 + Math.floor(R() * 5) }, () => ({ c: R(), s: 0.01 + R() * 0.04 }));
    for (let i = 0; i < rb.count * 2; i++) {
      const b = bursts[Math.floor(R() * bursts.length)], ph = R() < 0.35 ? b.c + (R() - 0.5) * b.s : R();
      const ic = icon === 'bubble' ? 0 : icon === 'thumb' ? 1 : (R() < 0.58 ? 0 : 1);
      toks.push({ rb, aT: [ph, rb.speed * (0.9 + R() * 0.2), 3.8 + R() * 2.4, ic], aJ: [(R() - 0.5) * rb.width, (R() - 0.5) * rb.width, R(), R()], br: rb.bright });
    }
  }
  const nTok = toks.length;
  // two quads per token: part 0 = glyph head, part 1 = trail
  const tokG = new THREE.BufferGeometry(), C = [-1, -1, 1, -1, 1, 1, -1, 1];
  const nQ = nTok * 2, corner = new Float32Array(nQ * 8), partA = new Float32Array(nQ * 4), brA = new Float32Array(nQ * 4), idx = new Uint32Array(nQ * 6);
  const attrs = {}; for (const k in per) attrs[k] = new Float32Array(nQ * 4 * per[k]);
  for (let q = 0; q < nQ; q++) {
    const tk = toks[q >> 1], src = { aO: tk.rb.O.toArray(), aI: tk.rb.I.toArray(), aC1: tk.rb.C1.toArray(), aC2: tk.rb.C2.toArray(), aT: tk.aT, aJ: tk.aJ };
    corner.set(C, q * 8);
    for (let v = 0; v < 4; v++) { for (const k in per) attrs[k].set(src[k], (q * 4 + v) * per[k]); partA[q * 4 + v] = q & 1; brA[q * 4 + v] = tk.br; }
    const a = q * 4; idx.set([a, a + 1, a + 2, a, a + 2, a + 3], q * 6);
  }
  tokG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nQ * 12), 3));
  tokG.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  tokG.setAttribute('aPart', new THREE.BufferAttribute(partA, 1));
  tokG.setAttribute('aBr', new THREE.BufferAttribute(brA, 1));
  for (const k in per) tokG.setAttribute(k, new THREE.BufferAttribute(attrs[k], per[k]));
  tokG.setIndex(new THREE.BufferAttribute(idx, 1));
  const tokMat = new THREE.ShaderMaterial({
    uniforms: { ...HU, uT: { value: 0 }, uRate: { value: rate / 2 }, uAtlas: { value: atlas }, uMid: { value: 0.03 }, uPix: { value: 0.001 } },
    vertexShader: `attribute vec2 corner; attribute vec3 aO, aI, aC1, aC2; attribute vec4 aT, aJ; attribute float aPart, aBr;
uniform float uT, uRate, uMid, uPix; varying vec2 vUv, vQ; varying vec3 vCol; varying float vA, vDof, vPart, vLen, vW, vGl;\n${HAZE}
vec3 bez(float s) { float u = 1.0 - s; return u*u*u*aO + 3.0*u*u*s*aC1 + 3.0*u*s*s*aC2 + s*s*s*aI; }
float warp(float u) { return u * (0.5 + 0.5 * u); }            // speeds up towards the intake
vec3 at(float s, out vec3 tng) {
  vec3 p = bez(s); tng = normalize(bez(min(s + 0.01, 1.0)) - bez(max(s - 0.01, 0.0)));
  vec3 sd = normalize(cross(tng, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 0.0, 0.001)), bn = cross(tng, sd);
  float wdt = mix(1.0, 0.12, smoothstep(0.45, 1.0, s)) * smoothstep(-0.05, 0.15, s);
  float wob = sin(uT * (0.7 + aJ.z) + s * 14.0 + aJ.z * 40.0);
  return p + (sd * aJ.x + bn * aJ.y) * wdt * (1.0 + 0.35 * wob);
}
void main(){
  float u = fract(aT.x + uT * aT.y);
  float s = warp(u);
  vec3 tng; vec3 p = at(s, tng);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  float sz = aT.z * mix(1.0, 0.55, smoothstep(0.7, 1.0, s)) * smoothstep(0.0, 0.04, s);
  float pix = uPix * max(d, 1.0);
  float gate = step(aJ.w, uRate);
  float fade = smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.95, 1.0, s));
  vA = gate * fade * aBr * (1.0 - hazeF(d) * 0.65) * smoothstep(40.0, 120.0, d) * (0.75 + 0.25 * sin(uT * (3.0 + 4.0 * aJ.z) + aJ.w * 50.0));
  vDof = clamp(max(smoothstep(260.0, 90.0, d), smoothstep(900.0, 1600.0, d) * 0.6), 0.0, 1.0);
  vCol = mix(vec3(1.0, 0.62, 0.28), vec3(0.42, 0.95, 0.9), smoothstep(0.3, 0.85, s));
  vPart = aPart;
  vec4 clip;
  if (aPart < 0.5) {
    float w = max(sz * 0.8, pix * 3.0);
    vA *= (sz * 0.8 / w) * (sz * 0.8 / w);
    float rot = 0.2 * sin(uT * 1.3 + aJ.w * 30.0);
    vec2 cr = vec2(corner.x * cos(rot) - corner.y * sin(rot), corner.x * sin(rot) + corner.y * cos(rot));
    mv.xy += cr * w;
    vUv = vec2(aT.w, 0.0);
    vQ = corner; vLen = 0.0; vW = w;
    clip = projectionMatrix * mv;
  } else {
    // trail: a short ribbon back along the path, longer as the token speeds up
    float s0 = warp(max(u - (0.016 + 0.16 * s * s * s), 0.0));
    vec3 t0; vec3 p0 = at(s0, t0);
    vec3 a = (viewMatrix * vec4(p0, 1.0)).xyz, b = mv.xyz;
    vec3 dir = b - a; float L = length(dir); dir = L > 1e-4 ? dir / L : vec3(0.0, 1.0, 0.0);
    float w = max(sz * 0.16, pix * (1.1 + 0.8 * s * s));
    vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + vec3(1e-4, 0.0, 0.0));
    vec3 q = mix(a, b, corner.x * 0.5 + 0.5) + side * corner.y * w;
    vQ = vec2(corner.x * 0.5 + 0.5, corner.y); vLen = L; vW = w;
    vA *= (0.6 + 1.2 * s * s) * clamp(sz * 0.16 / w, 0.0, 1.0) * (1.0 + 2.0 * s * s);
    vUv = vec2(0.0);
    clip = projectionMatrix * vec4(q, 1.0);
  }
  // keep the frame's middle band calm: tokens there dim to faint threads (screen space, by the head)
  vec4 hc = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float ys = (0.5 - 0.5 * hc.y / hc.w) * 1080.0;
  float band = smoothstep(290.0, 400.0, ys) * (1.0 - smoothstep(690.0, 800.0, ys));
  vA *= mix(1.0, uMid, band);
  vGl = (1.0 - band) * smoothstep(1000.0, 450.0, d) * (1.0 - smoothstep(0.8, 0.97, s));
  gl_Position = clip;
  if (vA < 0.002) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`,
    fragmentShader: `uniform sampler2D uAtlas; varying vec2 vUv, vQ; varying vec3 vCol; varying float vA, vDof, vPart, vLen, vW, vGl;
void main(){
  float a;
  if (vPart < 0.5) {
    // an orb of light with the glyph as its hot core: a point at distance, a readable glyph up close
    float r2 = dot(vQ, vQ);
    float orb = exp(-r2 * 5.0) * 0.55 + exp(-r2 * 18.0) * 0.6;
    vec2 gl = vQ * 1.45;
    float ga = 0.0;
    if (max(abs(gl.x), abs(gl.y)) < 1.0) {
      vec2 cuv = vec2((gl.x * 0.5 + 0.5) * 0.5 + vUv.x * 0.5, gl.y * 0.25 + 0.75);
      ga = mix(texture(uAtlas, cuv).a, texture(uAtlas, cuv - vec2(0.0, 0.5)).a * 0.7, vDof);
    }
    ga *= vGl;
    a = orb * (0.55 + 0.45 * vDof) * (1.4 - 0.4 * vGl) + ga * 0.8;
    if (a * vA < 0.004) discard;
    gl_FragColor = vec4((vCol * a + vec3(1.0, 0.93, 0.8) * ga * 0.35) * vA * 0.75, 1.0);
  } else {
    a = pow(vQ.x, 1.6) * exp(-vQ.y * vQ.y * 2.5);
    if (a * vA < 0.003) discard;
    gl_FragColor = vec4(vCol * a * vA, 1.0);
  }
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const tokens = new THREE.Mesh(tokG, tokMat); tokens.frustumCulled = false; scene.add(tokens);

  // lift-off: a soft vertical glow rising out of the city under every bundle (no ground decals)
  const liftT = glowTex([[0, 0.9], [0.25, 0.35], [0.6, 0.08], [1, 0]]);
  const lifts = [];
  for (const [hx, hz, hr] of HOT) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: liftT, color: new THREE.Color(1.0, 0.62, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.32, fog: false }));
    m.position.set(hx, 40, hz); m.scale.set(hr * 0.22, 120, 1); scene.add(m); lifts.push(m);
  }

  // ---- camera: crane up and tilt from the sea to the core (k-driven, any duration)
  const P0 = new THREE.Vector3(60, 140, 380), P1 = new THREE.Vector3(20, 190, 190);
  const T0 = new THREE.Vector3(70, -40, -240), T1 = new THREE.Vector3(0, 300, -560);
  const tgt = new THREE.Vector3();

  return {
    scene, camera,
    bloom: { strength: 0.7, radius: 0.5, threshold: 0.85 },
    exposure: 1.1,
    update(lt, c) {
      const e = ease.inOut(c.k) * 0.75 + c.k * 0.25;
      camera.position.lerpVectors(P0, P1, e);
      camera.position.x += noise(lt * 0.4 + 3) * 2; camera.position.y += noise(lt * 0.35 + 9) * 1.5;
      tgt.lerpVectors(T0, T1, ease.inOut(clamp(c.k * 1.05)));
      camera.lookAt(tgt);
      camera.fov = lerp(46, 40, e); camera.updateProjectionMatrix();
      const scale = 1080 / (2 * Math.tan((camera.fov * Math.PI) / 360));
      seaMat.uniforms.uT.value = lt; seaMat.uniforms.uScale.value = scale;
      tokMat.uniforms.uT.value = lt; tokMat.uniforms.uPix.value = 1 / scale;
      // the core wakes up as it absorbs; each trunk's entry flares with arrivals
      const glow = 0.3 + 0.7 * smooth(c.k * 1.15);
      coreMat.uniforms.uGlow.value = glow; coreMat.uniforms.uT.value = lt;
      for (let i = 0; i < 5; i++) coreMat.uniforms.uHit.value[i] = glow * (0.45 + 0.35 * noise(lt * 2.3 + i * 7.1) + 0.2 * noise(lt * 9 + i * 3.3));
      halo.material.opacity = 0.03 + 0.1 * glow; slotHaze.material.opacity = 0.02 + 0.06 * glow;
      for (const [i, m] of lifts.entries()) m.material.opacity = 0.26 + 0.08 * noise(lt * 1.5 + i * 5);
    },
  };
});

// merge plain BoxGeometries (position + normal only)
function mergeBoxes(list) {
  let n = 0; for (const g of list) n += g.index.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const P = g.attributes.position.array, Nn = g.attributes.normal.array, I = g.index.array;
    for (let i = 0; i < I.length; i++, o++) { pos.set(P.subarray(I[i] * 3, I[i] * 3 + 3), o * 3); nor.set(Nn.subarray(I[i] * 3, I[i] * 3 + 3), o * 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}
