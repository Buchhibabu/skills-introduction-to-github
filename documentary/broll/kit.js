// B-roll kit: cinematic 3D shots rendered with three.js through one shared WebGL renderer.
//
// A shot module calls register(name, factory). factory(opts) builds a three.js scene once and returns
//   { scene, camera, update(lt, c), bloom?: { strength, radius, threshold }, exposure?, background? }
// where update(lt, c) must set EVERY animated property from time alone (lt = seconds since the shot
// appeared, c = { k: 0..1 progress over the shot, dur, t }), never accumulate state: the renderer seeks
// frames in any order. No Math.random / Date / performance.now: use rng(seed).
//
// In the film a shot is a beat: { beat: 'shot', shot: 'server_hall', ...opts } (see beats.js). Each shot
// draws into its own 2D canvas inside its scene root, so the film's grade, grain and overlays apply on top.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };
export const W = 1920, H = 1080;

let renderer, composer, renderPass, bloomPass;
function ensure() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  bloomPass = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.8, 0.5, 0.2);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

// ---------- maths ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const ease = {
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
};
/** Deterministic PRNG (mulberry32): rng(seed)() -> [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Smooth 1D value noise in [-1, 1]. */
export function noise(x) {
  const i = Math.floor(x), f = x - i, h = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  return lerp(h(i), h(i + 1), f * f * (3 - 2 * f)) * 2 - 1;
}
/** Piecewise interpolation through keys [[time, value], ...]; value may be a number or an array. Eased per segment. */
export function keys(t, ks, fn = ease.inOut) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [a, va] = ks[i - 1], [b, vb] = ks[i];
      const k = fn((t - a) / (b - a || 1));
      return Array.isArray(va) ? va.map((v, j) => lerp(v, vb[j], k)) : lerp(va, vb, k);
    }
  }
  return ks[ks.length - 1][1];
}

// ---------- textures ----------
/** Soft round glow sprite (for points, lights, lens dots). */
export function glowTexture(inner = 'rgba(255,255,255,1)', size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, inner); r.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)')); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Text drawn to a canvas texture (fonts loaded by the page: Oswald, Inter, IBM Plex Mono, Special Elite, Playfair Display). */
export function textTexture(text, { font = '600 64px Oswald', color = '#ece6da', bg = null, pad = 16, align = 'center' } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = font;
  const m = g.measureText(text), size = parseInt(font.match(/(\d+)px/)[1], 10);
  c.width = Math.ceil(m.width + pad * 2); c.height = Math.ceil(size * 1.35 + pad * 2);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.font = font; g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = align;
  g.fillText(text, align === 'center' ? c.width / 2 : pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, aspect: c.width / c.height };
}

// ---------- registry ----------
window.SHOTS = window.SHOTS || {};
window.SHOT_FACTORIES = window.SHOT_FACTORIES || {};

/** Render one frame of a built shot into a 2D context. */
function draw(shot, ctx2d) {
  ensure();
  renderer.toneMappingExposure = shot.exposure ?? 1;
  renderPass.scene = shot.scene;
  renderPass.camera = shot.camera;
  const b = shot.bloom || {};
  bloomPass.enabled = (b.strength ?? 0.8) > 0;
  bloomPass.strength = b.strength ?? 0.8;
  bloomPass.radius = b.radius ?? 0.5;
  bloomPass.threshold = b.threshold ?? 0.2;
  composer.render();
  ctx2d.drawImage(renderer.domElement, 0, 0, W, H);
}

export function register(name, factory) {
  window.SHOT_FACTORIES[name] = factory;
  window.SHOTS[name] = (root, { t0, t1 }, opts = {}) => {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px';
    root.appendChild(canvas);
    const ctx2d = canvas.getContext('2d');
    const shot = factory({ ...opts, t0, t1 });
    shot.camera.aspect = W / H;
    shot.camera.updateProjectionMatrix?.();
    const dur = Math.max(0.001, t1 - t0);
    return (t) => {
      shot.update(t - t0, { k: clamp((t - t0) / dur), dur, t });
      draw(shot, ctx2d);
    };
  };
}
