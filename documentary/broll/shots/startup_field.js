// startup_field: "Startups rushed to wrap the models... you'll get steamrolled."
// A vast dark plain of wet asphalt covered with hundreds of small dark cubes (startups), each with a glowing sign
// (abstract glyph + generic word) that spills light onto the ground and reflects, rippled, in the wet surface.
//   mode 'field'             : the cubes pop up out of the ground in a rush, nearest first, while a low wide camera
//                              glides forward at constant speed and rises to reveal the field to the horizon. At
//                              killAt the DOCS signs stutter and die ("Then ChatGPT learned to read PDFs").
//   mode 'field', variant 'b': the aftermath, seen from a slow, higher aerial track: about a third of the cubes are
//                              dark or flattened, a few big ones still lit, and more signs keep dying during the shot.
//   mode 'roll'              : a colossal ribbed roller on a heavy yoke rolls across the field. A low three-quarter
//                              camera cranes down and tracks back beside it: cubes are crushed flat along the contact
//                              line (lights stutter out, dust and sparks burst), the wake behind is a flattened dark
//                              field, and the drum overruns the lens exactly on the cut.
//
// opts
//   mode      'field' | 'roll' (default 'field')
//   variant   'field' only: 'a' (default, the rush) | 'b' (the aftermath aerial)
//   seed      layout seed (default 5)
//   popFrom   'field' a: local seconds when the first near cubes pop (default 0.02 s)
//   popTo     'field' a: local seconds when the last far cube is up (default 62% of the shot)
//   killWord  'field' a: which signs die (default 'DOCS'; null for none)
//   killAt    'field' a: local seconds when they start dying (default 70% of the shot)
//   rollFrom  'roll': local seconds when the roller starts its crushing run (default 35% of the shot); it is already
//             rolling at frame 1
//   rollTo    'roll': local seconds when the run peaks right in front of the lens (default 88% of the shot); the frame
//             goes fully dark exactly at the end of the shot
//
// Overlays: 'field' a keeps the upper half calm (haze and distant lights); 'field' b keeps the lower middle and the right
// half quieter (dark aftermath) with the lit survivors up and to the left; 'roll' puts the action low and right, the
// upper left is the drum's dark mass and haze.
import { THREE, register, rng, noise, ease, prog, clamp, lerp, smooth } from '../kit.js';

const WORDS = ['CHAT', 'DOCS', 'BOT', 'AGENT', 'NOTES', 'SEARCH', 'WRITE', 'CODE'];
const GLYPHS = ['●', '▲', '■', '◆', '✦', '◎', '▶', '≡'];
const COLS = [[1.0, 0.62, 0.24], [0.42, 0.80, 0.76], [0.50, 0.62, 0.86], [0.95, 0.80, 0.55], [0.86, 0.32, 0.26]];

function signAtlas() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S * 4; c.height = S * 2;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  WORDS.forEach((w, i) => {
    const x = (i % 4) * S, y = Math.floor(i / 4) * S;
    // a lit panel: faint fill, a fine frame, the glyph and the word
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 64, y + 64, S - 128, S - 128);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 7; g.strokeRect(x + 64, y + 64, S - 128, S - 128);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '92px "IBM Plex Mono"';
    g.fillText(GLYPHS[i], x + S / 2, y + 200);
    g.font = `600 ${w.length > 5 ? 74 : 92}px Oswald`;
    g.fillText(w, x + S / 2, y + 322);
  });
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

register('startup_field', (opts) => {
  const dur = Math.max(0.5, (opts.t1 ?? 6) - (opts.t0 ?? 0));
  const mode = opts.mode === 'roll' ? 'roll' : 'field';
  const variant = mode === 'field' && opts.variant === 'b' ? 'b' : 'a';
  const seed = opts.seed ?? 5;
  const R = rng(seed * 7477 + 29);
  const popFrom = opts.popFrom ?? 0.02, popTo = Math.max(opts.popTo ?? dur * 0.62, popFrom + 0.3);
  const killWord = opts.killWord === undefined ? 'DOCS' : opts.killWord, killAt = opts.killAt ?? dur * 0.7;
  const rollFrom = clamp(opts.rollFrom ?? dur * 0.35, 0, dur - 0.4), rollTo = clamp(Math.max(opts.rollTo ?? dur * 0.88, rollFrom + 0.3), 0, dur - 0.05);

  const scene = new THREE.Scene();
  const HAZE = new THREE.Color(0.018, 0.021, 0.028);
  scene.background = HAZE.clone();
  const camera = new THREE.PerspectiveCamera(mode === 'roll' ? 44 : variant === 'b' ? 36 : 40, 16 / 9, 0.05, 400);
  const RR = 4.2;                          // roller radius
  const DRUM_X0 = -40, DRUM_X1 = 14;       // roller span along x (its right end faces the camera)
  const U = {
    uT: { value: 0 }, uRollZ: { value: -999 }, uRollR: { value: RR },
    uFog: { value: HAZE }, uFogDen: { value: variant === 'b' ? 0.011 : mode === 'roll' ? 0.013 : 0.019 },
    uSpan: { value: new THREE.Vector2(mode === 'roll' ? DRUM_X0 : 0, mode === 'roll' ? DRUM_X1 : 0) },
  };
  const FOG = /* glsl */`
    uniform vec3 uFog; uniform float uFogDen;
    vec3 hazeCol(vec3 D){ float az = exp(-pow(atan(D.x, -D.z) / 0.8, 2.0)); return uFog * (1.0 - 0.45 * smoothstep(0.0, 0.4, -D.y)) + vec3(0.040, 0.056, 0.074) * az * exp(-abs(D.y) * (D.y < 0.0 ? 10.0 : 4.5)); }
    vec3 fogIt(vec3 c, vec3 wp){ vec3 D = wp - cameraPosition; float d = length(D); float f = 1.0 - exp(-pow(d * uFogDen, 1.35)); return mix(c, hazeCol(D / d), f); }
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
    float puddle(vec2 p){ return smoothstep(0.42, 0.68, vnoise(p * 0.11 + 3.1) * 0.7 + vnoise(p * 0.5 + 7.7) * 0.3); }
  `;

  // ---------------- roller trajectory (roll) ----------------
  // D(t): distance from the camera plane to the drum axis. Already rolling at frame 1; accelerates from rollFrom into
  // a run that peaks right in front of the lens at rollTo, and overruns the lens exactly at the end of the shot.
  // the camera stands beside the drum's right end; on the cut the end cap passes right in front of the lens
  const camZ = (t) => 9.6 + 0.12 * t;
  const D0 = 35, vCreep = 2.8;
  const D1 = D0 - vCreep * rollFrom, D2 = 3.2, DEND = 0.2;
  const Dist = (t) => {
    if (t < rollFrom) return D0 - vCreep * t;
    if (t < rollTo) { const p = (t - rollFrom) / (rollTo - rollFrom); const s0 = vCreep * (rollTo - rollFrom) / Math.max(D1 - D2, 0.01); return lerp(D1, D2, p * (Math.min(s0, 1) + (1 - Math.min(s0, 1)) * p)); }
    return lerp(D2, DEND, (t - rollTo) / Math.max(dur - rollTo, 0.01));
  };
  const rollZ = (t) => camZ(t) - Dist(t);

  // ---------------- the cube field ----------------
  const cubes = [];
  const SP = 1.45;
  const gx = mode === 'roll' ? [-26, 17] : variant === 'b' ? [-24, 24] : [-18, 18];
  const gz = mode === 'roll' ? [-36, 8] : variant === 'b' ? [-40, 14] : [-32, 12];
  for (let iz = gz[0]; iz <= gz[1]; iz++) {
    for (let ix = gx[0]; ix <= gx[1]; ix++) {
      if (R() < 0.12) continue;
      const x = ix * SP + (R() - 0.5) * 0.7, z = iz * SP + (R() - 0.5) * 0.7;
      const s = 0.34 + R() * 0.2;
      const h = s * (R() < 0.15 ? 1.4 + R() * 0.6 : 1.0);
      cubes.push({ x, z, s, h, word: Math.floor(R() * WORDS.length), col: COLS[R() < 0.08 ? 4 : Math.floor(R() * 4)], r: R(), rot: (R() - 0.5) * 0.5, pop: -10, die: 1e9, flat: 0, crush: 1e9 });
    }
  }

  // camera paths (pure functions of k and lt), defined before the layout so the layout can be framed against them
  const tgt = new THREE.Vector3();
  const camAt = (k, lt, cam) => {
    if (mode === 'field' && variant === 'a') {
      // constant-velocity glide, low and wide, rising a little to reveal the field to the horizon
      const m = lerp(k, ease.inOut(k), 0.25);
      cam.position.set(lerp(-2.6, 1.8, m) + noise(lt * 0.4) * 0.05, lerp(1.45, 2.35, m) + noise(lt * 0.5 + 7) * 0.03, lerp(21.5, 11.5, m));
      cam.lookAt(tgt.set(lerp(-1.2, 1.0, m), lerp(0.35, 0.25, m), lerp(-4, -14, m)));
      cam.rotateZ(lerp(0.03, -0.02, m));
    } else if (mode === 'field') {
      // slow aerial track over the aftermath: high, looking down, drifting left and a little forward
      const m = lerp(k, ease.inOut(k), 0.2);
      cam.position.set(lerp(8.5, -6.5, m) + noise(lt * 0.25) * 0.08, lerp(8.8, 8.0, m) + noise(lt * 0.3 + 4) * 0.05, lerp(17.5, 12.5, m));
      cam.lookAt(tgt.set(lerp(5.0, -7.0, m), 0, lerp(-6.5, -10.5, m)));
      cam.rotateZ(lerp(-0.02, 0.025, m));
    } else {
      // roll: a crane down from a high three-quarter to the ground, tracking back beside the drum
      // a crane down from a high three-quarter (seeing the flattened wake behind the drum) to a low position beside
      // its end, panning to follow it; the end cap and yoke loom and pass across the lens on the cut
      const zr = rollZ(lt);
      const m = lerp(k, smooth(k), 0.6);
      const near = clamp(1 - (Dist(lt) - DEND) / 14);
      const sh = 0.012 + 0.09 * near * near;
      cam.position.set(lerp(25.5, 21.5, m) + noise(lt * 9.0) * sh, lerp(7.2, 1.7, m) + noise(lt * 11.0 + 3) * sh, camZ(lt));
      cam.lookAt(tgt.set(lerp(8.5, 14.0, near * near), lerp(1.2, RR * 0.85, near), lerp(zr + RR * 1.4, zr, near * near)));
      cam.rotateZ(lerp(0.03, -0.04, m) + noise(lt * 7.0 + 9) * sh * 0.15);
    }
    cam.updateMatrixWorld(true);
  };

  if (mode === 'field' && variant === 'a') {
    // the rush: the nearest cubes pop within the first second, then a wave runs away toward the horizon
    const near = 16, far = -46;
    cubes.forEach((c) => {
      const sweep = clamp((near - c.z) / (near - far));
      if (R() < 0.07) { c.pop = -5; return; } // a few distant lights are already on at frame 1
      const front = Math.pow(sweep, 1.15);
      c.pop = lerp(popFrom, popTo, clamp(0.88 * front * (0.85 + 0.3 * R()) + 0.12 * R()));
      if (killWord && WORDS[c.word] === killWord) c.die = killAt + R() * 0.6 + sweep * 0.4;
    });
  } else if (mode === 'field') {
    // the aftermath: a third dark, some flattened, a few big survivors still lit, more dying during the shot
    const anchorCam = new THREE.PerspectiveCamera(camera.fov, 16 / 9, 0.05, 400);
    const groundAt = (k, sx, sy) => {
      camAt(k, k * dur, anchorCam); anchorCam.updateProjectionMatrix();
      const d = new THREE.Vector3((sx / 1920) * 2 - 1, 1 - (sy / 1080) * 2, 0.5).unproject(anchorCam).sub(anchorCam.position).normalize();
      const t = -anchorCam.position.y / d.y;
      return [anchorCam.position.x + d.x * t, anchorCam.position.z + d.z * t];
    };
    const big = [[0.15, 640, 330], [0.3, 1020, 250], [0.45, 330, 420], [0.6, 820, 300], [0.8, 520, 380], [0.95, 260, 300]].map(([k, sx, sy]) => groundAt(k, sx, sy));
    cubes.forEach((c) => {
      // keep the big ones' neighbourhoods clear
      if (big.some(([bx, bz]) => Math.hypot(bx - c.x, bz - c.z) < 2.8)) { c.skip = 1; return; }
      // darker near the lens (under a lower-middle document), a little less dark toward the horizon
      const bias = 0.14 * clamp((c.z + 4) / 14);
      const u = R();
      if (u < 0.17 + bias * 0.5) { c.flat = 1; c.die = -10; } else if (u < 0.42 + bias) c.die = -10; else if (u < 0.50 + bias) c.die = dur * (0.06 + 0.88 * R());
    });
    for (let i = cubes.length - 1; i >= 0; i--) if (cubes[i].skip) cubes.splice(i, 1);
    // the survivors: a few big cubes still lit
    big.forEach(([x, z], j) => {
      const s = 1.35 + R() * 0.5;
      cubes.push({ x, z, s, h: s * (1.1 + R() * 0.5), word: [0, 3, 6, 7, 5, 2][j % 6], col: COLS[[0, 3, 1, 2, 0, 3][j % 6]], r: R(), rot: (R() - 0.5) * 0.4, pop: -10, die: 1e9, flat: 0, crush: 1e9, big: 1 });
    });
  } else {
    // roll: the crush time is when the drum's underside comes down to the cube's top (solved once, numerically)
    cubes.forEach((c) => {
      if (c.x < DRUM_X0 + 0.3 || c.x > DRUM_X1 - 0.2) return;
      const target = c.z - Math.sqrt(Math.max(0, RR * RR - (RR - c.h) ** 2));
      if (rollZ(0) >= target) { c.crush = -5; c.flat = 1; c.die = -10; return; }   // already in the wake at frame 1
      let lo = 0, hi = dur + 5;
      if (rollZ(hi) < target) return;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (rollZ(mid) < target) lo = mid; else hi = mid; }
      c.crush = hi;
    });
  }

  const N = cubes.length;
  const aI = new Float32Array(N * 4), aC = new Float32Array(N * 3), aT = new Float32Array(N * 4), aK = new Float32Array(N * 4);
  cubes.forEach((c, i) => {
    aI.set([c.x, c.z, c.s, c.h], i * 4);
    aC.set(c.col, i * 3);
    aT.set([c.pop, c.word, c.r, c.rot], i * 4);
    aK.set([c.crush, c.die, c.flat, c.big ? 1 : 0], i * 4);
  });
  const instGeo = (base) => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    for (const k of Object.keys(base.attributes)) g.setAttribute(k, base.attributes[k]);
    g.setAttribute('aI', new THREE.InstancedBufferAttribute(aI, 4));
    g.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
    g.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
    g.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4));
    g.instanceCount = N;
    return g;
  };
  const atlas = signAtlas();
  // state of one cube from time alone: rise out of the ground, squash under the drum, sign on/off
  const STATE = /* glsl */`
    uniform float uT; uniform float uRollZ; uniform float uRollR; uniform vec2 uSpan;
    attribute vec4 aI; attribute vec3 aC; attribute vec4 aT; attribute vec4 aK;
    void cubeState(out float rise, out float sq, out float on){
      float popAge = uT - aT.x;
      rise = popAge <= 0.0 ? 0.0 : 1.0 - exp(-popAge * 9.0) * cos(popAge * 16.0);
      float dz = aI.y - uRollZ;
      float inSpan = step(uSpan.x, aI.x) * step(aI.x, uSpan.y);
      float gap = (dz >= uRollR || inSpan < 0.5) ? 1e3 : (dz <= 0.0 ? 0.0 : uRollR - sqrt(max(uRollR * uRollR - dz * dz, 0.0)));
      sq = aK.z > 0.5 ? 0.0 : clamp(gap / aI.w, 0.0, 1.0);
      float ign = smoothstep(0.05, 0.22, popAge) * (popAge < 0.45 ? 0.5 + 0.5 * step(0.5, fract(popAge * 13.0)) : 1.0);
      float dAge = uT - aK.y;
      float die = dAge < 0.0 ? 1.0 : (dAge < 0.45 ? step(0.45, fract(dAge * 15.0 + aT.z * 3.0)) * (1.0 - dAge / 0.5) : 0.0);
      float crushDie = smoothstep(0.3, 0.75, sq) * (sq < 0.97 ? 0.35 + 0.65 * step(0.5, fract(uT * 23.0 + aT.z * 7.0)) : 1.0);
      on = ign * die * crushDie;
    }
  `;

  // ---------------- cubes ----------------
  const cGeo = new THREE.BoxGeometry(1, 1, 1);
  cGeo.translate(0, 0.5, 0);
  const cMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uAtlas: { value: atlas } },
    vertexShader: /* glsl */`
      ${STATE}
      varying vec3 vW; varying vec3 vN; varying vec3 vLN; varying vec3 vL; varying vec3 vC; varying float vOn; varying float vWord; varying vec2 vSize; varying float vBig;
      void main(){
        float rise, sq, on; cubeState(rise, sq, on);
        float hgt = max(aI.w * sq, 0.045);
        float spread = 1.0 + 0.55 * (1.0 - sq);
        vec3 p = position;
        vL = p; vLN = normal;
        float c = cos(aT.w), s = sin(aT.w);
        vec3 q = vec3(p.x * aI.z * spread, p.y * hgt, p.z * aI.z * spread);
        q = vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
        q.y -= (hgt + 0.05) * (1.0 - rise);
        vec3 wp = vec3(aI.x, 0.0, aI.y) + q;
        vW = wp;
        vN = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
        vC = aC; vWord = aT.y; vOn = on; vBig = aK.w;
        vSize = vec2(aI.z * spread, hgt);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${FOG}
      uniform sampler2D uAtlas;
      varying vec3 vW; varying vec3 vN; varying vec3 vLN; varying vec3 vL; varying vec3 vC; varying float vOn; varying float vWord; varying vec2 vSize; varying float vBig;
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float ndv = max(dot(n, V), 0.0);
        // dark satin body: a little haze reflected on the top and at grazing angles
        vec3 col = vec3(0.009, 0.010, 0.013);
        vec3 refl = reflect(-V, n);
        col += hazeCol(refl) * (0.12 + 0.6 * pow(1.0 - ndv, 4.0)) * mix(0.35, 0.8, step(0.5, vLN.y));
        // a faint cold top light from the sky so dark and flattened cubes keep their form
        col += vec3(0.010, 0.012, 0.016) * max(vLN.y, 0.0);
        // bevel highlights: thin, neutral, mostly on the top edges (no glowing outlines)
        float ex = (0.5 - abs(vL.x)) * vSize.x, ez = (0.5 - abs(vL.z)) * vSize.x, ey = (1.0 - vL.y) * vSize.y;
        float bev;
        if (vLN.y > 0.5) bev = 1.0 - smoothstep(0.0, 0.03, min(ex, ez));
        else bev = (1.0 - smoothstep(0.0, 0.022, ey)) + 0.3 * (1.0 - smoothstep(0.0, 0.018, abs(vLN.x) > 0.5 ? ez : ex));
        col += vec3(0.16, 0.18, 0.21) * bev * (0.12 + 0.5 * pow(1.0 - ndv, 2.0)) * 0.35;
        // the sign's own light on the front face; dimmed when close so near signs stay crisp under bloom
        float dcam = distance(cameraPosition, vW);
        float emis = mix(1.7, 2.2, vBig) * clamp((dcam - 1.2) / 7.0, 0.32, 1.0);
        if (vLN.z > 0.5) {
          vec2 uv = vec2(vL.x + 0.5, vL.y);
          float idx = floor(vWord + 0.5);
          vec2 cell = vec2(mod(idx, 4.0), floor(idx / 4.0));
          vec2 auv = vec2((cell.x + uv.x) / 4.0, 1.0 - (cell.y + 1.0 - uv.y) / 2.0);
          float sgn = texture2D(uAtlas, auv).a;
          col += vC * (0.02 + sgn * emis) * vOn;
        } else {
          // faint glow leaking around the other faces
          col += vC * 0.012 * vOn * (1.0 - vLN.y);
        }
        gl_FragColor = vec4(fogIt(col, vW), 1.0);
      }`,
  });
  const cubeMesh = new THREE.Mesh(instGeo(cGeo), cMat);
  cubeMesh.frustumCulled = false;
  cubeMesh.renderOrder = 1;
  scene.add(cubeMesh);

  // ---------------- sign light: pools on the ground and rippled reflections in the wet asphalt ----------------
  {
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    const pm = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        ${STATE}
        varying vec2 vUv; varying vec3 vC; varying vec3 vW;
        void main(){
          float rise, sq, on; cubeState(rise, sq, on);
          on *= 1.0 + 1.6 * exp(-max(uT - aT.x, 0.0) * 5.0) * step(0.0, uT - aT.x);
          float c = cos(aT.w), s = sin(aT.w);
          vec3 q = vec3(position.x * aI.z * 3.2, 0.0, (position.z + 0.25) * aI.z * 4.4);
          q = vec3(c * q.x + s * q.z, 0.0, -s * q.x + c * q.z);
          vec3 wp = vec3(aI.x, 0.004, aI.y) + q;
          vW = wp; vUv = uv; vC = aC * on * mix(1.0, 1.8, aK.w);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        ${FOG}
        varying vec2 vUv; varying vec3 vC; varying vec3 vW;
        void main(){
          vec2 q = (vUv - vec2(0.5, 0.62)) * vec2(2.0, 1.6);
          float a = exp(-dot(q, q) * 5.0);
          float f = 1.0 - exp(-pow(distance(vW, cameraPosition) * uFogDen, 1.35));
          gl_FragColor = vec4(vC * a * 0.05 * (1.0 + 1.5 * puddle(vW.xz)) * (1.0 - f) * (1.0 - f), 1.0);
        }`,
    });
    const pools = new THREE.Mesh(instGeo(plane), pm);
    pools.frustumCulled = false;
    pools.renderOrder = 3;
    scene.add(pools);

    // a vertical quad mirrored below the ground under each sign (the ground writes no depth, cubes in front occlude it)
    const quad = new THREE.PlaneGeometry(1, 1);
    const rm = new THREE.ShaderMaterial({
      uniforms: { ...U, uAtlas: { value: atlas } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        ${STATE}
        varying vec2 vUv; varying vec3 vC; varying vec3 vW; varying float vWord;
        void main(){
          float rise, sq, on; cubeState(rise, sq, on);
          float hgt = max(aI.w * sq, 0.045) * rise;
          float c = cos(aT.w), s = sin(aT.w);
          float u = position.x + 0.5, v = position.y + 0.5;
          vec3 q = vec3((u - 0.5) * aI.z, -(1.0 - v) * hgt * 1.5, 0.5 * aI.z + 0.012);
          q = vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
          vec3 wp = vec3(aI.x, 0.0, aI.y) + q;
          vW = wp; vUv = vec2(u, v); vC = aC * on; vWord = aT.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        ${FOG}
        uniform sampler2D uAtlas; uniform float uT;
        varying vec2 vUv; varying vec3 vC; varying vec3 vW; varying float vWord;
        void main(){
          float d = 1.0 - vUv.y;                       // 0 at the ground line, 1 deepest
          float wet = puddle(vW.xz);
          float rip = sin(vW.y * 38.0 + vW.x * 5.0 + uT * 1.7) * 0.018 + sin(vW.y * 13.0 - uT * 0.9) * 0.012;
          vec2 uv = vec2(vUv.x + rip * (0.4 + wet), d * 1.5);
          if (uv.y > 1.0) discard;
          float idx = floor(vWord + 0.5);
          vec2 cell = vec2(mod(idx, 4.0), floor(idx / 4.0));
          vec2 auv = vec2((cell.x + clamp(uv.x, 0.0, 1.0)) / 4.0, 1.0 - (cell.y + 1.0 - uv.y) / 2.0);
          float sgn = textureLod(uAtlas, auv, 2.5).a;
          float f = 1.0 - exp(-pow(distance(vW, cameraPosition) * uFogDen, 1.35));
          gl_FragColor = vec4(vC * sgn * mix(0.06, 0.6, wet) * exp(-d * 1.8) * (1.0 - f), 1.0);
        }`,
    });
    const refl = new THREE.Mesh(instGeo(quad), rm);
    refl.frustumCulled = false;
    refl.renderOrder = 2;
    scene.add(refl);
  }

  // ---------------- ground: dark wet asphalt, no grid ----------------
  {
    const g = new THREE.PlaneGeometry(800, 800); g.rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      uniforms: U, depthWrite: false,
      vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        ${FOG}
        uniform float uRollZ; uniform float uRollR; uniform vec2 uSpan;
        varying vec3 vW;
        void main(){
          vec2 p = vW.xz;
          float wet = puddle(p);
          float n = vnoise(p * 0.35) * 0.6 + vnoise(p * 1.9) * 0.3 + hash12(floor(p * 24.0)) * 0.1;
          vec3 col = vec3(0.0075, 0.0078, 0.0090) * (0.65 + 0.7 * n) * (1.0 - 0.45 * wet);
          // wet sheen: the haze reflected only at grazing angles, stronger in the puddles
          vec3 V = normalize(cameraPosition - vW);
          float fr = pow(1.0 - max(V.y, 0.0), 8.0);
          col += hazeCol(reflect(-V, vec3(0.0, 1.0, 0.0))) * mix(0.06, 0.4, wet) * fr * 0.55;
          // the roller's contact shadow and occlusion along its length
          float inSpan = smoothstep(uSpan.x - 1.0, uSpan.x + 0.5, p.x) * (1.0 - smoothstep(uSpan.y - 0.5, uSpan.y + 1.2, p.x));
          float dz = p.y - uRollZ;
          col *= 1.0 - inSpan * (dz < 0.0 ? 0.92 : 0.92 * exp(-dz * dz / (uRollR * uRollR * 0.9)));
          gl_FragColor = vec4(fogIt(col, vW), 1.0);
        }`,
    });
    const ground = new THREE.Mesh(g, m);
    ground.renderOrder = -1;
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
          vec3 col = mix(uFog, vec3(0.005, 0.006, 0.009), smoothstep(0.0, 0.35, e));
          float az = exp(-pow(atan(vD.x, -vD.z) / 0.8, 2.0));
          col += vec3(0.040, 0.056, 0.074) * az * exp(-max(e, 0.0) * 4.5);
          col += vec3(0.02, 0.028, 0.036) * exp(-pow(atan(vD.x, -vD.z) / 0.2, 2.0)) * exp(-max(e, 0.0) * 30.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), m);
    sky.renderOrder = -2;   // first: the ground writes no depth (reflections show through it), so it must cover the sky
    sky.frustumCulled = false;
    scene.add(sky);
  }

  // ---------------- dust motes in the air ----------------
  {
    const P = [], S = [];
    const ext = mode === 'roll' ? [50, 6, 50] : variant === 'b' ? [50, 9, 50] : [40, 5, 50];
    for (let i = 0; i < 700; i++) { P.push((R() - 0.5) * ext[0], R() * ext[1], -30 + R() * ext[2]); S.push(R()); }
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
    const motes = new THREE.Points(g, m);
    motes.frustumCulled = false;
    motes.renderOrder = 6;
    scene.add(motes);
  }

  // ---------------- roll: the roller on its yoke, dust and sparks ----------------
  let roller = null, yoke = null, waveMat = null, blackMat = null;
  if (mode === 'roll') {
    const L = DRUM_X1 - DRUM_X0, XC = (DRUM_X0 + DRUM_X1) / 2;
    // shared dark-metal lighting: haze reflections, a cold rim from the back light, a key from high front left,
    // a warm bounce from the lit field ahead, darker toward the ground
    const METAL = /* glsl */`
      vec3 metal(vec3 n, vec3 V, vec3 wp, float rough){
        float ndv = max(dot(n, V), 0.0);
        vec3 refl = reflect(-V, n);
        vec3 col = vec3(0.006, 0.0065, 0.0075);
        col += hazeCol(refl) * smoothstep(-0.1, 0.5, refl.y) * (0.25 + 1.1 * pow(1.0 - ndv, 2.5)) * rough;
        col += vec3(0.010, 0.012, 0.014) * smoothstep(0.0, 1.0, dot(n, normalize(vec3(-0.4, 0.8, 0.45))));
        vec3 Lb = normalize(vec3(0.15, 0.75, -0.65));
        col += vec3(0.40, 0.56, 0.70) * pow(1.0 - ndv, 3.0) * max(dot(n, Lb), 0.0) * 2.0;
        vec3 H = normalize(normalize(vec3(-0.6, 0.6, 0.5)) + V);
        col += vec3(0.30, 0.36, 0.42) * pow(max(dot(n, H), 0.0), 50.0) * 0.5 * rough;
        float low = 1.0 - smoothstep(0.0, ${RR.toFixed(2)} * 0.9, wp.y);
        col += vec3(0.20, 0.14, 0.09) * low * max(n.z, 0.0) * 0.22;
        col *= mix(0.3, 1.0, smoothstep(0.0, ${RR.toFixed(2)} * 1.1, wp.y));
        return col;
      }`;
    // drum: a smooth cylinder; ribs and bands are shading detail (no vertex displacement, so no kinks)
    const geo = new THREE.CylinderGeometry(RR, RR, L, 200, 1, true);
    geo.rotateZ(Math.PI / 2);   // axis along x
    geo.translate(XC, 0, 0);
    const drumMat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: /* glsl */`varying vec3 vW; varying vec3 vL; varying mat3 vRot;
        void main(){ vL = position; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vRot = mat3(modelMatrix); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        ${FOG}
        ${METAL}
        varying vec3 vW; varying vec3 vL; varying mat3 vRot;
        void main(){
          float th = atan(vL.z, vL.y);
          vec3 radial = vec3(0.0, cos(th), sin(th)), tang = vec3(0.0, -sin(th), cos(th));
          // 28 longitudinal ribs: a raised profile, expressed as a normal tilt
          float c = 0.5 + 0.5 * cos(th * 28.0);
          float slope = -56.0 * pow(c, 3.0) * sin(th * 28.0) * 0.5;
          vec3 nL = normalize(radial - tang * slope * 0.022);
          // circumferential bands every 3.6 units: a groove with a lit lip
          float bx = vL.x / 3.6;
          float bd = abs(fract(bx) - 0.5) * 3.6;
          float groove = 1.0 - smoothstep(0.05, 0.16, bd);
          float lip = exp(-pow((bd - 0.2) / 0.04, 2.0));
          vec3 n = normalize(vRot * nL);
          vec3 V = normalize(cameraPosition - vW);
          vec3 col = metal(n, V, vW, 1.0);
          col *= 1.0 - 0.75 * groove;
          col += vec3(0.05, 0.06, 0.07) * lip * pow(1.0 - max(dot(n, V), 0.0), 2.0);
          col *= 0.8 + 0.4 * c;
          // worn plates
          col *= 0.85 + 0.3 * vnoise(vec2(vL.x * 0.8, th * 6.0));
          vec3 D = vW - cameraPosition; float dd = length(D);
          gl_FragColor = vec4(mix(col, hazeCol(D / dd), 1.0 - exp(-pow(dd * uFogDen * 0.3, 1.35))), 1.0);
        }`,
    });
    const drum = new THREE.Mesh(geo, drumMat);
    drum.frustumCulled = false;
    roller = new THREE.Group();
    roller.add(drum);
    // end caps: recessed discs with a ring of bolts and spokes (they turn with the drum)
    const capMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`varying vec3 vW; varying vec2 vP; varying vec3 vN;
        void main(){ vP = position.xy; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        ${FOG}
        ${METAL}
        varying vec3 vW; varying vec2 vP; varying vec3 vN;
        void main(){
          float r = length(vP) / ${RR.toFixed(2)};
          float a = atan(vP.y, vP.x);
          vec3 V = normalize(cameraPosition - vW);
          vec3 col = metal(normalize(vN), V, vW, 0.6);
          float ring = smoothstep(0.02, 0.0, abs(r - 0.94)) + smoothstep(0.015, 0.0, abs(r - 0.62)) + smoothstep(0.025, 0.0, abs(r - 0.22));
          float bolts = step(length(vec2(fract(a / 6.2831 * 24.0) - 0.5, (r - 0.86) * 9.0)), 0.18);
          float spoke = smoothstep(0.07, 0.0, abs(sin(a * 3.0))) * step(0.22, r) * step(r, 0.62);
          col += vec3(0.06, 0.07, 0.085) * (ring * 0.9 + bolts * 1.2 + spoke * 0.5) * (0.4 + 0.6 * pow(1.0 - max(dot(vN, V), 0.0), 1.5));
          col *= 1.0 - 0.35 * step(r, 0.62) * step(0.22, r);
          vec3 D = vW - cameraPosition; float dd = length(D);
          gl_FragColor = vec4(mix(col, hazeCol(D / dd), 1.0 - exp(-pow(dd * uFogDen * 0.35, 1.35))), 1.0);
        }`,
    });
    for (const sgn of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(RR, 96), capMat);
      cap.rotation.y = sgn * Math.PI / 2;
      cap.position.x = XC + sgn * (L / 2 - 0.25);
      cap.frustumCulled = false;
      roller.add(cap);
    }
    roller.renderOrder = 0;
    scene.add(roller);

    // the yoke: bearings on the axle, side arms rising to a heavy chassis beam behind the drum top (does not turn)
    const yMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        ${FOG}
        ${METAL}
        varying vec3 vW; varying vec3 vN;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          vec3 col = metal(normalize(vN), V, vW, 0.8) * 1.15;
          vec3 D = vW - cameraPosition; float dd = length(D);
          gl_FragColor = vec4(mix(col, hazeCol(D / dd), 1.0 - exp(-pow(dd * uFogDen * 0.35, 1.35))), 1.0);
        }`,
    });
    yoke = new THREE.Group();
    const add = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, yMat); m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; m.frustumCulled = false; yoke.add(m); return m; };
    for (const sgn of [-1, 1]) {
      const ex = XC + sgn * (L / 2 + 0.55);
      const axle = new THREE.CylinderGeometry(0.75, 0.75, 1.1, 32); axle.rotateZ(Math.PI / 2);
      add(axle, ex, 0, 0);
      const hubR = new THREE.CylinderGeometry(1.15, 1.15, 0.35, 32); hubR.rotateZ(Math.PI / 2);
      add(hubR, ex + sgn * 0.45, 0, 0);
      // the side arm: from the bearing up and back to the chassis
      const arm = new THREE.BoxGeometry(0.55, RR + 2.0, 1.25); arm.translate(0, (RR + 2.0) / 2, 0);
      add(arm, ex + sgn * 0.2, 0, 0, -0.42);
      // a gusset plate low on the arm
      add(new THREE.BoxGeometry(0.4, 1.6, 2.4), ex + sgn * 0.2, 0.2, -0.6, -0.42);
    }
    // the chassis beam across the top, behind the drum, and a counterweight block
    const beamY = Math.cos(0.42) * (RR + 2.0), beamZ = -Math.sin(0.42) * (RR + 2.0);
    add(new THREE.BoxGeometry(L + 2.2, 1.1, 1.5), XC, beamY, beamZ);
    add(new THREE.BoxGeometry(L * 0.5, 1.3, 2.6), XC - L * 0.15, beamY + 0.9, beamZ - 1.4);
    yoke.renderOrder = 0;
    scene.add(yoke);

    // dust bursts and sparks: born at each cube's crush time, shoved ahead at the drum's speed, then settling
    const P = [], A = [], B = [], C = [];
    const vAt = (t) => (rollZ(t + 0.01) - rollZ(t - 0.01)) / 0.02;
    cubes.forEach((c) => {
      if (c.crush < 0 || c.crush > dur + 1) return;
      const vz = vAt(c.crush);
      const n = 16;
      for (let j = 0; j < n; j++) {
        P.push(c.x + (R() - 0.5) * c.s, 0.05 + R() * c.h * 0.6, c.z + (R() - 0.5) * c.s);
        const sp = 0.8 + R() * 2.6, ang = (R() - 0.5) * Math.PI * 1.7;
        A.push(Math.sin(ang) * sp, 0.8 + R() * 2.8, vz * (1.0 + R() * 0.35) + Math.cos(ang) * sp * 0.6);
        B.push(c.crush, R(), j < 5 ? 1 : 0, 0.6 + R() * 1.3);   // birth, rand, spark, life
        C.push(...c.col);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aV', new THREE.Float32BufferAttribute(A, 3));
    g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 4));
    g.setAttribute('aC', new THREE.Float32BufferAttribute(C, 3));
    const burstMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uScale: { value: 800 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`uniform float uT; uniform float uScale; attribute vec3 aV; attribute vec4 aB; attribute vec3 aC; varying vec3 vC;
        void main(){
          float age = uT - aB.x;
          float life = aB.w;
          float alive = step(0.0, age) * step(age, life);
          float a = clamp(age, 0.0, life);
          float k = 2.6;
          vec3 p = position + aV * (1.0 - exp(-k * a)) / k + vec3(0.0, -(aB.z > 0.5 ? 4.5 : 1.4) * a * a, 0.0);
          p.y = max(p.y, 0.03);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float t = a / life;
          gl_PointSize = clamp((0.22 + 0.8 * t) * uScale / -mv.z * mix(1.0, 0.18, aB.z), 1.5, 90.0) * alive;
          vec3 dust = mix(vec3(0.34, 0.35, 0.37), aC, 0.4) * (1.0 - t) * (1.0 - t) * 0.5;
          vec3 spark = mix(aC, vec3(1.0, 0.82, 0.55), 0.6) * 7.0 * exp(-a * 3.5);
          vC = mix(dust, spark, aB.z) * alive;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`varying vec3 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q,q) * 10.0); if (a < 0.03) discard; gl_FragColor = vec4(vC * a, 1.0); }`,
    });
    const bursts = new THREE.Points(g, burstMat);
    bursts.frustumCulled = false;
    bursts.renderOrder = 7;
    scene.add(bursts);

    // the dust skirt: a band of dust rolling along the ground just ahead of the contact line, all along the drum
    {
      const P2 = [], S2 = [];
      for (let i = 0; i < 2200; i++) { P2.push(DRUM_X0 + R() * L, R(), R()); S2.push(R()); }
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3));
      g2.setAttribute('aS', new THREE.Float32BufferAttribute(S2, 1));
      waveMat = new THREE.ShaderMaterial({
        uniforms: { ...U, uScale: { value: 800 }, uSpeed: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`uniform float uT; uniform float uScale; uniform float uRollZ; uniform float uSpeed; attribute float aS; varying vec3 vC;
          void main(){
            float cyc = fract(uT * (0.8 + aS * 0.9) + position.z);
            float x = position.x + sin(uT * 0.7 + aS * 30.0) * 0.6;
            float y = 0.04 + cyc * (0.3 + 1.4 * position.y) + sin(uT * 2.0 + aS * 11.0) * 0.06;
            float z = uRollZ + 1.0 + cyc * (0.6 + 2.4 * aS);
            vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
            float sp = 0.35 + 0.65 * clamp(uSpeed / 10.0, 0.0, 1.0);
            gl_PointSize = clamp((0.12 + 0.45 * cyc) * uScale / -mv.z, 1.0, 36.0);
            vC = mix(vec3(0.30, 0.30, 0.31), vec3(0.55, 0.42, 0.30), 0.35 * (1.0 - cyc)) * sin(3.14159 * cyc) * 0.22 * sp;
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

    // the last frames: the drum fills the lens; a screen-space fade lands the black exactly on the cut
    blackMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: /* glsl */`void main(){ gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`uniform float uA; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, uA); }`,
    });
    const bq = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blackMat);
    bq.frustumCulled = false; bq.renderOrder = 100;
    scene.add(bq);
  }

  const pointMats = [];
  scene.traverse((o) => { if (o.isPoints) pointMats.push(o.material); });
  return {
    scene, camera,
    bloom: { strength: 0.6, radius: 0.45, threshold: 0.6 },
    exposure: 1.0,
    update(lt, c) {
      const k = c.k;
      U.uT.value = lt;
      const scale = 1080 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      pointMats.forEach((m) => { if (m.uniforms.uScale) m.uniforms.uScale.value = scale; });
      if (mode === 'roll') {
        const zr = rollZ(lt);
        U.uRollZ.value = zr;
        roller.position.set(0, RR, zr);
        roller.rotation.x = zr / RR;     // rolls without slipping
        yoke.position.set(0, RR, zr);
        waveMat.uniforms.uSpeed.value = speedAt(lt);
        blackMat.uniforms.uA.value = smooth((lt - (c.dur - 0.16)) / 0.14);
      } else {
        U.uRollZ.value = -999;
      }
      camAt(k, lt, camera);
    },
  };
});
