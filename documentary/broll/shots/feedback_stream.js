// feedback_stream: "Your feedback becomes signal." Far below, a city-sized sea of tiny warm lights (people
// on phones). From bright points in it, ribbons of small glowing tokens (speech bubbles / thumbs-up glyphs)
// rise and swirl up into a towering obsidian monolith high above, whose seams and intake brighten as it
// absorbs them. Tokens cool from warm human amber to machine teal on the way up. The camera cranes and
// tilts up from the sea to the core.
//
// opts:
//   icon   'bubble' | 'thumb' | 'mixed' (default 'mixed')   glyph carried by the tokens
//   rate   0..2 token density (default 1)
//   seed   layout seed (default 11)
// Composition: the sea owns the bottom band, the core the top band; the middle band (y ~300-780) only
// carries thin, dim ribbon mid-sections, so a paper document (left) and an index card (right) read cleanly.
// Everything is a pure function of time (frames can be rendered out of order).
import { THREE, register, rng, noise, ease, smooth, clamp, lerp } from '../kit.js';

const TAU = Math.PI * 2;
const CORE = { x: 0, z: -430, w: 104, d: 36, y0: -30, y1: 540, intake: 430 };

// ---------------------------------------------------------------- helpers
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
// glyph atlas: left half a speech bubble, right half a thumbs-up; white on transparent with a soft glow
function glyphAtlas() {
  const [c, g] = canvas(512, 256);
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 22;
  // speech bubble
  rr(44, 54, 168, 112, 34); g.globalAlpha = 0.9; g.fill();
  g.beginPath(); g.moveTo(74, 150); g.lineTo(118, 160); g.lineTo(58, 214); g.closePath(); g.fill();
  g.globalAlpha = 1; g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(92 + i * 36, 110, 11, 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  // thumbs-up
  g.save(); g.translate(256, 0); g.shadowBlur = 22; g.globalAlpha = 0.92;
  rr(44, 118, 40, 100, 8); g.fill();                         // cuff
  rr(94, 112, 118, 106, 22); g.fill();                       // fist
  g.save(); g.translate(122, 118); g.rotate(-0.32); rr(-12, -92, 46, 104, 22); g.fill(); g.restore(); // thumb
  g.globalAlpha = 1; g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out'; g.lineWidth = 6; g.lineCap = 'round';
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(150, 112 + i * 26); g.lineTo(212, 112 + i * 26); g.stroke(); }
  g.beginPath(); g.moveTo(88, 112); g.lineTo(88, 218); g.stroke();
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapNearestFilter;
  return t;
}
// shared haze (per vertex): exp2 fog towards a colour that warms near the horizon (city glow) and cools upward
const HAZE = `
uniform vec3 uFogLo, uFogHi, uGlowCol; uniform float uFogDen;
vec3 hazeCol(vec3 vd) { return mix(uFogLo, uFogHi, smoothstep(-0.05, 0.5, vd.y)) + uGlowCol * exp(-abs(vd.y + 0.02) * 9.0); }
float hazeF(float d) { return 1.0 - exp(-uFogDen * uFogDen * d * d); }`;

register('feedback_stream', (opts) => {
  const icon = ['bubble', 'thumb', 'mixed'].includes(opts.icon) ? opts.icon : 'mixed';
  const rate = clamp(opts.rate ?? 1, 0, 2);
  const seed = opts.seed ?? 11;
  const R = rng(seed * 977 + 5);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090d);
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 1, 4000);
  const HU = {
    uFogLo: { value: new THREE.Color(0x0f0e0d) }, uFogHi: { value: new THREE.Color(0x05070a) },
    uGlowCol: { value: new THREE.Color(0xc98a50).multiplyScalar(0.07) }, uFogDen: { value: 0.0009 },
  };

  // ---- sky dome: night haze, warm light-pollution band at the horizon, cold above
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({
    uniforms: { ...HU },
    vertexShader: `varying vec3 vC;\n${HAZE}\nvoid main(){ vec4 w = modelMatrix * vec4(position, 1.0); vC = hazeCol(normalize(w.xyz - cameraPosition)); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }`,
    side: THREE.BackSide, depthWrite: false,
  }));
  sky.renderOrder = 5; scene.add(sky);

  // ---- the sea: ~30k phone lights in city-like clusters, twinkling; dark ground plane under them
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 60, 60), new THREE.ShaderMaterial({
    uniforms: { ...HU },
    vertexShader: `varying vec3 vC; varying float vF;\n${HAZE}\nvoid main(){ vec4 w = modelMatrix * vec4(position, 1.0); vec3 d = w.xyz - cameraPosition; float fd = length(d); vC = hazeCol(d / fd); vF = hazeF(fd); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vC; varying float vF; void main(){ gl_FragColor = vec4(mix(vec3(0.006, 0.006, 0.007), vC, vF), 1.0); }`,
  }));
  ground.rotation.x = -Math.PI / 2; ground.renderOrder = 4; scene.add(ground);
  const nSea = 42000, sP = new Float32Array(nSea * 3), sS = new Float32Array(nSea * 4);
  const districts = Array.from({ length: 26 }, () => ({
    x: (R() - 0.5) * 2600, z: -500 + (R() - 0.55) * 2300, r: 160 + R() * 380, ang: R() * Math.PI, blk: 55 + R() * 45, dens: 0.4 + R() * 0.6,
  }));
  // dense districts right under the lens so the foreground of the sea is rich
  for (const [x, z, r] of [[-60, 120, 260], [220, 40, 220], [-320, -60, 260], [80, -180, 240]]) districts.push({ x, z, r, ang: R() * Math.PI, blk: 42 + R() * 20, dens: 1 }, { x, z, r, ang: R() * Math.PI, blk: 42 + R() * 20, dens: 1 });
  for (let i = 0; i < nSea; i++) {
    const D = districts[Math.floor(R() * districts.length)];
    let u = (R() - 0.5) * 2 * D.r, v = (R() - 0.5) * 2 * D.r, kind = R();
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
  vA = aS.y * tw * min(1.0, (s * s) / (px * px) + 0.35) * (1.0 - hazeF(d) * 0.85);
  vCol = aS.z > 0.5 ? vec3(0.7, 0.82, 1.0) : mix(vec3(1.0, 0.78, 0.48), vec3(1.0, 0.58, 0.22), fract(aS.x * 7.13));
  gl_PointSize = min(px, 6.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vCol; varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; gl_FragColor = vec4(vCol * vA * exp(-r * 2.5) * 1.6, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sea = new THREE.Points(seaG, seaMat); sea.frustumCulled = false; scene.add(sea);

  // ---- the core: a towering obsidian monolith with chamfered edges, horizontal seams, an intake band
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { ...HU, uGlow: { value: 0.3 }, uT: { value: 0 }, uKey: { value: new THREE.Vector3(0.4, 0.3, 0.86).normalize() } },
    vertexShader: `varying vec3 vW, vN, vC; varying float vF;\n${HAZE}
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vec3 d = w.xyz - cameraPosition; float fd = length(d); vC = hazeCol(d / fd); vF = hazeF(fd) * 0.85; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uGlow, uT; uniform vec3 uKey; varying vec3 vW, vN, vC; varying float vF;
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float h = vW.y;
  // glossy black: reflect the warm city glow low down and the cold sky high up
  vec3 refl = mix(vec3(0.035, 0.024, 0.014), vec3(0.008, 0.012, 0.018), smoothstep(-0.2, 0.4, reflect(-V, N).y));
  vec3 col = vec3(0.003, 0.0035, 0.0045) + refl * (0.15 + 1.2 * fr);
  col += vec3(0.004, 0.005, 0.006) * max(dot(N, uKey), 0.0);
  col += vec3(0.25, 0.7, 0.68) * fr * 0.025 * (0.4 + uGlow);       // a cold edge so the silhouette reads against the dark
  // seams every 24 m, faint vertical seams; brighter towards the intake and with uGlow
  float sy = abs(fract(h / 37.0) - 0.5) * 37.0, sx = abs(abs(vW.x - ${CORE.x.toFixed(1)}) - ${(CORE.w / 2 - 4).toFixed(1)});
  float seam = exp(-sy * sy * 6.0) * 0.6 + exp(-sx * sx * 2.0) * 0.5;
  col += vec3(0.3, 0.8, 0.78) * fr * 0.05;
  float up = smoothstep(80.0, 430.0, h);
  float pulse = 0.6 + 0.4 * sin(h * 0.05 - uT * 2.4);
  col += vec3(0.25, 0.85, 0.8) * seam * (0.015 + 0.35 * uGlow * up * pulse);
  // intake band and crown
  float band = exp(-pow((h - 430.0) / 7.0, 2.0));
  col += vec3(0.42, 0.95, 0.9) * band * (0.3 + 3.0 * uGlow);
  float crown = smoothstep(500.0, 540.0, h);
  col += vec3(0.4, 0.8, 0.85) * crown * (0.08 + 0.6 * uGlow) * (0.5 + 0.5 * fr);
  gl_FragColor = vec4(mix(col, vC, vF * 0.35), 1.0);
}`,
  });
  const coreG = new THREE.BoxGeometry(1, 1, 1, 4, 60, 2);
  const core = new THREE.Mesh(coreG, coreMat);
  core.scale.set(CORE.w / 2, CORE.y1 - CORE.y0, CORE.d / 2);
  core.position.set(CORE.x, (CORE.y0 + CORE.y1) / 2, CORE.z);
  scene.add(core);
  // a soft cold halo where the ribbons enter, and a faint beam above the crown
  const glowTex = (() => { const [c, g] = canvas(128, 128); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.35, 0.85, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3, fog: false }));
  halo.position.set(CORE.x, CORE.intake, CORE.z + 30); halo.scale.set(200, 70, 1); scene.add(halo);

  // ---- ribbons of tokens: cubic beziers from glowing origins on the sea up into the intake
  const nRib = 16, perRib = 64, nTok = nRib * perRib;
  const ribs = [];
  for (let r = 0; r < nRib; r++) {
    // origins spread over the city in front of the core, never under the lens
    const O = new THREE.Vector3(CORE.x + ((r + 0.5) / nRib - 0.5) * 1500 + (R() - 0.5) * 150, 0, -60 - Math.pow(R(), 0.7) * 760);
    const side = Math.sign(O.x - CORE.x) || 1;
    const I = new THREE.Vector3(CORE.x + (R() - 0.5) * CORE.w * 0.8, CORE.intake + (R() - 0.5) * 10, CORE.z + CORE.d / 2 + 2);
    const C1 = O.clone().add(new THREE.Vector3((R() - 0.5) * 60, 140 + R() * 120, 40 + R() * 60));
    const C2 = I.clone().add(new THREE.Vector3(side * (120 + R() * 140), -120 - R() * 80, 140 + R() * 120));
    ribs.push({ O, I, C1, C2, speed: 0.07 + R() * 0.05, width: 6 + R() * 8 });
  }
  const atlas = glyphAtlas();
  const tP = { aO: 3, aI: 3, aC1: 3, aC2: 3, aT: 4, aJ: 4 }, tSrc = {};
  for (const k in tP) tSrc[k] = new Float32Array(nTok * tP[k]);
  for (let i = 0; i < nTok; i++) {
    const rb = ribs[i % nRib];
    tSrc.aO.set(rb.O.toArray(), i * 3); tSrc.aI.set(rb.I.toArray(), i * 3); tSrc.aC1.set(rb.C1.toArray(), i * 3); tSrc.aC2.set(rb.C2.toArray(), i * 3);
    const ic = icon === 'bubble' ? 0 : icon === 'thumb' ? 1 : (R() < 0.58 ? 0 : 1);
    tSrc.aT.set([R(), rb.speed * (0.85 + R() * 0.3), 9 + R() * 5, ic], i * 4);               // phase, speed, size, icon
    tSrc.aJ.set([(R() - 0.5) * rb.width, (R() - 0.5) * rb.width, R(), R()], i * 4);           // lateral jitter, wobble seed, gate
  }
  // expand to plain quads (one draw call)
  const tokG = new THREE.BufferGeometry(), C = [-1, -1, 1, -1, 1, 1, -1, 1];
  const corner = new Float32Array(nTok * 8), idx = new Uint32Array(nTok * 6);
  for (let i = 0; i < nTok; i++) { corner.set(C, i * 8); const a = i * 4; idx.set([a, a + 1, a + 2, a, a + 2, a + 3], i * 6); }
  tokG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nTok * 12), 3));
  tokG.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  for (const k in tP) { const sz = tP[k], out = new Float32Array(nTok * 4 * sz); for (let i = 0; i < nTok; i++) for (let v = 0; v < 4; v++) out.set(tSrc[k].subarray(i * sz, i * sz + sz), (i * 4 + v) * sz); tokG.setAttribute(k, new THREE.BufferAttribute(out, sz)); }
  tokG.setIndex(new THREE.BufferAttribute(idx, 1));
  const tokMat = new THREE.ShaderMaterial({
    uniforms: { ...HU, uT: { value: 0 }, uRate: { value: rate * 0.75 }, uAtlas: { value: atlas }, uMid: { value: 0.42 } },
    vertexShader: `attribute vec2 corner; attribute vec3 aO, aI, aC1, aC2; attribute vec4 aT, aJ;
uniform float uT, uRate, uMid; varying vec2 vUv; varying vec3 vCol; varying float vA;\n${HAZE}
vec3 bez(float s) { float u = 1.0 - s; return u*u*u*aO + 3.0*u*u*s*aC1 + 3.0*u*s*s*aC2 + s*s*s*aI; }
void main(){
  float s = fract(aT.x + uT * aT.y);
  vec3 p = bez(s);
  // ribbon width: wide where the stream lifts off, tight where it is sucked into the intake
  float wdt = mix(1.0, 0.15, smoothstep(0.55, 1.0, s));
  vec3 tng = normalize(bez(min(s + 0.01, 1.0)) - bez(max(s - 0.01, 0.0)));
  vec3 sd = normalize(cross(tng, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 0.0, 0.001)), bn = cross(tng, sd);
  float wob = sin(uT * (0.7 + aJ.z) + s * 18.0 + aJ.z * 40.0);
  p += (sd * aJ.x + bn * aJ.y) * wdt * (1.0 + 0.4 * wob);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float sz = aT.z * mix(1.0, 0.45, smoothstep(0.7, 1.0, s)) * smoothstep(0.0, 0.05, s);
  float rot = 0.25 * sin(uT * 1.3 + aJ.w * 30.0);
  vec2 cr = vec2(corner.x * cos(rot) - corner.y * sin(rot), corner.x * sin(rot) + corner.y * cos(rot));
  mv.xy += cr * sz * 0.5;
  vUv = vec2((corner.x * 0.5 + 0.5) * 0.5 + aT.w * 0.5, corner.y * 0.5 + 0.5);
  float d = -mv.z;
  float gate = step(aJ.w, uRate);
  float fade = smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.93, 1.0, s));
  // keep the ribbon mid-sections calm (they cross the frame's middle band); bright at both ends
  float calm = mix(1.0, uMid, smoothstep(0.18, 0.4, s) * (1.0 - smoothstep(0.62, 0.85, s)));
  vA = gate * fade * calm * (1.0 - hazeF(d) * 0.7) * smoothstep(70.0, 170.0, d);
  vCol = mix(vec3(1.0, 0.6, 0.26), vec3(0.42, 0.95, 0.9), smoothstep(0.3, 0.85, s)) * 1.3;
  gl_Position = projectionMatrix * mv;
  if (vA < 0.001) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`,
    fragmentShader: `uniform sampler2D uAtlas; varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){ float a = texture(uAtlas, vUv).a; if (a * vA < 0.004) discard; gl_FragColor = vec4(vCol * a * vA, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const tokens = new THREE.Mesh(tokG, tokMat); tokens.frustumCulled = false; scene.add(tokens);

  // ribbon origins: bright pools on the sea where the streams lift off; the trail of each ribbon is
  // drawn as a faint continuous filament (line strip) so the flow reads even between tokens
  const origins = new THREE.Group(); scene.add(origins);
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.6, 0.28), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4, fog: false });
  const poolG = new THREE.PlaneGeometry(44, 44); poolG.rotateX(-Math.PI / 2);
  for (const rb of ribs) { const m = new THREE.Mesh(poolG, poolMat); m.position.copy(rb.O).y = 1.5; origins.add(m); }
  const filP = [], filS = [];
  for (const rb of ribs) {
    const N = 64;
    for (let j = 0; j < N; j++) for (const t of [j / N, (j + 1) / N]) {
      const u = 1 - t, p = rb.O.clone().multiplyScalar(u * u * u).addScaledVector(rb.C1, 3 * u * u * t).addScaledVector(rb.C2, 3 * u * t * t).addScaledVector(rb.I, t * t * t);
      filP.push(p.x, p.y, p.z); filS.push(t);
    }
  }
  const filG = new THREE.BufferGeometry();
  filG.setAttribute('position', new THREE.Float32BufferAttribute(filP, 3)); filG.setAttribute('aS', new THREE.Float32BufferAttribute(filS, 1));
  const filMat = new THREE.ShaderMaterial({
    uniforms: { ...HU, uT: { value: 0 }, uMid: { value: 0.42 } },
    vertexShader: `attribute float aS; uniform float uT, uMid; varying float vA; varying float vS;\n${HAZE}
void main(){ vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0); vS = aS;
  vA = (0.25 + 0.75 * pow(0.5 + 0.5 * sin(aS * 40.0 - uT * 5.0), 3.0)) * (1.0 - hazeF(-mv.z) * 0.7) * mix(1.0, uMid, smoothstep(0.18, 0.4, aS) * (1.0 - smoothstep(0.62, 0.85, aS)));
  gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying float vS; void main(){ gl_FragColor = vec4(mix(vec3(1.0, 0.7, 0.4), vec3(0.4, 0.95, 0.9), smoothstep(0.25, 0.85, vS)) * vA * 0.35, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.LineSegments(filG, filMat));

  // ---- camera: crane up and tilt from the sea to the core
  const P0 = new THREE.Vector3(60, 115, 330), P1 = new THREE.Vector3(30, 210, 170);
  const T0 = new THREE.Vector3(0, 0, -220), T1 = new THREE.Vector3(0, 290, -430);
  const tgt = new THREE.Vector3();

  return {
    scene, camera,
    bloom: { strength: 0.75, radius: 0.55, threshold: 0.75 },
    exposure: 1.1,
    update(lt, c) {
      const e = ease.inOut(c.k) * 0.8 + c.k * 0.2;
      camera.position.lerpVectors(P0, P1, e);
      camera.position.x += noise(lt * 0.4 + 3) * 2; camera.position.y += noise(lt * 0.35 + 9) * 1.5;
      tgt.lerpVectors(T0, T1, ease.inOut(c.k));
      camera.lookAt(tgt);
      camera.fov = lerp(48, 42, e); camera.updateProjectionMatrix();
      const scale = 1080 / (2 * Math.tan((camera.fov * Math.PI) / 360));
      seaMat.uniforms.uT.value = lt; seaMat.uniforms.uScale.value = scale;
      tokMat.uniforms.uT.value = lt; filMat.uniforms.uT.value = lt;
      // the core brightens as it absorbs
      const glow = 0.25 + 0.75 * smooth(c.k * 1.1);
      coreMat.uniforms.uGlow.value = glow * (0.9 + 0.1 * Math.sin(lt * 6)); coreMat.uniforms.uT.value = lt;
      halo.material.opacity = 0.06 + 0.22 * glow;
    },
  };
});
