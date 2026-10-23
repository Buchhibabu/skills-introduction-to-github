// code_tunnel: "Then the wheel turned to the coders." The camera flies down an endless octagonal service
// tunnel whose walls are recessed monitor panels of scrolling, syntax-coloured source code. Every third
// panel boundary carries a bevelled ring frame; cable trays run along the floor edges and cables sag
// between the frames overhead. Panel light spills onto bezels, frames, cables and the floor. Text lines run
// along the direction of travel, so as the camera accelerates the code smears into saturated light streaks
// on black (real shutter blur in the shader); the jump gets more contrasty, never foggier. A cone around
// the tunnel axis stays free of motes, so the vanishing point is clean dark for a centred chapter title.
//
// opts:
//   speed  [[k, unitsPerSecond], ...]  camera speed over shot progress k (smooth between keys, distance is
//          the exact integral, so any duration works). Default [[0, 6], [0.5, 14], [1, 30]].
//   seed   panel layout / code seed (default 3)
// Overlay: centre (vanishing point) is kept dark and mote-free for a centred card; the bottom-centre floor
// lane stays dim for a label at y ~940. All generic code: no real product, company or person names.
import { THREE, register, rng, noise, smooth, clamp, lerp } from '../kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SH = 1 / 48;                 // 180-degree shutter at 24 fps
const RAD = 3.2;                   // tunnel "radius" (octagon apothem, m)
const PANEL = 3.6;                 // panel length along the tunnel (m)
const RING = 3;                    // a ring frame every RING panels
const TAU = Math.PI * 2;
const ATL_H = 4096, ROW = 20;      // code atlas height (px) and row pitch
const WIN = 600 / ATL_H;           // atlas window shown by one panel (v)

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

// ---------------------------------------------------------------- code generator (unique, generic)
// Blocks are built from templates with randomised identifiers and numbers, so no two windows of the atlas
// show the same block.
function codeLines(R, n) {
  const pick = (a) => a[Math.floor(R() * a.length)];
  const N = () => String(Math.floor(R() * (R() < 0.5 ? 100 : 100000)));
  const F = () => (R() * 2).toFixed(R() < 0.5 ? 2 : 4);
  const noun = ['batch', 'token', 'shard', 'event', 'reply', 'prompt', 'rating', 'session', 'vector', 'record', 'chunk', 'sample', 'score', 'cache', 'queue', 'buffer', 'weight', 'grad', 'label', 'signal', 'user', 'job', 'layer', 'head', 'step', 'frame', 'row', 'span', 'trace', 'index'];
  const verb = ['load', 'parse', 'embed', 'rank', 'merge', 'flush', 'encode', 'decode', 'score', 'sample', 'filter', 'collect', 'route', 'tokenize', 'normalize', 'shuffle', 'compact', 'project', 'update', 'record', 'stream', 'reduce', 'gather', 'split', 'emit', 'fetch', 'commit', 'train', 'eval', 'tune'];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const id = () => pick(noun) + (R() < 0.3 ? cap(pick(noun)) : '') + (R() < 0.2 ? '_' + Math.floor(R() * 9) : '');
  const fn = () => pick(verb) + (R() < 0.6 ? '_' + pick(noun) : '');
  const fnC = () => pick(verb) + cap(pick(noun));
  const T = [
    () => [`# ${pick(verb)} ${pick(noun)}s before the next step`, `def ${fn()}(${id()}, ${id()}, ${id()}=${N()}):`, `    ${id()} = ${fn()}(${id()})`, `    for i, ${id()} in enumerate(${id()}):`, `        if i % ${N()} == 0:`, `            log(f"${pick(noun)} {i} ${pick(noun)} {${id()}:.4f}")`, `        ${id()}.${fn()}(${id()}, lr=${F()})`, `    return ${id()}`, ''],
    () => [`// ${pick(verb)} incoming ${pick(noun)}s`, `export async function ${fnC()}(${id()}, ${id()}) {`, `  const ${id()} = await ${id()}.${fnC()}(${id()});`, `  if (!${id()}) return null;`, `  const ${id()} = ${id()}.filter(x => x.${pick(noun)} > ${F()});`, `  await ${id()}.${fnC()}(${id()}.id, { limit: ${N()} });`, `  return ${id()};`, '}', ''],
    () => [`func (s *${cap(pick(noun))}) ${cap(fn().replace(/_./g, (m) => m[1].toUpperCase()))}(ctx context.Context) error {`, '\tfor {', '\t\tselect {', `\t\tcase ${id()} := <-s.${id()}:`, `\t\t\tif err := s.${fnC()}(${id()}); err != nil {`, '\t\t\t\treturn err', '\t\t\t}', '\t\tcase <-ctx.Done():', '\t\t\treturn nil', '\t\t}', '\t}', '}', ''],
    () => [`fn ${fn()}(${id()}: &[${pick(['u32', 'f32', 'u8', 'i64'])}]) -> Vec<${pick(['u32', 'f32', 'usize'])}> {`, `    let mut ${id()} = Vec::with_capacity(${N()});`, `    for ${id()} in ${id()}.iter() {`, `        ${id()}.push(${id()}.${fn()}(*${id()}));`, '    }', `    ${id()}`, '}', ''],
    () => [`class ${cap(pick(noun))}${cap(pick(noun))}:`, `    def __init__(self, ${id()}=${N()}):`, `        self.${id()} = ${id()}`, `        self.${id()} = {}`, `    def ${fn()}(self, key):`, `        return self.${id()}.get(key, ${F()})`, ''],
    () => [`SELECT ${id()}, ${id()}, created_at FROM ${pick(noun)}s`, `  WHERE ${pick(noun)} = ${Math.floor(R() * 5)} AND ${pick(noun)}_id > ${N()}`, `  ORDER BY created_at DESC LIMIT ${N()};`, ''],
    () => [`interface ${cap(pick(noun))} { id: string; kind: "${pick(['thumb', 'text', 'edit', 'flag'])}" | "${pick(['text', 'retry', 'copy'])}"; ts: number }`, `type ${cap(pick(verb))}Fn = (e: ${cap(pick(noun))}) => Promise<void>;`, `const ${id()}: ${cap(pick(verb))}Fn[] = [];`, ''],
    () => [`  // TODO: ${pick(verb)} these ${pick(noun)}s in one pass`, `  for (let i = 0; i < ${id()}.length; i++) {`, `    await ${id()}[i].${fnC()}();`, '  }', `assert len(${id()}) == ${N()}`, `${id()} = load_checkpoint("ckpt/step_${N()}")`, ''],
    () => [`def ${fn()}(model, data):`, `    ${id()} = 0`, '    for x, y in data:', `        ${id()} += int(model.${fn()}(x) == y)`, `    return ${id()} / len(data)`, ''],
    () => [`git commit -m "${pick(['refactor', 'fix', 'feat', 'perf'])}: ${pick(verb)} ${pick(noun)} ${pick(['stage', 'path', 'loop', 'cache'])}"`, `$ run --${pick(noun)}s ${N()} --lr ${F()} --seed ${Math.floor(R() * 99)}`, `[${pick(['ok', 'ok', 'ok', 'warn'])}] ${pick(noun)} ${N()}/${N()}  loss ${F()}  ${N()} tok/s`, ''],
  ];
  const out = [];
  while (out.length < n) for (const l of pick(T)()) out.push(l);
  return out.slice(0, n);
}
const KW = new Set(['def', 'return', 'for', 'in', 'if', 'else', 'class', 'import', 'from', 'export', 'async', 'await', 'function', 'const', 'let', 'mut', 'fn', 'func', 'case', 'select', 'type', 'interface', 'SELECT', 'FROM', 'WHERE', 'ORDER', 'BY', 'DESC', 'LIMIT', 'AND', 'nil', 'self', 'err', 'while', 'new', 'assert', 'null', 'git']);
const COL = { kw: '#f0a63a', str: '#6cc3bd', fn: '#8fb0dd', com: '#5c6672', num: '#e0705f', id: '#c9d1d9', pun: '#8a939e', ln: '#2b333d' };
// sharp code atlas + a "streak" twin where every token is a saturated light line (what text becomes at speed)
function codeAtlas(seed) {
  const W = 1024, H = ATL_H, R = rng(seed);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sc = document.createElement('canvas'); sc.width = W / 2; sc.height = H / 2;
  const sg = sc.getContext('2d');
  g.fillStyle = '#05080b'; g.fillRect(0, 0, W, H);
  sg.fillStyle = '#000'; sg.fillRect(0, 0, W / 2, H / 2);
  g.font = '400 16px "IBM Plex Mono"'; g.textBaseline = 'middle';
  const lines = codeLines(R, H / ROW);
  const seg = (x0, x1, y, colr) => { sg.fillStyle = colr; sg.fillRect(x0 / 2, y / 2 - 1.25, Math.max(1, (x1 - x0) / 2), 2.5); };
  lines.forEach((line, row) => {
    const y = row * ROW + ROW / 2, x0 = 58;
    g.fillStyle = COL.ln; g.fillText(String(row + 1).padStart(4, ' '), 8, y);
    const indent = line.match(/^[\t ]*/)[0].replace(/\t/g, '    ').length;
    let x = x0 + indent * 9.6;
    const body = line.trim();
    if (body.startsWith('#') || body.startsWith('//')) { g.fillStyle = COL.com; g.fillText(body, x, y); seg(x, x + g.measureText(body).width, y, '#33404c'); return; }
    for (const tok of body.match(/"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*|\d[\d_.]*|\s+|./g) || []) {
      let colr = COL.pun;
      if (/^["']/.test(tok)) colr = COL.str;
      else if (/^\d/.test(tok)) colr = COL.num;
      else if (KW.has(tok)) colr = COL.kw;
      else if (/^[A-Za-z_]/.test(tok)) colr = COL.id;
      const w = g.measureText(tok).width;
      if (colr === COL.id && body[body.indexOf(tok) + tok.length] === '(') colr = COL.fn;
      g.fillStyle = colr; g.fillText(tok, x, y);
      if (!/^\s+$/.test(tok)) seg(x, x + w, y, colr === COL.id ? '#9fb6c8' : colr === COL.pun ? '#3a4652' : colr);
      x += w;
    }
  });
  // soften the streak lines a little along their length (they are what a line of code looks like at speed)
  const s2 = document.createElement('canvas'); s2.width = W / 2; s2.height = H / 2;
  const s2g = s2.getContext('2d'); s2g.fillStyle = '#000'; s2g.fillRect(0, 0, W / 2, H / 2); s2g.globalCompositeOperation = 'lighter';
  const NS = 8; s2g.globalAlpha = 1.15 / NS;
  for (let i = 0; i < NS; i++) s2g.drawImage(sc, (i / (NS - 1) - 0.5) * 22, 0);
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 1; return t; };
  return { sharp: mk(c), streak: mk(s2) };
}
// two dashboard tiles (training run status): big numbers, a loss curve, progress bars; generic labels only
function dashAtlas(seed) {
  const W = 1024, TH = 720, R = rng(seed + 99), c = document.createElement('canvas'); c.width = W; c.height = TH * 2;
  const g = c.getContext('2d');
  g.fillStyle = '#04070a'; g.fillRect(0, 0, W, TH * 2);
  for (let t = 0; t < 2; t++) {
    const y0 = t * TH;
    g.fillStyle = '#0b1218'; g.fillRect(24, y0 + 24, W - 48, 64);
    g.font = '600 38px Oswald'; g.textBaseline = 'middle'; g.fillStyle = '#e8eef2';
    g.fillText(t ? 'EVAL  ·  PREFERENCE MODEL' : 'TRAINING RUN  0412', 44, y0 + 57);
    g.font = '400 22px "IBM Plex Mono"'; g.fillStyle = '#6cc3bd'; g.fillText(t ? '● live' : '● running', W - 190, y0 + 57);
    // big number
    g.font = '600 120px Oswald'; g.fillStyle = t ? '#6cc3bd' : '#f0a63a';
    g.fillText(t ? '0.918' : '87%', 44, y0 + 190);
    g.font = '400 24px "IBM Plex Mono"'; g.fillStyle = '#8a939e'; g.fillText(t ? 'win rate vs. baseline' : 'epoch 37 / 42', 48, y0 + 270);
    // chart
    const cx = 420, cy = y0 + 120, cw = 560, ch = 260;
    g.strokeStyle = '#1a2630'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(cx, cy + (ch / 4) * i); g.lineTo(cx + cw, cy + (ch / 4) * i); g.stroke(); }
    g.strokeStyle = t ? '#6cc3bd' : '#f0a63a'; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i <= 80; i++) { const x = i / 80, v = t ? 0.2 + 0.7 * (1 - Math.exp(-x * 3)) + (R() - 0.5) * 0.06 : 0.9 * Math.exp(-x * 2.6) + 0.08 + (R() - 0.5) * 0.05; g.lineTo(cx + x * cw, cy + ch - v * ch); }
    g.stroke();
    // progress bars
    for (let i = 0; i < 4; i++) {
      const by = y0 + 430 + i * 64, p = 0.3 + R() * 0.7;
      g.font = '400 22px "IBM Plex Mono"'; g.fillStyle = '#8a939e'; g.fillText(['shard sync', 'feedback ingest', 'reward model', 'checkpoint'][i], 48, by);
      g.fillStyle = '#121b22'; g.fillRect(330, by - 12, 620, 24);
      g.fillStyle = i === 1 ? '#f0a63a' : '#6cc3bd'; g.fillRect(330, by - 12, 620 * p, 24);
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- panel shader
// Each panel is a recessed screen: a screen quad 9 cm behind the wall plane, four bezel side walls and a
// bezel frame at the wall plane. Every per-panel decision (state, brightness, code window, split pane,
// scroll, error, cursor) is made per vertex from the panel's world index and passed flat.
const WALL_VS = `
attribute float aFace, aFlip, aPart; attribute vec2 aP; attribute float aPZ;
uniform float uT, uSeed, uPanelLen;
varying vec3 vW; varying vec2 vP;
flat varying float vFace, vFlip, vPart, vOn, vBr, vErr, vCur, vRow, vRowB, vSplit, vBig, vPid;
float h1(float n) { return fract(sin(n * 127.1 + uSeed) * 43758.5453); }
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vP = aP; vFace = aFace; vFlip = aFlip; vPart = aPart;
  float pzW = floor(-(modelMatrix * vec4(0.0, 0.0, aPZ, 1.0)).z / uPanelLen + 0.5);   // world panel index
  float pid = pzW * 8.0 + aFace; vPid = pid;
  vOn = step(0.12, h1(pid));
  vBr = mix(0.65, 1.3, h1(pid + 3.1)) * vOn;
  vErr = step(0.95, h1(pid + 11.0));
  vCur = h1(pid + 2.2);
  vBig = step(0.94, h1(pid + 17.3)) * vOn;
  vSplit = step(0.55, h1(pid + 1.3));
  // code windows: 6 slots of the atlas, assigned so that panels on the same ring and their neighbours differ,
  // plus a random offset within the slot and a per-panel scroll
  float slot = mod(pzW * 5.0 + aFace * 3.0, 13.0);
  float scr = uT * mix(0.8, 4.0, h1(pid + 7.7)) * ${(ROW / ATL_H).toFixed(6)};
  vRow = slot / 13.0 + h1(pid + 5.9) * 0.03 + scr;
  vRowB = fract(vRow + 0.5 + h1(pid + 8.8) * 0.2);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WALL_FS = `
uniform sampler2D uCode, uStreak, uDash; uniform float uT, uBlur, uSpeed, uFogDen, uPanelLen, uPulse, uHot, uBase;
uniform vec3 uFog;
varying vec3 vW; varying vec2 vP;
flat varying float vFace, vFlip, vPart, vOn, vBr, vErr, vCur, vRow, vRowB, vSplit, vBig, vPid;
vec3 codeAt(vec2 cuv, float sg, float sweep, float st) {
  if (st < 1.5) return texture(uCode, cuv, -0.4).rgb;
  vec3 a = texture(uCode, cuv + vec2(sg * sweep * 0.5, 0.0)).rgb;
  float m = smoothstep(10.0, 55.0, st);
  if (m < 0.01) return a;
  // two taps of the (pre-smeared) streak atlas across the shutter sweep: real blur length
  vec3 b = (texture(uStreak, cuv + vec2(sg * sweep * 0.25, 0.0)).rgb + texture(uStreak, cuv + vec2(sg * sweep * 0.75, 0.0)).rgb) * 0.5;
  // streaks: saturated light lines on black, contrast rising with speed
  float l = dot(b, vec3(0.3, 0.55, 0.15));
  b = max(mix(vec3(l), b, 1.0 + 0.5 * m), 0.0) * 0.9;
  return mix(a, b, m);
}
void main() {
  float z = -vW.z;
  float dist = length(cameraPosition - vW);
  vec3 col;
  float sg = vFlip > 0.5 ? -1.0 : 1.0;
  if (vFace > 7.5) {
    // floor: dark grating, a dim centre lane, reflections of the wall light near both edges
    float lane = abs(vP.y - 0.5);
    float grid = smoothstep(0.42, 0.5, abs(fract(z / 0.6) - 0.5)) + smoothstep(0.45, 0.5, abs(fract(vP.y * 9.0) - 0.5));
    col = vec3(0.006, 0.007, 0.009) * (1.0 - 0.5 * min(grid, 1.0));
    float pz = floor(z / uPanelLen + 0.5);
    float hl = fract(sin((pz * 8.0 + 1.0) * 127.1) * 43758.5453), hr = fract(sin((pz * 8.0 + 7.0) * 127.1) * 43758.5453);
    float edge = smoothstep(0.25, 0.5, lane);
    vec3 spill = mix(vec3(0.3, 0.5, 0.52), vec3(0.6, 0.45, 0.25), step(0.5, vP.y) * hl + step(vP.y, 0.5) * hr * 0.5);
    float streaky = 0.6 + 0.4 * sin(z * 3.1 + vP.y * 40.0) * sin(z * 0.7);
    col += spill * 0.05 * edge * edge * streaky * (1.0 + uPulse);
    col += vec3(0.42, 0.95, 0.9) * 0.12 * exp(-pow((lane - 0.47) * 70.0, 2.0)) * (0.5 + 0.5 * sin(z * 0.8 - uT * 6.0));
  } else if (vPart < 0.5) {
    // the screen
    vec2 p = vP;
    if (vFlip > 0.5) p.x = 1.0 - p.x;
    float sweep = uBlur / uPanelLen, st = sweep * 1024.0;
    vec3 tx;
    if (vOn < 0.5) {
      // standby: dark glass with a faint diagonal sheen, a status line and a blinking cursor
      float sheen = exp(-pow((p.x * 0.8 + p.y * 0.6 - 0.55 - 0.02 * sin(vPid)) * 6.0, 2.0));
      tx = vec3(0.012, 0.016, 0.02) + vec3(0.03, 0.045, 0.05) * sheen;
      float bar = step(0.06, p.y) * step(p.y, 0.085) * step(0.03, p.x) * step(p.x, 0.3 + 0.2 * fract(vPid * 0.37));
      tx += vec3(0.05, 0.12, 0.12) * bar;
      float blink = step(0.5, fract(uT * 1.1 + vCur));
      tx += vec3(0.3, 0.7, 0.65) * blink * step(0.05, p.x) * step(p.x, 0.07) * step(0.86, p.y) * step(p.y, 0.92);
      col = tx;
    } else {
      if (vBig > 0.5) {
        // a brighter status display
        vec2 duv = vec2(p.x, (1.0 - p.y) * 0.5 + step(0.5, fract(vPid * 0.31)) * 0.5);
        tx = texture(uDash, duv, sweep * 30.0).rgb * 1.25;
      } else if (vSplit > 0.5 && p.x > 0.58) {
        // split view: a second pane with its own file
        vec2 cuv = vec2(p.x - 0.58, 1.0 - ((1.0 - p.y) * ${WIN.toFixed(5)} + vRowB));
        tx = codeAt(cuv, sg, sweep, st) * 0.85;
        tx += vec3(0.08, 0.1, 0.12) * step(p.x, 0.585);
      } else {
        vec2 cuv = vec2(p.x, 1.0 - ((1.0 - p.y) * ${WIN.toFixed(5)} + vRow));
        tx = codeAt(cuv, sg, sweep, st);
      }
      // a tab bar along the top edge
      tx = mix(tx, vec3(0.03, 0.045, 0.055) + vec3(0.12, 0.2, 0.22) * step(0.02, p.x) * step(p.x, 0.16), step(0.955, p.y) * (1.0 - vBig));
      vec3 tint = mix(vec3(1.0), vec3(1.3, 0.5, 0.42), vErr);
      float cur = exp(-pow((p.y - fract(vCur + uT * 0.07)) * 70.0, 2.0));
      vec2 pc = p - 0.5; float vig = 1.0 - dot(pc * vec2(1.1, 1.6), pc * vec2(1.1, 1.6));
      col = tx * tint * vBr * uHot + vec3(0.01, 0.022, 0.028) * vig * uBase + vec3(0.9, 0.62, 0.25) * cur * 0.1 * uBase;
      col *= 1.0 + uPulse * 0.9 * exp(-pow(fract((z + uT * 22.0) / 60.0) - 0.5, 2.0) * 120.0);
    }
  } else if (vPart < 1.5) {
    // bezel frame at the wall plane: dark anodised metal with a faint edge catch
    float e = min(min(vP.x, 1.0 - vP.x) * 3.6, min(vP.y, 1.0 - vP.y) * 2.6);
    col = vec3(0.008, 0.009, 0.011) + vec3(0.05, 0.07, 0.075) * exp(-e * 60.0) * (0.4 + 0.6 * vBr);
  } else {
    // bezel side walls: lit by their own screen, brighter towards it
    vec3 sc = mix(vec3(0.2, 0.32, 0.34), vec3(0.45, 0.32, 0.18), fract(vPid * 0.618));
    col = vec3(0.006) + sc * (0.08 + 0.3 * vP.y) * vBr * uHot * 0.5 * (1.0 + uPulse * 0.6);
  }
  // seam light lines along the octagon edges
  if (vPart < 1.5 && vFace < 7.5) {
    float e = min(vP.y, 1.0 - vP.y);
    float seam = vPart > 0.5 ? exp(-e * e * 9000.0) : 0.0;
    float dash = mix(0.35 + 0.65 * step(0.5, fract(z / 2.4 + vFace * 0.37)), 1.0, smoothstep(6.0, 20.0, uSpeed));
    col += mix(vec3(0.42, 0.95, 0.9), vec3(0.95, 0.66, 0.28), step(2.5, vFace) * step(vFace, 5.5)) * seam * dash * (0.2 + 0.035 * uSpeed);
  }
  col = mix(col, uFog, 1.0 - exp(-uFogDen * uFogDen * dist * dist));
  gl_FragColor = vec4(col, 1.0);
}`;

// structure (ring frames, trays, cables): dark metal lit by the panels around it, a thin ring light
const STRUCT_VS = `
attribute float aKind;
varying vec3 vW, vN; varying float vKind;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const STRUCT_FS = `
uniform float uFogDen, uPulse, uT, uHot; uniform vec3 uFog;
varying vec3 vW, vN; varying float vKind;
void main() {
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  vec2 rp = vW.xy; float rr = length(rp); vec2 outw = rr > 1e-3 ? rp / rr : vec2(0.0, 1.0);
  // light from the screens: strongest close to the walls, on faces turned towards them or along the tunnel
  // octagonal "radius" (distance along the nearest face normal): gradient from the inner lip to the wall
  float sec = floor((atan(rp.y, rp.x) + 1.9634954) / 0.7853982 + 0.5);
  float an = sec * 0.7853982 - 1.9634954 + 0.3926991;
  float q = dot(rp, vec2(cos(an), sin(an)));
  float nearWall = smoothstep(${(RAD - 0.3).toFixed(2)}, ${(RAD + 0.08).toFixed(2)}, q);
  float zr = vW.z / ${PANEL.toFixed(2)};
  float side = fract(sin(floor(zr) * 91.7 + sec * 13.1) * 43758.5);
  vec3 spillC = mix(vec3(0.22, 0.42, 0.46), vec3(0.5, 0.37, 0.22), side);
  float face = max(0.0, dot(N, vec3(outw, 0.0))) * 0.4 + abs(N.z) * 0.6;
  float grain = 0.75 + 0.25 * sin(q * 210.0 + sec * 3.0) * sin(vW.z * 7.0 + q * 40.0);
  vec3 col = vec3(0.005, 0.006, 0.0075) + spillC * 0.035 * (0.15 + nearWall) * face * grain * uHot * (1.0 + uPulse * 0.8);
  if (vKind > 0.5 && vKind < 1.5) {
    // machined groove and bolt heads on the frame face
    float gq = abs(q - ${(RAD - 0.06).toFixed(2)});
    col *= 0.55 + 0.45 * smoothstep(0.004, 0.012, gq);
    float tq = fract(dot(rp, vec2(-sin(an), cos(an))) * 2.2) - 0.5;
    float bolt = exp(-(tq * tq * 900.0 + pow(q - ${(RAD + 0.02).toFixed(2)}, 2.0) * 9000.0));
    col += spillC * 0.12 * bolt * abs(N.z) * uHot;
  }
  // glossy edge catch (fresnel) and a highlight streak from the panel light
  float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col += spillC * 0.07 * fr * uHot;
  vec3 R = reflect(-V, N);
  col += spillC * 0.18 * pow(max(0.0, dot(R, vec3(outw, 0.0))), 24.0) * uHot;
  if (vKind > 0.5 && vKind < 1.5) {
    // ring light: a thin strip on the inner lip of every frame
    // (a 4 cm strip at mid-depth of the lip, fading with distance so the vanishing point stays calm)
    float lip = smoothstep(0.75, 0.95, -dot(N, vec3(outw, 0.0)));
    float rz = vW.z - (floor((vW.z - ${(2 * PANEL).toFixed(2)}) / ${(PANEL * RING).toFixed(2)} + 0.5) * ${(PANEL * RING).toFixed(2)} + ${(2 * PANEL).toFixed(2)});
    float strip = exp(-rz * rz / 0.0004);
    float dl = length(cameraPosition - vW);
    col += mix(vec3(0.42, 0.95, 0.9), vec3(1.0, 0.66, 0.3), step(0.6, side)) * lip * strip * 0.6 * (0.7 + 0.3 * sin(uT * 3.0 + zr)) * (1.0 + uPulse) * mix(1.0, 0.25, smoothstep(12.0, 40.0, dl));
  }
  float dist = length(cameraPosition - vW);
  col = mix(col, uFog, 1.0 - exp(-uFogDen * uFogDen * dist * dist));
  gl_FragColor = vec4(col, 1.0);
}`;

register('code_tunnel', (opts) => {
  const keys = Array.isArray(opts.speed) && opts.speed.length ? opts.speed : [[0, 6], [0.5, 14], [1, 30]];
  const seed = opts.seed ?? 3;
  const R = rng(seed * 131 + 7);

  const FOG = new THREE.Color(0x020305);
  const scene = new THREE.Scene();
  scene.background = FOG.clone();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);

  // octagonal tunnel of recessed panels, ~160 m long, recentred on the camera in whole ring steps
  const NP = 39;                                    // panels per face (multiple of RING): ~140 m, the far end is lost in fog
  const RV = RAD / Math.cos(Math.PI / 8);           // vertex radius
  const DEPTH = 0.09, BZ = 0.07, BS = 0.06;         // recess depth, bezel width along z / across
  const pos = [], aP = [], face = [], flip = [], pz = [], part = [], idx = [];
  const quad = (A, B, C, D, uvs, f, fl, zc, pt) => {     // A-B along z at the near end, C-D far end
    const base = pos.length / 3;
    for (const [P, uv] of [[A, uvs[0]], [B, uvs[1]], [C, uvs[2]], [D, uvs[3]]]) { pos.push(...P); aP.push(...uv); face.push(f); flip.push(fl); pz.push(zc); part.push(pt); }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  for (let f = 0; f < 8; f++) {
    const a0 = (f / 8) * TAU - Math.PI / 2 - Math.PI / 8, a1 = a0 + TAU / 8;
    const p0 = [Math.cos(a0) * RV, Math.sin(a0) * RV], p1 = [Math.cos(a1) * RV, Math.sin(a1) * RV];
    const am = (a0 + a1) / 2, n = [Math.cos(am), Math.sin(am)];
    const up0 = p0[1] > p1[1] + 1e-6 ? 1 : 0, fl = (p0[0] + p1[0]) / 2 > 0.01 ? 1 : 0, fid = f === 0 ? 8 : f;
    const at = (s, z, d) => [p0[0] + (p1[0] - p0[0]) * s + n[0] * d, p0[1] + (p1[1] - p0[1]) * s + n[1] * d, z];
    const vy = (s) => (up0 ? 1 - s : s);             // panel v (1 at the higher edge)
    const side = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), sb = BS / side;
    for (let j = 0; j < NP; j++) {
      const zA = (2 - j) * PANEL, zB = zA - PANEL, zc = zA - PANEL / 2;
      if (fid === 8) { quad(at(0, zA, 0), at(1, zA, 0), at(0, zB, 0), at(1, zB, 0), [[0, vy(0)], [0, vy(1)], [1, vy(0)], [1, vy(1)]], fid, fl, zc, 0); continue; }
      const za = zA - BZ, zb = zB + BZ, s0 = sb, s1 = 1 - sb;
      // screen (recessed)
      quad(at(s0, za, DEPTH), at(s1, za, DEPTH), at(s0, zb, DEPTH), at(s1, zb, DEPTH), [[0, vy(0)], [0, vy(1)], [1, vy(0)], [1, vy(1)]].map(([u, v], i) => [u, v]), fid, fl, zc, 0);
      // bezel frame at the wall plane (4 strips); aP = position within the whole panel
      const U = (z) => (zA - z) / PANEL, Vv = (s) => vy(s);
      const strip = (sA, sB, zA_, zB_) => quad(at(sA, zA_, 0), at(sB, zA_, 0), at(sA, zB_, 0), at(sB, zB_, 0), [[U(zA_), Vv(sA)], [U(zA_), Vv(sB)], [U(zB_), Vv(sA)], [U(zB_), Vv(sB)]], fid, fl, zc, 1);
      strip(0, 1, zA, za); strip(0, 1, zb, zB); strip(0, s0, za, zb); strip(s1, 1, za, zb);
      // side walls: aP.y = 0 at the wall plane, 1 at the screen
      const wall = (A0, A1) => quad(A0(0), A1(0), A0(DEPTH), A1(DEPTH), [[0, 0], [1, 0], [0, 1], [1, 1]], fid, fl, zc, 2);
      wall((d) => at(s0, za, d), (d) => at(s1, za, d));
      wall((d) => at(s1, zb, d), (d) => at(s0, zb, d));
      wall((d) => at(s0, zb, d), (d) => at(s0, za, d));
      wall((d) => at(s1, za, d), (d) => at(s1, zb, d));
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 2));
  tg.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 1));
  tg.setAttribute('aFlip', new THREE.Float32BufferAttribute(flip, 1));
  tg.setAttribute('aPZ', new THREE.Float32BufferAttribute(pz, 1));
  tg.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  tg.setIndex(idx);
  const code = codeAtlas(seed);
  const wallMat = new THREE.ShaderMaterial({
    uniforms: {
      uCode: { value: code.sharp }, uStreak: { value: code.streak }, uDash: { value: dashAtlas(seed) }, uT: { value: 0 }, uBlur: { value: 0 }, uSpeed: { value: 0 },
      uFogDen: { value: 0.03 }, uSeed: { value: seed * 1.37 }, uPanelLen: { value: PANEL }, uFog: { value: FOG }, uPulse: { value: 0 }, uHot: { value: 3.2 }, uBase: { value: 1 },
    },
    vertexShader: WALL_VS, fragmentShader: WALL_FS, side: THREE.DoubleSide,
  });
  const tunnel = new THREE.Group(); scene.add(tunnel);
  const walls = new THREE.Mesh(tg, wallMat); walls.frustumCulled = false; tunnel.add(walls);

  // ring frames (bevelled octagon extrusions), floor trays and sagging overhead cables: one merged mesh
  const parts = [];
  const tagged = (g, kind) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); g.setAttribute('aKind', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(kind), 1)); return g; };
  {
    const oct = (r, rot = 0) => Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * TAU - Math.PI / 2 - Math.PI / 8 + rot; return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r); });
    const shape = new THREE.Shape(oct(RV + 0.12)), hole = new THREE.Path(oct((RAD - 0.2) / Math.cos(Math.PI / 8)).reverse());
    shape.holes.push(hole);
    const ringG = new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2, curveSegments: 1 });
    ringG.translate(0, 0, -0.13); ringG.computeVertexNormals();
    // trays along the two lower corners, with brackets at each frame
    const tray = new THREE.BoxGeometry(0.34, 0.12, PANEL * RING - 0.4, 1, 1, 1);
    const cab = new THREE.CylinderGeometry(0.035, 0.035, PANEL * RING - 0.4, 8, 1); cab.rotateX(Math.PI / 2);
    for (let j = 0; j < NP; j += RING) {
      const z = (2 - j) * PANEL;
      parts.push(tagged(ringG.clone().translate(0, 0, z), 1));
      for (const sx of [-1, 1]) {
        const zc = z - (PANEL * RING) / 2;
        parts.push(tagged(tray.clone().translate(sx * 1.08, -RAD + 0.08, zc), 2));
        for (let c = 0; c < 3; c++) parts.push(tagged(cab.clone().translate(sx * (0.97 + c * 0.1), -RAD + 0.17, zc), 2));
        // overhead cables sag between frames along the upper corners
        for (let c = 0; c < 2; c++) {
          const x = sx * (1.18 - c * 0.12), y = RAD - 0.28 - c * 0.05, pts = [];
          for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector3(x, y - 0.28 * (1 - Math.pow(2 * u - 1, 2)) * (1 + c * 0.3), z - u * PANEL * RING)); }
          parts.push(tagged(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.03 + c * 0.012, 6, false), 3));
        }
      }
    }
  }
  const structMat = new THREE.ShaderMaterial({
    uniforms: { uFogDen: wallMat.uniforms.uFogDen, uFog: { value: FOG }, uPulse: wallMat.uniforms.uPulse, uT: wallMat.uniforms.uT, uHot: { value: 1 } },
    vertexShader: STRUCT_VS, fragmentShader: STRUCT_FS,
  });
  const struct = new THREE.Mesh(mergeGeometries(parts), structMat); struct.frustumCulled = false; tunnel.add(struct);

  // data motes: small glowing squares drifting in the tunnel, streaked over the shutter by the camera speed;
  // a cone around the axis is kept clear so the vanishing point stays clean for a centred title
  const nM = 600, mSrc = new Float32Array(nM * 4), mCol = new Float32Array(nM * 3);
  for (let i = 0; i < nM; i++) {
    const a = R() * TAU, rr = 0.6 + Math.sqrt(R()) * (RAD - 1.0);
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
    uniforms: { uCam: { value: 0 }, uStreak: { value: 0 }, uPix: { value: 0.001 }, uT: { value: 0 }, uCamXY: { value: new THREE.Vector2() } },
    vertexShader: `attribute vec2 corner; attribute vec4 aM; attribute vec3 aC; uniform float uCam, uStreak, uPix, uT; uniform vec2 uCamXY;
varying vec2 vQ; varying float vLen, vW, vI; varying vec3 vCol;
void main(){
  float zr = mod(aM.z - uCam, 120.0);             // distance ahead (0..120), wrapping as the camera advances
  vec3 p = vec3(aM.x + sin(uT * 0.5 + aM.z) * 0.1, aM.y + cos(uT * 0.4 + aM.z * 1.3) * 0.1, -uCam - zr + 1.0);
  vec4 c1 = viewMatrix * vec4(p, 1.0), c0 = viewMatrix * vec4(p + vec3(0.0, 0.0, -uStreak), 1.0);
  float pix = uPix * max(0.05, -c1.z), w = max(aM.w, pix * 1.2);
  float L = length(c1.xyz - c0.xyz);
  vec3 dir = L > 1e-5 ? (c1.xyz - c0.xyz) / L : vec3(0.0, 1.0, 0.0);
  vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 1e-4, 0.0));
  vec3 q = mix(c0.xyz - dir * w, c1.xyz + dir * w, corner.x) + side * corner.y * w;
  vQ = vec2(corner.x * (L + 2.0 * w), corner.y * w); vLen = L; vW = w;
  // clear cone: nothing near the axis once it is more than a few metres ahead
  float ang = length((p.xy - uCamXY) * vec2(0.55, 1.0)) / max(zr, 0.5);
  float cone = mix(1.0, smoothstep(0.16, 0.34, ang), smoothstep(4.0, 10.0, zr));
  vI = (aM.w / w) * (aM.w / w) * 6.0 * smoothstep(120.0, 60.0, zr) * smoothstep(0.6, 3.0, zr) * cone / (1.0 + L * 0.4);
  vCol = aC;
  gl_Position = projectionMatrix * vec4(q, 1.0);
  if (-c1.z < 0.3 || vI < 0.002) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`,
    fragmentShader: `varying vec2 vQ; varying float vLen, vW, vI; varying vec3 vCol;
void main(){ float ax = max(0.0, max(vW - vQ.x, vQ.x - (vLen + vW))); float d2 = (ax * ax + vQ.y * vQ.y) / (vW * vW); float g = exp(-d2 * 3.0); if (vI * g < 0.003) discard; gl_FragColor = vec4(vCol * vI * g, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Mesh(mg, moteMat); motes.frustumCulled = false; scene.add(motes);

  const bloom = { strength: 0.7, radius: 0.5, threshold: 0.62 };
  return {
    scene, camera, bloom,
    exposure: 1.0,
    update(lt, c) {
      const { d, v } = travel(keys, c.k, c.dur);
      const camZ = -d;
      const fast = smooth(clamp((v - 10) / 18));
      // gentle drift and roll; a touch of shake as the speed climbs
      const sh = 0.004 * v;
      camera.position.set(noise(lt * 0.35 + 1) * 0.35 + noise(lt * 7) * sh, noise(lt * 0.3 + 4) * 0.22 - 0.1 + noise(lt * 8 + 2) * sh, camZ);
      camera.lookAt(noise(lt * 0.25 + 9) * 0.6, noise(lt * 0.22 + 2) * 0.3 - 0.15, camZ - 30);
      camera.rotateZ(noise(lt * 0.2 + 5) * 0.05 + lerp(0, 0.03, smooth(c.k)));
      camera.fov = lerp(40, 58, smooth(clamp((v - 6) / 26))); camera.updateProjectionMatrix();
      tunnel.position.z = Math.ceil(camZ / (PANEL * RING)) * PANEL * RING;      // whole rings: content stays fixed in world z
      const u = wallMat.uniforms;
      // the shutter opens with the speed: legible code at cruising speed, light streaks at full tilt
      u.uT.value = lt; u.uBlur.value = v * SH * smooth(clamp((v - 7) / 17)); u.uSpeed.value = v; u.uPulse.value = 0.7 * fast;
      // hold the blacks at speed: the screens' base glow drops out and the panel gain eases off a little
      u.uBase.value = lerp(1, 0.1, fast); u.uHot.value = lerp(3.2, 2.4, fast);
      structMat.uniforms.uHot.value = lerp(1, 0.8, fast);
      bloom.strength = lerp(0.7, 0.55, fast); bloom.threshold = lerp(0.62, 0.7, fast);
      const mu = moteMat.uniforms;
      mu.uCam.value = d; mu.uStreak.value = v * SH * 1.5; mu.uPix.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / 1080; mu.uT.value = lt;
      mu.uCamXY.value.set(camera.position.x, camera.position.y);
    },
  };
});
