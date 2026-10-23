// Deterministic animation engine: every frame is a pure function of t (seconds),
// so the renderer can seek to any frame in any order.
(() => {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = {
    linear: (k) => k,
    in: (k) => k * k * k,
    out: (k) => 1 - Math.pow(1 - k, 3),
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    outBack: (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2),
    outExpo: (k) => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  };
  // 0 -> 1 as t goes from a to b
  const prog = (t, a, b, e = ease.inOut) => e(clamp((t - a) / Math.max(1e-6, b - a)));
  // opacity envelope: in over [a, a+fi], out over [b-fo, b]
  const env = (t, a, b, fi = 0.6, fo = 0.6) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));
  // piecewise keyframes: [[t, v], ...]
  const keys = (t, ks, e = ease.inOut) => {
    if (t <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      if (t <= ks[i][0]) return lerp(ks[i - 1][1], ks[i][1], e((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])));
    }
    return ks[ks.length - 1][1];
  };
  // smooth deterministic noise in [-1, 1]
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };

  // blend two #rrggbb colours
  const mix = (a, b, k) => {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return '#' + pa.map((v, i) => Math.round(lerp(v, pb[i], clamp(k))).toString(16).padStart(2, '0')).join('');
  };

  const el = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  const css = (e, styles) => { for (const k in styles) e.style[k] = styles[k]; return e; };

  const scenes = [];
  const globals = [];
  const sfx = [];
  const stage = document.getElementById('scenes');

  // A scene is visible on [start, end]; build(root) returns update(t).
  function scene(start, end, build, { push = 0.035 } = {}) {
    const root = el('div', 'scene', stage);
    const update = build(root) || (() => {});
    scenes.push({ start, end, root, update, push });
  }
  const every = (fn) => globals.push(fn);
  const cue = (t, type, opts = {}) => sfx.push({ t: +t.toFixed(3), type, ...opts });

  // ---------- reusable pieces ----------

  // Typewriter: reveals text char by char from t0 at cps chars/second, with a block cursor.
  function typewriter(parent, text, { t0, cps = 16, cls = 'type', style = {}, cursorUntil = Infinity, sound = true }) {
    const box = css(el('div', cls, parent), style);
    const shown = el('span', '', box);
    const cur = el('span', '', box, '▌');
    cur.style.color = 'var(--amber)';
    if (sound) {
      for (let i = 0; i < text.length; i++) if (text[i] !== ' ') cue(t0 + i / cps, 'key');
    }
    return (t) => {
      const n = Math.floor(clamp((t - t0) * cps, 0, text.length));
      shown.textContent = text.slice(0, n);
      const blinking = n >= text.length || t < t0;
      cur.style.opacity = t > cursorUntil ? 0 : blinking ? (Math.floor(t * 2.2) % 2 ? 0 : 1) : 1;
    };
  }

  // Words fade/rise in one at a time, from t0, `gap` seconds apart. html may contain inline markup.
  function words(parent, html, { t0, gap = 0.12, dur = 0.5, rise = 18, cls = '', style = {} }) {
    const box = css(el('div', cls, parent, html), style);
    const spans = [];
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((w) => {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
            const sp = document.createElement('span');
            sp.textContent = w;
            sp.style.display = 'inline-block';
            spans.push(sp);
            frag.appendChild(sp);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(box);
    return (t) => spans.forEach((sp, i) => {
      const k = prog(t, t0 + i * gap, t0 + i * gap + dur, ease.out);
      sp.style.opacity = k;
      sp.style.transform = `translateY(${(1 - k) * rise}px)`;
      sp.style.filter = `blur(${(1 - k) * 6}px)`;
    });
  }

  // Count from a to b over [t0, t1]; fmt formats the number.
  function counter(node, { t0, t1, from = 0, to, fmt = (v) => Math.round(v).toLocaleString('en-US') }) {
    return (t) => { node.textContent = fmt(lerp(from, to, prog(t, t0, t1, ease.outExpo))); };
  }

  // Source lower third.
  function source(parent, text, { t0, t1, label = 'SOURCE' }) {
    const s = el('div', 'source', parent, `<b>${label}</b>${text}`);
    return (t) => {
      const k = env(t, t0, t1, 0.5, 0.4);
      s.style.opacity = k;
      s.style.transform = `translateX(${(1 - k) * -20}px)`;
    };
  }

  // Seeded RNG for layouts.
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // ---------- ambience ----------
  const fogRoot = document.getElementById('fog');
  const blobs = [
    { x: 0.25, y: 0.35, r: 900, sp: 0.03 },
    { x: 0.75, y: 0.6, r: 1000, sp: 0.024 },
    { x: 0.5, y: 0.9, r: 800, sp: 0.037 },
  ].map((b, i) => ({ ...b, i, node: el('div', 'blob', fogRoot) }));
  let palette = () => ['#1c2633', '#2a1f1c', '#18242a'];
  let bgColor = () => '#0e1116';

  const grain = document.getElementById('grain');
  const gctx = grain.getContext('2d');
  const GW = grain.width, GH = grain.height;
  const tiles = [];
  {
    const r = rng(1234);
    for (let k = 0; k < 8; k++) {
      const img = gctx.createImageData(GW, GH);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (r() + r() + r() - 1.5) * 150;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      tiles.push(img);
    }
  }
  const flicker = document.getElementById('flicker');
  const blackout = document.getElementById('blackout');
  const scanline = document.getElementById('scanline');
  let blackoutKeys = [[0, 0]];
  let grainAmount = () => 0.16;
  let vignetteAmount = () => 1;
  let grade = () => '';
  let weave = () => 0;
  const vignette = document.getElementById('vignette');

  function ambience(t) {
    const cols = palette(t);
    document.getElementById('bg').style.background = bgColor(t);
    blobs.forEach((b) => {
      const x = (b.x + 0.08 * noise(t * b.sp + b.i * 10)) * 1920;
      const y = (b.y + 0.06 * noise(t * b.sp + b.i * 20 + 5)) * 1080;
      css(b.node, {
        width: b.r + 'px', height: b.r + 'px',
        left: x - b.r / 2 + 'px', top: y - b.r / 2 + 'px',
        background: `radial-gradient(circle, ${cols[b.i]} 0%, transparent 68%)`,
      });
    });
    gctx.putImageData(tiles[Math.floor(t * 12) % tiles.length], 0, 0);
    grain.style.opacity = grainAmount(t);
    vignette.style.opacity = vignetteAmount(t);
    const layer = document.getElementById('scenes');
    layer.style.filter = grade(t);
    const wv = weave(t);
    layer.style.translate = wv ? `${noise(t * 7) * wv}px ${noise(t * 9 + 3) * wv * 1.6}px` : '0px 0px';
    flicker.style.opacity = 0.035 * (0.5 + 0.5 * noise(t * 9)) + (noise(t * 31) > 0.93 ? 0.04 : 0);
    blackout.style.opacity = keys(t, blackoutKeys, ease.linear);
    scanline.style.top = ((t * 140) % 1200) - 60 + 'px';
  }


  // Brief digital glitch on the whole picture at the given times.
  const glitches = [];
  const bands = Array.from({ length: 5 }, () => {
    const b = document.createElement('div');
    b.style.cssText = 'position:absolute;left:0;right:0;background:rgba(236,230,218,.08);mix-blend-mode:difference;display:none';
    document.getElementById('fx').appendChild(b);
    return b;
  });
  function glitch(t0, dur = 0.28) { glitches.push([t0, dur]); sfx.push({ t: +t0.toFixed(3), type: 'glitch', dur }); }
  function applyGlitch(t) {
    const g = glitches.find(([a, d]) => t >= a && t < a + d);
    const layer = document.getElementById('scenes');
    if (!g) { layer.style.transform = ''; bands.forEach((b) => (b.style.display = 'none')); return; }
    const f = Math.floor(t * 24);
    layer.style.transform = `translateX(${(hash(f) - 0.5) * 40}px)`;
    layer.style.filter = `${grade(t)} contrast(1.5) saturate(${hash(f + 3) > 0.5 ? 0 : 1.8}) hue-rotate(${(hash(f + 7) - 0.5) * 90}deg)`;
    bands.forEach((b, i) => {
      b.style.display = 'block';
      b.style.top = hash(f * 7 + i) * 1080 + 'px';
      b.style.height = 6 + hash(f * 3 + i) * 60 + 'px';
      b.style.transform = `translateX(${(hash(f + i * 11) - 0.5) * 200}px)`;
    });
  }


  // Film burn / light leak: warm light washes across the frame (screen blend), optionally flaring to white.
  const burns = [];
  const burnEl = document.createElement('div');
  burnEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:0';
  document.getElementById('fx').appendChild(burnEl);
  function burn(t0, dur = 1.2, { flare = 0.85, hue = 28, from = 'left' } = {}) { burns.push({ t0, dur, flare, hue, from }); }
  function applyBurn(t) {
    const b = burns.find((x) => t >= x.t0 && t < x.t0 + x.dur);
    if (!b) { burnEl.style.opacity = 0; return; }
    const k = (t - b.t0) / b.dur;
    const env = Math.sin(Math.PI * k);
    const x = b.from === 'left' ? lerp(-20, 120, k) : lerp(120, -20, k);
    burnEl.style.opacity = Math.min(1, env * 1.3);
    burnEl.style.background = `radial-gradient(ellipse 70% 120% at ${x}% ${50 + 20 * noise(t * 3)}%, hsla(${b.hue},100%,62%,${0.9 * env}) 0%, hsla(${b.hue + 12},100%,50%,${0.55 * env}) 35%, transparent 70%),` +
      `radial-gradient(circle at ${100 - x}% 30%, hsla(${b.hue - 10},100%,70%,${0.35 * env}) 0%, transparent 45%),` +
      `rgba(255,248,235,${Math.max(0, env - (1 - b.flare)) * 0.9})`;
  }

  async function seek(t) {
    ambience(t);
    for (const s of scenes) {
      const on = t >= s.start && t <= s.end;
      s.root.style.display = on ? 'block' : 'none';
      if (!on) continue;
      s.update(t);
      const k = prog(t, s.start, s.end, ease.linear);
      if (s.push) s.root.style.transform = `scale(${1 + s.push * k})`;
    }
    globals.forEach((g) => g(t));
    applyGlitch(t);
    applyBurn(t);
  }

  window.E = {
    clamp, lerp, mix, ease, prog, env, keys, noise, hash, el, css, scene, every, cue, typewriter, words, counter, source, rng,
    sfx, setPalette: (fn) => (palette = fn), setBg: (fn) => (bgColor = fn), setGrain: (fn) => (grainAmount = fn), setVignette: (fn) => (vignetteAmount = fn), setGrade: (fn) => (grade = fn), setWeave: (fn) => (weave = fn),
    setBlackout: (ks) => (blackoutKeys = ks), glitch, burn, seek,
  };
})();
