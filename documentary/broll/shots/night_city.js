// night_city: "A million users in five days." Aerial night drone shot over a dense city grid. Windows switch on
// as cold screen-light in a wave spreading from one building outward, like an epidemic of glowing screens.
//
// opts
//   waveFrom  0..1 of shot progress when the first window lights (default 0.08)
//   waveTo    0..1 of shot progress when the wave reaches the haze on the horizon (default 0.92)
//   seed      layout seed for the city (default 11)
//
// Everything animated is computed in shaders from two uniforms (time and wave radius), so every frame is a pure
// function of lt. Per-window switch-on thresholds come from a hash of (building, face, window cell).
import { THREE, register, rng, noise, ease, prog, clamp, lerp, keys } from '../kit.js';

const BLOCK = 8;          // block pitch (street centre to street centre)
const STREET = 2.0;       // street width
const NB = 33;            // blocks from centre to edge in each direction
const SPX = 0.36, SPY = 0.40, GF = 0.5; // window pitch and ground-floor height

const riverZ = (x) => -118 + 26 * Math.sin(x * 0.011 + 0.6) + 9 * Math.sin(x * 0.031);
const RIVER_W = 9;

const COMMON = /* glsl */`
uniform vec3 uFogColor; uniform float uFogDen; uniform float uFogLow; uniform float uFogH;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 fogIt(vec3 col, vec3 wp){
  float d = distance(wp, cameraPosition);
  float dens = uFogDen + uFogLow * exp(-max(wp.y, 0.0) / uFogH);
  float f = 1.0 - exp(-pow(d * dens, 1.5));
  return mix(col, uFogColor, f);
}
`;

register('night_city', (opts) => {
  const waveFrom = opts.waveFrom ?? 0.08, waveTo = Math.max(opts.waveTo ?? 0.92, waveFrom + 0.02), seed = opts.seed ?? 11;
  const R = rng(seed * 7919 + 3);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090d);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.5, 5000);

  const fogU = {
    uFogColor: { value: new THREE.Color(0.026, 0.028, 0.035) },
    uFogDen: { value: 0.0031 },
    uFogLow: { value: 0.0040 },
    uFogH: { value: 6.0 },
  };
  const U = {
    ...fogU,
    uR: { value: -1 },
    uO: { value: new THREE.Vector2(0, 0) },
    uT: { value: 0 },
    uJit: { value: 26 },
  };

  // ---------------- city layout ----------------
  const centres = [[0, 0, 1.0, 55], [-70, -60, 0.6, 40], [80, -150, 0.5, 45], [-150, 60, 0.35, 50]];
  const downtown = (x, z) => centres.reduce((a, [cx, cz, s, r]) => a + s * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r)), 0);
  const lots = []; // [x, z, w, d, h, seed]
  const add = (x, z, w, d, h, y = 0) => lots.push([x, z, w, d, h, R() * 97.3 + 1, y]);
  for (let i = -NB; i <= NB; i++) {
    for (let j = -NB; j <= NB; j++) {
      const cx = i * BLOCK, cz = j * BLOCK;
      const rr = Math.hypot(cx, cz);
      if (rr > NB * BLOCK) continue;
      if (Math.abs(cz - riverZ(cx)) < RIVER_W + BLOCK * 0.5) continue; // river
      const park = R();
      if (park < 0.035 && rr > 20) continue; // parks / empty lots
      const inner = BLOCK - STREET; // buildable
      const dt = downtown(cx, cz);
      // split the block into lots
      // downtown blocks often hold one or two big towers; elsewhere the block splits into smaller lots
      const towerBlock = R() < 0.55 * dt;
      const sx = towerBlock ? (R() < 0.5 ? 1 : 2) : (R() < 0.55 ? 2 : (R() < 0.5 ? 1 : 3));
      const sz = towerBlock ? 1 : (R() < 0.55 ? 2 : (R() < 0.5 ? 1 : 3));
      for (let a = 0; a < sx; a++) {
        for (let b = 0; b < sz; b++) {
          const lw = inner / sx, ld = inner / sz;
          const x = cx - inner / 2 + lw * (a + 0.5), z = cz - inner / 2 + ld * (b + 0.5);
          const set = 0.12 + R() * 0.3;
          const w = lw - set * 2, d = ld - set * 2;
          let h;
          if (towerBlock) h = 10 + 26 * dt * (0.4 + R() * 0.8);
          else h = (0.9 + R() * 2.0) * (1 + 3.5 * dt * (0.3 + R()));
          h = Math.min(h, 38, 8 * Math.min(w, d) + 2);
          add(x, z, w, d, h);
          if (h > 12 && R() < 0.6) { // stepped crown
            const f = 0.5 + R() * 0.3, h2 = h * (0.1 + R() * 0.25);
            add(x, z, w * f, d * f, h2, h);
            if (R() < 0.3) add(x, z, w * f * 0.5, d * f * 0.5, h2 * 0.6, h + h2);
          }
        }
      }
    }
  }
  // sort front-to-back from the camera's average position so early-z rejects hidden facades
  const camAvg = new THREE.Vector3(-20, 72, 210);
  lots.sort((A, B) => Math.hypot(A[0] - camAvg.x, A[1] - camAvg.z) - Math.hypot(B[0] - camAvg.x, B[1] - camAvg.z));

  // ---------------- buildings ----------------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  // drop the bottom face (never seen)
  {
    const idx = boxGeo.index.array, keep = [];
    const ny = boxGeo.attributes.normal.array;
    for (let t = 0; t < idx.length; t += 3) if (ny[idx[t] * 3 + 1] > -0.5) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    boxGeo.setIndex(keep);
  }
  // Everything that is constant over a face (building hashes, wave state, window grid size) or linear across it
  // (window-grid coordinates, fog) is computed per vertex; the fragment shader only resolves the window cells.
  const bMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      ${COMMON}
      uniform float uR; uniform vec2 uO; uniform float uJit;
      attribute float aSeed;
      varying vec2 vUV;      // facade: window-grid coords (u columns, v floors); roof: local metres
      varying vec4 vB;       // bh, bh2, dO, waveIn
      varying vec4 vF;       // face id (-1 roof), cols, floors, onGround
      varying vec2 vY;       // height above the building base, distance along the face
      varying float vFog; varying float vSeedF; varying float vGlow;
      const float SPX = ${SPX.toFixed(3)}; const float SPY = ${SPY.toFixed(3)}; const float GF = ${GF.toFixed(3)};
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 C = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 S = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        float dO = distance(C.xz, uO);
        vB = vec4(hash12(vec2(aSeed, 1.7)), hash12(vec2(aSeed, 9.3)), dO, clamp((uR - dO) / uJit, 0.0, 1.0));
        float onGround = step(C.y, 0.01);
        float y = wp.y - C.y;
        if (normal.y > 0.5) {
          vUV = wp.xz - (C.xz - S.xz * 0.5);
          vF = vec4(-1.0, S.x, S.z, onGround);
          vY = vec2(y, 0.0);
        } else {
          bool alongZ = abs(normal.x) > 0.5;
          float face = alongZ ? (normal.x > 0.0 ? 0.0 : 1.0) : (normal.z > 0.0 ? 2.0 : 3.0);
          float hc = alongZ ? wp.z - (C.z - S.z * 0.5) : wp.x - (C.x - S.x * 0.5);
          float width = alongZ ? S.z : S.x;
          float gf = GF * onGround;
          float cols = max(1.0, floor((width - 0.1) / SPX));
          float margin = (width - cols * SPX) * 0.5;
          float floors = max(0.0, floor((S.y - gf - 0.18) / SPY));
          vUV = vec2((hc - margin) / SPX, (y - gf) / SPY);
          vF = vec4(face, cols, floors, onGround);
          vY = vec2(y, hc - width * 0.5);
        }
        vSeedF = aSeed * 13.7 + vF.x * 1.7;
        float d = distance(wp.xyz, cameraPosition);
        float dens = uFogDen + uFogLow * exp(-max(wp.y, 0.0) / uFogH);
        vFog = 1.0 - exp(-pow(d * dens, 1.5));
        // screen light scattering in the haze over the part of the city the wave has reached
        vGlow = clamp((uR - distance(wp.xz, uO)) / 60.0, 0.0, 1.0) * exp(-max(wp.y, 0.0) / 30.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${COMMON}
      uniform float uR; uniform float uT; uniform float uJit;
      varying vec2 vUV; varying vec4 vB; varying vec4 vF; varying vec2 vY; varying float vFog; varying float vSeedF; varying float vGlow;
      void main(){
        float bh = vB.x, bh2 = vB.y, dO = vB.z, waveIn = vB.w;
        vec3 screenA = vec3(0.50, 0.72, 1.00), screenB = vec3(0.40, 0.95, 0.88);
        vec3 warm = vec3(1.00, 0.58, 0.26);
        vec3 col;
        if (vF.x < -0.5) {
          // ---- roof ----
          vec2 lp = vUV;
          float edge = min(min(lp.x, vF.y - lp.x), min(lp.y, vF.z - lp.y));
          float rim = 1.0 - smoothstep(0.0, 0.09, edge);
          vec3 base = mix(vec3(0.011, 0.012, 0.015), vec3(0.020, 0.019, 0.018), bh) * (0.75 + 0.5 * bh2);
          vec2 rf = fract(lp / 0.7);
          float hb = hash12(floor(lp / 0.7) + vSeedF);
          float unit = step(0.80, hb) * step(0.2, rf.x) * step(rf.x, 0.8) * step(0.2, rf.y) * step(rf.y, 0.8) * step(0.3, edge);
          col = base * (1.0 + rim * 1.4) + unit * (vec3(0.012, 0.013, 0.015) + step(0.985, hb) * warm * 0.9);
          col += waveIn * vec3(0.010, 0.020, 0.030) * (0.5 + bh);
        } else {
          // ---- facade ----
          float u = vUV.x, v = vUV.y, cols = vF.y, floors = vF.z, onGround = vF.w, y = vY.x;
          float inGrid = step(0.0, u) * step(u, cols) * step(0.0, v) * step(v, floors);
          vec2 fw = max(fwidth(vUV), vec2(1e-4));
          float far = smoothstep(0.24, 0.65, max(fw.x, fw.y));
          // building style: curtain-wall glass vs punched windows
          float glass = step(0.62, bh);
          vec2 lo = mix(vec2(0.20, 0.24), vec2(0.06, 0.12), glass);
          vec2 hi = 1.0 - lo;
          float area = (hi.x - lo.x) * (hi.y - lo.y);
          float pWarm = 0.09 + 0.12 * bh2;
          const float pWave = 0.38;
          vec3 pane = vec3(0.006, 0.008, 0.012) * (1.0 + glass);
          float win = 0.0;
          vec3 wl = vec3(0.0);
          if (far < 0.999) {
            vec2 cell = floor(vUV);
            vec2 f = vUV - cell;
            float wx = smoothstep(lo.x - fw.x, lo.x + fw.x, f.x) * (1.0 - smoothstep(hi.x - fw.x, hi.x + fw.x, f.x));
            float wy = smoothstep(lo.y - fw.y, lo.y + fw.y, f.y) * (1.0 - smoothstep(hi.y - fw.y, hi.y + fw.y, f.y));
            win = wx * wy * inGrid;
            // glass office towers switch on in zones along a floor; homes window by window
            float hc1 = hash12(cell + vSeedF);
            float h1 = glass > 0.5 ? hash12(vec2(floor(cell.x / 5.0), cell.y) + vSeedF) : hc1;
            float h2 = fract(h1 * 37.71 + 0.13), h3 = fract(h1 * 113.37 + 0.41);
            float holes = mix(1.0, step(0.18, fract(hc1 * 7.31)), glass);
            float warmOn = step(h1, pWarm) * holes;
            float age = uR - (dO + h2 * uJit);
            float waveOn = step(h3, pWave) * step(0.0, age) * holes;
            float flick = 0.86 + 0.14 * sin(uT * (2.0 + h1 * 7.0) + h2 * 40.0);
            float flash = 1.0 + 2.2 * exp(-max(age, 0.0) * 0.08);
            vec3 scr = mix(screenA, screenB, step(0.6, h1)) * (1.3 + 1.5 * h2) * flick * flash;
            vec3 cellCol = mix(warmOn * warm * (1.1 + 1.2 * h2), scr, waveOn) * (0.75 + 0.35 * f.y);
            wl = mix(pane, cellCol, max(warmOn, waveOn)) * win;
          }
          // far field: average of what the cells would show
          float pw = pWave * waveIn;
          vec3 avg = (pWarm * (1.0 - pw) * warm * 1.6 + pw * mix(screenA, screenB, 0.4) * 1.25 + (1.0 - pWarm) * (1.0 - pw) * pane) * area * inGrid;
          wl = mix(wl, avg, far);
          // facade body: dark, lifted by street light at the bottom and by cold spill in the wave
          vec3 body = mix(vec3(0.008, 0.009, 0.012), vec3(0.016, 0.014, 0.013), bh2) * (0.8 + 0.4 * (1.0 - win));
          col = body + exp(-y / 1.3) * onGround * warm * 0.10 + waveIn * vec3(0.003, 0.006, 0.010);
          col = col * (1.0 - win * (1.0 - far)) + wl;
          // ground-floor storefronts
          float hc = vY.y;
          float shop = step(0.35, fract(bh2 * 17.3 + vF.x * 0.37)) * onGround;
          float sf = step(0.08, y) * step(y, 0.40) * step(abs(hc), 0.5 * (cols * ${SPX.toFixed(3)}) - 0.05);
          if (shop * sf > 0.0) col += warm * (0.9 + 1.2 * hash12(vec2(floor(hc / 0.9), vSeedF)));
        }
        gl_FragColor = vec4(mix(col, uFogColor + vec3(0.010, 0.020, 0.030) * vGlow, vFog), 1.0);
      }`,
  });
  const nb = lots.length;
  const bMesh = new THREE.InstancedMesh(boxGeo, bMat, nb);
  const seeds = new Float32Array(nb);
  const m4 = new THREE.Matrix4();
  lots.forEach(([x, z, w, d, h, s, y], i) => {
    m4.makeScale(w, h, d); m4.setPosition(x, y, z);
    bMesh.setMatrixAt(i, m4);
    seeds[i] = s;
  });
  boxGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  bMesh.frustumCulled = false;
  bMesh.renderOrder = 0;
  scene.add(bMesh);

  // ---------------- ground: streets, sodium light, river ----------------
  const gGeo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
  gGeo.rotateX(-Math.PI / 2);
  const gMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      ${COMMON}
      uniform float uR; uniform vec2 uO; uniform float uT; uniform float uJit;
      varying vec3 vW;
      const float B = ${BLOCK.toFixed(2)};
      float riverZ(float x){ return -118.0 + 26.0 * sin(x * 0.011 + 0.6) + 9.0 * sin(x * 0.031); }
      void main(){
        vec2 p = vW.xz;
        vec2 fw = fwidth(p);
        float dx = abs(fract(p.x / B) - 0.5) * B;   // distance to nearest N-S street centre
        float dz = abs(fract(p.y / B) - 0.5) * B;
        float d = min(dx, dz);
        vec3 warm = vec3(1.0, 0.55, 0.22);
        float glow = exp(-d * d / 0.30);
        // lamp pools along each street
        float along = dx < dz ? p.y : p.x;
        float pools = 0.55 + 0.45 * cos(6.2831 * along / 2.5);
        pools = mix(pools, 0.55, smoothstep(0.08, 0.3, max(fw.x, fw.y)));
        vec3 col = vec3(0.006, 0.006, 0.007) + warm * glow * pools * 0.55;
        // the wave: screens spill cold light into the streets, a faint front on the ground
        float dO = distance(p, uO);
        float inside = clamp((uR - dO) / uJit, 0.0, 1.0);
        col += vec3(0.03, 0.07, 0.10) * inside * glow;
        float ring = exp(-pow((dO - uR) / 5.0, 2.0)) * step(0.0, uR);
        col += vec3(0.10, 0.30, 0.34) * ring * (0.25 + glow) * 0.5;
        // river
        float rz = riverZ(p.x);
        float rd = abs(p.y - rz);
        float water = 1.0 - smoothstep(${(RIVER_W - 1.2).toFixed(1)}, ${(RIVER_W).toFixed(1)}, rd);
        if (water > 0.0) {
          float sh = hash12(floor(vec2(p.x * 1.3, p.y * 4.0 + uT * 0.6)));
          float streak = pow(sh, 18.0) * 1.2;
          vec3 wcol = vec3(0.020, 0.026, 0.036) + vec3(0.07, 0.065, 0.06) * smoothstep(0.0, 1.0, rd / ${RIVER_W.toFixed(1)}) * 0.4;
          wcol += warm * streak * 0.5 + vec3(0.4, 0.6, 0.8) * streak * inside * 0.6;
          // embankment lights
          col = mix(col, wcol, water);
        }
        float bank = exp(-pow((rd - ${RIVER_W.toFixed(1)}) / 0.35, 2.0));
        col += warm * bank * (0.5 + 0.5 * cos(6.2831 * p.x / 2.0)) * 0.35;
        float gl = clamp((uR - dO) / 120.0, 0.0, 1.0);
        vec3 fc = fogIt(col, vW);
        float fd = distance(vW, cameraPosition);
        fc += vec3(0.010, 0.020, 0.030) * gl * (1.0 - exp(-pow(fd * (uFogDen + uFogLow), 1.5)));
        gl_FragColor = vec4(fc, 1.0);
      }`,
  });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.renderOrder = 1;
  scene.add(ground);

  // ---------------- sky dome: haze glow on the horizon, city-lit cloud deck ----------------
  const skyMat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */`varying vec3 vD; void main(){ vD = normalize(position); vec4 wp = modelMatrix * vec4(position,1.0); gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: /* glsl */`
      ${COMMON}
      varying vec3 vD;
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float e = vD.y;
        vec3 zen = vec3(0.004, 0.005, 0.008);
        // light-pollution dome just above the horizon, matching the haze at the ground's far edge
        vec3 col = mix(uFogColor, zen, smoothstep(0.0, 0.30, e));
        col += vec3(0.016, 0.013, 0.010) * smoothstep(0.0, 0.04, e) * exp(-max(e, 0.0) * 12.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), skyMat);
  sky.renderOrder = 2;
  sky.frustumCulled = false;
  scene.add(sky);

  // ---------------- lights: street lamps, traffic, aviation beacons ----------------
  const ptMat = (extra = '') => new THREE.ShaderMaterial({
    uniforms: { ...U, uScale: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uT; uniform float uScale; uniform float uFogDen; uniform float uFogLow; uniform float uFogH;
      attribute vec3 aCol; attribute vec4 aMove; attribute float aSize;
      varying vec3 vCol; varying float vFog;
      void main(){
        vec3 p = position;
        ${extra}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        gl_PointSize = clamp(aSize * uScale / d, 1.0, 14.0);
        float dens = uFogDen + uFogLow * exp(-max(p.y, 0.0) / uFogH);
        vFog = exp(-pow(d * dens, 1.5));
        // sub-pixel lamps fade instead of shimmering
        vCol = aCol * vFog * clamp(aSize * uScale / d / 2.0, 0.15, 1.0);
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

  const L = NB * BLOCK;
  const inRiver = (x, z) => Math.abs(z - riverZ(x)) < RIVER_W;
  // lamps
  {
    const P = [], C = [], S = [];
    for (let s = -NB; s < NB; s++) {
      const c = (s + 0.5) * BLOCK;
      const bridge = ((s % 3) + 3) % 3 === 0;
      for (let a = -L; a <= L; a += 3.2) {
        for (const [x, z] of [[c + 0.85, a], [a, c + 0.85]]) {
          if (Math.hypot(x, z) > L) continue;
          if (inRiver(x, z) && !bridge) continue;
          const led = R() < 0.25;
          P.push(x, 0.45, z);
          const i = 2.2 + R() * 1.2;
          if (led) C.push(0.75 * i, 0.85 * i, 1.0 * i); else C.push(1.0 * i, 0.55 * i, 0.22 * i);
          S.push(0.10);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('aMove', new THREE.Float32BufferAttribute(new Float32Array(S.length * 4), 4));
    var lamps = new THREE.Points(g, ptMat());
    lamps.frustumCulled = false;
    lamps.renderOrder = 5;
    scene.add(lamps);
  }
  // traffic: head/tail lights moving along the streets (position is a pure function of uT)
  {
    const P = [], C = [], S = [], M = [];
    for (let n = 0; n < 4200; n++) {
      const s = Math.floor(R() * 2 * NB) - NB;
      const c = (s + 0.5) * BLOCK;
      const axis = R() < 0.5 ? 0 : 1;
      const dir = R() < 0.5 ? 1 : -1;
      const lane = dir * 0.38;
      const speed = dir * (2.0 + R() * 3.5);
      const off = R() * 2 * L;
      // aMove: axis, street coord (with lane), offset, speed
      M.push(axis, c + lane, off, speed);
      P.push(0, 0.3, 0);
      const i = 1.6 + R() * 1.4;
      // half the cars face the camera (white), half away (red); simple split by direction
      if (dir > 0) C.push(1.0 * i, 0.92 * i, 0.8 * i); else C.push(1.0 * i, 0.12 * i, 0.06 * i);
      S.push(0.09);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('aMove', new THREE.Float32BufferAttribute(M, 4));
    const mat = ptMat(`
      float Lr = ${(2 * L).toFixed(1)};
      float a = mod(aMove.z + aMove.w * uT, Lr) - Lr * 0.5;
      p = aMove.x < 0.5 ? vec3(a, 0.3, aMove.y) : vec3(aMove.y, 0.3, a);
      if (length(p.xz) > ${L.toFixed(1)}) p.y = -50.0;
      float rz = -118.0 + 26.0 * sin(p.x * 0.011 + 0.6) + 9.0 * sin(p.x * 0.031);
      if (abs(p.z - rz) < ${RIVER_W.toFixed(1)}) p.y = -50.0;`);
    const traffic = new THREE.Points(g, mat);
    traffic.frustumCulled = false;
    traffic.renderOrder = 5;
    scene.add(traffic);
    var trafficMat = mat;
  }
  // aviation beacons on the tallest buildings
  {
    const tall = lots.filter((l) => l[4] + l[6] > 22).slice(0, 400);
    const P = [], C = [], S = [], M = [];
    tall.forEach((l) => { P.push(l[0], l[4] + l[6] + 0.2, l[1]); C.push(3.5, 0.25, 0.12); S.push(0.35); M.push(R(), 0, 0, 0); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('aMove', new THREE.Float32BufferAttribute(M, 4));
    const mat = ptMat(`p.y += 0.0;`);
    mat.vertexShader = mat.vertexShader.replace('vCol = aCol', 'vCol = aCol * (0.15 + 0.85 * step(fract(uT * 0.7 + aMove.x), 0.22))');
    const bea = new THREE.Points(g, mat);
    bea.frustumCulled = false;
    bea.renderOrder = 6;
    scene.add(bea);
  }

  const allPointMats = [];
  scene.traverse((o) => { if (o.isPoints) allPointMats.push(o.material); });

  // ---------------- camera ----------------
  const tmp = new THREE.Vector3();
  return {
    scene, camera,
    bloom: { strength: 0.85, radius: 0.55, threshold: 0.5 },
    exposure: 1.05,
    update(lt, c) {
      const k = c.k;
      // wave radius: a single building first, then accelerating spread (epidemic curve)
      const wp = prog(k, waveFrom, waveTo);
      U.uR.value = wp > 0 ? 1.5 + 330 * Math.pow(wp, 1.55) : -1;
      U.uT.value = lt;
      // descending drone push with a slight bank
      const m = ease.inOut(clamp(k * 0.92 + 0.04));
      const pos = [lerp(-30, -10, m), lerp(92, 52, m), lerp(250, 168, m)];
      const tgt = [lerp(6, 0, m), lerp(0, 4, m), lerp(-40, -22, m)];
      // tiny drone float
      pos[0] += noise(lt * 0.35 + 3) * 0.6; pos[1] += noise(lt * 0.3 + 9) * 0.4;
      camera.position.set(...pos);
      camera.lookAt(tmp.set(...tgt));
      camera.rotateZ(lerp(-0.07, -0.02, m) + noise(lt * 0.25 + 1) * 0.004);
      const scale = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      for (const pm of allPointMats) pm.uniforms.uScale.value = scale;
    },
  };
});
