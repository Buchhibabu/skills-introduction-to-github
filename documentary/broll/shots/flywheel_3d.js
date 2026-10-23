// flywheel_3d: THE hero object. A 9.6 m machined steel flywheel (grooved rope rim, six cast spokes,
// bolted hub, an engraved ring and a graduated dial band) turning in a hazy industrial hall. Amber back
// light through tall windows, a cold fill from the left, light shafts, dust, and a grinding shoe throwing
// sparks where the rim climbs out of its floor pit.
//
// opts:
//   mode    'hero'   (default) low-angle slow push-in on the whole wheel; hub right of centre, the
//                    centre band stays calm for a statement line
//           'close'  camera rides the top of the rim: grooves rushing at the lens, engraving and dial
//                    streaking past, debris flecks, camera shake that grows with speed
//           'reveal' starts a hand's width from the rim face, where thousands of tiny warm lights
//                    (people) are embedded; pulls back to the whole wheel: a ring of light feeding pulses
//                    down the spokes into a glowing hub. Lower-centre band (y ~ 560-660) stays dark.
//   spin    [[k, revolutionsPerSecond], ...]  speed over shot progress k (0..1), smooth between keys;
//           the rotation angle is the exact integral, so any duration works. Default by mode.
//   people  0..1 intensity of the embedded people-lights (default 1 in 'reveal', 0 otherwise)
//   sparks  0..2 spark multiplier (default 1); the spark rate also follows the spin speed
//   feed    0..1 intensity of the pulses running down the spokes into the hub (default = people)
//   seed    layout seed for lights/sparks/dust (default 7)
//
// Motion blur is real: a 180-degree shutter (1/48 s). The rim is a solid of revolution, so its detail
// atlas is blurred along the angle in the shader; spokes get an analytic coverage "ghost disc"; lights,
// sparks and flecks are drawn as streaks swept over the shutter interval. Everything is a pure function
// of time, so frames can be rendered in any order.
import { THREE, register, rng, noise, ease, smooth, clamp, lerp, glowTexture } from '../kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RC = 4.2;                        // hub height above the floor (m)
const RO = 4.8, RI = 4.12, HW = 0.6;   // rim outer / inner radius, half width (axial)
const SH = 1 / 48;                     // 180-degree shutter at 24 fps
const REP = 8;                         // rim detail atlas repeats around the wheel
const NSP = 6;                         // spokes
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ spin (analytic integral)
// rps(k) is smoothstep-interpolated between keys; returns revolutions since k = 0 and rps now.
function spinAt(spin, k, dur) {
  const ks = spin;
  if (k <= ks[0][0]) return { rev: ks[0][1] * k * dur, rps: ks[0][1] };
  let rev = ks[0][1] * ks[0][0] * dur;
  for (let i = 1; i < ks.length; i++) {
    const [a, va] = ks[i - 1], [b, vb] = ks[i], span = b - a;
    if (k <= b && span > 0) {
      const x = (k - a) / span;
      rev += dur * span * (va * x + (vb - va) * (x * x * x - x * x * x * x / 2));
      return { rev, rps: va + (vb - va) * x * x * (3 - 2 * x) };
    }
    rev += dur * span * (va + vb) / 2;
  }
  const [kl, vl] = ks[ks.length - 1];
  return { rev: rev + dur * vl * (k - kl), rps: vl };
}

// ------------------------------------------------------------------ geometry
// Rim cross-section (r, z) as a closed loop; normal of a segment = normalize(-dz, dr) (outward).
const FRONT = { a: RI + 0.07, land1: 4.33, rec0: 4.35, rec1: 4.6, land2: 4.62, b: RO - 0.08 };
function rimProfile() {
  const P = [];
  const add = (r, z) => P.push([r, z]);
  add(RI, -HW + 0.07); add(RI, HW - 0.07);
  add(FRONT.a, HW);
  add(FRONT.land1, HW); add(FRONT.rec0, HW - 0.018); add(FRONT.rec1, HW - 0.018); add(FRONT.land2, HW);
  add(FRONT.b, HW); add(RO, HW - 0.08);
  const G = 5, gw = 0.12, gd = 0.055, z0 = HW - 0.08, z1 = -(HW - 0.08), pitch = (z0 - z1) / G;
  for (let g = 0; g < G; g++) {
    const zc = z0 - pitch * (g + 0.5);
    add(RO, zc + gw / 2); add(RO - gd, zc + 0.012); add(RO - gd, zc - 0.012); add(RO, zc - gw / 2);
  }
  add(RO, z1); add(RO - 0.08, -HW); add(RI + 0.07, -HW); add(RI, -HW + 0.07);
  return P;
}
// Lathe around z, flat across profile segments (crisp machined edges), smooth around.
function latheGeo(P, seg, rep) {
  const nS = P.length - 1, sAcc = [0];
  for (let i = 0; i < nS; i++) sAcc.push(sAcc[i] + Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]));
  const S = sAcc[nS], pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < nS; i++) {
    const [r0, z0] = P[i], [r1, z1] = P[i + 1];
    const dr = r1 - r0, dz = z1 - z0, L = Math.hypot(dr, dz) || 1, nr = -dz / L, nz = dr / L;
    const base = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
      pos.push(r0 * c, r0 * s, z0, r1 * c, r1 * s, z1);
      nor.push(nr * c, nr * s, nz, nr * c, nr * s, nz);
      uv.push((j / seg) * rep, sAcc[i] / S, (j / seg) * rep, sAcc[i + 1] / S);
    }
    for (let j = 0; j < seg; j++) {
      const a = base + j * 2, b = a + 1, c = a + 3, d = a + 2;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geo: g, sAcc, S };
}
// spoke half-width (tangential) and half-depth (axial) along the radius, flared into hub and rim
const spokeA = (r) => lerp(0.3, 0.19, clamp((r - 0.9) / 3.4)) + 0.22 * Math.min(1.5, Math.exp(-(r - 1.05) / 0.28)) + 0.16 * Math.min(1.5, Math.exp(-(RI + 0.02 - r) / 0.22));
const spokeC = (r) => lerp(0.19, 0.12, clamp((r - 0.9) / 3.4)) + 0.1 * Math.min(1.5, Math.exp(-(r - 1.05) / 0.28)) + 0.08 * Math.min(1.5, Math.exp(-(RI + 0.02 - r) / 0.22));
function spokeGeo() {
  const rings = 20, around = 16, r0 = 0.9, r1 = 4.3, pos = [], uv = [], idx = [];
  for (let s = 0; s < NSP; s++) {
    const ph = (s / NSP) * TAU, dx = Math.cos(ph), dy = Math.sin(ph), tx = -dy, ty = dx, base = pos.length / 3;
    for (let i = 0; i <= rings; i++) {
      const r = lerp(r0, r1, i / rings), a = spokeA(r), c = spokeC(r);
      for (let j = 0; j <= around; j++) {
        const q = (j / around) * TAU, ca = Math.cos(q) * a, sc = Math.sin(q) * c;
        pos.push(dx * r + tx * ca, dy * r + ty * ca, sc);
        uv.push(j / around + s * 0.37, r / 4.3);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < around; j++) {
      const a = base + i * (around + 1) + j, b = a + around + 1, c = b + 1, d = a + 1;
      idx.push(a, c, b, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ textures
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
const grey = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;
// Rim detail atlas: R = albedo factor, G = roughness factor, B = height. u = angle (REP repeats), v = profile arc length.
function bakeRim(sAcc, S, P, seed) {
  const W = 2048, H = 1024, R = rng(seed);
  const [cA, A] = canvas(W, H), [cR, Rg] = canvas(W, H), [cH, Hg] = canvas(W, H);
  A.fillStyle = grey(150); A.fillRect(0, 0, W, H);
  Rg.fillStyle = grey(120); Rg.fillRect(0, 0, W, H);
  Hg.fillStyle = grey(128); Hg.fillRect(0, 0, W, H);
  const yOf = (s) => (s / S) * H;
  // profile index helpers
  const sAtR = (r) => { // front face: s grows with r between FRONT.a and FRONT.b
    for (let i = 0; i < P.length - 1; i++) {
      const [ra, za] = P[i], [rb, zb] = P[i + 1];
      if (za > HW - 0.03 && zb > HW - 0.03 && r >= Math.min(ra, rb) && r <= Math.max(ra, rb) && rb > ra) return sAcc[i] + (sAcc[i + 1] - sAcc[i]) * (r - ra) / (rb - ra);
    }
    return 0;
  };
  const iOuter0 = P.findIndex(([r, z]) => r === RO), iOuter1 = P.length - 4;
  const sOut0 = sAcc[iOuter0], sOut1 = sAcc[iOuter1 + 1];
  const pxPerMx = (r) => W / ((TAU * r) / REP), pxPerMy = H / S;
  // 1. lathe tool marks: circumferential lines (constant v)
  for (let y = 0; y < H; y++) {
    const v = R();
    A.fillStyle = `rgba(${v < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + 0.06 * R()})`; A.fillRect(0, y, W, 1);
    Rg.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + 0.12 * R()})`; Rg.fillRect(0, y, W, 1);
  }
  // 2. inner face and chamfers: cast, darker and rougher, pitted
  const yIn = yOf(sAcc[1]);
  A.fillStyle = 'rgba(0,0,0,0.35)'; A.fillRect(0, 0, W, yIn + 6);
  Rg.fillStyle = 'rgba(255,255,255,0.45)'; Rg.fillRect(0, 0, W, yIn + 6);
  for (let i = 0; i < 9000; i++) {
    const x = R() * W, y = R() * yIn, r = 1 + R() * 3;
    Hg.fillStyle = grey(70 + R() * 60); Hg.beginPath(); Hg.ellipse(x, y, r * 1.6, r, 0, 0, TAU); Hg.fill();
    A.fillStyle = `rgba(0,0,0,${0.2 * R()})`; A.fillRect(x, y, r * 2, r);
  }
  // 3. wear: oxidation blotches and scuffs everywhere, heavier near the edges of the outer face
  for (let i = 0; i < 260; i++) {
    const x = R() * W, y = R() * H, rx = 20 + R() * 220, ry = 4 + R() * 30;
    const g = A.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(40,30,20,${0.12 + 0.2 * R()})`); g.addColorStop(1, 'rgba(40,30,20,0)');
    A.save(); A.translate(x, y); A.scale(1, ry / rx); A.translate(-x, -y); A.fillStyle = g; A.fillRect(x - rx, y - rx, rx * 2, rx * 2); A.restore();
    Rg.fillStyle = `rgba(255,255,255,${0.08 + 0.15 * R()})`; Rg.beginPath(); Rg.ellipse(x, y, rx * 0.8, ry * 0.8, 0, 0, TAU); Rg.fill();
  }
  for (let i = 0; i < 260; i++) { // scratches, mostly along the travel direction
    const x = R() * W, y = sOut0 / S * H + R() * (sOut1 - sOut0) / S * H, l = 30 + R() * 260;
    A.strokeStyle = `rgba(255,255,255,${0.03 + 0.06 * R()})`; A.lineWidth = 1; A.beginPath(); A.moveTo(x, y); A.lineTo(x + l, y + (R() - 0.5) * 6); A.stroke();
    Rg.strokeStyle = `rgba(0,0,0,${0.08 + 0.1 * R()})`; Rg.lineWidth = 1.5; Rg.beginPath(); Rg.moveTo(x, y); Rg.lineTo(x + l, y + (R() - 0.5) * 6); Rg.stroke();
  }
  // 4. front face: bolt circle, engraved band with lettering, graduated dial
  const fx = pxPerMx(4.45), fy = pxPerMy;
  const yR = (r) => yOf(sAtR(r));
  // engraved rings bounding the recess
  for (const r of [FRONT.rec0 + 0.02, FRONT.rec1 - 0.02]) {
    A.fillStyle = 'rgba(0,0,0,0.6)'; A.fillRect(0, yR(r) - 1.5, W, 3);
    Hg.fillStyle = grey(40); Hg.fillRect(0, yR(r) - 1.5, W, 3);
  }
  // lettering (rotated 180 deg so it reads left-to-right, upright, at the top of the wheel seen from the front)
  const words = 'THE DATA FLYWHEEL  ·  USE  ·  FEEDBACK  ·  SIGNAL  ·  TRAINING  ·  ';
  const yc = yR((FRONT.rec0 + FRONT.rec1) / 2), capM = 0.13; // letter height (m)
  for (const [ctx, col] of [[A, 'rgba(10,8,6,0.85)'], [Hg, grey(20)], [Rg, grey(235)]]) {
    ctx.save(); ctx.translate(W, yc); ctx.scale(-fx / fy, -1);
    ctx.font = `600 ${Math.round(capM * fy * 1.32)}px Oswald`; ctx.textBaseline = 'middle'; ctx.fillStyle = col;
    const span = W / (fx / fy);
    let x = 0; const step = ctx.measureText(words).width + 10;
    while (x < span) { ctx.fillText(words, x, 2); x += step; }
    ctx.restore();
  }
  // dial: 1-degree ticks on the outer land, long ticks every 5, numerals every 10 (each repeat = 90 degrees)
  const yT0 = yR(FRONT.land2 + 0.005), yT1 = yR(FRONT.b - 0.006);
  for (let d = 0; d < 45; d++) {
    const x = W - (d / 45) * W, long = d % 5 === 0, h = (yT1 - yT0) * (long ? 1 : 0.55);
    A.fillStyle = 'rgba(0,0,0,0.75)'; A.fillRect(x - 1.5, yT0, 3, h);
    Hg.fillStyle = grey(50); Hg.fillRect(x - 1.5, yT0, 3, h);
  }
  // bolt circle on the inner land: hex heads with washers (raised)
  const yB = yR((FRONT.a + FRONT.land1) / 2), bx = pxPerMx(4.26);
  for (let b = 0; b < 6; b++) {
    const x = (b + 0.5) / 6 * W;
    for (const [ctx, ring, head, face] of [[A, 'rgba(0,0,0,0.5)', grey(190), grey(165)], [Hg, grey(150), grey(215), grey(205)], [Rg, grey(150), grey(90), grey(110)]]) {
      ctx.fillStyle = ring; ctx.beginPath(); ctx.ellipse(x, yB, 0.05 * bx, 0.05 * fy, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = head; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const q = (k / 6) * TAU + 0.3; ctx.lineTo(x + Math.cos(q) * 0.036 * bx, yB + Math.sin(q) * 0.036 * fy); }
      ctx.fill();
      ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(x, yB, 0.022 * bx, 0.022 * fy, 0, 0, TAU); ctx.fill();
    }
  }
  // 5. segment joints: one seam per repeat across every band, with a stamped plate on the front face
  for (const x of [6]) {
    A.fillStyle = 'rgba(0,0,0,0.55)'; A.fillRect(x, 0, 3, H);
    Hg.fillStyle = grey(70); Hg.fillRect(x, 0, 3, H);
  }
  // 6. outer-face edge grime and grooves darkened (oil in the rope grooves)
  for (let i = iOuter0; i <= iOuter1; i++) {
    const [r0] = P[i], [r1] = P[i + 1];
    if (r0 < RO || r1 < RO) { A.fillStyle = 'rgba(20,14,8,0.35)'; A.fillRect(0, yOf(sAcc[i]), W, yOf(sAcc[i + 1]) - yOf(sAcc[i]) + 1); }
  }
  // merge
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const o = out.getContext('2d'), id = o.createImageData(W, H);
  const a = A.getImageData(0, 0, W, H).data, r = Rg.getImageData(0, 0, W, H).data, h = Hg.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H * 4; i += 4) { id.data[i] = a[i]; id.data[i + 1] = r[i]; id.data[i + 2] = h[i]; id.data[i + 3] = 255; }
  o.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapNearestFilter;
  return { tex: t, W, H };
}
// tileable value-noise canvas (grey), used for cast iron and concrete
function noiseCanvas(size, seed, octaves, base, amp) {
  const R = rng(seed), [c, g] = canvas(size, size), id = g.createImageData(size, size);
  const grids = [];
  for (let o = 0; o < octaves; o++) { const n = 4 << o, a = new Float32Array(n * n); for (let i = 0; i < n * n; i++) a[i] = R(); grids.push([n, a]); }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, w = 0.5;
    for (const [n, a] of grids) {
      const fx = (x / size) * n, fy = (y / size) * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const s = (i, j) => a[((iy + j) % n) * n + ((ix + i) % n)], sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      v += w * lerp(lerp(s(0, 0), s(1, 0), sx), lerp(s(0, 1), s(1, 1), sx), sy); w *= 0.5;
    }
    const q = clamp(base + (v - 0.5) * amp + (R() - 0.5) * 0.06, 0, 1) * 255, i = (y * size + x) * 4;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = q; id.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return c;
}
// back wall: a wall of tall industrial windows, glowing warm (HDR via the material colour)
function windowTexture(seed) {
  const R = rng(seed), [c, g] = canvas(1024, 512);
  g.fillStyle = '#050505'; g.fillRect(0, 0, 1024, 512);
  const bays = 6, bw = 1024 / bays;
  for (let b = 0; b < bays; b++) {
    const x0 = b * bw + 18, x1 = (b + 1) * bw - 18, y0 = 40, y1 = 470;
    const grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, '#fff2d8'); grd.addColorStop(0.55, '#f6c27a'); grd.addColorStop(1, '#a8652a');
    g.fillStyle = grd; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const cols = 4, rows = 10;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const px = x0 + ((x1 - x0) / cols) * i, py = y0 + ((y1 - y0) / rows) * j, pw = (x1 - x0) / cols, ph = (y1 - y0) / rows;
      const q = R();
      if (q < 0.14) { g.fillStyle = `rgba(0,0,0,${0.2 + 0.3 * R()})`; g.fillRect(px, py, pw, ph); }
      g.strokeStyle = '#080706'; g.lineWidth = 4; g.strokeRect(px, py, pw, ph);
    }
    g.fillStyle = '#060504'; g.fillRect(x0, y0 + (y1 - y0) * 0.62, x1 - x0, 7);
  }
  const [c2, g2] = canvas(1024, 512); g2.filter = 'blur(2.5px)'; g2.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(c2); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// concrete floor around the pit: joints, stains, worn walkway paint, hazard band around the slot
function floorTextures(seed) {
  const N = 1024, M = 48, px = N / M, R = rng(seed);   // 48 m square centred on the wheel
  const [cA, A] = canvas(N, N), Rg = { fillRect() {}, createRadialGradient: () => ({ addColorStop() {} }) };
  const X = (x) => (x + M / 2) * px, Z = (z) => (z + M / 2) * px;
  A.drawImage(noiseCanvas(512, seed + 1, 6, 0.36, 0.5), 0, 0, N, N);
  A.lineWidth = 1.5;
  A.globalAlpha = 0.5; A.drawImage(noiseCanvas(512, seed + 2, 5, 0.5, 0.7), 0, 0, N / 4, N / 4);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) A.drawImage(A.canvas, 0, 0, N / 4, N / 4, i * N / 4, j * N / 4, N / 4, N / 4);
  A.globalAlpha = 1;
  Rg.fillStyle = grey(205); Rg.fillRect(0, 0, N, N);
  for (let i = 0; i < 160; i++) { // oil / water stains: darker and glossier, clustered into irregular patches
    const cx = Math.floor(i / 8), x = X(Math.sin(cx * 12.9) * 14 + (R() - 0.5) * 3), z = Z(Math.cos(cx * 7.3) * 12 + (R() - 0.5) * 2), r = (0.2 + R() * 0.9) * px;
    const g = A.createRadialGradient(x, z, 0, x, z, r); g.addColorStop(0, `rgba(8,6,4,${0.3 + 0.4 * R()})`); g.addColorStop(1, 'rgba(8,6,4,0)');
    A.fillStyle = g; A.fillRect(x - r, z - r, 2 * r, 2 * r);
    const h = Rg.createRadialGradient(x, z, 0, x, z, r); h.addColorStop(0, `rgba(30,30,30,${0.5 + 0.4 * R()})`); h.addColorStop(1, 'rgba(30,30,30,0)');
    Rg.fillStyle = h; Rg.fillRect(x - r, z - r, 2 * r, 2 * r);
  }
  A.strokeStyle = 'rgba(0,0,0,0.6)'; A.lineWidth = 3;
  for (let m = -24; m <= 24; m += 6) { A.beginPath(); A.moveTo(X(m), 0); A.lineTo(X(m), N); A.stroke(); A.beginPath(); A.moveTo(0, Z(m)); A.lineTo(N, Z(m)); A.stroke(); }
  // worn walkway lines
  for (const z of [-4.2, 4.2]) for (let x = -20; x < 20; x += 0.2) {
    if (R() < 0.15) continue;
    A.fillStyle = `rgba(200,150,40,${0.25 + 0.35 * R()})`; A.fillRect(X(x), Z(z) - 0.06 * px, 0.2 * px, 0.12 * px);
  }
  // pit slot with steel trim and hazard band
  const hx = 2.6, hz = 0.95;
  A.save(); A.beginPath(); A.rect(X(-hx - 0.35), Z(-hz - 0.35), (2 * hx + 0.7) * px, (2 * hz + 0.7) * px); A.clip();
  for (let s = -20; s < 20; s++) { A.fillStyle = s % 2 ? 'rgba(210,160,40,0.75)' : 'rgba(15,12,10,0.85)'; A.beginPath(); const x0 = X(s * 0.3); A.moveTo(x0, 0); A.lineTo(x0 + 0.15 * px, 0); A.lineTo(x0 + 0.15 * px + N, N); A.lineTo(x0 + N, N); A.fill(); }
  A.restore();
  A.fillStyle = '#9a9a96'; A.fillRect(X(-hx - 0.06), Z(-hz - 0.06), (2 * hx + 0.12) * px, (2 * hz + 0.12) * px);
  A.fillStyle = '#000'; A.fillRect(X(-hx), Z(-hz), 2 * hx * px, 2 * hz * px);
  Rg.fillStyle = grey(90); Rg.fillRect(X(-hx - 0.06), Z(-hz - 0.06), (2 * hx + 0.12) * px, (2 * hz + 0.12) * px);
  const tA = new THREE.CanvasTexture(cA); tA.colorSpace = THREE.SRGBColorSpace; tA.minFilter = THREE.LinearMipmapNearestFilter;
  return { tA, M };
}

// ------------------------------------------------------------------ materials
// Haze: exp2 fog whose colour brightens towards the window walls (in-scattering), shared by every surface.
const HAZE_GLSL = `
uniform vec3 uFogCol, uHazeCol, uHazeDir, uHazeDir2; uniform float uFogDen;
vec3 hazeCol(vec3 vd) {
  float a = dot(vd, uHazeDir), b = dot(vd, uHazeDir2);
  return uFogCol + uHazeCol * (exp((a - 1.0) / 0.3) + 0.3 * exp((b - 1.0) / 0.3));
}
vec3 haze(vec3 col, vec3 wp) {
  vec3 d = wp - cameraPosition; float fd = length(d);
  return mix(col, hazeCol(d / fd), 1.0 - exp(-uFogDen * uFogDen * fd * fd));
}`;
// Unlit surfaces (window walls, dark walls, sky dome) with the same haze.
function hazeBasic(shared, { map = null, color = 0xffffff, mult = 1, rep = [1, 1], sky = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uMap: { value: map }, uCol: { value: new THREE.Color(color).multiplyScalar(mult) }, uRep: { value: new THREE.Vector2(...rep) } },
    defines: { ...(map ? { MAP: '' } : {}), ...(sky ? { SKY: '' } : {}) },
    vertexShader: `varying vec2 vUv; varying vec3 vHC; varying float vHF;
${HAZE_GLSL}
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vUv = uv; gl_Position = projectionMatrix * viewMatrix * w;
  vec3 d = w.xyz - cameraPosition; float fd = length(d); vHC = hazeCol(d / fd);
  #ifdef SKY
  vHF = 1.0;
  #else
  vHF = 1.0 - exp(-uFogDen * uFogDen * fd * fd);
  #endif
}`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uCol; uniform vec2 uRep; varying vec2 vUv; varying vec3 vHC; varying float vHF;
void main(){
  vec3 c = uCol;
  #ifdef MAP
  c *= texture(uMap, vUv * uRep).rgb;
  #endif
  gl_FragColor = vec4(mix(c, vHC, vHF), 1.0);
}`,
    side: sky ? THREE.BackSide : THREE.FrontSide, depthWrite: !sky,
  });
}
// Analytic environment of the hall (also evaluated per vertex for the floor).
const ENV_GLSL = `
vec3 envSpec(vec3 R, float ro) {
  float r2 = ro * ro;
  vec3 c = mix(vec3(0.004, 0.004, 0.005), vec3(0.022, 0.027, 0.036), smoothstep(-0.25, 0.3, R.y));
  c += vec3(0.04, 0.045, 0.055) * exp(-abs(R.y) * 7.0);
  // window wall behind (-z): a soft box in (azimuth, height); pane grid only on polished steel
  float s = 0.025 + r2 * 1.1, az = R.x / max(-R.z, 0.04);
  float box = smoothstep(1.03 + s, 1.03 - s, abs(az)) * step(0.0, -R.z) * smoothstep(0.03 - s, 0.03 + s, R.y) * smoothstep(0.68 + s, 0.68 - s, R.y);
  if (ro < 0.4 && box > 0.0) { vec2 g = abs(fract(vec2(az * 3.6, R.y * 7.4)) - 0.5); box *= mix(1.0, 0.25 + 0.75 * smoothstep(0.03, 0.08, min(g.x, g.y)), 1.0 - ro / 0.4); }
  c += vec3(1.0, 0.64, 0.33) * 4.0 * box * (0.55 + 0.45 * clamp(R.y / 0.68, 0.0, 1.0)) / (1.0 + r2 * 3.0);
  // clerestory on the left wall and the cold softbox front-right: cheap lobes
  float wl = 0.05 + r2 * 0.8;
  c += vec3(1.0, 0.7, 0.42) * 1.6 * exp((dot(R, vec3(-0.86, 0.5, -0.1)) - 1.0) / wl) * (0.05 / wl);
  float w = 0.03 + r2 * 0.8;
  c += vec3(0.5, 0.66, 1.0) * 1.2 * exp((dot(R, vec3(0.6, 0.48, 0.64)) - 1.0) / w) * (0.03 / w);
  c += vec3(0.75, 0.78, 0.82) * 0.4 * smoothstep(0.86 - r2, 0.97, R.y);
  c += vec3(0.13, 0.14, 0.155) * smoothstep(-0.2, 0.7, R.z) * (0.35 + 0.65 * smoothstep(-0.3, 0.35, R.y));
  return c * uEnvI;
}
vec3 envDiff(vec3 N) {
  vec3 c = mix(vec3(0.008, 0.007, 0.007), vec3(0.04, 0.045, 0.055), N.y * 0.5 + 0.5) + vec3(0.03, 0.032, 0.036) * max(0.0, N.z);
  c += vec3(1.0, 0.64, 0.33) * 0.22 * max(0.0, dot(N, vec3(0.0, 0.37, -0.93)));
  c += vec3(1.0, 0.7, 0.42) * 0.12 * max(0.0, dot(N, vec3(-0.93, 0.37, 0.0)));
  c += vec3(0.5, 0.66, 1.0) * 0.08 * max(0.0, dot(N, normalize(vec3(0.62, 0.5, 0.6))));
  return c * uEnvI;
}
`;
// One cheap physically-flavoured shader for every lit surface (SwiftShader budget): an analytic HDR
// "hall" environment (warm window wall behind, cold softbox front-left, strips overhead) blurred by
// roughness, GGX key + fill + a point light, Schlick fresnel, exp2 fog. Optional: rim detail atlas with
// angular motion blur (DETAIL), albedo map (MAP), floor gloss from albedo (FLOOR).
const LIT_VS = `
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
varying vec3 vHC; varying float vHF;
${HAZE_GLSL}
#ifdef FLOOR
uniform float uEnvI;
varying vec3 vSpec;
${ENV_GLSL}
#endif
void main() {
  vec4 p = vec4(position, 1.0); vec3 n = normal;
  #ifdef USE_INSTANCING
  p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  vec4 w = modelMatrix * p;
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * n); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
  vec3 d = w.xyz - cameraPosition; float fd = length(d);
  vHC = hazeCol(d / fd); vHF = 1.0 - exp(-uFogDen * uFogDen * fd * fd);
  #ifdef FLOOR
  vSpec = envSpec(reflect(d / fd, vN), 0.72);
  #endif
}`;
const LIT_FS = `
uniform vec3 uAlb, uEmis; uniform float uMetal, uRough;
uniform vec3 uKeyDir, uKeyCol, uFillDir, uFillCol, uPtPos, uPtCol; uniform float uEnvI;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
varying vec3 vHC; varying float vHF;
#ifdef DETAIL
uniform sampler2D uDet; uniform float uBlur, uDetW; uniform vec3 uDetAmt;
vec3 detBlur(vec2 uv) {
  float span = abs(uBlur) * uDetW;
  if (span < 1.5) return texture(uDet, uv).rgb;
  float bias = log2(max(1.0, span / 2.0));
  if (span > 160.0) return 0.5 * (texture(uDet, uv + vec2(uBlur * 0.25, 0.0), bias + 0.5).rgb + texture(uDet, uv + vec2(uBlur * 0.75, 0.0), bias + 0.5).rgb);
  return (texture(uDet, uv, bias).rgb + texture(uDet, uv + vec2(uBlur * 0.5, 0.0), bias).rgb + texture(uDet, uv + vec2(uBlur, 0.0), bias).rgb) / 3.0;
}
#endif
#ifdef MAP
uniform sampler2D uMap; uniform vec2 uMapRep;
#endif
const float PI = 3.14159265;
${ENV_GLSL}
#ifdef FLOOR
varying vec3 vSpec;
#endif
vec3 ggx(vec3 N, vec3 V, vec3 L, vec3 col, vec3 dc, vec3 F0, float ro) {
  float NoL = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V); float NoH = max(dot(N, H), 0.0), VoH = max(dot(V, H), 0.0);
  float a = max(0.045, ro * ro), a2 = a * a, d = NoH * NoH * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * d * d);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
  return (dc / PI + F * D * 0.25 / max(VoH * VoH, 0.12)) * col * NoL;
}
void main() {
  vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vW);
  vec3 alb = uAlb; float ro = uRough, me = uMetal;
  #ifdef MAP
  vec3 tx = texture(uMap, vUv * uMapRep).rgb;
  alb *= tx * 2.0;
  #ifdef FLOOR
  ro = mix(0.58, 0.92, smoothstep(0.015, 0.09, dot(tx, vec3(0.3, 0.6, 0.1))));
  #else
  ro = clamp(ro * (0.6 + tx.g * 0.9), 0.05, 1.0);
  #endif
  #endif
  #ifdef DETAIL
  vec3 det = detBlur(vUv);
  alb *= mix(1.0, det.r * 1.7, uDetAmt.x);
  ro = clamp(ro * mix(1.0, det.g * 2.1, uDetAmt.y), 0.06, 1.0);
  if (abs(uBlur) * uDetW < 48.0) {            // engraving relief; smeared away at speed
    float hh = (det.b - 0.5) * uDetAmt.z;
    vec3 sx = dFdx(vW), sy = dFdy(vW);
    vec3 R1 = cross(sy, N), R2 = cross(N, sx);
    float fDet = dot(sx, R1);
    vec3 grad = sign(fDet) * (dFdx(hh) * R1 + dFdy(hh) * R2);
    N = normalize(abs(fDet) * N - grad);
  }
  #endif
  float NoV = max(dot(N, V), 1e-3);
  vec3 F0 = mix(vec3(0.04), alb, me), dc = alb * (1.0 - me);
  vec3 Fe = F0 + (max(vec3(1.0 - ro), F0) - F0) * pow(1.0 - NoV, 5.0);
  #ifdef FLOOR
  vec3 col = vSpec * Fe * (1.2 - ro) * 1.6 + dc * envDiff(N);
  col += dc / PI * (uKeyCol * max(dot(N, uKeyDir), 0.0) + uFillCol * max(dot(N, uFillDir), 0.0));
  if (uPtCol.r > 0.01) { vec3 Lp = uPtPos - vW; float dp = length(Lp); col += dc / PI * uPtCol * max(dot(N, Lp / dp), 0.0) / (1.0 + dp * dp); }
  gl_FragColor = vec4(mix(col, vHC, vHF), 1.0);
  #else
  vec3 col = envSpec(reflect(-V, N), ro) * Fe + dc * envDiff(N);
  col += ggx(N, V, uKeyDir, uKeyCol, dc, F0, ro);
  col += (dc / PI + F0 * 0.06) * uFillCol * max(dot(N, uFillDir), 0.0);   // fill: diffuse + a broad sheen (its glossy part lives in the env softbox)
  if (uPtCol.r > 0.01) { vec3 Lp = uPtPos - vW; float dp = length(Lp); col += ggx(N, V, Lp / dp, uPtCol / (1.0 + dp * dp), dc, F0, max(ro, 0.3)); }
  col += uEmis;
  gl_FragColor = vec4(mix(col, vHC, vHF), 1.0);
  #endif
}`;
// Gouraud variant for the dark structural steel of the hall (columns, beams, crane, housing, rails):
// lighting, a cheap highlight and haze all per vertex; the fragment shader only writes the colour.
function gouraudMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: `uniform vec3 uKeyDir, uKeyCol, uFillDir, uFillCol; uniform float uEnvI;
attribute vec3 aCol; attribute float aSpec;
varying vec3 vC;
${HAZE_GLSL}
${ENV_GLSL}
void main() {
  vec4 p = vec4(position, 1.0); vec3 n = normal;
  #ifdef USE_INSTANCING
  p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  vec4 w = modelMatrix * p; vec3 N = normalize(mat3(modelMatrix) * n);
  vec3 d = w.xyz - cameraPosition; float fd = length(d); vec3 V = -d / fd;
  vec3 R = reflect(-V, N);
  vec3 col = aCol * (envDiff(N) + (uKeyCol * max(dot(N, uKeyDir), 0.0) + uFillCol * max(dot(N, uFillDir), 0.0)) / 3.14159);
  col += aSpec * (uKeyCol * pow(max(dot(R, uKeyDir), 0.0), 12.0) * 0.15 + envSpec(R, 0.5) * 0.5);
  vC = mix(col, hazeCol(d / fd), 1.0 - exp(-uFogDen * uFogDen * fd * fd));
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
    fragmentShader: `varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.0); }`,
  });
}
// Static parts baked into one mesh (one draw call, one program): geometry is transformed into place and
// tagged with its colour and highlight strength.
function staticBuilder() {
  const parts = [], O = new THREE.Object3D();
  const push = (geo, m, color, spec) => {
    const g = geo.clone().applyMatrix4(m), n = g.attributes.position.count, c = new THREE.Color(color);
    const col = new Float32Array(n * 3), sp = new Float32Array(n).fill(spec);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSpec', new THREE.BufferAttribute(sp, 1));
    parts.push(g);
  };
  return {
    add(geo, { pos = [0, 0, 0], rot = [0, 0, 0], color, spec = 0.3 }) { O.position.set(...pos); O.rotation.set(...rot); O.scale.set(1, 1, 1); O.updateMatrix(); push(geo, O.matrix, color, spec); },
    addMatrix(geo, m, color, spec = 0.3) { push(geo, m, color, spec); },
    build(mat) { const m = new THREE.Mesh(mergeGeometries(parts), mat); m.frustumCulled = false; return m; },
  };
}
function litFactory(shared) {
  return (o = {}) => {
    const defines = {};
    const uniforms = { ...shared, uAlb: { value: new THREE.Color(o.color ?? 0x888888) }, uEmis: { value: new THREE.Color(0, 0, 0) }, uMetal: { value: o.metal ?? 1 }, uRough: { value: o.rough ?? 0.4 } };
    if (o.det) { defines.DETAIL = ''; Object.assign(uniforms, { uDet: { value: o.det.tex }, uBlur: o.blur, uDetW: { value: o.det.W }, uDetAmt: { value: new THREE.Vector3(...o.detAmt) } }); }
    if (o.map) { defines.MAP = ''; Object.assign(uniforms, { uMap: { value: o.map }, uMapRep: { value: new THREE.Vector2(...(o.rep || [1, 1])) } }); }
    if (o.floor) defines.FLOOR = '';
    return new THREE.ShaderMaterial({ uniforms, defines, vertexShader: LIT_VS, fragmentShader: LIT_FS, side: o.side ?? THREE.FrontSide });
  };
}

// Streak lights: tiny emitters on the rim (people), pulses down the spokes (feed) and debris flecks.
// Each instance is a short ribbon swept over the shutter interval; min width 1.3 px, energy conserved.
const STREAK_VS = `
attribute vec2 corner;            // x along 0..1, y across -1..1 (one quad: short arcs drawn as chords)
attribute vec4 aP;                // theta, r, z, kind (0 front face, 1 outer face / air, 2 spoke pulse)
attribute vec4 aL;                // size (m), brightness, warmth 0..1, phase
attribute vec2 aM;                // pulse speed (m/s inwards), pulse range (m)
uniform float uAng, uOm, uTime, uPix, uOn, uFeed, uShutter;
varying vec2 vQ; varying float vLen, vW, vI, vK; varying vec3 vCol;
float spokeC(float r) {
  return mix(0.19, 0.12, clamp((r - 0.9) / 3.4, 0.0, 1.0)) + 0.1 * min(1.5, exp(-(r - 1.05) / 0.28)) + 0.08 * min(1.5, exp(-(4.14 - r) / 0.22));
}
void main() {
  float th = aP.x, r = aP.y, z = aP.z, kind = aP.w, size = aL.x;
  float on = uOn;
  if (kind > 1.5) { r = aP.y - mod(aL.w * aM.y + uTime * aM.x, aM.y); z = spokeC(r) + 0.012; on = uFeed * smoothstep(1.0, 1.6, r) * smoothstep(4.15, 3.7, r); }
  float sw = uOm * uShutter;
  float a0 = th + uAng - max(0.0, sw), a1 = th + uAng + max(0.0, -sw);
  float ac = 0.5 * (a0 + a1);
  vec4 cmv = modelViewMatrix * vec4(r * cos(ac), r * sin(ac), z, 1.0);
  float pix = uPix * max(0.05, -cmv.z);
  float w = max(size, pix * 1.3);
  float arc = (a1 - a0) * r, len;
  vec3 p;
  if (kind > 1.5) {
    len = 0.55;                                   // comet tail, outwards
    float rr = r - w + corner.x * (len + 2.0 * w);
    float aa = th + uAng + corner.y * w / r;
    p = vec3(rr * cos(aa), rr * sin(aa), z);
  } else {
    len = arc;
    float a = mix(a0 - w / r, a1 + w / r, corner.x);
    if (kind < 0.5) { float rr = r + corner.y * w; p = vec3(rr * cos(a), rr * sin(a), z); }
    else p = vec3(r * cos(a), r * sin(a), z + corner.y * w);
  }
  vQ = vec2(corner.x * (len + 2.0 * w), corner.y * w); vLen = len; vW = w; vK = kind > 1.5 ? 1.0 : 0.0;
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * fract(aL.w * 7.3)) + aL.w * 40.0);
  vI = aL.y * on * tw * (size / w) * (size / w) * (kind > 1.5 ? 1.0 : size / (size + arc * 0.5));
  vCol = kind > 1.5 ? vec3(1.0, 0.62, 0.25) : mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.46, 0.12), aL.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const STREAK_FS = `
varying vec2 vQ; varying float vLen, vW, vI, vK; varying vec3 vCol;
float vTail(float u) { return vK > 0.5 ? mix(1.0, pow(1.0 - u, 2.0), vK) : 1.0; }
void main() {
  float ax = max(0.0, max(vW - vQ.x, vQ.x - (vLen + vW)));
  float d2 = (ax * ax + vQ.y * vQ.y) / (vW * vW);
  float g = exp(-d2 * 3.5) * vTail(vQ.x / (vLen + 2.0 * vW));
  if (vI * g < 0.002) discard;
  gl_FragColor = vec4(vCol * vI * g, 1.0);
}`;
// One plain (non-instanced) quad per item: SwiftShader pays a heavy per-instance cost on instanced draws,
// so per-item attributes are duplicated onto the 4 corners and everything goes out in one draw call.
function streakGeometry(n, fill, extra = {}) {
  const per = { aP: 4, aL: 4, aM: 2, ...extra }, src = {};
  for (const k in per) src[k] = new Float32Array(n * per[k]);
  for (let i = 0; i < n; i++) fill(i, src.aP, src.aL, src.aM, src);
  const g = new THREE.BufferGeometry(), corner = new Float32Array(n * 8), idx = new Uint32Array(n * 6), C = [0, -1, 0, 1, 1, -1, 1, 1];
  for (let i = 0; i < n; i++) { corner.set(C, i * 8); const a = i * 4; idx.set([a, a + 1, a + 3, a, a + 3, a + 2], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
  g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  for (const k in per) {
    const sz = per[k], out = new Float32Array(n * 4 * sz);
    for (let i = 0; i < n; i++) for (let v = 0; v < 4; v++) out.set(src[k].subarray(i * sz, i * sz + sz), (i * 4 + v) * sz);
    g.setAttribute(k, new THREE.BufferAttribute(out, sz));
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
function streakMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uAng: { value: 0 }, uOm: { value: 0 }, uTime: { value: 0 }, uPix: { value: 0.001 }, uOn: { value: 1 }, uFeed: { value: 0 }, uShutter: { value: SH } },
    vertexShader: STREAK_VS, fragmentShader: STREAK_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ the shot
register('flywheel_3d', (opts) => {
  const mode = ['hero', 'close', 'reveal'].includes(opts.mode) ? opts.mode : 'hero';
  const spin = Array.isArray(opts.spin) && opts.spin.length ? opts.spin
    : mode === 'close' ? [[0, 0.6], [1, 1.6]] : mode === 'reveal' ? [[0, 0.5], [1, 0.8]] : [[0, 0.08], [1, 0.3]];
  const people = opts.people ?? (mode === 'reveal' ? 1 : 0);
  const feed = opts.feed ?? people;
  const sparkMul = opts.sparks ?? (mode === 'reveal' ? 0.15 : 1);
  const seed = opts.seed ?? 7;
  const R = rng(seed * 7919 + 13);

  const FOG = new THREE.Color(0x0a0d12);
  const fogDen = mode === 'close' ? 0.03 : 0.022;
  const scene = new THREE.Scene();
  scene.background = FOG.clone();
  scene.fog = new THREE.FogExp2(FOG.getHex(), fogDen);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 260);

  // ---- lighting: shared uniforms of the lit shader. Amber back light from back-left-top, cold fill
  // from front-right (the camera side in every mode), a flickering point light at the grinding shoe.
  const KEY = new THREE.Color(0xf3a646), FILLC = new THREE.Color(0x7b97bd), SPK = new THREE.Color(0xff8a3a);
  const LU = {
    uKeyDir: { value: new THREE.Vector3(-8, 12, -12).normalize() }, uKeyCol: { value: KEY.clone().multiplyScalar(3) },
    uFillDir: { value: new THREE.Vector3(6, 4, 10).normalize() }, uFillCol: { value: FILLC.clone().multiplyScalar(1.1) },
    uPtPos: { value: new THREE.Vector3(-2.9, 0.75, 0.7) }, uPtCol: { value: new THREE.Color(0, 0, 0) },
    uFogCol: { value: FOG }, uFogDen: { value: fogDen }, uEnvI: { value: 1 },
    uHazeCol: { value: new THREE.Color(0xe0b080).multiplyScalar(0.15) }, uHazeDir: { value: new THREE.Vector3(-0.1, 0.32, -1).normalize() },
    uHazeDir2: { value: new THREE.Vector3(-1, 0.45, -0.2).normalize() },
  };
  const lit = litFactory(LU), gouraud = gouraudMaterial(LU);
  const U = { blur: { value: 0 } };
  const M4 = new THREE.Matrix4();

  // ---- the wheel
  const wheel = new THREE.Group(); wheel.position.set(0, RC, 0); scene.add(wheel);
  const prof = rimProfile();
  const lathe = latheGeo(prof, 192, REP);
  const det = bakeRim(lathe.sAcc, lathe.S, prof, seed);
  const rim = new THREE.Mesh(lathe.geo, lit({ color: 0xa9aeb4, metal: 1, rough: 0.3, det, blur: U.blur, detAmt: [0.85, 0.9, 1.0] }));
  wheel.add(rim);
  const castMap = new THREE.CanvasTexture(noiseCanvas(256, seed + 5, 5, 0.5, 0.6));
  castMap.colorSpace = THREE.SRGBColorSpace; castMap.wrapS = castMap.wrapT = THREE.RepeatWrapping;
  const spokes = new THREE.Mesh(spokeGeo(), lit({ color: 0x8a9096, metal: 0.65, rough: 0.55, map: castMap, rep: [2, 3] }));
  wheel.add(spokes);
  // hub: machined lathe profile with a cap; the shaft runs back into the bearing housing
  const hubP = [[0.001, 1.24], [0.3, 1.24], [0.34, 1.2], [0.34, 1.1], [0.55, 1.1], [0.58, 1.07], [0.58, 0.95], [0.76, 0.95], [0.8, 0.91],
    [1.05, 0.91], [1.13, 0.83], [1.13, -0.83], [1.05, -0.91], [0.5, -0.91], [0.44, -0.97], [0.44, -3.2]];
  const hubMat = lit({ color: 0x969ca2, metal: 1, rough: 0.34 });
  wheel.add(new THREE.Mesh(latheGeo(hubP, 96, 1).geo, hubMat));
  const boltG = new THREE.CylinderGeometry(0.052, 0.052, 0.06, 6); boltG.rotateX(Math.PI / 2);
  const washG = new THREE.CylinderGeometry(0.075, 0.075, 0.015, 16); washG.rotateX(Math.PI / 2);
  const boltB = staticBuilder();
  for (let i = 0; i < 20; i++) {
    const inner = i >= 12, n = inner ? 8 : 12, j = inner ? i - 12 : i, rr = inner ? 0.46 : 0.93, zz = inner ? 1.1 : 0.91;
    const a = (j / n) * TAU + (inner ? 0.2 : 0);
    M4.makeRotationZ(a).setPosition(Math.cos(a) * rr, Math.sin(a) * rr, zz + 0.037); boltB.addMatrix(boltG, M4, 0x5a5f65, 1.1);
    M4.makeRotationZ(a).setPosition(Math.cos(a) * rr, Math.sin(a) * rr, zz + 0.007); boltB.addMatrix(washG, M4, 0x4a4f55, 0.9);
  }
  wheel.add(boltB.build(gouraud));

  // spoke motion-blur ghost: analytic coverage of the spokes swept over the shutter
  const ghostMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAng: { value: 0 }, uB: { value: 0 }, uAlpha: { value: 0 }, uCol: { value: new THREE.Color(0.05, 0.045, 0.044) }, uRim: { value: new THREE.Color(0.5, 0.3, 0.12) } }]),
    vertexShader: `varying vec2 vP;\n#include <fog_pars_vertex>\nvoid main(){ vP = position.xy; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float uAng, uB, uAlpha; uniform vec3 uCol, uRim; varying vec2 vP;\n#include <fog_pars_fragment>
float hwOf(float r) { float a = mix(0.3, 0.19, clamp((r - 0.9) / 3.4, 0.0, 1.0)) + 0.22 * min(1.5, exp(-(r - 1.05) / 0.28)) + 0.16 * min(1.5, exp(-(4.14 - r) / 0.22)); return atan(a / r); }
void main() {
  float r = length(vP); if (r < 1.12 || r > 4.13 || uAlpha < 0.001) discard;
  float P = 6.2831853 / 6.0, hw = hwOf(r);
  float x = mod(atan(vP.y, vP.x) - uAng + 0.5 * P, P) - 0.5 * P;
  float lo = x + min(0.0, uB), hi = x + max(0.0, uB), cov = 0.0;
  for (int j = -1; j <= 1; j++) { float c = float(j) * P; cov += max(0.0, min(hi, c + hw) - max(lo, c - hw)); }
  cov = clamp(cov / max(abs(uB), 1e-4), 0.0, 1.0);
  float edge = smoothstep(0.55, 1.0, abs(x) / max(hw, 1e-3) * 0.5) ;
  gl_FragColor = vec4(uCol * (0.8 + 0.4 * r / 4.0) + uRim * 0.25 * (1.0 - cov) * cov * 4.0, cov * uAlpha);
  #include <fog_fragment>
}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const ghost = new THREE.Mesh(new THREE.RingGeometry(1.1, 4.14, 128, 1), ghostMat);
  ghost.position.set(0, RC, 0); scene.add(ghost);

  // people lights in the rim and feed pulses on the spokes (wheel-local polar coords, rotated in the shader)
  const nFront = 4200, nOuter = 1600, nFeed = NSP * 10;
  const recessZ = (r) => (r > FRONT.rec0 && r < FRONT.rec1 ? HW - 0.018 : HW) + 0.004;
  const lands = []; { const z0 = HW - 0.08, pitch = (2 * z0) / 5; for (let g = 0; g <= 5; g++) lands.push(z0 - pitch * g); }
  const density = (th) => 0.55 + 0.45 * Math.sin(th * 7 + 1.3) * Math.sin(th * 3.1 + 0.4) + 0.25 * noise(th * 23);
  const lightGeo = streakGeometry(nFront + nOuter + nFeed, (i, P, L, M) => {
    let th, r, z, kind;
    if (i < nFront + nOuter) {
      do { th = R() * TAU; } while (R() > density(th));
      if (i < nFront) { kind = 0; r = lerp(FRONT.a + 0.03, FRONT.b - 0.01, Math.pow(R(), 0.8)); z = recessZ(r); }
      else { kind = 1; r = RO + 0.003; const g = Math.floor(R() * 5); z = lerp(lands[g] - 0.075, lands[g + 1] + 0.075, R()); }
      L[i * 4] = 0.007 + 0.012 * Math.pow(R(), 3); L[i * 4 + 1] = 1.6 + 5 * Math.pow(R(), 2.5); L[i * 4 + 2] = R(); L[i * 4 + 3] = R();
    } else {
      const j = i - nFront - nOuter, s = j % NSP; kind = 2;
      th = (s / NSP) * TAU + (R() - 0.5) * 0.004; r = 4.2; z = 0;
      L[i * 4] = 0.03; L[i * 4 + 1] = 5 + 3 * R(); L[i * 4 + 2] = 0.5; L[i * 4 + 3] = Math.floor(j / NSP) / 10 + R() * 0.04;
      M[i * 2] = 1.6 + 0.5 * R(); M[i * 2 + 1] = 3.4;
    }
    P.set([th, r, z, kind], i * 4);
  });
  const lightMat = streakMaterial(); lightMat.uniforms.uShutter.value = SH * 0.25;
  const lights = new THREE.Mesh(lightGeo, lightMat); lights.position.set(0, RC, 0); lights.frustumCulled = false; scene.add(lights);
  lights.visible = people > 0 || feed > 0;

  // debris flecks riding the boundary layer of the rim (close mode)
  let fleckMat = null;
  if (mode === 'close') {
    const fg = streakGeometry(700, (i, P, L) => {
      P.set([R() * TAU, RO + 0.015 + Math.pow(R(), 2) * 0.3, (R() - 0.5) * 1.5, 1], i * 4);
      L.set([0.002 + 0.004 * R(), 0.5 + 1.5 * R(), 0.3 + 0.7 * R(), R()], i * 4);
    });
    fleckMat = streakMaterial();
    const flecks = new THREE.Mesh(fg, fleckMat); flecks.position.set(0, RC, 0); flecks.frustumCulled = false; scene.add(flecks);
  }
  const hubGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,180,90,1)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  hubGlow.position.set(0, RC, 1.4); hubGlow.scale.set(3.2, 3.2, 1); scene.add(hubGlow);

  // ---- the hall
  const { tA, M: FM } = floorTextures(seed + 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FM, FM, 96, 96), lit({ color: 0xffffff, metal: 0, rough: 0.8, map: tA, floor: true }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 24), hazeBasic(LU, { sky: true })); sky.renderOrder = 3; scene.add(sky);
  const outerFloor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 40, 40), hazeBasic(LU, { color: 0x0a0b0c }));
  outerFloor.rotation.x = -Math.PI / 2; outerFloor.position.y = -0.01; outerFloor.renderOrder = 2; scene.add(outerFloor);
  // all static dark steel of the hall in one mesh: guard rail, grinding shoe, bearing housing, columns,
  // crane runway, overhead crane, roof trusses
  const hall = staticBuilder(), RAIL = 0x6a4c12, DARK = 0x1c1f23, STEEL = 0x15191d;
  const postG = new THREE.CylinderGeometry(0.035, 0.035, 1.05, 10);
  for (let x = -3.4; x <= 3.41; x += 1.13) for (const z of [1.75, -1.75]) hall.add(postG, { pos: [x, 0.525, z], color: RAIL });
  for (const z of [-0.6, 0.6]) for (const x of [-3.4, 3.4]) hall.add(postG, { pos: [x, 0.525, z], color: RAIL });
  const barX = new THREE.CylinderGeometry(0.028, 0.028, 6.8, 8), barZ = new THREE.CylinderGeometry(0.028, 0.028, 3.5, 8);
  for (const y of [0.55, 1.03]) {
    for (const z of [-1.75, 1.75]) hall.add(barX, { pos: [0, y, z], rot: [0, 0, Math.PI / 2], color: RAIL });
    for (const x of [-3.4, 3.4]) hall.add(barZ, { pos: [x, y, 0], rot: [Math.PI / 2, 0, 0], color: RAIL });
  }
  hall.add(new THREE.BoxGeometry(0.9, 0.55, 1.4, 2, 2, 3), { pos: [-2.85, 0.3, 0], rot: [0, 0, 0.5], color: DARK, spec: 0.35 });
  hall.add(new THREE.CylinderGeometry(1.15, 1.15, 1.4, 48, 4), { pos: [0, RC, -2.1], rot: [Math.PI / 2, 0, 0], color: DARK, spec: 0.35 });
  hall.add(new THREE.BoxGeometry(2.2, RC, 1.3, 4, 8, 3), { pos: [0, RC / 2, -2.1], color: DARK, spec: 0.35 });
  const webG = new THREE.BoxGeometry(0.7, 26, 0.06, 1, 10, 1), flangeG = new THREE.BoxGeometry(0.06, 26, 0.55, 1, 10, 1);
  for (let z = -32; z <= 16; z += 6.5) for (const x of [-14, 14]) {
    hall.add(webG, { pos: [x, 13, z], color: STEEL }); hall.add(flangeG, { pos: [x - 0.33, 13, z], color: STEEL }); hall.add(flangeG, { pos: [x + 0.33, 13, z], color: STEEL });
  }
  for (const x of [-13.3, 13.3]) hall.add(new THREE.BoxGeometry(0.6, 1.1, 52, 1, 1, 20), { pos: [x, 17, -8], color: STEEL });
  const CR = [0, 17.6, -9.5];
  for (const dz of [-0.9, 0.9]) hall.add(new THREE.BoxGeometry(27, 1.4, 0.55, 12, 1, 1), { pos: [CR[0], CR[1], CR[2] + dz], color: STEEL });
  hall.add(new THREE.BoxGeometry(2.6, 1.2, 2.6), { pos: [CR[0] - 3.5, CR[1] + 1.1, CR[2]], color: STEEL });
  for (const dx of [-0.25, 0.25]) hall.add(new THREE.CylinderGeometry(0.02, 0.02, 8, 5), { pos: [CR[0] - 3.5 + dx, CR[1] - 3.6, CR[2]], color: STEEL });
  hall.add(new THREE.BoxGeometry(0.8, 1.1, 0.5), { pos: [CR[0] - 3.5, CR[1] - 8, CR[2]], color: STEEL });
  const trussG = new THREE.BoxGeometry(28, 0.35, 0.3, 12, 1, 1);
  for (let i = 0; i < 8; i++) for (const y of [24, 21.5]) hall.add(trussG, { pos: [0, y, -32 + i * 6.5], color: STEEL });
  scene.add(hall.build(gouraud));
  const wallM = hazeBasic(LU, { color: 0x0b0d10 });
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(40, 70, 20, 35), wallM); roof.rotation.x = Math.PI / 2; roof.position.set(0, 26, -8); roof.renderOrder = 2; scene.add(roof);
  // window walls: back (-z) and left (-x), HDR through the material colour so they bloom through the haze
  const winTex = windowTexture(seed + 9);
  const winMat = hazeBasic(LU, { map: winTex, mult: 1.5 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(34, 17, 34, 17), winMat); back.position.set(0, 11.5, -36); back.renderOrder = 1; scene.add(back);
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(80, 40, 40, 20), wallM); backWall.position.set(0, 14, -36.1); backWall.renderOrder = 2; scene.add(backWall);
  winTex.wrapS = THREE.RepeatWrapping;
  const winMat2 = hazeBasic(LU, { map: winTex, mult: 1.0, rep: [2, 1] });
  const left = new THREE.Mesh(new THREE.PlaneGeometry(46, 6, 23, 3), winMat2); left.rotation.y = Math.PI / 2; left.position.set(-15.9, 18.5, -8); left.renderOrder = 1; scene.add(left);
  for (const x of [-16, 16]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(70, 30, 35, 15), wallM); s.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; s.position.set(x + (x < 0 ? -0.05 : 0), 15, -8); s.renderOrder = 2; scene.add(s); }

  // light shafts (cylindrical billboards, additive, soft) from the window walls
  const shaftMat = (col, I) => new THREE.ShaderMaterial({
    uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uW: { value: new THREE.Vector2(1, 3) }, uI: { value: I }, uCol: { value: new THREE.Color(col) }, uT: { value: 0 } },
    vertexShader: `uniform vec3 uA, uB; uniform vec2 uW; varying vec2 vUv2; varying float vFade;
void main(){ vec3 P = mix(uA, uB, uv.y); vec3 ax = normalize(uB - uA); vec3 tc = normalize(cameraPosition - P);
  vec3 side = normalize(cross(ax, tc)); float w = mix(uW.x, uW.y, uv.y); P += side * (uv.x * 2.0 - 1.0) * w;
  vUv2 = uv; vFade = clamp(1.2 - abs(dot(ax, tc)) * 1.2, 0.25, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0); }`,
    fragmentShader: `uniform float uI, uT; uniform vec3 uCol; varying vec2 vUv2; varying float vFade;
void main(){ float x = vUv2.x * 2.0 - 1.0; float a = pow(max(0.0, 1.0 - x * x), 1.6);
  a *= smoothstep(0.0, 0.12, vUv2.y) * pow(1.0 - vUv2.y, 1.3);
  a *= 0.75 + 0.25 * sin(vUv2.y * 23.0 + x * 3.0 + uT * 0.4) * sin(vUv2.y * 9.0 - uT * 0.25);
  gl_FragColor = vec4(uCol * a * uI * vFade, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const shafts = [];
  const sunB = new THREE.Vector3(0.3, -0.5, 1).normalize(), sunL = new THREE.Vector3(1, -0.55, 0.3).normalize();
  for (const [x, y, z, dir, w0, w1, I] of [[-7.5, 17, -35.5, sunB, 1.0, 2.4, 0.07], [1.5, 16.5, -35.5, sunB, 1.1, 2.8, 0.065], [-15.5, 19, -6, sunL, 0.9, 2.4, 0.05]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shaftMat(0xffc985, I));
    const A0 = new THREE.Vector3(x, y, z), B0 = A0.clone().addScaledVector(dir, 40);
    m.material.uniforms.uA.value.copy(A0); m.material.uniforms.uB.value.copy(B0); m.material.uniforms.uW.value.set(w0, w1);
    m.frustumCulled = false; m.visible = mode === 'hero'; scene.add(m); shafts.push(m);
  }

  // dust motes (points drifting by sines of time; bigger and softer near the lens)
  const nDust = 500, dPos = new Float32Array(nDust * 3), dSeed = new Float32Array(nDust * 4);
  for (let i = 0; i < nDust; i++) {
    dPos.set([(R() - 0.5) * 26, R() * 16, (R() - 0.6) * 30], i * 3);
    dSeed.set([R(), R(), R(), R()], i * 4);
  }
  const dustG = new THREE.BufferGeometry();
  dustG.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dustG.setAttribute('aS', new THREE.BufferAttribute(dSeed, 4));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uScale: { value: 500 }, uI: { value: 1 } },
    vertexShader: `attribute vec4 aS; uniform float uT, uScale; varying float vA;
void main(){ vec3 p = position + vec3(sin(uT * (0.13 + aS.x * 0.2) + aS.y * 30.0) * 0.6, sin(uT * (0.09 + aS.z * 0.15) + aS.w * 20.0) * 0.4 + uT * 0.04 * (aS.x - 0.3), cos(uT * (0.11 + aS.w * 0.2) + aS.x * 25.0) * 0.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;
  float s = uScale * (0.01 + 0.025 * aS.z * aS.z) / max(d, 0.1);
  vA = (0.3 + 0.7 * aS.y) * smoothstep(0.3, 1.5, d) / (1.0 + max(0.0, s - 5.0) * 0.15);
  gl_PointSize = clamp(s, 1.0, 14.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI; varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; float a = exp(-r * 3.0) * vA * uI; gl_FragColor = vec4(vec3(1.0, 0.86, 0.68) * a * 0.5, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustG, dustMat); dust.frustumCulled = false; scene.add(dust);

  // sparks: a tight jet of ballistic streaks thrown off the shoe along the rim's motion, one floor bounce
  const nSpark = 520;
  const sparkG = streakGeometry(nSpark, (i, P, L, M, X) => {
    const a = 2.5 + (R() - 0.5) * 0.4, sp = 6 + R() * 8;
    X.aO.set([-2.6 + (R() - 0.5) * 0.15, 0.5 + R() * 0.08, (R() - 0.5) * 0.7, R()], i * 4);
    X.aV.set([Math.cos(a) * sp, Math.sin(a) * sp, (R() - 0.5) * 2.4 + 0.8, R()], i * 4);
    X.aT.set([0.35 + R() * 0.8, R(), 0.0035 + R() * 0.005, R()], i * 4);   // life, phase, size, gate
  }, { aO: 4, aV: 4, aT: 4 });
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uRate: { value: 0 }, uPix: { value: 0.001 }, uSh: { value: SH * 2.4 }, uVS: { value: 1 } },
    vertexShader: `attribute vec2 corner; attribute vec4 aO, aV, aT; uniform float uT, uRate, uPix, uSh, uVS; varying vec2 vQ; varying float vLen, vW, vI, vK; varying vec3 vCol;
vec3 at(float t) {
  vec3 v = aV.xyz * uVS;
  float g = 9.8, th = (v.y + sqrt(v.y * v.y + 2.0 * g * aO.y)) / g;
  if (t < th) return aO.xyz + v * t + vec3(0.0, -0.5 * g * t * t, 0.0);
  vec3 h = aO.xyz + v * th; h.y = 0.0; float u = t - th; float vy = (g * th - v.y) * 0.3;
  return h + vec3(v.x * 0.45 * u, vy * u - 0.5 * g * u * u, v.z * 0.45 * u);
}
void main() {
  float life = aT.x, age = mod(uT + aT.y * 7.0, life * 1.5);
  float alive = step(aT.w, uRate) * step(age, life);
  float t1 = age, t0 = max(0.0, age - uSh);
  vec4 v0 = modelViewMatrix * vec4(at(t0), 1.0), v1 = modelViewMatrix * vec4(at(t1), 1.0);
  float pix = uPix * max(0.05, -v1.z), w = max(aT.z, pix * 1.1);
  vec3 d = v1.xyz - v0.xyz; float L = length(d); vec3 dir = L > 1e-5 ? d / L : vec3(1.0, 0.0, 0.0);
  vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + vec3(1e-5));
  vec3 p = mix(v0.xyz - dir * w, v1.xyz + dir * w, corner.x) + side * corner.y * w;
  vQ = vec2(corner.x * (L + 2.0 * w), corner.y * w); vLen = L; vW = w; vK = 0.0;
  float heat = 1.0 - age / life;
  vI = alive * (aT.z / w) * (aT.z / w) * (0.5 + 2.0 * heat * heat) * 14.0 * smoothstep(2.4, 4.4, -v1.z) / (1.0 + L * 1.5);
  vCol = mix(vec3(1.0, 0.3, 0.07), vec3(1.0, 0.86, 0.58), heat * heat);
  if (alive < 0.5 || -v1.z < 2.4 || -v0.z < 2.0) p = vec3(0.0, 0.0, 10.0);
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`,
    fragmentShader: STREAK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const sparks = new THREE.Mesh(sparkG, sparkMat); sparks.frustumCulled = false; scene.add(sparks);

  // ---- camera paths per mode (k-driven, so they fit any duration)
  const V3 = (a) => new THREE.Vector3(...a);
  const tgt = new THREE.Vector3();
  const pathOf = {
    hero: { p0: [9.8, 0.8, 13.4], p1: [6.7, 1.15, 9.5], t0: [-3.1, 5.0, 0], t1: [-2.6, 4.75, 0], f0: 33, f1: 35, e: (k) => k * 0.8 + 0.2 * ease.out(k) },
    close: { p0: [-6.25, 1.75, 3.35], p1: [-5.15, 3.25, 2.45], t0: [-3.3, 2.9, 0.2], t1: [-2.9, 3.2, 0.2], f0: 56, f1: 62, e: (k) => ease.inOut(k) * 0.5 + k * 0.5 },
    reveal: { p0: [-2.55, 6.45, 3.5], p1: [-1.6, 2.7, 19.5], t0: [-3.4, 7.0, 0.6], t1: [0.2, 2.75, 0], f0: 42, f1: 34, e: (k) => ease.inOut(clamp(k / 0.92)) },
  };
  const path = pathOf[mode];
  const P0 = V3(path.p0), P1 = V3(path.p1), T0 = V3(path.t0), T1 = V3(path.t1);

  return {
    scene, camera,
    bloom: mode === 'reveal' ? { strength: 0.9, radius: 0.55, threshold: 0.75 } : { strength: 0.6, radius: 0.5, threshold: 0.9 },
    exposure: 1.0,
    update(lt, c) {
      const { rev, rps } = spinAt(spin, c.k, c.dur);
      const ang = -rev * TAU, om = -rps * TAU;              // clockwise seen from the front
      wheel.rotation.z = ang;
      U.blur.value = ((om * SH) / TAU) * REP;
      ghostMat.uniforms.uAng.value = ang; ghostMat.uniforms.uB.value = om * SH;
      // spokes sharp at low speed; above ~1 rps the analytic coverage disc takes over completely
      const bl = Math.abs(om * SH);
      const gA = smooth((bl - 0.1) / 0.05);
      ghostMat.uniforms.uAlpha.value = bl > 0.15 ? 1 : gA * 0.8;
      ghost.visible = gA > 0.002;
      spokes.visible = bl <= 0.15;

      // camera
      const e = path.e(c.k);
      camera.position.lerpVectors(P0, P1, e);
      tgt.lerpVectors(T0, T1, e);
      if (mode === 'close') {
        const s = 0.012 + 0.03 * clamp(rps / 2);
        camera.position.x += noise(lt * 9 + 3) * s; camera.position.y += noise(lt * 11 + 7) * s; camera.position.z += noise(lt * 7 + 1) * s * 0.5;
        tgt.y += noise(lt * 6 + 11) * s * 2;
      } else {
        camera.position.x += noise(lt * 0.6 + 2) * 0.05; camera.position.y += noise(lt * 0.5 + 5) * 0.03;
      }
      camera.fov = lerp(path.f0, path.f1, e);
      camera.lookAt(tgt);
      if (mode === 'close') camera.rotateZ(0.05 + noise(lt * 4) * 0.012 * clamp(rps));
      camera.updateProjectionMatrix();
      const pix = (2 * Math.tan((camera.fov * Math.PI) / 360)) / 1080;

      // people lights + feed into the hub
      lightMat.uniforms.uAng.value = ang; lightMat.uniforms.uOm.value = om; lightMat.uniforms.uTime.value = lt; lightMat.uniforms.uPix.value = pix;
      lightMat.uniforms.uOn.value = people * (mode === 'reveal' ? lerp(1, 2.4, smooth(c.k * 1.2)) : 1);
      const feedNow = feed * (mode === 'reveal' ? smooth((c.k - 0.15) / 0.45) : 1);
      lightMat.uniforms.uFeed.value = feedNow;
      hubMat.uniforms.uEmis.value.setRGB(1, 0.55, 0.2).multiplyScalar(feedNow * (0.35 + 0.08 * Math.sin(lt * 5)));
      hubGlow.material.opacity = feedNow * 0.45; hubGlow.visible = feedNow > 0.001;
      if (fleckMat) { const u = fleckMat.uniforms; u.uAng.value = ang; u.uOm.value = om; u.uTime.value = lt; u.uPix.value = pix; u.uOn.value = 0.5 + 0.5 * clamp(rps); }

      // the hall dims a little while the people-lights carry the reveal
      const dim = mode === 'reveal' ? lerp(1, 0.5, smooth(c.k * 1.4)) : 1;
      LU.uKeyCol.value.copy(KEY).multiplyScalar(3 * dim); LU.uFillCol.value.copy(FILLC).multiplyScalar(1.1 * dim); LU.uEnvI.value = dim * (mode === 'close' ? 0.55 : 1);
      const wdim = mode === 'reveal' ? lerp(1, 0.28, smooth(c.k * 1.3)) : 1;
      winMat.uniforms.uCol.value.setScalar(1.5 * wdim); winMat2.uniforms.uCol.value.setScalar(1.0 * wdim);
      for (const s of shafts) s.material.uniforms.uT.value = lt;

      // sparks follow the rim speed
      const rate = clamp(Math.pow(rps / 0.6, 1.3) * 0.7, 0, 1) * sparkMul;
      sparkMat.uniforms.uT.value = lt; sparkMat.uniforms.uRate.value = rate; sparkMat.uniforms.uPix.value = pix;
      sparkMat.uniforms.uVS.value = clamp(0.55 + rps * 0.6, 0.6, 1.9);       // the jet speeds up with the rim
      const flick = 0.75 + 0.25 * noise(lt * 23) + 0.15 * noise(lt * 61);
      LU.uPtCol.value.copy(SPK).multiplyScalar(28 * clamp(rate) * flick);

      dustMat.uniforms.uT.value = lt; dustMat.uniforms.uScale.value = 1080 / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
  };
});
