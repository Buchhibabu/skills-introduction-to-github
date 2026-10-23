// night_city: "A million users in five days. Critics called it unreliable. Users kept coming."
// Aerial night drone shot over a dense city. Before the launch the city is warm sodium light, traffic streams along
// the avenues, a handful of early screens flick on and one tower (patient zero) breathes cold light. On the launch
// the cold screen-light spreads from that tower outward like an epidemic: a ragged front with fingers along the
// districts, whole buildings igniting window by window, some blocks never converting.
//
// opts
//   waveFrom  0..1 of shot progress when patient zero ignites (default 0.08; the film uses ~0.43, on "Free.")
//   waveTo    0..1 of shot progress when the front reaches the haze (default 0.92); the front keeps moving after it
//   seed      layout seed for the city (default 11)
//   origin    [x, y] screen pixel where patient zero should sit when the wave starts (default [1270, 420]:
//             the gap between a left-hand document and a right-hand counter)
//
// Composition: horizon haze along the top, avenues and a boulevard recede diagonally. Keep text in the centre band
// (pre-wave) or left document + right counter (post-wave); patient zero lights in the gap at about x 1180-1360.
//
// Everything animated is computed in shaders from time and the wave radius, so every frame is a pure function of lt.
// Per-building arrival radius, immunity and early-adopter times are baked at build time from rng(seed).
import { THREE, register, rng, noise, ease, smooth, clamp, lerp } from '../kit.js';

const BX = 7, BZ = 11;            // main district block pitch (x, z): elongated blocks
const ST = 1.7, AV = 3.4, AVE = 4; // street width, avenue width, avenue every N x-streets
const SPX = 0.36, SPY = 0.40, GF = 0.5; // window pitch and ground-floor height
const RIVER_W = 9;
const riverZ = (x) => -118 + 26 * Math.sin(x * 0.011 + 0.6) + 9 * Math.sin(x * 0.031);
const OT = { ang: 0.52, cx: 10, cz: -170, p: 6.2, st: 1.3 };   // old town across the river: rotated grid
const BV = { px: -60, pz: 120, ang: -0.40, w: 3.2 };              // diagonal boulevard through the main grid
const BVd = [Math.cos(BV.ang), Math.sin(BV.ang)], BVn = [-Math.sin(BV.ang), Math.cos(BV.ang)];
const CITY_R = 330;
// smooth spatial warp of the epidemic (fingers along districts); mirrored exactly in GLSL below
const warp = (x, z) => 1 + 0.22 * Math.sin(x * 0.021 + 1.3) * Math.sin(z * 0.017 + 0.4) + 0.15 * Math.sin(x * 0.047 - z * 0.039 + 2.1);
const WARP_GLSL = /* glsl */`float warpF(vec2 p){ return 1.0 + 0.22 * sin(p.x * 0.021 + 1.3) * sin(p.y * 0.017 + 0.4) + 0.15 * sin(p.x * 0.047 - p.y * 0.039 + 2.1); }`;

const COMMON = /* glsl */`
uniform vec3 uFogColor; uniform float uFogDen; uniform float uFogLow; uniform float uFogH;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fogF(vec3 wp){
  float d = distance(wp, cameraPosition);
  float dens = uFogDen + uFogLow * exp(-max(wp.y, 0.0) / uFogH);
  return 1.0 - exp(-pow(d * dens, 2.0));
}
vec3 hazeCol(vec3 wp){
  vec3 D = normalize(wp - cameraPosition);
  return uFogColor + vec3(0.020, 0.016, 0.012) * exp(-max(D.y, 0.0) * 9.0);
}
${WARP_GLSL}
`;

register('night_city', (opts) => {
  const dur = Math.max(0.5, (opts.t1 ?? 8) - (opts.t0 ?? 0));
  const waveFrom = opts.waveFrom ?? 0.08, waveTo = Math.max(opts.waveTo ?? 0.92, waveFrom + 0.05), seed = opts.seed ?? 11;
  const target = opts.origin ?? [1270, 420];
  const R = rng(seed * 7919 + 3);
  const waveSec = waveFrom * dur;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color().setRGB(0.004, 0.005, 0.008);
  const FOV = 34;
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 5000);

  // ---------------- camera path: constant-velocity descending push with a slow turn and a slight bank ----------------
  const PSI = 0.42;                       // heading relative to the street grid: the avenues recede on a diagonal
  const S0 = new THREE.Vector3(-128, 104, 262);
  const camAt = (k, lt, out, look) => {
    const m = lerp(k, ease.out(k), 0.3);  // moving from frame 1, settling a little at the end
    const yaw = PSI + lerp(-0.10, 0.20, m);
    const fwd = [Math.sin(PSI), -Math.cos(PSI)], right = [Math.cos(PSI), Math.sin(PSI)];
    const tr = 132 * m, side = lerp(0, -10, m);
    const x = S0.x + fwd[0] * tr + right[0] * side + noise(lt * 0.35 + 3) * 0.5;
    const z = S0.z + fwd[1] * tr + right[1] * side;
    const y = lerp(S0.y, 58, m) + noise(lt * 0.3 + 9) * 0.35;
    const pitch = lerp(0.285, 0.265, m);
    out.set(x, y, z);
    look.set(x + Math.sin(yaw) * Math.cos(pitch) * 100, y - Math.sin(pitch) * 100, z - Math.cos(yaw) * Math.cos(pitch) * 100);
    return lerp(-0.065, -0.025, m) + noise(lt * 0.25 + 1) * 0.004; // bank
  };
  const placeCam = (cam, k, lt) => {
    const p = new THREE.Vector3(), l = new THREE.Vector3();
    const bank = camAt(k, lt, p, l);
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(l); cam.rotateZ(bank);
    cam.updateMatrixWorld(true);
  };

  // path frusta (slightly widened) for build-time culling of everything that is never on screen
  const frusta = [], camPts = [];
  {
    const c = new THREE.PerspectiveCamera(FOV * 1.12, 16 / 9 * 1.04, 0.5, 5000);
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      placeCam(c, k, k * dur);
      c.updateProjectionMatrix();
      const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
      frusta.push(f); camPts.push(c.position.clone());
    }
  }
  const sph = new THREE.Sphere();
  const visible = (x, y, z, r, far = 560) => {
    sph.center.set(x, y, z); sph.radius = r;
    for (let i = 0; i < frusta.length; i++) {
      if (camPts[i].distanceTo(sph.center) - r > far) continue;
      if (frusta[i].intersectsSphere(sph)) return true;
    }
    return false;
  };

  // ---------------- city layout ----------------
  // districts are anchored to screen positions along the camera path, so the composition survives path tweaks
  const hitCam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 5000);
  const groundAt = (k, sx, sy) => {
    placeCam(hitCam, k, k * dur); hitCam.updateProjectionMatrix();
    const d = new THREE.Vector3((sx / 1920) * 2 - 1, 1 - (sy / 1080) * 2, 0.5).unproject(hitCam).sub(hitCam.position).normalize();
    const t = -hitCam.position.y / d.y;
    return [hitCam.position.x + d.x * t, hitCam.position.z + d.z * t];
  };
  const centres = [
    [...groundAt(0.6, 640, 560), 1.0, 46],          // downtown, left of centre (its skyline rises above a left document)
    [...groundAt(waveFrom, 1270, 760), 0.6, 12],    // patient zero's spire, in the gap right of the document
    [...groundAt(0.4, 240, 470), 0.55, 40],
    [...groundAt(0.9, 1000, 330), 0.6, 45],         // a far cluster on the skyline
    [...groundAt(0.9, 1750, 380), 0.3, 40],
    [...groundAt(0.5, 400, 300), 0.45, 50],
  ];
  const downtown = (x, z) => centres.reduce((a, [cx, cz, s, r]) => a + s * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r)), 0);
  const lots = []; // {x, z, w, d, h, y, rot, kind, seed}
  const add = (x, z, w, d, h, y, rot, kind, s) => { lots.push({ x, z, w, d, h, y, rot, kind, s }); };
  const onBoulevard = (x, z, r) => Math.abs((x - BV.px) * BVn[0] + (z - BV.pz) * BVn[1]) < BV.w * 0.5 + r;
  const inRiver = (x, z, m = 0) => Math.abs(z - riverZ(x)) < RIVER_W + m;
  const fillBlock = (cx, cz, iw, id, rot, dt, oldTown) => {
    // each block has its own random stream, so culling or path tweaks never reshuffle the rest of the city
    const R = rng(((Math.round(cx * 10) * 73856093) ^ (Math.round(cz * 10) * 19349663) ^ (seed * 83492791)) >>> 0);
    // split a block (local width iw along its x, depth id along its z) into lots
    const tower = R() < 0.6 * dt;
    const sx = tower ? 1 : (iw > 5 ? (R() < 0.6 ? 2 : 1) : 1);
    const sz = tower ? (id > 8 ? 2 : 1) : Math.max(1, Math.round(id / (2.2 + R() * 2.5)));
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let a = 0; a < sx; a++) {
      for (let b = 0; b < sz; b++) {
        const lw = iw / sx, ld = id / sz;
        const lx = -iw / 2 + lw * (a + 0.5), lz = -id / 2 + ld * (b + 0.5);
        const x = cx + c * lx + s * lz, z = cz - s * lx + c * lz;
        if (!oldTown && onBoulevard(x, z, Math.min(lw, ld) * 0.5)) continue;
        if (inRiver(x, z, 1.5)) continue;
        const set = 0.1 + R() * 0.25;
        const w = lw - set * 2, d = ld - set * 2;
        if (w < 0.6 || d < 0.6) continue;
        let h;
        if (tower) h = 9 + 46 * dt * (0.35 + R() * 0.85);
        else h = (0.8 + R() * 1.8) * (1 + 3.2 * dt * (0.3 + R()));
        if (oldTown) h = Math.min(h, 2.2 + R() * 3.5 + 22 * dt * R() * R());
        h = Math.min(h, 64, 11 * Math.min(w, d) + 2);
        // cull what the drone never sees
        if (!visible(x, h / 2, z, Math.hypot(w, d, h) / 2, h > 18 ? 660 : 520)) continue;
        const near = Math.min(...camPts.map((cp) => Math.hypot(cp.x - x, cp.z - z))) < 230;
        add(x, z, w, d, h, 0, rot, 0, R() * 97.3 + 1);
        const top = h;
        if (h > 12 && R() < 0.6) { // stepped crown
          const f = 0.5 + R() * 0.3, h2 = h * (0.08 + R() * 0.22);
          add(x, z, w * f, d * f, h2, h, rot, 0, R() * 97.3 + 1);
          if (R() < 0.35) add(x, z, w * f * 0.5, d * f * 0.5, h2 * 0.6, h + h2, rot, 0, R() * 97.3 + 1);
        }
        // rooftop clutter: plant rooms, water tanks, antennas
        if (near && w > 1.0 && d > 1.0) {
          const nU = Math.floor(R() * 3);
          for (let u = 0; u < nU; u++) {
            const ux = (R() - 0.5) * (w - 0.7), uz = (R() - 0.5) * (d - 0.7);
            const uw = 0.25 + R() * Math.min(1.2, w * 0.3), ud = 0.25 + R() * Math.min(1.2, d * 0.3);
            add(x + c * ux + s * uz, z - s * ux + c * uz, uw, ud, 0.22 + R() * 0.3, top, rot, 1, R() * 97.3 + 1);
          }
          if (h > 2.5 && h < 16 && R() < 0.45) {
            const ux = (R() - 0.5) * (w - 0.8), uz = (R() - 0.5) * (d - 0.8);
            tanks.push([x + c * ux + s * uz, top, z - s * ux + c * uz, 0.16 + R() * 0.14]);
          }
          if (h > 18 && R() < 0.55) add(x, z, 0.07, 0.07, 1.5 + R() * 4.5, top, rot, 1, R() * 97.3 + 1);
        }
      }
    }
  };
  const tanks = [];
  // main district (north bank, toward the camera)
  for (let i = -48; i <= 48; i++) {
    for (let j = -14; j <= 30; j++) {
      const x0 = i * BX, x1 = (i + 1) * BX, z0 = j * BZ, z1 = (j + 1) * BZ;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.hypot(cx, cz + 40) > CITY_R) continue;
      if (cz - BZ / 2 < riverZ(cx) + RIVER_W + 1) continue;
      if (R() < 0.03) continue; // parks and empty lots
      const hwW = (((i % AVE) + AVE) % AVE === 0 ? AV : ST) / 2, hwE = ((((i + 1) % AVE) + AVE) % AVE === 0 ? AV : ST) / 2;
      const iw = BX - hwW - hwE, id = BZ - ST;
      fillBlock(x0 + hwW + iw / 2, cz, iw, id, 0, downtown(cx, cz), false);
    }
  }
  // old town (across the river): a rotated grid of small blocks
  {
    const c = Math.cos(OT.ang), s = Math.sin(OT.ang);
    for (let i = -50; i <= 50; i++) {
      for (let j = -50; j <= 50; j++) {
        const lx = (i + 0.5) * OT.p, lz = (j + 0.5) * OT.p;
        const x = OT.cx + c * lx + s * lz, z = OT.cz - s * lx + c * lz;
        if (Math.hypot(x, z + 40) > CITY_R) continue;
        if (z + OT.p * 0.6 > riverZ(x) - RIVER_W - 1) continue;
        if (R() < 0.05) continue;
        fillBlock(x, z, OT.p - OT.st, OT.p - OT.st, OT.ang, downtown(x, z), true);
      }
    }
  }

  // ---------------- patient zero: the tall tower closest to the requested screen point when the wave starts ----------------
  const pzCam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 5000);
  placeCam(pzCam, waveFrom, waveSec);
  pzCam.updateProjectionMatrix();
  let pz = null, best = 1e9;
  const v = new THREE.Vector3();
  for (const L of lots) {
    if (L.kind !== 0 || L.y > 0 || L.h < 16) continue;
    v.set(L.x, L.h * 0.75, L.z).project(pzCam);
    const sx = (v.x * 0.5 + 0.5) * 1920, sy = (0.5 - v.y * 0.5) * 1080;
    const dsc = Math.hypot(sx - target[0], (sy - target[1]) * 1.3) - L.h * 2.0;
    if (v.z < 1 && dsc < best) { best = dsc; pz = L; }
  }
  const O = pz ? [pz.x, pz.z] : [30, -20];
  const pzTop = pz ? pz.h : 20;

  // per-building wave data: arrival radius (warped + jittered), immunity, early-adopter time, kind
  const blockHash = (x, z) => { const h = Math.sin(Math.floor(x / 14) * 12.9898 + Math.floor(z / 14) * 78.233) * 43758.5453; return h - Math.floor(h); };
  lots.forEach((L) => {
    const d = Math.hypot(L.x - O[0], L.z - O[1]);
    L.rho = d * warp(L.x, L.z) + R() * 9 * (d > 4 ? 1 : 0);
    L.immune = (blockHash(L.x, L.z) < 0.10 || R() < 0.14) && d > 12 ? 1 : 0;
    L.early = (L.kind === 0 && R() < 0.07 && waveSec > 0.6) ? waveSec * Math.sqrt(R()) * 0.95 : -1;
    if (pz && L.x === pz.x && L.z === pz.z) { L.kind = L.kind === 0 ? 2 : L.kind; L.rho = 0; L.immune = 0; }
  });

  // sort front-to-back from the camera's average position so early-z rejects hidden facades
  const camAvg = camPts[5];
  lots.sort((A, B) => Math.hypot(A.x - camAvg.x, A.z - camAvg.z) - Math.hypot(B.x - camAvg.x, B.z - camAvg.z));

  const fogU = {
    uFogColor: { value: new THREE.Color(0.014, 0.016, 0.021) },
    uFogDen: { value: 0.0016 },
    uFogLow: { value: 0.0013 },
    uFogH: { value: 6.0 },
  };
  const U = {
    ...fogU,
    uR: { value: -1 },
    uO: { value: new THREE.Vector2(O[0], O[1]) },
    uT: { value: 0 },
    uWaveT: { value: waveSec },
  };

  // ---------------- buildings ----------------
  // One merged static mesh (no instancing): every per-face constant (window grid, building hashes, lit fractions)
  // is precomputed here, so the vertex shader only evaluates the per-frame wave state and fog.
  // The fragment shader resolves window cells (near), floors (middle) or nothing (far).
  const bMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uPre: { value: 0 }, uBreathe: { value: 1 } },
    vertexShader: /* glsl */`
      ${COMMON}
      uniform float uR; uniform float uT; uniform float uPre; uniform float uBreathe;
      attribute vec2 aUV; attribute vec2 aYH; attribute vec4 aF; attribute vec4 aB; attribute vec4 aW;
      // aF: face id (-1 roof), cols, floors, onGround; aB: seed, bh2, glass, pWarm;
      // aW: arrival radius, immune, early-adopter time, kind (0 bldg, 1 bare, 2 patient zero)
      varying vec2 vUV; varying vec2 vYH; varying float vFog;
      flat varying vec4 vF;      // face id (-1 roof), cols, floors, onGround
      flat varying vec4 vP;      // lo.x, lo.y, glass, patient-zero pre-launch glow
      flat varying vec4 vA;      // far-field average colour, pWarm
      flat varying vec4 vL;      // middle-field lit colour, pWave
      flat varying vec4 vS;      // arrival radius, early time, wave-in, seed
      flat varying vec3 vBody;
      void main(){
        float immune = aW.y, isPZ = step(1.5, aW.w);
        float waveIn = clamp((uR - aW.x) / 10.0, 0.0, 1.0) * (1.0 - 0.8 * immune);
        float glass = aB.z;
        vec2 lo = mix(vec2(0.20, 0.24), vec2(0.06, 0.12), glass);
        float areaX = 1.0 - 2.0 * lo.x, areaY = 1.0 - 2.0 * lo.y;
        float pWarm = aB.w;
        float pWave = mix(mix(0.36, 0.03, immune), 0.75, isPZ);
        float pre = isPZ * uPre;
        float earlyF = 0.22 * step(0.0, aW.z) * step(aW.z + 0.6, uT);
        vec3 warm = vec3(1.00, 0.58, 0.26), cold = vec3(0.45, 0.83, 0.94);
        vec3 pane = vec3(0.006, 0.008, 0.012) * (1.0 + glass);
        float pw = pWave * waveIn;
        vec3 litMix = pWarm * (1.0 - pw) * warm * 1.4 + (pw + earlyF) * cold * 1.1;
        vA = vec4(min((litMix + pre * 0.12 * cold + (1.0 - pWarm) * (1.0 - pw) * pane) * areaX * areaY * 0.5, vec3(0.16)), pWarm);
        vL = vec4(mix(pane, litMix + pre * 0.16 * cold * uBreathe, 0.85) * areaX, pWave);
        vP = vec4(lo, glass, pre * uBreathe);
        vS = vec4(aW.x, aW.z, waveIn, aB.x);
        vF = aF; vUV = aUV; vYH = aYH;
        vBody = mix(vec3(0.008, 0.009, 0.012), vec3(0.016, 0.014, 0.013), aB.y);
        vFog = fogF(position);
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${COMMON}
      uniform float uR; uniform float uT;
      varying vec2 vUV; varying vec2 vYH; varying float vFog;
      flat varying vec4 vF; flat varying vec4 vP; flat varying vec4 vA; flat varying vec4 vL; flat varying vec4 vS; flat varying vec3 vBody;
      void main(){
        vec3 vHaze = uFogColor + vec3(0.020, 0.016, 0.012);
        vec3 warm = vec3(1.00, 0.58, 0.26);
        float vSeedF = vS.w;
        vec3 body = vBody + vS.z * max(0.0, 1.0 - vYH.x / 6.0) * vec3(0.004, 0.009, 0.014);
        vec3 col;
        if (vF.x < -0.5) {
          // ---- roof: near black, a faint parapet rim, rooftop units ----
          vec2 lp = vUV;
          float edge = min(min(lp.x, vF.y - lp.x), min(lp.y, vF.z - lp.y));
          vec2 rf = abs(fract(lp / 0.7) - 0.5);
          float hb = hash12(floor(lp / 0.7) + vSeedF);
          float unit = step(0.82, hb) * step(max(rf.x, rf.y), 0.3) * step(0.3, edge);
          col = body * (0.9 + 0.6 * (1.0 - smoothstep(0.0, 0.07, edge))) + unit * (vec3(0.010, 0.011, 0.013) + step(0.988, hb) * warm * 0.7);
        } else {
          // ---- facade ----
          vec2 uv = vUV;
          float cols = vF.y, floors = vF.z, onGround = vF.w, y = vYH.x;
          float inGrid = step(0.0, uv.x) * step(uv.x, cols) * step(0.0, uv.y) * step(uv.y, floors);
          vec2 fw = max(fwidth(uv), vec2(1e-4));
          float farY = smoothstep(0.28, 0.75, fw.y);
          vec3 wl = vA.rgb * inGrid;
          float winA = 0.0;
          if (farY < 0.999) {
            float farX = smoothstep(0.28, 0.75, fw.x);
            vec2 lo = vP.xy, hi = 1.0 - vP.xy;
            vec2 cell = floor(uv), f = uv - cell;
            float wy = clamp((f.y - lo.y) / fw.y + 0.5, 0.0, 1.0) * clamp((hi.y - f.y) / fw.y + 0.5, 0.0, 1.0) * inGrid;
            vec3 near = vec3(0.0);
            float win = 0.0;
            if (farX < 0.999) {
              float wx = clamp((f.x - lo.x) / fw.x + 0.5, 0.0, 1.0) * clamp((hi.x - f.x) / fw.x + 0.5, 0.0, 1.0);
              win = wx * wy;
              // glass office towers switch on in zones along a floor; homes window by window
              float glass = vP.z;
              float h1 = hash12(vec2(glass > 0.5 ? floor(cell.x / 5.0) : cell.x, cell.y) + vSeedF);
              float h2 = fract(h1 * 37.71 + 0.13), h3 = fract(h1 * 113.37 + 0.41);
              float holes = mix(1.0, step(0.18, fract(h1 * 7.31 + cell.x * 0.618)), glass);
              float warmOn = step(h1, vA.w) * holes;
              float age = uR - (vS.x + h2 * 10.0);
              float waveOn = step(h3, vL.w) * step(0.0, age) * holes;
              // early adopters flick on before the launch; patient zero breathes
              float eAge = uT - (vS.y + h2 * 1.5);
              float early = step(0.0, vS.y) * step(h3, 0.22) * step(0.0, eAge) * mix(step(0.5, fract(eAge * 11.0)), 1.0, step(0.35, eAge));
              float pzOn = step(h3, 0.22) * step(0.001, vP.w);
              float coldOn = max(max(waveOn, early), pzOn);
              float fl = max(0.0, 1.0 - max(age, 0.0) * 0.05);
              vec3 scr = mix(vec3(0.50, 0.72, 1.00), vec3(0.40, 0.95, 0.88), step(0.6, h1)) * (0.8 + 0.7 * h2)
                       * mix(1.0, 1.0 + 1.1 * fl * fl, waveOn) * mix(1.0, vP.w * 1.4, pzOn * (1.0 - max(waveOn, early)));
              vec3 pane = vec3(0.006, 0.008, 0.012) * (1.0 + glass);
              vec3 cellCol = mix(warmOn * warm * (1.0 + 1.1 * h2), scr, coldOn) * (0.75 + 0.35 * f.y);
              near = mix(pane, cellCol, max(warmOn, coldOn)) * win;
            }
            if (farX > 0.001) {
              // middle field: columns merge but floors still resolve (grazing walls stay banded, never a flat slab)
              float rowH = hash12(vec2(cell.y, vSeedF * 0.37));
              near = mix(near, vL.rgb * (0.25 + 1.5 * rowH * rowH) * wy, farX);
              win = mix(win, wy * 0.8, farX);
            }
            wl = mix(near, wl, farY);
            winA = win * (1.0 - farY);
          }
          float g = max(0.0, 1.0 - y / 2.6);
          col = (body * (0.8 + 0.4 * (1.0 - winA)) + g * g * onGround * warm * 0.10) * (1.0 - winA) + wl;
          // ground-floor storefronts
          float hc = vYH.y;
          float shop = step(0.35, fract(vSeedF * 1.31)) * onGround * step(0.5, floors);
          float sf = step(0.08, y) * step(y, 0.40) * step(abs(hc), 0.5 * (cols * ${SPX.toFixed(3)}) - 0.05);
          col += warm * shop * sf * (0.25 + 0.45 * fract(floor(hc / 0.9) * 0.37 + vSeedF * 0.71));
        }
        gl_FragColor = vec4(mix(col, vHaze, vFog), 1.0);
      }`,
  });
  const FACES = [   // unit box faces (y 0..1), corners counter-clockwise seen from outside; the bottom is never seen
    { id: 0, n: 'x', c: [[0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5]] },
    { id: 1, n: 'x', c: [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]] },
    { id: 2, n: 'z', c: [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]] },
    { id: 3, n: 'z', c: [[0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]] },
    { id: -1, n: 'y', c: [[-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5]] },
  ];
  {
    const nb = lots.length, NV = nb * 20;
    const pos = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), yh = new Float32Array(NV * 2);
    const aF = new Float32Array(NV * 4), aB = new Float32Array(NV * 4), aWv = new Float32Array(NV * 4);
    const idx = new Uint32Array(nb * 30);
    const R2 = rng(seed * 31 + 7);
    const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    let v = 0, ii = 0;
    for (const L of lots) {
      const c = Math.cos(L.rot), sn = Math.sin(L.rot);
      const onG = L.y <= 0.01 ? 1 : 0, gf = GF * onG;
      const bh = R2(), bh2 = R2(), glass = bh > 0.62 ? 1 : 0;
      const floors = L.kind === 1 ? 0 : Math.max(0, Math.floor((L.h - gf - 0.18) / SPY));
      const pWarm = 0.08 + 0.12 * bh2 + 0.06 * (1 - sstep(4, 16, floors));
      for (const F of FACES) {
        const base = v;
        const width = F.n === 'x' ? L.d : L.w;
        const cols = Math.max(1, Math.floor((width - 0.1) / SPX)), margin = (width - cols * SPX) * 0.5;
        for (const [lx, ly, lz] of F.c) {
          const px = lx * L.w, py = ly * L.h, pz = lz * L.d;
          pos[v * 3] = L.x + c * px + sn * pz; pos[v * 3 + 1] = L.y + py; pos[v * 3 + 2] = L.z - sn * px + c * pz;
          if (F.id < 0) {
            uv[v * 2] = (lx + 0.5) * L.w; uv[v * 2 + 1] = (lz + 0.5) * L.d;
            yh[v * 2] = py; yh[v * 2 + 1] = 0;
            aF.set([-1, L.w, L.d, onG], v * 4);
          } else {
            const hc = ((F.n === 'x' ? lz : lx) + 0.5) * width;
            uv[v * 2] = (hc - margin) / SPX; uv[v * 2 + 1] = (py - gf) / SPY;
            yh[v * 2] = py; yh[v * 2 + 1] = hc - width * 0.5;
            aF.set([F.id, cols, floors, onG], v * 4);
          }
          aB.set([L.s * 13.7 + F.id * 1.7, bh2, glass, pWarm], v * 4);
          aWv.set([L.rho, L.immune, L.early, L.kind], v * 4);
          v++;
        }
        idx.set([base, base + 1, base + 2, base, base + 2, base + 3], ii); ii += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aYH', new THREE.BufferAttribute(yh, 2));
    g.setAttribute('aF', new THREE.BufferAttribute(aF, 4));
    g.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
    g.setAttribute('aW', new THREE.BufferAttribute(aWv, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    var bMesh = new THREE.Mesh(g, bMat);
    bMesh.frustumCulled = false;
    bMesh.renderOrder = 0;
    scene.add(bMesh);
  }
  const m4 = new THREE.Matrix4();

  // water tanks: little dark cylinders with a faint rim, on legs
  if (tanks.length) {
    const tg = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
    tg.translate(0, 0.5, 0);
    const tm = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`${COMMON} varying float vFog; varying float vL; varying float vY;
        void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vFog = fogF(wp.xyz);
          vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal); vL = 0.5 + 0.5 * dot(n, normalize(vec3(-0.5, 0.6, 0.6))); vY = position.y;
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`${COMMON} varying float vFog; varying float vL; varying float vY;
        void main(){ vec3 c = vec3(0.016, 0.014, 0.012) * (0.6 + 0.8 * vL) + vec3(0.03, 0.018, 0.01) * smoothstep(0.9, 1.0, vY);
          gl_FragColor = vec4(mix(c, hazeCol(vec3(0.0, -1.0, 0.0) + cameraPosition), vFog), 1.0); }`,
    });
    const tMesh = new THREE.InstancedMesh(tg, tm, tanks.length);
    tanks.forEach(([x, y, z, r], i) => { m4.compose(new THREE.Vector3(x, y + 0.18, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 2.6, r)); tMesh.setMatrixAt(i, m4); });
    tMesh.frustumCulled = false;
    scene.add(tMesh);
  }

  // ---------------- ground: streets, avenues, the boulevard, sodium light, river ----------------
  // a tessellated plane: everything smooth (fog, haze, river curve, rotated coordinates, wave spill) is per vertex
  const gGeo = new THREE.PlaneGeometry(2400, 2400, 240, 240);
  gGeo.rotateX(-Math.PI / 2);
  gGeo.translate(0, 0, -250);
  const gMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      ${COMMON}
      uniform float uR; uniform vec2 uO;
      varying vec2 vP; varying vec2 vQ; varying float vRz; varying float vFogV; varying vec3 vHazeV; varying float vIn;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xz;
        vRz = -118.0 + 26.0 * sin(wp.x * 0.011 + 0.6) + 9.0 * sin(wp.x * 0.031);
        float c = cos(${OT.ang.toFixed(3)}), s = sin(${OT.ang.toFixed(3)});
        vec2 r = wp.xz - vec2(${OT.cx.toFixed(1)}, ${OT.cz.toFixed(1)});
        vQ = vec2(c * r.x - s * r.y, s * r.x + c * r.y);
        vFogV = fogF(wp.xyz); vHazeV = hazeCol(wp.xyz);
        vIn = clamp((uR - distance(wp.xz, uO) * warpF(wp.xz)) / 30.0, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${COMMON}
      uniform float uT;
      varying vec2 vP; varying vec2 vQ; varying float vRz; varying float vFogV; varying vec3 vHazeV; varying float vIn;
      void main(){
        if (vFogV > 0.985) { gl_FragColor = vec4(vHazeV, 1.0); return; }
        vec2 p = vP;
        float rz = vRz;
        float d, hw, along, lum;
        if (p.y < rz - ${RIVER_W.toFixed(1)}) {
          // old town: rotated grid
          float P = ${OT.p.toFixed(2)};
          vec2 qq = vQ;
          float dx = abs(qq.x - floor(qq.x / P + 0.5) * P), dz = abs(qq.y - floor(qq.y / P + 0.5) * P);
          d = min(dx, dz); hw = ${(OT.st / 2).toFixed(2)}; along = dx < dz ? qq.y : qq.x; lum = 0.75;
        } else {
          float ix = floor(p.x / ${BX.toFixed(1)} + 0.5);
          float dx = abs(p.x - ix * ${BX.toFixed(1)});
          float ave = step(abs(mod(ix, ${AVE.toFixed(1)})), 0.5);
          float hwx = mix(${(ST / 2).toFixed(2)}, ${(AV / 2).toFixed(2)}, ave);
          float dz = abs(p.y - floor(p.y / ${BZ.toFixed(1)} + 0.5) * ${BZ.toFixed(1)});
          float hwz = ${(ST / 2).toFixed(2)};
          float db = abs(dot(p - vec2(${BV.px.toFixed(1)}, ${BV.pz.toFixed(1)}), vec2(${BVn[0].toFixed(4)}, ${BVn[1].toFixed(4)})));
          float hwb = ${(BV.w / 2).toFixed(2)};
          float ex = dx / hwx, ez = dz / hwz, eb = db / hwb;
          if (ex < ez && ex < eb) { d = dx; hw = hwx; along = p.y; lum = mix(0.85, 1.25, ave); }
          else if (ez < eb) { d = dz; hw = hwz; along = p.x; lum = 0.8; }
          else { d = db; hw = hwb; along = dot(p, vec2(${BVd[0].toFixed(4)}, ${BVd[1].toFixed(4)})); lum = 0.9; }
        }
        vec3 warm = vec3(1.0, 0.55, 0.22);
        float e = d / hw;
        float glow = exp(-e * e * 1.8);
        vec3 col = vec3(0.004, 0.004, 0.005) + warm * glow * 0.085 * lum;
        // the wave: screens spill a little cold light into the streets
        col += vec3(0.020, 0.040, 0.060) * vIn * glow;
        // river
        float rd = abs(p.y - rz);
        if (rd < ${(RIVER_W + 1.5).toFixed(1)}) {
          float water = 1.0 - smoothstep(${(RIVER_W - 1.2).toFixed(1)}, ${RIVER_W.toFixed(1)}, rd);
          float sh = hash12(floor(vec2(p.x * 1.3, p.y * 4.0 + uT * 0.6)));
          float streak = pow(sh, 18.0) * 1.2;
          vec3 wcol = vec3(0.012, 0.015, 0.021) + vec3(0.05, 0.045, 0.04) * smoothstep(0.0, 1.0, rd / ${RIVER_W.toFixed(1)}) * 0.3;
          wcol += warm * streak * 0.5 + vec3(0.4, 0.6, 0.8) * streak * vIn * 0.5;
          col = mix(col, wcol, water);
          float bank = exp(-pow((rd - ${RIVER_W.toFixed(1)}) / 0.35, 2.0));
          col += warm * bank * (0.5 + 0.5 * cos(6.2831 * p.x / 2.0)) * 0.25;
        }
        gl_FragColor = vec4(mix(col, vHazeV, vFogV), 1.0);
      }`,
  });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.renderOrder = 1;
  scene.add(ground);

  // ---------------- sky dome: haze glow on the horizon ----------------
  const skyMat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */`varying vec3 vD; void main(){ vD = normalize(position); vec4 wp = modelMatrix * vec4(position,1.0); gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: /* glsl */`
      ${COMMON}
      uniform float uR;
      varying vec3 vD;
      void main(){
        float e = vD.y;
        vec3 zen = vec3(0.004, 0.005, 0.008);
        vec3 col = mix(uFogColor, zen, smoothstep(0.0, 0.30, e));
        col += vec3(0.020, 0.016, 0.012) * exp(-max(e, 0.0) * 9.0);
        // the haze over the converted city turns a touch colder (capped)
        col += vec3(0.002, 0.005, 0.008) * clamp(uR / 200.0, 0.0, 1.0) * exp(-max(e, 0.0) * 10.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  // only the band around the horizon is ever on screen: a partial sphere keeps the rasterised area small
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 6, 0, Math.PI * 2, Math.PI / 2 - 0.35, 0.42), skyMat);
  sky.renderOrder = 2;
  sky.frustumCulled = false;
  scene.add(sky);

  // ---------------- lights: street lamps, traffic, aviation beacons ----------------
  const ptMat = (extra = '') => new THREE.ShaderMaterial({
    uniforms: { ...U, uScale: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uT; uniform float uScale; uniform float uFogDen; uniform float uFogLow; uniform float uFogH;
      attribute vec3 aCol; attribute vec4 aA; attribute vec4 aM; attribute float aSize;
      varying vec3 vCol;
      void main(){
        vec3 p = position;
        ${extra}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        gl_PointSize = clamp(aSize * uScale / d, 1.0, 14.0);
        float dens = uFogDen + uFogLow * exp(-max(p.y, 0.0) / uFogH);
        float vis = exp(-pow(d * dens * 0.75, 2.0));
        vCol = aCol * vis * clamp(aSize * uScale / d / 2.0, 0.2, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main(){
        vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0;
        float a = exp(-r * r * 4.0);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vCol * a, 1.0);
      }`,
  });
  const pointsGeo = (P, C, S, A, M) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('aA', new THREE.Float32BufferAttribute(A || new Float32Array(S.length * 4), 4));
    g.setAttribute('aM', new THREE.Float32BufferAttribute(M || new Float32Array(S.length * 4), 4));
    return g;
  };
  // street segments: [x0, z0, dx, dz, length, kind] kind 0 street, 1 avenue, 2 boulevard, 3 old town
  const segs = [];
  {
    const ZMAX = 300, XMAX = 340;
    for (let i = -48; i <= 48; i++) {
      const x = i * BX, ave = ((i % AVE) + AVE) % AVE === 0;
      // a z-running street stops at the river (no bridge) or crosses it every third avenue
      const zr = riverZ(x);
      segs.push([x, ZMAX, 0, -1, ZMAX - (zr + RIVER_W), ave ? 1 : 0]);
    }
    for (let j = -14; j <= 30; j++) {
      const z = j * BZ;
      segs.push([-XMAX, z, 1, 0, 2 * XMAX, 0]);
    }
    segs.push([BV.px - BVd[0] * 300, BV.pz - BVd[1] * 300, BVd[0], BVd[1], 600, 2]);
    const c = Math.cos(OT.ang), s = Math.sin(OT.ang);
    for (let i = -50; i <= 50; i += 1) {
      const lx = i * OT.p;
      // along local z
      segs.push([OT.cx + c * lx + s * -300, OT.cz - s * lx + c * -300, s, c, 600, 3]);
      segs.push([OT.cx + c * -300 + s * lx, OT.cz - s * -300 + c * lx, c, -s, 600, 3]);
    }
  }
  const okPt = (x, z, kind) => {
    if (Math.hypot(x, z + 40) > CITY_R) return false;
    const rz = riverZ(x);
    if (kind === 3) return z < rz - RIVER_W - 0.5;
    return z > rz + RIVER_W + 0.5;
  };
  // lamps
  {
    const P = [], C = [], S = [];
    for (const [x0, z0, dx, dz, len, kind] of segs) {
      const hw = kind === 1 ? AV / 2 : kind === 2 ? BV.w / 2 : kind === 3 ? OT.st / 2 : ST / 2;
      const sp = kind === 3 ? 4.4 : 3.6;
      for (let a = 0; a <= len; a += sp) {
        for (const side of [-1, 1]) {
          const x = x0 + dx * a - dz * side * (hw - 0.15), z = z0 + dz * a + dx * side * (hw - 0.15);
          if (!okPt(x, z, kind)) continue;
          if (!visible(x, 0.5, z, 0.5, 760)) continue;
          const far = Math.min(...camPts.map((c) => Math.hypot(c.x - x, c.z - z))) > 330;
          if (far && R() < 0.65) continue;
          P.push(x, 0.45, z);
          const led = R() < 0.22;
          const i = (2.2 + R() * 1.2) * (kind === 3 ? 0.8 : 1);
          if (led) C.push(0.75 * i, 0.85 * i, 1.0 * i); else C.push(1.0 * i, 0.55 * i, 0.22 * i);
          S.push((kind === 1 || kind === 2 ? 0.13 : 0.11) * (far ? 1.3 : 1));
        }
      }
    }
    const lamps = new THREE.Points(pointsGeo(P, C, S), ptMat());
    lamps.frustumCulled = false;
    lamps.renderOrder = 5;
    scene.add(lamps);
  }
  // traffic: head/tail lights streaming along avenues, the boulevard and some cross streets (pure function of uT)
  {
    const P = [], C = [], S = [], A = [], M = [];
    for (const [x0, z0, dx, dz, len, kind] of segs) {
      if (kind === 3) continue;
      const n = kind === 2 ? 150 : kind === 1 ? 150 : (R() < 0.35 ? 26 : 0);
      if (!n) continue;
      // is any part of this segment on screen?
      let seen = false;
      for (let a = 0; a <= len && !seen; a += 12) if (okPt(x0 + dx * a, z0 + dz * a, kind) && visible(x0 + dx * a, 0.3, z0 + dz * a, 6, 480)) seen = true;
      if (!seen) continue;
      const hw = kind === 1 ? AV / 2 : kind === 2 ? BV.w / 2 : ST / 2;
      for (let c = 0; c < n; c++) {
        const dir = R() < 0.5 ? 1 : -1;
        const lane = dir * hw * (0.3 + 0.25 * R());
        // aA: start point (with lane offset) and direction; aM: offset, speed, length
        A.push(x0 - dz * lane, z0 + dx * lane, dx, dz);
        M.push(R() * len, dir * (4 + R() * 5) * (kind === 0 ? 0.7 : 1), len, 0);
        P.push(0, 0.3, 0);
        const i = 3.2 + R() * 2.0;
        if (dir > 0) C.push(1.0 * i, 0.92 * i, 0.8 * i); else C.push(1.0 * i, 0.14 * i, 0.07 * i);
        S.push(0.36);
      }
    }
    const mat = ptMat(/* glsl */`
      float a = mod(aM.x + aM.y * uT, aM.z);
      p = vec3(aA.x + aA.z * a, 0.3, aA.y + aA.w * a);
      float rz = -118.0 + 26.0 * sin(p.x * 0.011 + 0.6) + 9.0 * sin(p.x * 0.031);
      if (abs(p.z - rz) < ${(RIVER_W + 0.5).toFixed(1)} || p.z < rz || length(p.xz + vec2(0.0, 40.0)) > ${CITY_R.toFixed(1)}) p.y = -50.0;`);
    const traffic = new THREE.Points(pointsGeo(P, C, S, A, M), mat);
    traffic.frustumCulled = false;
    traffic.renderOrder = 5;
    scene.add(traffic);
  }
  // aviation beacons on the tallest buildings, and the cold pulse on patient zero's crown
  {
    const tall = lots.filter((L) => L.kind !== 1 && L.h + L.y > 22).slice(0, 300);
    const P = [], C = [], S = [], A = [];
    tall.forEach((L) => { P.push(L.x, L.h + L.y + 0.2, L.z); C.push(3.2, 0.25, 0.12); S.push(0.35); A.push(R(), 0, 0, 0); });
    const mat = ptMat(`p.y += 0.0;`);
    mat.vertexShader = mat.vertexShader.replace('vCol = aCol', 'vCol = aCol * (0.15 + 0.85 * step(fract(uT * 0.7 + aA.x), 0.22))');
    const bea = new THREE.Points(pointsGeo(P, C, S, A), mat);
    bea.frustumCulled = false;
    bea.renderOrder = 6;
    scene.add(bea);
  }

  const allPointMats = [];
  scene.traverse((o) => { if (o.isPoints) allPointMats.push(o.material); });

  return {
    scene, camera,
    bloom: { strength: 0.8, radius: 0.55, threshold: 0.5 },
    exposure: 1.05,
    update(lt, c) {
      const k = c.k;
      // wave radius: patient zero first, then an accelerating spread that is still moving at the cut
      const wp = (k - waveFrom) / (waveTo - waveFrom);
      U.uR.value = wp >= 0 ? 2 + 250 * (0.22 * wp + 0.78 * Math.pow(wp, 1.6)) : -1;
      U.uT.value = lt;
      // patient zero breathes cold before the launch, brighter as the moment nears
      bMat.uniforms.uPre.value = U.uR.value < 0 ? smooth(lt / Math.max(waveSec, 0.01)) : 0;
      bMat.uniforms.uBreathe.value = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(lt * 2.4));
      placeCam(camera, k, lt);
      const scale = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      for (const pm of allPointMats) pm.uniforms.uScale.value = scale;
    },
  };
});
