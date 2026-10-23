// startup_field: "Startups rushed to wrap the models... you'll get steamrolled."
// A vast dark plain covered with hundreds of small glowing cubes (startups), each with a tiny glowing sign.
//   mode 'field': the cubes pop up out of the ground in a rush while a low, wide camera glides over them.
//   mode 'roll' : a colossal dark ribbed roller rolls across the field toward camera, flattening the cubes
//                 (they squash to nothing, their lights die, dust bursts) as it passes.
//
// opts
//   mode      'field' | 'roll' (default 'field')
//   rollFrom  local seconds when the roller starts its run (default 12% of the shot); before that it creeps
//   rollTo    local seconds when the roller reaches the lens and fills the frame (default 94% of the shot)
//   popFrom   'field' only: local seconds when the first cube pops (default 3% of the shot)
//   popTo     'field' only: local seconds when the last cube is up (default 62% of the shot)
//   seed      layout seed (default 5)
import { THREE, register, rng, noise, ease, prog, clamp, lerp, glowTexture } from '../kit.js';

const WORDS = ['CHAT', 'DOCS', 'BOT', 'AGENT', 'NOTES', 'SEARCH', 'WRITE', 'CODE'];
const GLYPHS = ['●', '▲', '■', '◆', '✦', '◎', '▶', '≡'];
const COLS = [[1.0, 0.62, 0.24], [0.42, 0.80, 0.76], [0.50, 0.62, 0.86], [0.95, 0.80, 0.55], [0.86, 0.32, 0.26]];

function signAtlas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  WORDS.forEach((w, i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 256;
    // panel frame
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 4;
    g.strokeRect(x + 40, y + 40, 176, 176);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '46px "IBM Plex Mono"';
    g.fillText(GLYPHS[i], x + 128, y + 102);
    const size = w.length > 5 ? 38 : 46;
    g.font = `600 ${size}px Oswald`;
    g.fillText(w, x + 128, y + 160);
  });
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

register('startup_field', (opts) => {
  const dur = Math.max(0.5, (opts.t1 ?? 6) - (opts.t0 ?? 0));
  const mode = opts.mode === 'roll' ? 'roll' : 'field';
  const seed = opts.seed ?? 5;
  const rollFrom = opts.rollFrom ?? dur * 0.12, rollTo = Math.max((opts.rollTo ?? dur * 0.94), rollFrom + 0.5);
  const popFrom = opts.popFrom ?? dur * 0.03, popTo = Math.max(opts.popTo ?? dur * 0.62, popFrom + 0.3);
  const R = rng(seed * 7477 + 29);

  const scene = new THREE.Scene();
  const HAZE = new THREE.Color(0.030, 0.036, 0.048);
  scene.background = HAZE.clone();
  const camera = new THREE.PerspectiveCamera(mode === 'roll' ? 42 : 40, 16 / 9, 0.05, 400);
  const U = {
    uT: { value: 0 }, uRollZ: { value: -999 }, uRollR: { value: 4.6 },
    uFog: { value: HAZE }, uFogDen: { value: 0.020 },
  };
  const FOG = /* glsl */`
    uniform vec3 uFog; uniform float uFogDen;
    vec3 hazeCol(vec3 D){ float az = exp(-pow(atan(D.x, -D.z) / 0.7, 2.0)); return uFog + vec3(0.07, 0.10, 0.13) * az * exp(-max(D.y, 0.0) * 4.5); }
    vec3 fogIt(vec3 c, vec3 wp){ vec3 D = wp - cameraPosition; float d = length(D); float f = 1.0 - exp(-pow(d * uFogDen, 1.35)); return mix(c, hazeCol(D / d), f); }
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  `;
  // roller trajectory (axis z) as a pure function of local time
  const RR = 4.6;
  const zCamRoll = 17;
  const zEnd = zCamRoll - RR - 0.9;
  const zStart = -46;
  const rollZ = (t) => {
    const creep = zStart + 1.2 * t;
    const p = prog(t, rollFrom, rollTo);
    const z0 = zStart + 1.2 * rollFrom;
    if (t < rollFrom) return creep;
    // accelerate (ease-in) from the creep into a crushing run that ends at the lens
    const e = p * (0.25 + 0.75 * p);
    return lerp(z0 + 1.2 * (t - rollFrom), zEnd, e);
  };

  // ---------------- cubes ----------------
  const cubes = [];
  const SP = 1.45;
  for (let iz = -30; iz <= 12; iz++) {
    for (let ix = -18; ix <= 18; ix++) {
      if (R() < 0.12) continue;
      const x = ix * SP + (R() - 0.5) * 0.7, z = iz * SP + (R() - 0.5) * 0.7;
      const s = 0.34 + R() * 0.2;
      const h = s * (R() < 0.15 ? 1.4 + R() * 0.6 : 1.0);
      cubes.push({ x, z, s, h, word: Math.floor(R() * WORDS.length), col: COLS[R() < 0.08 ? 4 : Math.floor(R() * 4)], seed: R(), pop: 0, crush: 1e9, rot: (R() - 0.5) * 0.5 });
    }
  }
  // pop times: a rush (few first, then a flood), loosely sweeping from the far field toward the lens
  cubes.forEach((c) => {
    const sweep = clamp((c.z + 44) / 62);
    const r = Math.pow(R(), 0.7);
    const early = R() < 0.14;
    c.pop = mode === 'field' ? (early ? -5 : lerp(popFrom, popTo, clamp(0.45 * r + 0.55 * sweep * (0.7 + 0.3 * R())))) : -10 - R();
  });
  // crush time for 'roll': when the roller's leading surface reaches the cube top (solved once, numerically)
  if (mode === 'roll') {
    cubes.forEach((c) => {
      const target = c.z - Math.sqrt(Math.max(0, RR * RR - (RR - c.h * 0.35) ** 2));
      let lo = 0, hi = dur + 5;
      if (rollZ(hi) < target) { c.crush = 1e9; return; }
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (rollZ(mid) < target) lo = mid; else hi = mid; }
      c.crush = hi;
    });
  }
  const N = cubes.length;
  const cGeo = new THREE.BoxGeometry(1, 1, 1);
  cGeo.translate(0, 0.5, 0);
  const aI = new Float32Array(N * 4), aC = new Float32Array(N * 3), aT = new Float32Array(N * 2);
  cubes.forEach((c, i) => {
    aI.set([c.x, c.z, c.s, c.h], i * 4);
    aC.set(c.col, i * 3);
    aT.set([c.pop, c.word + c.seed * 0.5 + c.rot * 0.0], i * 2);
  });
  const aRot = new Float32Array(N); cubes.forEach((c, i) => { aRot[i] = c.rot; });
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = cGeo.index;
  ig.setAttribute('position', cGeo.attributes.position);
  ig.setAttribute('normal', cGeo.attributes.normal);
  ig.setAttribute('uv', cGeo.attributes.uv);
  ig.setAttribute('aI', new THREE.InstancedBufferAttribute(aI, 4));
  ig.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
  ig.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 2));
  ig.setAttribute('aRot', new THREE.InstancedBufferAttribute(aRot, 1));
  ig.instanceCount = N;
  const atlas = signAtlas();
  const CUBE_SQUASH = /* glsl */`
    // pop: rise out of the ground with an overshoot; crush: the roller's underside presses the cube flat
    float popAge = uT - aT.x;
    float rise = popAge <= 0.0 ? 0.0 : 1.0 - exp(-popAge * 9.0) * cos(popAge * 16.0);
    float dz = aI.y - uRollZ;
    float gap = dz >= uRollR ? 1e3 : (dz <= 0.0 ? 0.0 : uRollR - sqrt(max(uRollR * uRollR - dz * dz, 0.0)));
    float sq = clamp(gap / aI.w, 0.0, 1.0);
  `;
  const cMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uAtlas: { value: atlas } },
    vertexShader: /* glsl */`
      uniform float uT; uniform float uRollZ; uniform float uRollR;
      attribute vec4 aI; attribute vec3 aC; attribute vec2 aT; attribute float aRot;
      varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vC; varying float vOn; varying float vWord; varying float vSq;
      void main(){
        ${CUBE_SQUASH}
        float hgt = aI.w * min(sq, 1.0);
        float spread = 1.0 + 0.45 * (1.0 - sq);
        vec3 p = position;
        vL = p;
        float c = cos(aRot), s = sin(aRot);
        vec3 q = vec3(p.x * aI.z * spread, p.y * hgt, p.z * aI.z * spread);
        q = vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
        // rising out of the ground: sink by (1 - rise)
        q.y -= (aI.w + 0.05) * (1.0 - rise);
        vec3 wp = vec3(aI.x, 0.0, aI.y) + q;
        vW = wp;
        vN = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
        vC = aC;
        vWord = aT.y;
        vSq = sq;
        // sign ignition after the pop, and the dying flicker as it is crushed
        float ign = smoothstep(0.05, 0.25, popAge) * (0.55 + 0.45 * step(0.5, fract(popAge * 13.0)) * (1.0 - step(0.45, popAge)) + 0.45 * step(0.45, popAge));
        float die = smoothstep(0.35, 0.8, sq) * (0.6 + 0.4 * step(0.5, fract(uT * 23.0 + aT.y)) * (1.0 - step(0.98, sq)) + 0.4 * step(0.98, sq));
        vOn = ign * die;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${FOG}
      uniform sampler2D uAtlas; uniform float uT;
      varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vC; varying float vOn; varying float vWord; varying float vSq;
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        // dark glass body with a cold sky reflection
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col = vec3(0.008, 0.009, 0.012) + vec3(0.035, 0.045, 0.060) * fres * (0.4 + 0.6 * max(n.y, 0.0));
        // glowing edges: distance to the nearest box edge in local space
        vec3 a = abs(vL - vec3(0.0, 0.5, 0.0)) * 2.0;     // 0 centre .. 1 face
        vec3 e = smoothstep(0.93, 0.99, a);
        float edge = max(max(e.x * e.y, e.y * e.z), e.x * e.z);
        col += vC * edge * 0.45 * vOn;
        // inner light leaking through the top
        col += vC * step(0.5, n.y) * 0.03 * vOn;
        // the sign on the front face
        if (vL.z > 0.499) {
          vec2 uv = vec2(vL.x + 0.5, vL.y);
          float idx = floor(vWord);
          vec2 cell = vec2(mod(idx, 4.0), floor(idx / 4.0));
          // canvas row 0 is the top half of the texture (flipY)
          vec2 auv = vec2((cell.x + uv.x) / 4.0, 1.0 - (cell.y + 1.0 - uv.y) / 2.0);
          float sgn = texture2D(uAtlas, auv).a;
          col += vC * (0.025 + sgn * 1.9) * vOn;
        }
        gl_FragColor = vec4(fogIt(col, vW), 1.0);
      }`,
  });
  const cubeMesh = new THREE.Mesh(ig, cMat);
  cubeMesh.frustumCulled = false;
  cubeMesh.renderOrder = 1;
  scene.add(cubeMesh);

  // ---------------- light pools on the ground under each cube ----------------
  {
    const pg = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    pg.index = plane.index;
    pg.setAttribute('position', plane.attributes.position);
    pg.setAttribute('uv', plane.attributes.uv);
    pg.setAttribute('aI', new THREE.InstancedBufferAttribute(aI, 4));
    pg.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
    pg.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 2));
    pg.instanceCount = N;
    const pm = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        uniform float uT; uniform float uRollZ; uniform float uRollR;
        attribute vec4 aI; attribute vec3 aC; attribute vec2 aT;
        varying vec2 vUv; varying vec3 vC; varying vec3 vW;
        void main(){
          ${CUBE_SQUASH}
          float on = smoothstep(0.0, 0.3, popAge) * smoothstep(0.35, 0.8, sq) * (1.0 + 2.5 * exp(-max(popAge, 0.0) * 5.0));
          float size = aI.z * 3.4;
          vec3 wp = vec3(aI.x, 0.004, aI.y + aI.z * 0.6) + position * size;
          vW = wp; vUv = uv; vC = aC * on;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        ${FOG}
        varying vec2 vUv; varying vec3 vC; varying vec3 vW;
        void main(){
          vec2 q = (vUv - 0.5) * 2.0;
          float a = exp(-dot(q, q) * 4.0);
          float f = 1.0 - exp(-pow(distance(vW, cameraPosition) * uFogDen, 1.35));
          gl_FragColor = vec4(vC * a * 0.13 * (1.0 - f), 1.0);
        }`,
    });
    const pools = new THREE.Mesh(pg, pm);
    pools.frustumCulled = false;
    pools.renderOrder = 3;
    scene.add(pools);
  }

  // ---------------- ground: dark, faintly gridded, slightly glossy toward the horizon ----------------
  {
    const g = new THREE.PlaneGeometry(800, 800); g.rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        ${FOG}
        varying vec3 vW;
        void main(){
          vec2 p = vW.xz;
          vec2 fw = fwidth(p);
          vec2 gq = abs(fract(p / 1.55 + 0.5) - 0.5) * 1.55;
          vec2 lw = max(fw * 1.2, vec2(0.012));
          float grid = (1.0 - smoothstep(lw.x * 0.5, lw.x, gq.x)) + (1.0 - smoothstep(lw.y * 0.5, lw.y, gq.y));
          grid *= 1.0 - smoothstep(0.15, 0.6, max(fw.x, fw.y));
          float n = hash12(floor(p * 7.0)) * 0.5 + hash12(floor(p * 23.0)) * 0.5;
          vec3 col = vec3(0.010, 0.011, 0.013) * (0.8 + 0.4 * n) + vec3(0.020, 0.026, 0.034) * grid;
          // horizon sheen: grazing reflection of the haze
          vec3 V = normalize(cameraPosition - vW);
          col += uFog * 0.5 * pow(1.0 - max(V.y, 0.0), 6.0);
          gl_FragColor = vec4(fogIt(col, vW), 1.0);
        }`,
    });
    const ground = new THREE.Mesh(g, m);
    ground.renderOrder = 2;
    scene.add(ground);
  }

  // ---------------- sky: haze band on the horizon, a cold glow behind the field ----------------
  {
    const m = new THREE.ShaderMaterial({
      uniforms: U, side: THREE.BackSide, depthWrite: false,
      vertexShader: /* glsl */`varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.9999; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFog; varying vec3 vD;
        void main(){
          float e = vD.y;
          vec3 zen = vec3(0.006, 0.007, 0.010);
          vec3 col = mix(uFog, zen, smoothstep(0.0, 0.35, e));
          // a cold light source low behind the field (where the roller comes from)
          float az = exp(-pow(atan(vD.x, -vD.z) / 0.55, 2.0));
          az = exp(-pow(atan(vD.x, -vD.z) / 0.7, 2.0));
          col += vec3(0.07, 0.10, 0.13) * az * exp(-max(e, 0.0) * 4.5);
          col += vec3(0.02, 0.028, 0.036) * exp(-pow(atan(vD.x, -vD.z) / 0.2, 2.0)) * exp(-max(e, 0.0) * 30.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), m);
    sky.renderOrder = 9;
    sky.frustumCulled = false;
    scene.add(sky);
  }

  // ---------------- dust motes in the air ----------------
  {
    const P = [], S = [];
    for (let i = 0; i < 700; i++) { P.push((R() - 0.5) * 40, R() * 5, -30 + R() * 50); S.push(R()); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { ...U, uScale: { value: 800 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`uniform float uT; uniform float uScale; attribute float aS; varying float vA;
        void main(){
          vec3 p = position + vec3(sin(uT * 0.21 + aS * 40.0) * 0.4 + uT * 0.12, sin(uT * 0.17 + aS * 23.0) * 0.25, cos(uT * 0.13 + aS * 31.0) * 0.4);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(0.03 * uScale / -mv.z, 1.0, 6.0);
          vA = (0.25 + 0.75 * aS) * smoothstep(0.3, 2.0, -mv.z) * exp(-(-mv.z) * 0.05);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 14.0); gl_FragColor = vec4(vec3(0.55, 0.6, 0.66) * a * vA * 0.35, 1.0); }`,
    });
    var motes = new THREE.Points(g, m);
    motes.frustumCulled = false;
    motes.renderOrder = 6;
    scene.add(motes);
  }

  // ---------------- roll mode: roller, dust bursts ----------------
  let roller = null, burstMat = null;
  if (mode === 'roll') {
    const L = 62;
    const geo = new THREE.CylinderGeometry(RR, RR, L, 240, 60, true);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const th = Math.atan2(z, x);
      // longitudinal ribs + raised circumferential bands every 9 units
      const rib = Math.pow(Math.abs(Math.cos(th * 18)), 6) * 0.10;
      const bp = ((y % 9) + 9) % 9;
      const band = (bp < 0.6 ? 1 : 0) * 0.14;
      const r = RR + rib + band;
      pos.setXYZ(i, Math.cos(th) * r, y, Math.sin(th) * r);
    }
    geo.computeVertexNormals();
    geo.rotateZ(Math.PI / 2);   // axis along x
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uSpin: { value: 0 } },
      vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN; varying vec3 vL;
        void main(){ vL = position; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        ${FOG}
        uniform float uRollZ; uniform float uRollR;
        varying vec3 vW; varying vec3 vN; varying vec3 vL;
        void main(){
          vec3 n = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          float ndv = max(dot(n, V), 0.0);
          // dark brushed metal: the haze reflected near grazing angles, a rim from the cold back light above
          vec3 refl = reflect(-V, n);
          float sky = smoothstep(-0.05, 0.5, refl.y);
          vec3 base = vec3(0.005, 0.0055, 0.0065);
          vec3 col = base + uFog * 1.2 * pow(1.0 - ndv, 2.5) * sky;
          // broad soft key from high front-left so the drum reads as a cylinder
          col += vec3(0.008, 0.010, 0.012) * smoothstep(0.0, 1.0, dot(n, normalize(vec3(-0.4, 0.8, 0.45))));
          // the bottom of the drum sits in its own shadow
          col *= mix(0.35, 1.0, smoothstep(0.0, uRollR * 1.2, vW.y));
          vec3 Lb = normalize(vec3(0.15, 0.75, -0.65));
          float rim = pow(1.0 - ndv, 3.0) * max(dot(n, Lb), 0.0);
          col += vec3(0.40, 0.56, 0.70) * rim * 2.2;
          // a cold specular streak from a key high on the left
          vec3 Lk = normalize(vec3(-0.6, 0.6, 0.5));
          vec3 H = normalize(Lk + V);
          col += vec3(0.30, 0.38, 0.46) * pow(max(dot(n, H), 0.0), 60.0) * 0.45;
          // warm and cold bounce from the glowing field just ahead of the drum
          float low = 1.0 - smoothstep(0.0, uRollR * 0.9, vW.y);
          col += vec3(0.20, 0.15, 0.10) * low * max(n.z, 0.0) * 0.25;
          // worn metal: soft variation along the axis
          col *= 0.85 + 0.3 * (0.5 + 0.5 * sin(vL.y * 1.7 + sin(vL.y * 0.37) * 3.0));
          vec3 D = vW - cameraPosition; float dd = length(D);
          gl_FragColor = vec4(mix(col, hazeCol(D / dd), 1.0 - exp(-pow(dd * uFogDen * 0.28, 1.35))), 1.0);
        }`,
    });
    const drum = new THREE.Mesh(geo, mat);
    drum.frustumCulled = false;
    roller = new THREE.Group();
    roller.add(drum);
    // end caps: recessed dark discs with a hub and spokes, so the drum reads as a machine part rolling
    const capMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`varying vec3 vW; varying vec2 vP; varying vec3 vN;
        void main(){ vP = position.xy; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        ${FOG}
        uniform float uRollR;
        varying vec3 vW; varying vec2 vP; varying vec3 vN;
        void main(){
          float r = length(vP) / uRollR;
          float a = atan(vP.y, vP.x);
          vec3 V = normalize(cameraPosition - vW);
          vec3 col = vec3(0.012, 0.013, 0.016);
          float ring = smoothstep(0.02, 0.0, abs(r - 0.93)) + smoothstep(0.015, 0.0, abs(r - 0.62)) + smoothstep(0.03, 0.0, abs(r - 0.2));
          float spoke = smoothstep(0.08, 0.0, abs(sin(a * 4.0))) * step(0.2, r) * step(r, 0.62);
          float hub = step(r, 0.2);
          float lit = 0.5 + 0.5 * dot(vN, normalize(vec3(-0.4, 0.8, 0.45)));
          col += vec3(0.05, 0.06, 0.075) * (ring * 0.8 + spoke * 0.5 + hub * 0.25) * lit;
          col += uFog * 0.6 * pow(1.0 - max(dot(vN, V), 0.0), 2.0);
          col *= mix(0.4, 1.0, smoothstep(0.0, uRollR * 1.2, vW.y));
          vec3 D = vW - cameraPosition; float dd = length(D);
          gl_FragColor = vec4(mix(col, hazeCol(D / dd), 1.0 - exp(-pow(dd * uFogDen * 0.40, 1.35))), 1.0);
        }`,
    });
    for (const sgn of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(RR + 0.05, 96), capMat);
      cap.rotation.y = sgn * Math.PI / 2;
      cap.position.x = sgn * L / 2;
      cap.frustumCulled = false;
      roller.add(cap);
    }
    roller.renderOrder = 0;
    scene.add(roller);

    // dust burst particles: born at each cube's crush time, shoved ahead at the drum's speed, then settling
    const P = [], A = [], B = [], C = [];
    const vAt = (t) => (rollZ(t + 0.01) - rollZ(t - 0.01)) / 0.02;
    cubes.forEach((c) => {
      if (c.crush > dur + 1) return;
      const vz = vAt(c.crush);
      const n = 12;
      for (let j = 0; j < n; j++) {
        P.push(c.x + (R() - 0.5) * c.s, 0.05 + R() * c.h * 0.6, c.z + (R() - 0.5) * c.s);
        const sp = 0.8 + R() * 2.2, ang = (R() - 0.5) * Math.PI * 1.6;
        A.push(Math.sin(ang) * sp, 0.6 + R() * 2.2, vz * (1.05 + R() * 0.35) + Math.cos(ang) * sp * 0.5);
        B.push(c.crush, R(), j < 3 ? 1 : 0, 0.7 + R() * 1.2);   // birth, rand, spark, life
        C.push(...c.col);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aV', new THREE.Float32BufferAttribute(A, 3));
    g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 4));
    g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 3));
    burstMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uScale: { value: 800 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`uniform float uT; uniform float uScale; attribute vec3 aV; attribute vec4 aB; attribute vec3 aC; varying vec3 vC;
        void main(){
          float age = uT - aB.x;
          float life = aB.w;
          float alive = step(0.0, age) * step(age, life);
          float a = clamp(age, 0.0, life);
          // drag + gravity, closed form
          float k = 2.6;
          vec3 p = position + aV * (1.0 - exp(-k * a)) / k + vec3(0.0, -1.6 * a * a, 0.0);
          p.y = max(p.y, 0.03);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float t = a / life;
          gl_PointSize = clamp((0.2 + 0.7 * t) * uScale / -mv.z * mix(1.0, 0.25, aB.z), 1.5, 80.0) * alive;
          vec3 dust = mix(vec3(0.34, 0.35, 0.37), aC, 0.45) * (1.0 - t) * (1.0 - t) * 0.55;
          vec3 spark = mix(aC, vec3(1.0, 0.85, 0.6), 0.5) * 6.0 * exp(-a * 4.0);
          vC = mix(dust, spark, aB.z) * alive;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 10.0); if (a < 0.03) discard; gl_FragColor = vec4(vC * a, 1.0); }`,
    });
    const bursts = new THREE.Points(g, burstMat);
    bursts.frustumCulled = false;
    bursts.renderOrder = 7;
    scene.add(bursts);

    // the bow wave: a band of dust rolling along the ground just ahead of the drum's contact line
    {
      const P2 = [], S2 = [];
      for (let i = 0; i < 900; i++) { P2.push((R() - 0.5) * 64, R(), R()); S2.push(R()); }
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3));
      g2.setAttribute('aS', new THREE.Float32BufferAttribute(S2, 1));
      var waveMat = new THREE.ShaderMaterial({
        uniforms: { ...U, uScale: { value: 800 }, uSpeed: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`uniform float uT; uniform float uScale; uniform float uRollZ; uniform float uSpeed; attribute float aS; varying vec3 vC;
          void main(){
            // each mote cycles: born at the contact line, swept forward and up, fading
            float cyc = fract(uT * (0.8 + aS * 0.9) + position.z);
            float x = position.x + sin(uT * 0.7 + aS * 30.0) * 0.6;
            float y = 0.05 + cyc * (0.4 + 1.6 * position.y) + sin(uT * 2.0 + aS * 11.0) * 0.08;
            float z = uRollZ + 0.2 + cyc * (0.6 + 2.2 * aS);
            vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
            float sp = clamp(uSpeed / 14.0, 0.0, 1.0);
            gl_PointSize = clamp((0.3 + 1.1 * cyc) * uScale / -mv.z, 1.0, 90.0) * step(0.02, sp);
            vC = mix(vec3(0.34, 0.33, 0.32), vec3(0.6, 0.45, 0.3), 0.3 * (1.0 - cyc)) * sin(3.14159 * cyc) * 0.32 * sp * (1.0 - smoothstep(26.0, 34.0, abs(x)));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 9.0); if (a < 0.03) discard; gl_FragColor = vec4(vC * a, 1.0); }`,
      });
      const wave = new THREE.Points(g2, waveMat);
      wave.frustumCulled = false;
      wave.renderOrder = 7;
      scene.add(wave);
    }
    var speedAt = vAt;
  }

  const pointMats = [];
  scene.traverse((o) => { if (o.isPoints) pointMats.push(o.material); });
  const tgt = new THREE.Vector3();
  return {
    scene, camera,
    bloom: { strength: 0.65, radius: 0.45, threshold: 0.55 },
    exposure: 1.0,
    update(lt, c) {
      const k = c.k;
      U.uT.value = lt;
      const scale = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      pointMats.forEach((m) => { if (m.uniforms.uScale) m.uniforms.uScale.value = scale; });
      if (mode === 'field') {
        U.uRollZ.value = -999;
        // low, wide glide over the field, drifting sideways as it pushes in
        const m = ease.inOut(clamp(k));
        camera.position.set(lerp(-3.0, 2.4, m) + noise(lt * 0.4) * 0.05, lerp(2.3, 1.55, m) + noise(lt * 0.5 + 7) * 0.03, lerp(22, 14, m));
        camera.lookAt(tgt.set(lerp(-0.8, 0.9, m), lerp(0.1, 0.15, m), lerp(-6, -12, m)));
        camera.rotateZ(lerp(0.035, -0.02, m));
      } else {
        const zr = rollZ(lt);
        U.uRollZ.value = zr;
        roller.position.set(0, RR, zr);
        roller.rotation.x = zr / RR;     // rolls without slipping
        waveMat.uniforms.uSpeed.value = speedAt(lt);
        // camera holds low, eases back and tilts up as the drum looms
        const near = clamp((zr - (zEnd - 30)) / 30);
        const m = ease.inOut(clamp(k));
        camera.position.set(lerp(-1.2, 0.4, m) + noise(lt * 0.6) * 0.03 * (1 + 3 * near * near), 3.0 - 1.0 * near, zCamRoll + 1.2 * m);
        camera.lookAt(tgt.set(lerp(-0.4, 0.2, m), lerp(-0.6, 3.0, ease.in(near)), zr));
        camera.rotateZ(lerp(0.02, -0.03, m));
      }
    },
  };
});
