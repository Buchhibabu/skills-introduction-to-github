// flywheel_3d: THE hero object. A 9.6 m machined steel flywheel (grooved rope rim with an engraved, paint-filled
// legend ring, a graduated dial, bolt circle, hazard and balance-mark paint, six cast spokes, a turned and bolted
// hub on a split pillow block) turning in a hazy industrial hall. Amber back light through tall windows, a cold
// blue fill from the camera side, dust, and a brake shoe throwing sparks off the rim.
//
// opts:
//   mode    'hero'   (default) low-angle slow push-in on the whole wheel. The hub sits in the upper-right third
//                    (~x 1500-1650, y 180-300); the left ~55% of frame is dark hall, so centred statements
//                    (y ~330 or ~540) and a timeline (y ~600-700) cross the hall and the rim's dark flank.
//           'close'  the climax: the camera hangs just in front of the top of the rim and pushes in while it
//                    spins up. A brake shoe on the top-left of the rim throws a growing spark jet along the top
//                    arc (upper third of frame); bolts, lettering, dial ticks and paint marks stream past as
//                    motion-blur streaks; grit whips past the lens; shake and roll grow with the speed, so the
//                    last frame is the most violent. The rim face fills the middle band (y ~420-720), so the
//                    stacked centre lines (y ~430 / 560 / 720) sit on dark, streaking steel.
//           'reveal' starts a hand's width from the rim face, where thousands of tiny warm lights (people, in
//                    soft clustered crowds) are embedded; pulls back to the whole wheel: a ring of light feeding
//                    pulses down the spokes into a glowing seam and core in the hub. Centre lines at y ~480/600
//                    cross the lower spokes on a dimmed hall.
//   spin    [[k, revolutionsPerSecond], ...]  speed over shot progress k (0..1), smooth between keys;
//           the rotation angle is the exact integral, so any duration works. Default by mode.
//   people  0..1 intensity of the embedded people-lights (default 1 in 'reveal', 0 otherwise)
//   sparks  0..2 spark multiplier (default 1; 0.15 in 'reveal'); the spark rate also follows the spin speed
//   feed    0..1 intensity of the pulses running down the spokes into the hub (default = people)
//   seed    layout seed for lights/sparks/dust (default 7)
//
// Motion blur is real: a 180-degree shutter (1/48 s; shortened in 'close' so detail streaks stay discrete). The
// rim is a solid of revolution, so its detail atlas is blurred along the angle in the shader (with an
// angle-only pre-smeared twin at high speed) and its paint marks are box-filtered analytically; the spokes
// crossfade into an analytic coverage "ghost disc" over a speed range; lights, sparks and flecks are drawn as
// streaks swept over the shutter interval. Everything is a pure function of time, so frames can be rendered in
// any order.
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
  // 1. lathe tool marks: soft circumferential bands (constant v), smoothed so they never alias into crunch
  {
    const n = new Float32Array(H), m = new Float32Array(H);
    for (let y = 0; y < H; y++) { n[y] = R() - 0.5; m[y] = R() - 0.5; }
    const sm = (a, r) => { const o = new Float32Array(H); for (let y = 0; y < H; y++) { let t = 0; for (let k = -r; k <= r; k++) t += a[(y + k + H) % H]; o[y] = t / (2 * r + 1); } return o; };
    const a1 = sm(n, 3), a2 = sm(m, 6);
    for (let y = 0; y < H; y++) {
      const va = a1[y] * 2.2 + a2[y] * 1.5, vr = a2[y] * 3.0 - a1[y] * 1.5;
      A.fillStyle = `rgba(${va < 0 ? '0,0,0' : '255,255,255'},${Math.min(va < 0 ? 0.12 : 0.07, Math.abs(va) * 0.22)})`; A.fillRect(0, y, W, 1);
      Rg.fillStyle = `rgba(${vr < 0 ? '0,0,0' : '255,255,255'},${Math.min(0.2, Math.abs(vr) * 0.35)})`; Rg.fillRect(0, y, W, 1);
    }
  }
  // 2. inner face and chamfers: cast, darker and rougher, pitted
  const yIn = yOf(sAcc[1]);
  A.fillStyle = 'rgba(0,0,0,0.55)'; A.fillRect(0, 0, W, yIn + 6);
  Rg.fillStyle = 'rgba(255,255,255,0.6)'; Rg.fillRect(0, 0, W, yIn + 6);
  for (let i = 0; i < 9000; i++) {            // casting pits: albedo only (a height map this fine would alias)
    const x = R() * W, y = R() * yIn, r = 1 + R() * 3;
    A.fillStyle = `rgba(0,0,0,${0.12 * R()})`; A.fillRect(x, y, r * 2, r);
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
    A.strokeStyle = `rgba(255,255,255,${0.02 + 0.04 * R()})`; A.lineWidth = 1; A.beginPath(); A.moveTo(x, y); A.lineTo(x + l, y + (R() - 0.5) * 6); A.stroke();
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
  for (const [ctx, col] of [[A, grey(236)], [Hg, grey(20)], [Rg, grey(235)]]) {     // engraved, with a white paint infill
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
    A.fillStyle = grey(234); A.fillRect(x - 2, yT0, 4, h);
    Hg.fillStyle = grey(50); Hg.fillRect(x - 1.5, yT0, 3, h);
  }
  // bolt circle on the inner land: hex heads with washers (raised)
  const yB = yR((FRONT.a + FRONT.land1) / 2), bx = pxPerMx(4.26);
  for (let b = 0; b < 6; b++) {
    const x = (b + 0.5) / 6 * W;
    for (const [ctx, ring, head, face] of [[A, 'rgba(0,0,0,0.5)', grey(232), grey(214)], [Hg, grey(150), grey(215), grey(205)], [Rg, grey(150), grey(90), grey(110)]]) {
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
  // 5b. paint: a balance-mark stripe across the outer face and the front face, a hazard block and a stencilled
  // warning (albedo above ~0.62 is read by the shader as white paint, linearly, so it survives motion blur)
  {
    const xs = W * 0.62, pw = 0.09 * pxPerMx(RO);
    A.fillStyle = grey(232); A.fillRect(xs, yOf(sOut0) + 2, pw, yOf(sOut1) - yOf(sOut0) - 4);
    Rg.fillStyle = grey(235); Rg.fillRect(xs, yOf(sOut0) + 2, pw, yOf(sOut1) - yOf(sOut0) - 4);
    A.fillStyle = grey(232); A.fillRect(xs, yR(FRONT.land2), pw * 0.8, yR(FRONT.b) - yR(FRONT.land2));
    // a painted inspection band on the outer face, a quarter turn later (the striped hazard blocks are analytic)
    const xh = W * 0.18, hw = 0.5 * pxPerMx(RO);
    A.save(); A.beginPath(); A.rect(xh, yOf(sOut0) + 2, hw, yOf(sOut1) - yOf(sOut0) - 4); A.clip();
    A.fillStyle = grey(240); A.fillRect(xh, 0, hw, H);
    A.restore();
    Rg.fillStyle = grey(225); Rg.fillRect(xh, yOf(sOut0) + 2, hw, yOf(sOut1) - yOf(sOut0) - 4);
    // stencil on the front face, between the bolt circle and the engraved band
    for (const [ctx, col] of [[A, grey(232)], [Rg, grey(230)]]) {
      ctx.save(); ctx.translate(W * 0.36, yR(FRONT.land1 - 0.06)); ctx.scale(-fx / fy, -1);
      ctx.font = `700 ${Math.round(0.07 * fy * 1.32)}px Oswald`; ctx.textBaseline = 'middle'; ctx.fillStyle = col;
      ctx.fillText('MAX 120 RPM  ·  KEEP CLEAR', 0, 0); ctx.restore();
    }
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
  // canvas rows map straight to the profile arc length (v = s / S), as the bake above assumes
  t.flipY = false; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  // a twin smeared 64 px along the angle only (running average of shifted copies): motion blur at speed keeps
  // the detail across the profile sharp instead of going through isotropic mip blur
  const st = document.createElement('canvas'); st.width = W; st.height = H;
  const sg = st.getContext('2d'), NS = 16;
  for (let i = 0; i < NS; i++) { const dx = Math.round((i / (NS - 1) - 0.5) * 64); sg.globalAlpha = 1 / (i + 1); sg.drawImage(out, dx, 0); sg.drawImage(out, dx > 0 ? dx - W : dx + W, 0); }
  const ts = new THREE.CanvasTexture(st);
  ts.flipY = false; ts.wrapS = THREE.RepeatWrapping; ts.wrapT = THREE.ClampToEdgeWrapping; ts.minFilter = THREE.LinearMipmapLinearFilter; ts.anisotropy = 4;
  return { tex: t, streak: ts, W, H, innerV: (sAcc[1] / S) * 1.02 };
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
  for (let i = 0; i < 260; i++) { // oil / water stains: small, soft, clustered around the machine and walkways
    const cx = Math.floor(i / 10), x = X(Math.sin(cx * 12.9) * 12 + (R() - 0.5) * 2.5), z = Z(Math.cos(cx * 7.3) * 10 + (R() - 0.5) * 1.6), r = (0.08 + R() * 0.35) * px;
    const g = A.createRadialGradient(x, z, 0, x, z, r); g.addColorStop(0, `rgba(10,8,6,${0.1 + 0.18 * R()})`); g.addColorStop(1, 'rgba(10,8,6,0)');
    A.save(); A.translate(x, z); A.scale(1, 0.5 + R() * 0.5); A.translate(-x, -z); A.fillStyle = g; A.fillRect(x - r, z - r, 2 * r, 2 * r); A.restore();
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
  if (ro < 0.75 && box > 0.0) {
    float bw = 0.04 + ro * 0.25;
    float bay = smoothstep(0.06, 0.06 + bw, abs(fract(az * 2.9 + 0.5) - 0.5));          // dark piers between bays
    vec2 g = abs(fract(vec2(az * 11.6, R.y * 7.4)) - 0.5);
    float pane = 0.35 + 0.65 * smoothstep(0.03, 0.03 + bw * 1.5, min(g.x, g.y));         // glazing bars
    float tr = smoothstep(0.42, 0.44 + bw, abs(R.y - 0.42));                             // transom
    box *= mix(1.0, bay * mix(1.0, pane * (0.5 + 0.5 * tr), smoothstep(0.55, 0.15, ro)), smoothstep(0.75, 0.3, ro));
  }
  c += vec3(1.0, 0.64, 0.33) * 4.0 * box * (0.55 + 0.45 * clamp(R.y / 0.68, 0.0, 1.0)) / (1.0 + r2 * 3.0);
  // clerestory on the left wall and the cold softbox front-right: cheap lobes
  float wl = 0.05 + r2 * 0.8;
  c += vec3(1.0, 0.7, 0.42) * 1.6 * exp((dot(R, vec3(-0.86, 0.5, -0.1)) - 1.0) / wl) * (0.05 / wl);
  float w = 0.03 + r2 * 0.8;
  c += vec3(0.5, 0.66, 1.0) * 2.2 * exp((dot(R, vec3(0.6, 0.48, 0.64)) - 1.0) / w) * (0.03 / w);
  c += vec3(0.75, 0.78, 0.82) * 0.4 * smoothstep(0.86 - r2, 0.97, R.y);
  c += vec3(0.13, 0.14, 0.155) * smoothstep(-0.2, 0.7, R.z) * (0.35 + 0.65 * smoothstep(-0.3, 0.35, R.y));
  return c * uEnvI;
}
vec3 envDiff(vec3 N) {
  vec3 c = mix(vec3(0.008, 0.007, 0.007), vec3(0.04, 0.045, 0.055), N.y * 0.5 + 0.5) + vec3(0.03, 0.032, 0.036) * max(0.0, N.z);
  c += vec3(1.0, 0.64, 0.33) * 0.22 * max(0.0, dot(N, vec3(0.0, 0.37, -0.93)));
  c += vec3(1.0, 0.7, 0.42) * 0.12 * max(0.0, dot(N, vec3(-0.93, 0.37, 0.0)));
  c += vec3(0.5, 0.66, 1.0) * 0.2 * max(0.0, dot(N, normalize(vec3(0.62, 0.5, 0.6))));
  return c * uEnvI;
}
`;
// One cheap physically-flavoured shader for every lit surface (SwiftShader budget): an analytic HDR
// "hall" environment (warm window wall behind, cold softbox front-left, strips overhead) blurred by
// roughness, GGX key + fill + a point light, Schlick fresnel, exp2 fog. Optional: rim detail atlas with
// angular motion blur (DETAIL), albedo map (MAP), floor gloss from albedo (FLOOR).
const LIT_VS = `
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vLoc;
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
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * n); vUv = uv; vLoc = position;
  gl_Position = projectionMatrix * viewMatrix * w;
  vec3 d = w.xyz - cameraPosition; float fd = length(d);
  vHC = hazeCol(d / fd); vHF = 1.0 - exp(-uFogDen * uFogDen * fd * fd);
  #ifdef FLOOR
  vSpec = envSpec(reflect(d / fd, vN), 0.72);
  #endif
}`;
const LIT_FS = `
uniform vec3 uAlb, uEmis; uniform float uMetal, uRough, uOpacity;
varying vec3 vLoc;
uniform vec3 uKeyDir, uKeyCol, uFillDir, uFillCol, uPtPos, uPtCol; uniform float uEnvI;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
varying vec3 vHC; varying float vHF;
#ifdef DETAIL
uniform sampler2D uDet, uDetS; uniform float uBlur, uDetW, uInnerV; uniform vec3 uDetAmt;
vec3 detBlur(vec2 uv) {
  float span = abs(uBlur) * uDetW;
  if (span < 1.5) return texture(uDet, uv).rgb;
  vec3 a = vec3(0.0);
  if (span < 64.0) a = (texture(uDet, uv).rgb + texture(uDet, uv + vec2(uBlur * 0.5, 0.0)).rgb + texture(uDet, uv + vec2(uBlur, 0.0)).rgb) / 3.0;
  if (span < 12.0) return a;
  // taps of the angle-smeared twin spread across the shutter sweep
  int n = int(clamp(span / 48.0, 2.0, 6.0));
  vec3 b = vec3(0.0);
  for (int i = 0; i < 6; i++) { if (i >= n) break; b += texture(uDetS, uv + vec2(uBlur * (float(i) + 0.5) / float(n), 0.0)).rgb; }
  b /= float(n);
  return span < 64.0 ? mix(a, b, smoothstep(12.0, 64.0, span)) : b;
}
// fraction of the shutter interval [a, a + s] covered by periodic boxes [kP, kP + L] (exact box filter)
float boxCov(float a, float s, float P, float L) {
  float lo = a + min(s, 0.0), w = abs(s);
  if (w < 1e-6) return step(mod(lo, P), L);
  float hi = lo + w;
  float F1 = floor(hi / P) * L + min(mod(hi, P), L), F0 = floor(lo / P) * L + min(mod(lo, P), L);
  return clamp((F1 - F0) / w, 0.0, 1.0);
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
  float NoV0 = abs(dot(N, V));
  #ifdef MACHINED
  // turned steel: soft lathe rings along the profile break up the roughness and the albedo
  float rg = sin(vUv.y * 5200.0) * 0.4 + sin(vUv.y * 1700.0 + 1.3) * 0.35 + sin(vUv.y * 310.0 + 0.4) * 0.25;
  ro = clamp(ro * (0.9 + 0.16 * rg), 0.08, 1.0);
  alb *= 0.97 + 0.04 * rg;
  #endif
  #ifdef DETAIL
  vec3 det = detBlur(vUv);
  // albedo channel: steel up to ~0.62, white paint above; coverage is linear so blurred paint smears into
  // proportionally fainter streaks instead of vanishing below a threshold
  float paint = clamp((det.r - 0.62) / 0.3, 0.0, 1.0) * uDetAmt.x;
  alb *= mix(1.0, min(det.r, 0.62) * 1.75, uDetAmt.x);
  ro = clamp(ro * mix(1.0, det.g * 2.1, uDetAmt.y), 0.06, 1.0);
  alb = mix(alb, vec3(0.64, 0.62, 0.57), paint);
  float inner = step(vUv.y, uInnerV);          // the inner face is unmachined cast iron under dark oxide paint
  alb = mix(alb, vec3(0.075, 0.08, 0.085) * (0.7 + 0.6 * det.r), inner); me = mix(me, 0.15, inner); ro = mix(ro, 0.72, inner);
  {
    // paint that reads at speed: amber hazard blocks and white index stripes placed by absolute angle (not the
    // repeating atlas), box-filtered over the shutter interval so they smear into streaks of the right length
    float r = length(vLoc.xy), a = fract(vUv.x / ${REP.toFixed(1)}), sw = uBlur / ${REP.toFixed(1)};
    float front = step(${(HW - 0.03).toFixed(3)}, vLoc.z) * step(${(FRONT.a).toFixed(3)}, r) * step(r, ${(FRONT.b).toFixed(3)});
    float outer = step(${(RO - 0.065).toFixed(3)}, r) * step(abs(vLoc.z), ${(HW - 0.09).toFixed(3)});
    float circ = 6.2831853 * r;
    float hz = front * boxCov(a + 0.02, sw, 1.0 / 5.0, 0.5 / circ) + outer * boxCov(a + 0.19, sw, 1.0 / 4.0, 0.7 / circ);
    float wt = front * boxCov(a + 0.09, sw, 1.0 / 13.0, 0.05 / circ) + outer * boxCov(a + 0.3, sw, 1.0 / 9.0, 0.06 / circ);
    float sharp = 1.0 - smoothstep(0.0008, 0.004, abs(sw));
    float sq = (a * circ + r * 0.8 + vLoc.z) / 0.11;
    float stripes = mix(0.55, clamp(0.5 + (abs(fract(sq) - 0.5) - 0.25) / max(fwidth(sq), 1e-3), 0.0, 1.0), sharp);
    vec3 pc = mix(vec3(0.03, 0.028, 0.025), vec3(0.85, 0.42, 0.08), stripes);
    // chalk balance marks and a band of scuffs on the inner face (it is what the camera sees from below)
    float inn = step(r, ${(RI + 0.02).toFixed(3)}) * step(abs(vLoc.z), ${(HW - 0.07).toFixed(3)});
    wt += inn * (boxCov(a + 0.05, sw, 1.0 / 11.0, 0.06 / circ) * step(abs(vLoc.z), 0.36) + boxCov(a + 0.12, sw, 1.0 / 7.0, 0.22 / circ) * step(abs(vLoc.z - 0.18), 0.05));
    hz += inn * boxCov(a + 0.27, sw, 1.0 / 4.0, 0.4 / circ) * step(abs(vLoc.z + 0.2), 0.16);
    float cov = clamp(hz + wt, 0.0, 1.0);
    alb = mix(alb, mix(vec3(0.62, 0.6, 0.55), pc, hz / max(hz + wt, 1e-4)), cov);
    me = mix(me, 0.0, cov); ro = mix(ro, 0.5, cov);
  }
  me = mix(me, 0.0, paint); ro = mix(ro, 0.55, paint);
  if (abs(uBlur) * uDetW < 56.0) {            // engraving relief; fades as it smears at speed, and at grazing angles
    vec2 fw = fwidth(vUv) * vec2(uDetW, uDetW * 0.5);          // atlas texels per pixel: fade relief once minified
    float hh = (det.b - 0.5) * uDetAmt.z * smoothstep(0.12, 0.45, NoV0) * (1.0 - smoothstep(12.0, 56.0, abs(uBlur) * uDetW)) * (1.0 - smoothstep(0.6, 1.6, max(fw.x, fw.y)));
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
  gl_FragColor = vec4(mix(col, vHC, vHF), uOpacity);
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
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m), n = g.attributes.position.count, c = new THREE.Color(color);
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
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
    const uniforms = { ...shared, uAlb: { value: new THREE.Color(o.color ?? 0x888888) }, uEmis: { value: new THREE.Color(0, 0, 0) }, uMetal: { value: o.metal ?? 1 }, uRough: { value: o.rough ?? 0.4 }, uOpacity: { value: 1 } };
    if (o.det) { defines.DETAIL = ''; Object.assign(uniforms, { uDet: { value: o.det.tex }, uDetS: { value: o.det.streak }, uBlur: o.blur, uDetW: { value: o.det.W }, uInnerV: { value: o.det.innerV ?? 0 }, uDetAmt: { value: new THREE.Vector3(...o.detAmt) } }); }
    if (o.map) { defines.MAP = ''; Object.assign(uniforms, { uMap: { value: o.map }, uMapRep: { value: new THREE.Vector2(...(o.rep || [1, 1])) } }); }
    if (o.floor) defines.FLOOR = '';
    if (o.machined) defines.MACHINED = '';
    return new THREE.ShaderMaterial({ uniforms, defines, vertexShader: LIT_VS, fragmentShader: LIT_FS, side: o.side ?? THREE.FrontSide, transparent: !!o.fade });
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

  // where the brake/grinding shoe bears on the rim: lower left (hero, reveal) or on the top left of the rim (close),
  // so its spark jet is thrown along the top arc, grazing the front face
  const SHOE_TH = mode === 'close' ? (112 * Math.PI) / 180 : null;
  const SHOE = SHOE_TH === null ? null : new THREE.Vector3(Math.cos(SHOE_TH) * RO, RC + Math.sin(SHOE_TH) * RO, 0);
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
    uFillDir: { value: new THREE.Vector3(6, 4, 10).normalize() }, uFillCol: { value: FILLC.clone().multiplyScalar(2.4) },
    uPtPos: { value: SHOE ? SHOE.clone().add(new THREE.Vector3(0.6, 0.5, -0.1)) : new THREE.Vector3(-2.9, 0.75, 0.7) }, uPtCol: { value: new THREE.Color(0, 0, 0) },
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
  const rim = new THREE.Mesh(lathe.geo, lit({ color: 0x8e959d, metal: 1, rough: 0.32, det, blur: U.blur, detAmt: [0.85, 0.9, 1.0] }));
  wheel.add(rim);
  const castMap = new THREE.CanvasTexture(noiseCanvas(256, seed + 5, 5, 0.5, 0.6));
  castMap.colorSpace = THREE.SRGBColorSpace; castMap.wrapS = castMap.wrapT = THREE.RepeatWrapping;
  const spokes = new THREE.Mesh(spokeGeo(), lit({ color: 0x8a9096, metal: 0.65, rough: 0.55, map: castMap, rep: [2, 3], fade: true }));
  wheel.add(spokes);
  // hub: machined lathe profile with a cap; the shaft runs back into the bearing housing
  const hubP = [[0.001, 1.24], [0.3, 1.24], [0.34, 1.2], [0.34, 1.1], [0.55, 1.1], [0.58, 1.07], [0.58, 0.95], [0.76, 0.95], [0.8, 0.91],
    [1.05, 0.91], [1.13, 0.83], [1.13, -0.83], [1.05, -0.91], [0.5, -0.91], [0.44, -0.97], [0.44, -3.2]];
  const hubMat = lit({ color: 0x5f666f, metal: 1, rough: 0.46, machined: true });
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
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAng: { value: 0 }, uB: { value: 0 }, uAlpha: { value: 0 }, uCol: { value: new THREE.Color(0.022, 0.026, 0.032) }, uRim: { value: new THREE.Color(0.16, 0.2, 0.26) } }]),
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
  gl_FragColor = vec4(uCol * (0.8 + 0.4 * r / 4.0) + uRim * 0.25 * (1.0 - cov) * cov * 4.0, pow(cov, 0.7) * uAlpha);
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
  // people: organic clusters (crowds, neighbourhoods) of soft round lights, with a sparse scatter between them;
  // a few brighter "hub" lights at cluster centres. Positions are polar (theta, r on the front face; theta, z on
  // the outer face) so the clusters wrap with the rim.
  const clusters = Array.from({ length: 70 }, () => ({ th: R() * TAU, u: R(), s: 0.012 + 0.05 * Math.pow(R(), 1.5), w: 0.3 + R() }));
  const cw = clusters.reduce((a, c) => a + c.w, 0);
  const pickC = () => { let q = R() * cw; for (const c of clusters) { q -= c.w; if (q <= 0) return c; } return clusters[0]; };
  const gauss = () => (R() + R() + R() - 1.5) * 0.8;
  const lightGeo = streakGeometry(nFront + nOuter + nFeed, (i, P, L, M) => {
    let th, r, z, kind;
    if (i < nFront + nOuter) {
      const C = R() < 0.82 ? pickC() : null;
      th = C ? C.th + gauss() * C.s * 2.2 : R() * TAU;
      const u = clamp(C ? C.u + gauss() * C.s * 6 : R(), 0, 1);
      if (i < nFront) { kind = 0; r = lerp(FRONT.a + 0.03, FRONT.b - 0.01, u); z = recessZ(r); }
      else { kind = 1; r = RO + 0.003; const g = Math.min(4, Math.floor(u * 5)); z = lerp(lands[g] - 0.075, lands[g + 1] + 0.075, (u * 5) % 1); }
      const hub = C && R() < 0.03;
      L[i * 4] = hub ? 0.02 + 0.01 * R() : 0.006 + 0.01 * Math.pow(R(), 3); L[i * 4 + 1] = hub ? 7 : 1.4 + 4 * Math.pow(R(), 2.5); L[i * 4 + 2] = R(); L[i * 4 + 3] = R();
    } else {
      const j = i - nFront - nOuter, s = j % NSP; kind = 2;
      th = (s / NSP) * TAU + (R() - 0.5) * 0.004; r = 4.2; z = 0;
      L[i * 4] = 0.03; L[i * 4 + 1] = 5 + 3 * R(); L[i * 4 + 2] = 0.5; L[i * 4 + 3] = Math.floor(j / NSP) / 10 + R() * 0.04;
      M[i * 2] = 1.6 + 0.5 * R(); M[i * 2 + 1] = 3.4;
    }
    P.set([th, r, z, kind], i * 4);
  });
  const lightMat = streakMaterial();
  const lights = new THREE.Mesh(lightGeo, lightMat); lights.position.set(0, RC, 0); lights.frustumCulled = false; scene.add(lights);
  lights.visible = people > 0 || feed > 0;

  // debris flecks riding the boundary layer of the rim (close mode)
  let fleckMat = null, debrisMat = null;
  if (mode === 'close') {
    const fg = streakGeometry(700, (i, P, L) => {
      P.set([R() * TAU, RO + 0.015 + Math.pow(R(), 2) * 0.3, (R() - 0.5) * 1.5, 1], i * 4);
      L.set([0.002 + 0.004 * R(), 0.5 + 1.5 * R(), 0.3 + 0.7 * R(), R()], i * 4);
    });
    fleckMat = streakMaterial();
    const flecks = new THREE.Mesh(fg, fleckMat); flecks.position.set(0, RC, 0); flecks.frustumCulled = false; scene.add(flecks);
    // grit carried in the air between the face and the lens: it whips past the camera as the rim speeds up
    const dg = streakGeometry(520, (i, P, L) => {
      const th = Math.PI * (0.3 + R() * 0.45);
      P.set([th, 4.0 + R() * 1.1, HW + 0.08 + Math.pow(R(), 0.7) * 1.4, 0], i * 4);
      L.set([0.004 + 0.009 * R(), 1.2 + 3.5 * Math.pow(R(), 2), 0.2 + 0.8 * R(), R()], i * 4);
    });
    debrisMat = streakMaterial();
    const debris = new THREE.Mesh(dg, debrisMat); debris.position.set(0, RC, 0); debris.frustumCulled = false; scene.add(debris);
  }
  const hubGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,180,90,1)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  hubGlow.position.set(0, RC, 1.4); hubGlow.scale.set(2.2, 2.2, 1); scene.add(hubGlow);
  // where the feed arrives: a glowing seam in the groove between the hub steps and a hot inner core in the cap;
  // the machined steel and the bolts around them stay readable
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const seam = new THREE.Mesh(new THREE.RingGeometry(0.585, 0.615, 96), seamMat); seam.position.z = 0.953; wheel.add(seam);
  const seam2 = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.335, 64), seamMat); seam2.position.z = 1.205; wheel.add(seam2);
  const coreMat2 = new THREE.MeshBasicMaterial({ color: 0x000000, map: glowTexture('rgba(255,255,255,1)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.26, 48), coreMat2); core.position.z = 1.243; wheel.add(core);

  // ---- the hall
  const { tA, M: FM } = floorTextures(seed + 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FM, FM, 96, 96), lit({ color: 0x6a6a6a, metal: 0, rough: 0.8, map: tA, floor: true }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 24), hazeBasic(LU, { sky: true })); sky.renderOrder = 3; scene.add(sky);
  const outerFloor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 40, 40), hazeBasic(LU, { color: 0x0a0b0c }));
  outerFloor.rotation.x = -Math.PI / 2; outerFloor.position.y = -0.01; outerFloor.renderOrder = 2; scene.add(outerFloor);
  // all static dark steel of the hall in one mesh: guard rail, grinding shoe, bearing housing, columns,
  // crane runway, overhead crane, roof trusses
  const hall = staticBuilder(), RAIL = 0x6a4c12, DARK = 0x1c1f23, STEEL = 0x15191d;
  const postG = new THREE.CylinderGeometry(0.035, 0.035, 1.05, 10);
  if (mode !== 'close') {            // the guard rail would sit between the lens and the rim in the close shot
    for (let x = -3.4; x <= 3.41; x += 1.13) for (const z of [1.75, -1.75]) hall.add(postG, { pos: [x, 0.525, z], color: RAIL });
    for (const z of [-0.6, 0.6]) for (const x of [-3.4, 3.4]) hall.add(postG, { pos: [x, 0.525, z], color: RAIL });
    const barX = new THREE.CylinderGeometry(0.028, 0.028, 6.8, 8), barZ = new THREE.CylinderGeometry(0.028, 0.028, 3.5, 8);
    for (const y of [0.55, 1.03]) {
      for (const z of [-1.75, 1.75]) hall.add(barX, { pos: [0, y, z], rot: [0, 0, Math.PI / 2], color: RAIL });
      for (const x of [-3.4, 3.4]) hall.add(barZ, { pos: [x, y, 0], rot: [Math.PI / 2, 0, 0], color: RAIL });
    }
  }
  hall.add(new THREE.BoxGeometry(0.9, 0.55, 1.4, 2, 2, 3), { pos: [-2.85, 0.3, 0], rot: [0, 0, 0.5], color: DARK, spec: 0.35 });
  let shoeHot = null, shoeFlare = null;
  if (SHOE) {
    // a heavy curved brake shoe bearing down on the top of the rim (bevelled arc block, backing plate, ribs),
    // on twin lever arms hung from a frame above; its lining glows where it rubs
    const sector = (r0, r1, a0, a1, z0, depth, bevel) => {
      const sh = new THREE.Shape(); sh.absarc(0, 0, r1, a0, a1, false); sh.absarc(0, 0, r0, a1, a0, true); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 18 });
      return g.translate(0, RC, z0);
    };
    const s0 = SHOE_TH - 0.11, s1 = SHOE_TH + 0.11;
    hall.add(sector(RO + 0.04, RO + 0.3, s0, s1, -0.66, 1.32, 0.025), { color: 0x1a1c1f, spec: 0.55 });
    hall.add(sector(RO + 0.3, RO + 0.4, s0 - 0.03, s1 + 0.03, -0.75, 1.5, 0.015), { color: 0x111214, spec: 0.4 });
    for (const da of [-0.07, 0, 0.07]) hall.add(sector(RO + 0.4, RO + 0.62, SHOE_TH + da - 0.008, SHOE_TH + da + 0.008, -0.6, 1.2, 0), { color: 0x16181b, spec: 0.5 });
    const nutG = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6); nutG.rotateX(Math.PI / 2);
    for (const da of [-0.085, 0.085]) for (const z of [-0.45, 0, 0.45]) { const a = SHOE_TH + da, rr = RO + 0.35; hall.add(nutG, { pos: [Math.cos(a) * rr, RC + Math.sin(a) * rr, z + (z === 0 ? 0.76 : 0.76)], color: 0x2c2f33, spec: 1 }); }
    const top = new THREE.Vector3(Math.cos(SHOE_TH) * (RO + 0.6), RC + Math.sin(SHOE_TH) * (RO + 0.6), 0), piv = new THREE.Vector3(SHOE.x - 1.6, SHOE.y + 3.6, 0);
    const arm = piv.clone().sub(top), L = arm.length(), ang = Math.atan2(arm.y, arm.x) - Math.PI / 2, mid = top.clone().add(piv).multiplyScalar(0.5);
    for (const z of [-0.55, 0.55]) {
      hall.add(new THREE.BoxGeometry(0.06, L, 0.26, 1, 4, 1), { pos: [mid.x, mid.y, z], rot: [0, 0, ang], color: 0x15171a, spec: 0.5 });
      hall.add(new THREE.BoxGeometry(0.2, L, 0.04, 1, 4, 1), { pos: [mid.x, mid.y, z + 0.13], rot: [0, 0, ang], color: 0x1b1d21, spec: 0.6 });
      hall.add(new THREE.BoxGeometry(0.2, L, 0.04, 1, 4, 1), { pos: [mid.x, mid.y, z - 0.13], rot: [0, 0, ang], color: 0x1b1d21, spec: 0.6 });
    }
    hall.add(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 14), { pos: [top.x, top.y, 0], rot: [Math.PI / 2, 0, 0], color: 0x2a2d31, spec: 0.9 });
    hall.add(new THREE.CylinderGeometry(0.11, 0.11, 1.5, 14), { pos: [piv.x, piv.y, 0], rot: [Math.PI / 2, 0, 0], color: 0x2a2d31, spec: 0.9 });
    shoeHot = new THREE.Mesh(sector(RO + 0.003, RO + 0.014, s0 + 0.01, s1 - 0.01, -0.62, 1.24, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.32, 0.06), fog: false }));
    scene.add(shoeHot);
    // white-hot contact where the jet leaves the rim
    shoeFlare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,200,140,1)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    shoeFlare.position.set(SHOE.x + 0.2, SHOE.y + 0.05, 0.62); shoeFlare.scale.set(0.9, 0.5, 1); scene.add(shoeFlare);
  }
  // bearing pedestal: bevelled tapered column with gussets and front ribs on a bolted base plate, carrying a
  // split pillow block (cap, cap bolts, end cover)
  {
    const PD = 0x17191c;
    const sh = new THREE.Shape(); sh.moveTo(-1.45, 0); sh.lineTo(1.45, 0); sh.lineTo(1.05, RC - 1.0); sh.lineTo(-1.05, RC - 1.0); sh.closePath();
    const col = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
    hall.add(col, { pos: [0, 0.18, -2.65], color: PD, spec: 0.45 });
    hall.add(new THREE.BoxGeometry(3.6, 0.18, 2.2, 6, 1, 4), { pos: [0, 0.09, -2.1], color: 0x141618, spec: 0.3 });
    const nut = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6);
    for (const x of [-1.6, 1.6]) for (const z of [-3.05, -1.15]) hall.add(nut, { pos: [x, 0.22, z], color: 0x2a2d31, spec: 0.8 });
    hall.add(new THREE.BoxGeometry(3.2, 0.32, 1.7, 4, 1, 2), { pos: [0, 0.34, -2.1], color: 0x16181b, spec: 0.5 });   // stepped plinth
    for (const x of [-0.55, 0, 0.55]) hall.add(new THREE.BoxGeometry(0.09, RC - 1.5, 0.08, 1, 6, 1), { pos: [x, 0.2 + (RC - 1.5) / 2, -1.48], color: 0x1d2024, spec: 0.6 });
    hall.add(new THREE.CylinderGeometry(1.12, 1.12, 1.3, 48, 2), { pos: [0, RC, -2.1], rot: [Math.PI / 2, 0, 0], color: 0x15171a, spec: 0.35 });
    hall.add(new THREE.CylinderGeometry(1.2, 1.2, 1.36, 48, 1, false, -Math.PI / 2, Math.PI), { pos: [0, RC + 0.02, -2.1], rot: [Math.PI / 2, 0, 0], color: 0x1b1e22, spec: 0.5 });
    hall.add(new THREE.BoxGeometry(2.7, 0.14, 1.36), { pos: [0, RC, -2.1], color: 0x121416, spec: 0.4 });
    for (const x of [-1.25, 1.25]) for (const z of [-2.55, -1.65]) hall.add(nut, { pos: [x, RC + 0.11, z], color: 0x2c2f33, spec: 0.9 });
    hall.add(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 40), { pos: [0, RC, -2.8], rot: [Math.PI / 2, 0, 0], color: 0x1e2125, spec: 0.7 });
  }
  const webG = new THREE.BoxGeometry(0.7, 26, 0.06, 1, 10, 1), flangeG = new THREE.BoxGeometry(0.06, 26, 0.55, 1, 10, 1);
  for (let z = -32; z <= 16; z += 6.5) for (const x of [-14, 14]) {
    hall.add(webG, { pos: [x, 13, z], color: STEEL }); hall.add(flangeG, { pos: [x - 0.33, 13, z], color: STEEL }); hall.add(flangeG, { pos: [x + 0.33, 13, z], color: STEEL });
  }
  // I-beam helper (web + two flanges) along x, y or z
  const ibeam = (len, h, w, pos, axis = 'x', color = STEEL) => {
    const L = (a, b, c) => (axis === 'x' ? [a, b, c] : axis === 'z' ? [c, b, a] : [b, a, c]);
    const tf = h * 0.09, tw = w * 0.14, seg = Math.max(1, Math.round(len / 3));
    const web = new THREE.BoxGeometry(...L(len, h - 2 * tf, tw), ...L(seg, 1, 1)), fl = new THREE.BoxGeometry(...L(len, tf, w), ...L(seg, 1, 1));
    hall.add(web, { pos, color }); hall.add(fl, { pos: [pos[0], pos[1] + (h - tf) / 2, pos[2]], color, spec: 0.4 }); hall.add(fl, { pos: [pos[0], pos[1] - (h - tf) / 2, pos[2]], color, spec: 0.4 });
  };
  for (const x of [-13.3, 13.3]) ibeam(52, 1.1, 0.6, [x, 17, -8], 'z');
  const CR = [0, 17.6, -9.5];
  for (const dz of [-0.9, 0.9]) ibeam(27, 1.4, 0.55, [CR[0], CR[1], CR[2] + dz], 'x');
  for (const x of [-13.3, 13.3]) hall.add(new THREE.BoxGeometry(0.9, 0.8, 2.6, 2, 1, 3), { pos: [x, CR[1] + 0.2, CR[2]], color: 0x1a1d21, spec: 0.4 });
  // trolley with rope drum, ropes and a hook block
  hall.add(new THREE.BoxGeometry(2.6, 0.5, 2.4, 3, 1, 3), { pos: [CR[0] - 3.5, CR[1] + 0.95, CR[2]], color: 0x1b1e22, spec: 0.4 });
  hall.add(new THREE.CylinderGeometry(0.42, 0.42, 1.8, 24), { pos: [CR[0] - 3.5, CR[1] + 1.5, CR[2]], rot: [Math.PI / 2, 0, 0], color: 0x202328, spec: 0.7 });
  for (const dx of [-0.25, 0.25]) hall.add(new THREE.CylinderGeometry(0.02, 0.02, 8, 5), { pos: [CR[0] - 3.5 + dx, CR[1] - 3.6, CR[2]], color: STEEL });
  hall.add(new THREE.BoxGeometry(0.8, 0.9, 0.42, 2, 2, 1), { pos: [CR[0] - 3.5, CR[1] - 7.9, CR[2]], color: 0x5a4210, spec: 0.5 });
  hall.add(new THREE.TorusGeometry(0.22, 0.06, 8, 20, Math.PI * 1.4), { pos: [CR[0] - 3.5, CR[1] - 8.6, CR[2]], rot: [0, 0, Math.PI * 0.8], color: 0x2a2c30, spec: 0.8 });
  // roof trusses: chords with diagonal bracing
  const trussG = new THREE.BoxGeometry(28, 0.35, 0.3, 12, 1, 1);
  const brace = new THREE.BoxGeometry(0.16, 3.3, 0.16);
  for (let i = 0; i < 8; i++) {
    const z = -32 + i * 6.5;
    for (const y of [24, 21.5]) hall.add(trussG, { pos: [0, y, z], color: STEEL });
    for (let j = -6; j <= 6; j++) hall.add(brace, { pos: [j * 2.1, 22.75, z], rot: [0, 0, (j % 2 ? 1 : -1) * 0.7], color: STEEL });
  }
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
  const nSpark = mode === 'close' ? 900 : 520;
  const sparkG = streakGeometry(nSpark, (i, P, L, M, X) => {
    if (SHOE) {   // thrown off the top of the rim along its motion (to the right), fanning up and towards the lens
      const a = SHOE_TH - Math.PI / 2 - 0.05 + (R() - 0.5) * 0.4, sp = 7 + R() * 10;
      X.aO.set([SHOE.x + 0.15 + (R() - 0.5) * 0.1, SHOE.y + 0.02 + R() * 0.05, (R() - 0.6) * 1.0, R()], i * 4);
      X.aV.set([Math.cos(a) * sp, Math.sin(a) * sp, (R() - 0.55) * 1.0, R()], i * 4);
    } else {
      const a = 2.5 + (R() - 0.5) * 0.4, sp = 6 + R() * 8;
      X.aO.set([-2.6 + (R() - 0.5) * 0.15, 0.5 + R() * 0.08, (R() - 0.5) * 0.7, R()], i * 4);
      X.aV.set([Math.cos(a) * sp, Math.sin(a) * sp, (R() - 0.5) * 2.4 + 0.8, R()], i * 4);
    }
    X.aT.set([0.35 + R() * 0.8, R(), 0.0035 + R() * 0.005, R()], i * 4);   // life, phase, size, gate
  }, { aO: 4, aV: 4, aT: 4 });
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uRate: { value: 0 }, uPix: { value: 0.001 }, uSh: { value: SH * 2.4 }, uVS: { value: 1 }, uNear: { value: mode === 'close' ? 0.18 : 2.4 }, uGain: { value: mode === 'close' ? 6 : 14 } },
    vertexShader: `attribute vec2 corner; attribute vec4 aO, aV, aT; uniform float uT, uRate, uPix, uSh, uVS, uNear, uGain; varying vec2 vQ; varying float vLen, vW, vI, vK; varying vec3 vCol;
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
  vI = alive * (aT.z / w) * (aT.z / w) * (0.5 + 2.0 * heat * heat) * uGain * smoothstep(uNear, uNear * 1.8, -v1.z) * smoothstep(0.2, 2.5, -v1.z) / (1.0 + L * 1.5);
  vCol = mix(vec3(1.0, 0.3, 0.07), vec3(1.0, 0.86, 0.58), heat * heat);
  if (alive < 0.5 || -v1.z < uNear || -v0.z < uNear * 0.8) p = vec3(0.0, 0.0, 10.0);
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`,
    fragmentShader: STREAK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const sparks = new THREE.Mesh(sparkG, sparkMat); sparks.frustumCulled = false; scene.add(sparks);

  // ---- camera paths per mode (k-driven, so they fit any duration)
  const V3 = (a) => new THREE.Vector3(...a);
  const tgt = new THREE.Vector3();
  const pathOf = {
    hero: { p0: [6.0, 0.4, 12.8], p1: [4.6, 0.55, 9.8], t0: [-8.2, 2.9, 0], t1: [-7.4, 3.6, 0], f0: 34, f1: 36, e: (k) => k * 0.8 + 0.2 * ease.out(k) },
    close: { p0: [0.35, 7.55, 4.3], p1: [-0.25, 8.0, 2.05], t0: [0.0, 8.55, 0.6], t1: [-0.1, 8.5, 0.6], f0: 42, f1: 50, e: (k) => 0.6 * k + 0.4 * k * k },
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
      // close shot: a short, tightening shutter keeps bolts, lettering and paint as discrete streaks at any speed
      // (the smear grows from ~80 to ~170 atlas texels while the rim speed more than triples)
      const shut = mode === 'close' ? lerp(80, 170, clamp((rps - 0.6) / 1.4)) * 48 / (Math.max(rps, 0.05) * REP * det.W) : 1;
      U.blur.value = ((om * SH) / TAU) * REP * Math.min(1, shut);
      ghostMat.uniforms.uAng.value = ang; ghostMat.uniforms.uB.value = om * SH;
      // spokes sharp at low speed; the analytic coverage disc crossfades in over a speed range (no pop)
      const bl = Math.abs(om * SH);
      const gA = smooth((bl - 0.07) / 0.1);
      ghostMat.uniforms.uAlpha.value = gA;
      ghost.visible = gA > 0.002;
      spokes.material.uniforms.uOpacity.value = 1 - gA;
      spokes.visible = gA < 0.998;

      // camera
      const e = path.e(c.k);
      camera.position.lerpVectors(P0, P1, e);
      tgt.lerpVectors(T0, T1, e);
      let roll = 0;
      if (mode === 'close') {
        // shake and roll escalate with the speed (squared), plus a low rumble; the end is the most violent
        const q = clamp((rps - 0.4) / 1.6), sh = 0.003 + 0.018 * q * q;
        camera.position.x += (noise(lt * 13 + 3) + 0.5 * noise(lt * 31 + 1)) * sh; camera.position.y += (noise(lt * 15 + 7) + 0.5 * noise(lt * 29 + 4)) * sh;
        camera.position.z += noise(lt * 2.1 + 1) * 0.02 * q;
        tgt.x += noise(lt * 9 + 11) * sh * 2.5; tgt.y += noise(lt * 11 + 5) * sh * 2.5;
        roll = -0.05 - 0.07 * smooth(c.k) + noise(lt * 7 + 2) * 0.02 * q;
      } else {
        camera.position.x += noise(lt * 0.6 + 2) * 0.05; camera.position.y += noise(lt * 0.5 + 5) * 0.03;
      }
      camera.fov = lerp(path.f0, path.f1, e); camera.lookAt(tgt);
      if (mode === 'close') camera.rotateZ(roll);
      camera.updateProjectionMatrix();
      const pix = (2 * Math.tan((camera.fov * Math.PI) / 360)) / 1080;

      // people lights + feed into the hub
      lightMat.uniforms.uAng.value = ang; lightMat.uniforms.uOm.value = om; lightMat.uniforms.uTime.value = lt; lightMat.uniforms.uPix.value = pix;
      lightMat.uniforms.uShutter.value = SH * 0.25 * smooth((rps - 0.9) / 0.8);    // round points at reveal speeds, streaks only when fast
      lightMat.uniforms.uOn.value = people * (mode === 'reveal' ? lerp(1, 2.4, smooth(c.k * 1.2)) : 1);
      const feedNow = feed * (mode === 'reveal' ? smooth((c.k - 0.15) / 0.45) : 1);
      lightMat.uniforms.uFeed.value = feedNow;
      const beat = 0.8 + 0.2 * Math.sin(lt * 5);
      seamMat.color.setRGB(1, 0.55, 0.2).multiplyScalar(feedNow * 2.2 * beat); coreMat2.color.setRGB(1, 0.62, 0.3).multiplyScalar(feedNow * 1.6 * beat);
      seam.visible = seam2.visible = core.visible = feedNow > 0.001;
      hubGlow.material.opacity = feedNow * 0.22; hubGlow.visible = feedNow > 0.001;
      if (fleckMat) { const u = fleckMat.uniforms; u.uAng.value = ang; u.uOm.value = om; u.uTime.value = lt; u.uPix.value = pix; u.uOn.value = 0.5 + 0.5 * clamp(rps); }
      if (debrisMat) { const u = debrisMat.uniforms; u.uAng.value = ang; u.uOm.value = om; u.uTime.value = lt; u.uPix.value = pix; u.uOn.value = 0.15 + 1.1 * clamp((rps - 0.5) / 1.5); }

      // the hall dims a little while the people-lights carry the reveal
      const dim = mode === 'reveal' ? lerp(1, 0.5, smooth(c.k * 1.4)) : 1;
      LU.uKeyCol.value.copy(KEY).multiplyScalar(3 * dim); LU.uFillCol.value.copy(FILLC).multiplyScalar(2.4 * dim); LU.uEnvI.value = dim * (mode === 'close' ? 0.5 : 1);
      const wdim = mode === 'reveal' ? lerp(1, 0.28, smooth(c.k * 1.3)) : mode === 'close' ? 0.07 : 1;
      winMat.uniforms.uCol.value.setScalar(1.5 * wdim); winMat2.uniforms.uCol.value.setScalar(1.0 * wdim);
      for (const s of shafts) s.material.uniforms.uT.value = lt;

      // sparks follow the rim speed
      const rate = (mode === 'close' ? clamp(0.3 + 0.7 * (rps - 0.6) / 1.4, 0.3, 1) : clamp(Math.pow(rps / 0.6, 1.3) * 0.7, 0, 1)) * sparkMul;
      sparkMat.uniforms.uT.value = lt; sparkMat.uniforms.uRate.value = rate; sparkMat.uniforms.uPix.value = pix;
      sparkMat.uniforms.uVS.value = clamp(0.55 + rps * 0.6, 0.6, 1.9);       // the jet speeds up with the rim
      const flick = 0.75 + 0.25 * noise(lt * 23) + 0.15 * noise(lt * 61);
      LU.uPtCol.value.copy(SPK).multiplyScalar((mode === 'close' ? 9 : 28) * clamp(rate) * flick);
      if (shoeHot) { shoeHot.material.color.setRGB(1.0, 0.3, 0.05).multiplyScalar((0.8 + 1.4 * clamp(rate)) * flick); shoeFlare.material.opacity = (0.25 + 0.5 * clamp(rate)) * flick; }

      dustMat.uniforms.uT.value = lt; dustMat.uniforms.uScale.value = 1080 / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
  };
});
