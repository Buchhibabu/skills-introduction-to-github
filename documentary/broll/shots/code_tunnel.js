// code_tunnel: "Then the wheel turned to the coders." The camera flies down an endless octagonal tunnel lined
// with monitor panels of scrolling, syntax-coloured source code. Text lines run along the direction of
// travel, so as the camera accelerates the code smears into light streaks (real shutter blur in the
// shader); edge seams and floating data motes streak too. The vanishing point stays dark and calm for a
// centred chapter title.
//
// opts:
//   speed  [[k, unitsPerSecond], ...]  camera speed over shot progress k (smooth between keys, distance is
//          the exact integral, so any duration works). Default [[0, 6], [0.5, 14], [1, 30]].
//   seed   panel layout seed (default 3)
// All generic code: no real product, company or person names.
import { THREE, register, rng, noise, smooth, clamp, lerp } from '../kit.js';

const SH = 1 / 48;                 // 180-degree shutter at 24 fps
const RAD = 3.2;                   // tunnel "radius" (octagon apothem, m)
const PANEL = 3.6;                 // panel length along the tunnel (m)
const TAU = Math.PI * 2;

// distance and speed from smoothstep-interpolated keys over k
function travel(keys, k, dur) {
  if (k <= keys[0][0]) return { d: keys[0][1] * k * dur, v: keys[0][1] };
  let d = keys[0][1] * keys[0][0] * dur;
  for (let i = 1; i < keys.length; i++) {
    const [a, va] = keys[i - 1], [b, vb] = keys[i], span = b - a;
    if (k <= b && span > 0) { const x = (k - a) / span; return { d: d + dur * span * (va * x + (vb - va) * (x * x * x - x * x * x * x / 2)), v: va + (vb - va) * x * x * (3 - 2 * x) }; }
    d += dur * span * (va + vb) / 2;
  }
  const [kl, vl] = keys[keys.length - 1];
  return { d: d + dur * vl * (k - kl), v: vl };
}

// ---------------------------------------------------------------- code atlas
const LINES = [
  '# training loop', 'def train_step(model, batch, optimizer):', '    inputs, targets = batch', '    logits = model(inputs)',
  '    loss = cross_entropy(logits, targets)', '    loss.backward()', '    optimizer.step()', '    optimizer.zero_grad()', '    return loss.item()', '',
  'for epoch in range(num_epochs):', '    for i, batch in enumerate(loader):', '        loss = train_step(model, batch, opt)', '        if i % 100 == 0:',
  '            log(f"epoch {epoch} step {i} loss {loss:.4f}")', '',
  '// request handler', 'export async function handle(req, res) {', '  const user = await session.get(req.headers.token);', '  if (!user) return res.status(401).end();',
  '  const prompt = sanitize(req.body.prompt);', '  const reply = await complete(prompt, { maxTokens: 512 });', '  await feedback.record(user.id, reply.id);', '  res.json({ reply });', '}', '',
  'func (s *Server) Run(ctx context.Context) error {', '\tfor {', '\t\tselect {', '\t\tcase job := <-s.queue:', '\t\t\tif err := s.process(job); err != nil {',
  '\t\t\t\treturn err', '\t\t\t}', '\t\tcase <-ctx.Done():', '\t\t\treturn nil', '\t\t}', '\t}', '}', '',
  'fn tokenize(text: &str) -> Vec<u32> {', '    let mut ids = Vec::with_capacity(text.len());', '    for word in text.split_whitespace() {', '        ids.push(vocab.lookup(word));', '    }', '    ids', '}', '',
  'class Cache:', '    def __init__(self, size=4096):', '        self.size = size', '        self.store = {}', '    def get(self, key):', '        return self.store.get(key)', '',
  'const results = items.filter(x => x.score > 0.92).map(render);', 'SELECT id, rating, created_at FROM events WHERE rating = 1;', 'git commit -m "refactor: extract pipeline stage"',
  '  // TODO: batch these writes', '  for (let i = 0; i < shards.length; i++) {', '    await shards[i].flush();', '  }', 'assert len(dataset) == 1_000_000', 'model = load_checkpoint("ckpt/step_120000")',
  'def evaluate(model, data):', '    correct = 0', '    for x, y in data:', '        correct += int(model.predict(x) == y)', '    return correct / len(data)', '',
  'interface Event { id: string; kind: "thumb" | "text"; ts: number }', 'type Handler = (e: Event) => Promise<void>;', 'const handlers: Handler[] = [];', '',
];
const KW = new Set(['def', 'return', 'for', 'in', 'if', 'else', 'class', 'import', 'from', 'export', 'async', 'await', 'function', 'const', 'let', 'mut', 'fn', 'func', 'case', 'select', 'type', 'interface', 'SELECT', 'FROM', 'WHERE', 'nil', 'self', 'err', 'while', 'new']);
function codeAtlas(seed) {
  const W = 1024, H = 2048, R = rng(seed), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#06090d'; g.fillRect(0, 0, W, H);
  const LH = 20, cols = 1, CW = W / cols;
  g.font = '400 16px "IBM Plex Mono"'; g.textBaseline = 'middle';
  const COL = { kw: '#f0a63a', str: '#6cc3bd', fn: '#8fb0dd', com: '#5c6672', num: '#e0705f', id: '#c9d1d9', pun: '#8a939e' };
  for (let col = 0; col < cols; col++) {
    let li = Math.floor(R() * LINES.length);
    for (let row = 0; row < H / LH; row++) {
      const y = row * LH + LH / 2, x0 = col * CW + 58;
      g.fillStyle = '#2b333d'; g.fillText(String(row + 1).padStart(4, ' '), col * CW + 8, y);
      let line = LINES[li % LINES.length]; li++;
      if (R() < 0.08) line = '';
      const indent = line.match(/^[\t ]*/)[0].replace(/\t/g, '    ').length;
      let x = x0 + indent * 9.6;
      const body = line.trim();
      if (body.startsWith('#') || body.startsWith('//')) { g.fillStyle = COL.com; g.fillText(body, x, y); continue; }
      for (const tok of body.match(/"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*|\d[\d_.]*|\s+|./g) || []) {
        let colr = COL.pun;
        if (/^["']/.test(tok)) colr = COL.str;
        else if (/^\d/.test(tok)) colr = COL.num;
        else if (KW.has(tok)) colr = COL.kw;
        else if (/^[A-Za-z_]/.test(tok)) colr = COL.id;
        const w = g.measureText(tok).width;
        if (colr === COL.id && body[body.indexOf(tok) + tok.length] === '(') colr = COL.fn;
        g.fillStyle = colr; g.fillText(tok, x, y); x += w;
      }
    }
  }
  // streak twin: every line smeared horizontally (along the travel direction) by ~70 px, line structure kept
  const sc = document.createElement('canvas'); sc.width = W / 2; sc.height = H / 2;     // half-res is plenty once smeared
  const sg = sc.getContext('2d'); sg.fillStyle = '#000'; sg.fillRect(0, 0, W / 2, H / 2); sg.globalCompositeOperation = 'lighter';
  const N = 18; sg.globalAlpha = 1.25 / N;
  for (let i = 0; i < N; i++) sg.drawImage(c, (i / (N - 1) - 0.5) * 36, 0, W / 2, H / 2);
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapNearestFilter; return t; };
  return { sharp: mk(c), streak: mk(sc) };
}

// ---------------------------------------------------------------- shaders
// One quad per panel: every per-panel decision (on/off, brightness, code window, scroll, error state,
// cursor) is made once per vertex from the panel's world index and passed flat; the fragment shader only
// does the bezel, the (motion-blurred) code lookup and the tint.
const WALL_VS = `
attribute float aFace, aFlip; attribute vec2 aP; attribute float aPZ;
uniform float uT, uSeed, uPanelLen;
varying vec3 vW; varying vec2 vP;
flat varying float vFace, vFlip, vOn, vBr, vErr, vCur, vScroll, vRow, vCol;
float h1(float n) { return fract(sin(n * 127.1 + uSeed) * 43758.5453); }
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vP = aP; vFace = aFace; vFlip = aFlip;
  float pzW = floor(-(modelMatrix * vec4(0.0, 0.0, aPZ, 1.0)).z / uPanelLen + 0.5);   // world panel index
  float pid = pzW + aFace * 1000.0;
  vOn = step(0.12, h1(pid));
  vBr = mix(0.6, 1.35, h1(pid + 3.1)) * vOn;
  vErr = step(0.94, h1(pid + 11.0));
  vCur = h1(pid + 2.2);
  vScroll = uT * mix(0.6, 3.5, h1(pid + 7.7)) / 100.0;
  vRow = h1(pid + 5.9) * 0.7;
  vCol = step(0.5, h1(pid + 1.3)) * 0.5;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WALL_FS = `
uniform sampler2D uCode, uStreak; uniform float uT, uBlur, uSpeed, uFogDen, uPanelLen, uPulse;
uniform vec3 uFog;
varying vec3 vW; varying vec2 vP;
flat varying float vFace, vFlip, vOn, vBr, vErr, vCur, vScroll, vRow, vCol;
void main() {
  float face = vFace;
  float z = -vW.z;
  float dist = length(cameraPosition - vW);
  vec3 col;
  if (face > 7.5) {
    // floor: dark grating with lane glow and a fake reflection of the wall light
    float lane = abs(vP.y - 0.5);
    float grid = smoothstep(0.46, 0.5, abs(fract(z / 0.6) - 0.5));
    col = vec3(0.012, 0.014, 0.018) * (1.0 - 0.6 * grid);
    col += vec3(0.25, 0.34, 0.4) * 0.05 * smoothstep(0.5, 0.2, lane);
    col += vec3(0.42, 0.95, 0.9) * 0.25 * exp(-pow((lane - 0.47) * 60.0, 2.0)) * (0.6 + 0.4 * sin(z * 0.8 - uT * 6.0));
  } else {
    vec2 p = vP;
    if (vFlip > 0.5) p.x = 1.0 - p.x;
    float bez = 0.035;
    float inside = step(bez, p.x) * step(p.x, 1.0 - bez) * step(bez * 1.6, p.y) * step(p.y, 1.0 - bez * 1.6);
    vec2 cuv = vec2((p.x - bez) / (1.0 - 2.0 * bez), 1.0 - ((1.0 - p.y) * 0.3 + vRow + vCol + vScroll));
    float sweep = uBlur / uPanelLen;
    vec3 tx;
    float st = sweep * 1024.0;                      // shutter sweep in atlas texels
    if (st < 1.5) tx = texture(uCode, cuv, -0.3).rgb;
    else {
      float sg = vFlip > 0.5 ? -1.0 : 1.0;
      vec3 a = texture(uCode, cuv + vec2(sg * sweep * 0.5, 0.0)).rgb;
      vec3 b = texture(uStreak, cuv + vec2(sg * sweep * 0.5, 0.0)).rgb;
      tx = mix(a, b, smoothstep(4.0, 60.0, st));
    }
    vec3 tint = mix(vec3(1.0), vec3(1.25, 0.55, 0.45), vErr);
    float cur = exp(-pow((p.y - fract(vCur + uT * 0.07)) * 70.0, 2.0)) * vOn;
    vec2 pc = p - 0.5; float vig = 1.0 - dot(pc * vec2(1.1, 1.6), pc * vec2(1.1, 1.6));
    vec3 screen = tx * tint * vBr * 3.4 + vec3(0.014, 0.03, 0.04) * vOn * vig + vec3(0.9, 0.62, 0.25) * cur * 0.14;
    col = mix(vec3(0.01, 0.012, 0.015), screen, inside);
    col *= 1.0 + uPulse * 1.2 * exp(-pow(fract((z + uT * 22.0) / 60.0) - 0.5, 2.0) * 120.0);
  }
  float e = min(vP.y, 1.0 - vP.y);
  float seam = exp(-e * e * 40000.0);
  float dash = mix(0.35 + 0.65 * step(0.5, fract(z / 2.4 + face * 0.37)), 1.0, smoothstep(6.0, 20.0, uSpeed));
  col += mix(vec3(0.42, 0.95, 0.9), vec3(0.95, 0.66, 0.28), step(2.5, face) * step(face, 5.5)) * seam * dash * (0.25 + 0.05 * uSpeed);
  col = mix(col, uFog, 1.0 - exp(-uFogDen * uFogDen * dist * dist));
  gl_FragColor = vec4(col, 1.0);
}`;

register('code_tunnel', (opts) => {
  const keys = Array.isArray(opts.speed) && opts.speed.length ? opts.speed : [[0, 6], [0.5, 14], [1, 30]];
  const seed = opts.seed ?? 3;
  const R = rng(seed * 131 + 7);

  const FOG = new THREE.Color(0x04070a);
  const scene = new THREE.Scene();
  scene.background = FOG.clone();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);

  // octagonal tunnel, 160 m long, recentred on the camera in whole-panel steps (content keys off world z)
  const NP = 46;                                    // panels per face: from 2 behind the lens to ~158 m ahead
  const pos = [], aP = [], face = [], flip = [], pz = [], idx = [];
  for (let f = 0; f < 8; f++) {
    const a0 = (f / 8) * TAU - Math.PI / 2 - Math.PI / 8, a1 = a0 + TAU / 8;
    const r = RAD / Math.cos(Math.PI / 8);
    const p0 = [Math.cos(a0) * r, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, Math.sin(a1) * r];
    const up0 = p0[1] > p1[1] + 1e-6 ? 1 : 0, fl = (p0[0] + p1[0]) / 2 > 0.01 ? 1 : 0, fid = f === 0 ? 8 : f;
    for (let j = 0; j < NP; j++) {
      const zA = (2 - j) * PANEL, zB = zA - PANEL, zc = zA - PANEL / 2, base = pos.length / 3;
      pos.push(p0[0], p0[1], zA, p1[0], p1[1], zA, p0[0], p0[1], zB, p1[0], p1[1], zB);
      aP.push(0, up0, 0, 1 - up0, 1, up0, 1, 1 - up0);
      for (let v = 0; v < 4; v++) { face.push(fid); flip.push(fl); pz.push(zc); }
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 2));
  tg.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 1));
  tg.setAttribute('aFlip', new THREE.Float32BufferAttribute(flip, 1));
  tg.setAttribute('aPZ', new THREE.Float32BufferAttribute(pz, 1));
  tg.setIndex(idx);
  const code = codeAtlas(seed);
  const wallMat = new THREE.ShaderMaterial({
    uniforms: { uCode: { value: code.sharp }, uStreak: { value: code.streak }, uT: { value: 0 }, uBlur: { value: 0 }, uSpeed: { value: 0 }, uFogDen: { value: 0.03 }, uSeed: { value: seed * 1.37 }, uPanelLen: { value: PANEL }, uFog: { value: FOG }, uPulse: { value: 0 } },
    vertexShader: WALL_VS, fragmentShader: WALL_FS, side: THREE.DoubleSide,
  });
  const tunnel = new THREE.Mesh(tg, wallMat); tunnel.frustumCulled = false; scene.add(tunnel);

  // data motes: small glowing squares drifting in the tunnel, streaked over the shutter by the camera speed
  const nM = 700, mSrc = new Float32Array(nM * 4), mCol = new Float32Array(nM * 3);
  for (let i = 0; i < nM; i++) {
    const a = R() * TAU, rr = Math.sqrt(R()) * (RAD - 0.4);
    mSrc.set([Math.cos(a) * rr, Math.sin(a) * rr * 0.85, R() * 120, 0.006 + R() * 0.014], i * 4);
    const c = R(); mCol.set(c < 0.5 ? [1.0, 0.68, 0.3] : c < 0.85 ? [0.45, 0.95, 0.9] : [0.95, 0.4, 0.32], i * 3);
  }
  const mg = new THREE.BufferGeometry(), C = [0, -1, 0, 1, 1, -1, 1, 1];
  const mCorner = new Float32Array(nM * 8), mA = new Float32Array(nM * 16), mC = new Float32Array(nM * 12), mIdx = new Uint32Array(nM * 6);
  for (let i = 0; i < nM; i++) {
    mCorner.set(C, i * 8);
    for (let v = 0; v < 4; v++) { mA.set(mSrc.subarray(i * 4, i * 4 + 4), (i * 4 + v) * 4); mC.set(mCol.subarray(i * 3, i * 3 + 3), (i * 4 + v) * 3); }
    const a = i * 4; mIdx.set([a, a + 1, a + 3, a, a + 3, a + 2], i * 6);
  }
  mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nM * 12), 3));
  mg.setAttribute('corner', new THREE.BufferAttribute(mCorner, 2));
  mg.setAttribute('aM', new THREE.BufferAttribute(mA, 4));
  mg.setAttribute('aC', new THREE.BufferAttribute(mC, 3));
  mg.setIndex(new THREE.BufferAttribute(mIdx, 1));
  const moteMat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: 0 }, uStreak: { value: 0 }, uPix: { value: 0.001 }, uT: { value: 0 } },
    vertexShader: `attribute vec2 corner; attribute vec4 aM; attribute vec3 aC; uniform float uCam, uStreak, uPix, uT;
varying vec2 vQ; varying float vLen, vW, vI; varying vec3 vCol;
void main(){
  // motes live in a 120 m window ahead of the camera, wrapping as it advances
  float zr = mod(aM.z - uCam, 120.0);             // distance ahead (0..120)
  vec3 p = vec3(aM.x + sin(uT * 0.5 + aM.z) * 0.1, aM.y + cos(uT * 0.4 + aM.z * 1.3) * 0.1, -uCam - zr + 1.0);
  vec4 c1 = viewMatrix * vec4(p, 1.0), c0 = viewMatrix * vec4(p + vec3(0.0, 0.0, -uStreak), 1.0);
  float pix = uPix * max(0.05, -c1.z), w = max(aM.w, pix * 1.2);
  vec2 d = c1.xy - c0.xy; float L = length(c1.xyz - c0.xyz);
  vec3 dir = L > 1e-5 ? (c1.xyz - c0.xyz) / L : vec3(0.0, 1.0, 0.0);
  vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 1e-4, 0.0));
  vec3 q = mix(c0.xyz - dir * w, c1.xyz + dir * w, corner.x) + side * corner.y * w;
  vQ = vec2(corner.x * (L + 2.0 * w), corner.y * w); vLen = L; vW = w;
  vI = (aM.w / w) * (aM.w / w) * 6.0 * smoothstep(120.0, 60.0, zr) * smoothstep(0.6, 3.0, zr) / (1.0 + L * 0.4);
  vCol = aC;
  gl_Position = projectionMatrix * vec4(q, 1.0);
  if (-c1.z < 0.3) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`,
    fragmentShader: `varying vec2 vQ; varying float vLen, vW, vI; varying vec3 vCol;
void main(){ float ax = max(0.0, max(vW - vQ.x, vQ.x - (vLen + vW))); float d2 = (ax * ax + vQ.y * vQ.y) / (vW * vW); float g = exp(-d2 * 3.0); if (vI * g < 0.003) discard; gl_FragColor = vec4(vCol * vI * g, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Mesh(mg, moteMat); motes.frustumCulled = false; scene.add(motes);

  // the light at the end of the tunnel (stays a fixed distance ahead, dim enough for a title on top)
  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 128;
  { const g = glowC.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }
  const glowT = new THREE.CanvasTexture(glowC); glowT.colorSpace = THREE.SRGBColorSpace;
  const endGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: new THREE.Color(0.55, 0.85, 0.85), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.3 }));
  endGlow.scale.set(26, 18, 1); scene.add(endGlow);

  return {
    scene, camera,
    bloom: { strength: 0.72, radius: 0.55, threshold: 0.62 },
    exposure: 1.0,
    update(lt, c) {
      const { d, v } = travel(keys, c.k, c.dur);
      const camZ = -d;
      // gentle drift and roll; a touch of shake as the speed climbs
      const sh = 0.004 * v;
      camera.position.set(noise(lt * 0.35 + 1) * 0.35 + noise(lt * 7) * sh, noise(lt * 0.3 + 4) * 0.22 - 0.1 + noise(lt * 8 + 2) * sh, camZ);
      camera.lookAt(noise(lt * 0.25 + 9) * 0.6, noise(lt * 0.22 + 2) * 0.3 - 0.15, camZ - 30);
      camera.rotateZ(noise(lt * 0.2 + 5) * 0.05 + lerp(0, 0.03, smooth(c.k)));
      camera.fov = lerp(40, 58, smooth(clamp((v - 6) / 26))); camera.updateProjectionMatrix();
      tunnel.position.z = Math.ceil(camZ / PANEL) * PANEL;      // whole panels: content stays fixed in world z
      const u = wallMat.uniforms;
      // the shutter opens with the speed: legible code at cruising speed, light streaks at full tilt
      u.uT.value = lt; u.uBlur.value = v * SH * smooth(clamp((v - 7) / 17)); u.uSpeed.value = v; u.uPulse.value = smooth(clamp((v - 10) / 20));
      const mu = moteMat.uniforms;
      mu.uCam.value = d; mu.uStreak.value = v * SH * 1.5; mu.uPix.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / 1080; mu.uT.value = lt;
      endGlow.position.set(0, -0.1, camZ - 90);
      endGlow.material.opacity = 0.18 + 0.25 * smooth(clamp((v - 8) / 22));
    },
  };
});
