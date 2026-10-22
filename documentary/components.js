// Reusable on-screen pieces. Each builder appends DOM to `root` and returns update(t).
(() => {
  const { el, css, env, prog, keys, ease, clamp, lerp, noise, cue, rng } = E;

  // "EXHIBIT A" style chapter card.
  function chapterCard(root, { label, name, t0, t1 }) {
    const box = el('div', 'center chapter', root);
    const l = el('div', 'label', box, label);
    const n = el('div', 'name', box, name);
    const r = el('div', 'rule', box);
    cue(t0, 'whoosh', { dur: 1.2 });
    cue(t0 + 0.35, 'stamp', { gain: 0.6 });
    return (t) => {
      const a = env(t, t0, t1, 0.5, 0.5);
      box.style.opacity = a;
      l.style.letterSpacing = `${lerp(0.9, 0.5, prog(t, t0, t0 + 1.5, ease.out))}em`;
      n.style.transform = `scale(${lerp(1.12, 1, prog(t, t0, t0 + 0.8, ease.out))})`;
      n.style.filter = `blur(${(1 - prog(t, t0, t0 + 0.6, ease.out)) * 10}px)`;
      r.style.width = `${prog(t, t0 + 0.4, t0 + 1.4, ease.inOut) * 520}px`;
    };
  }

  // Paper document with optional highlight sweep and redaction bars.
  // html may contain <span class="hl"><span class="mark"></span>...</span> and <span class="redact"><span class="bar"></span>...</span>
  function docCard(root, { head, date, html, foot, t0, t1, x = 260, y, w = 1400, rot = -1.1, hl = [], redact = [], quoteSize, stamp }) {
    const d = el('div', 'doc', root);
    css(d, { left: x + 'px', top: (y ?? 200) + 'px', width: w + 'px' });
    let placed = y !== undefined;
    d.innerHTML = `<div class="head"><span>${head}</span><span>${date || ''}</span></div><div class="quote">${html}</div>${foot ? `<div class="foot">${foot}</div>` : ''}`;
    if (quoteSize) d.querySelector('.quote').style.fontSize = quoteSize + 'px';
    const marks = [...d.querySelectorAll('.hl')];
    d.querySelectorAll('.mark').forEach((m) => m.remove());
    const bars = [...d.querySelectorAll('.bar')];
    let st = null;
    if (stamp) {
      st = el('div', 'stamp', d, stamp.text);
      css(st, { right: (stamp.right ?? 60) + 'px', bottom: (stamp.bottom ?? -34) + 'px', fontSize: (stamp.size ?? 56) + 'px', whiteSpace: 'nowrap', background: 'rgba(239,231,214,.92)', transform: `rotate(${stamp.rot ?? -8}deg)` });
      cue(stamp.t, 'stamp');
    }
    cue(t0, 'shutter');
    hl.forEach((h) => cue(h[0], 'tick', { gain: 0.5 }));
    redact.forEach((r) => cue(r, 'glitch', { dur: 0.25, gain: 0.7 }));
    return (t) => {
      if (!placed) { d.style.top = Math.max(120, (1080 - d.offsetHeight) / 2 - 30) + 'px'; placed = true; }
      const a = env(t, t0, t1, 0.45, 0.5);
      const k = prog(t, t0, t0 + 0.7, ease.out);
      d.style.opacity = a;
      d.style.transform = `translateY(${(1 - k) * 60}px) rotate(${rot}deg) scale(${lerp(0.97, 1.0, k) + 0.025 * prog(t, t0, t1, ease.linear)})`;
      marks.forEach((m, i) => { const [a0, a1] = hl[i] || [t0 + 1, t0 + 2]; m.style.backgroundSize = `${prog(t, a0, a1, ease.linear) * 100}% 78%`; });
      bars.forEach((b, i) => { const r0 = redact[i] ?? t0 + 1; b.style.transform = `scaleX(${1 - prog(t, r0, r0 + 0.35, ease.in)})`; });
      if (st) {
        const s = prog(t, stamp.t, stamp.t + 0.18, ease.out);
        st.style.opacity = s * 0.85;
        st.style.transform = `rotate(${stamp.rot ?? -8}deg) scale(${lerp(1.8, 1, s)})`;
      }
    };
  }

  // Big number with a label under it.
  function bigStat(root, { x, y, value, label, t0, t1, from = 0, fmt, size = 150, color = 'var(--text)', countDur = 1.6, align = 'center' }) {
    const box = el('div', 'abs', root);
    css(box, { left: x + 'px', top: y + 'px', transform: 'translate(-50%,-50%)', textAlign: align });
    const n = el('div', 'title', box);
    css(n, { fontSize: size + 'px', color, lineHeight: 1, letterSpacing: '0.02em' });
    const l = el('div', 'mono', box, label);
    css(l, { fontSize: '28px', color: 'var(--dim)', marginTop: '18px', letterSpacing: '0.18em', textTransform: 'uppercase' });
    const f = fmt || ((v) => Math.round(v).toLocaleString('en-US'));
    cue(t0, 'pop', { freq: 660 });
    return (t) => {
      const a = env(t, t0, t1, 0.4, 0.5);
      box.style.opacity = a;
      n.textContent = typeof value === 'number' ? f(lerp(from, value, prog(t, t0, t0 + countDur, ease.outExpo))) : value;
      box.style.transform = `translate(-50%,-50%) translateY(${(1 - prog(t, t0, t0 + 0.6, ease.out)) * 30}px)`;
    };
  }

  // Horizontal timeline with dated markers; the strip pans to keep the newest marker in view.
  function timeline(root, { t0, t1, events, y = 640, span = 1920, pan: doPan = false }) {
    const strip = el('div', 'abs', root);
    css(strip, { left: '0px', top: y + 'px', width: span + 'px', height: '2px' });
    const line = el('div', 'abs', strip);
    css(line, { left: '0px', top: '0px', height: '2px', background: 'rgba(236,230,218,0.35)' });
    const nodes = events.map((e, i) => {
      const m = el('div', 'abs', strip);
      css(m, { left: e.x + 'px', top: '-11px', width: '24px', height: '24px', marginLeft: '-12px', borderRadius: '50%', background: e.color || 'var(--amber)', boxShadow: `0 0 30px ${e.color || 'var(--amber)'}` });
      const lab = el('div', 'abs', strip);
      const up = e.up ?? i % 2 === 0;
      css(lab, { left: e.x + 'px', width: '560px', marginLeft: '-280px', textAlign: 'center', top: up ? '-250px' : '50px' });
      lab.innerHTML = `<div class="mono" style="font-size:30px;color:${e.color || 'var(--amber)'};letter-spacing:.2em">${e.date}</div>
        <div class="title" style="font-size:54px;margin-top:10px;line-height:1.08">${e.title}</div>
        ${e.sub ? `<div style="font-size:26px;color:var(--dim);margin-top:12px;line-height:1.35">${e.sub}</div>` : ''}`;
      cue(e.t, 'pop', { freq: 520 + i * 90 });
      return { m, lab, e, up };
    });
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.5, 0.5);
      const shown = nodes.filter((n) => t >= n.e.t);
      const focus = shown.length ? shown[shown.length - 1].e : events[0];
      const prev = shown.length > 1 ? shown[shown.length - 2].e : focus;
      const pan = lerp(prev.x, focus.x, prog(t, focus.t, focus.t + 1.2, ease.inOut));
      strip.style.transform = doPan ? `translateX(${960 - pan}px)` : 'none';
      line.style.width = `${Math.max(...nodes.map((n) => (t >= n.e.t ? n.e.x : 0)), 0) + 400 * prog(t, t0, t1, ease.linear)}px`;
      nodes.forEach(({ m, lab, e, up }) => {
        const k = prog(t, e.t, e.t + 0.6, ease.outBack);
        m.style.transform = `scale(${k})`;
        lab.style.opacity = prog(t, e.t + 0.1, e.t + 0.7, ease.out);
        lab.style.transform = `translateY(${(1 - prog(t, e.t + 0.1, e.t + 0.8, ease.out)) * (up ? 30 : -30)}px)`;
      });
    };
  }

  // The flywheel: a ring with four stations and an accelerating spin.
  function flywheel(root, { t0, t1, cx = 960, cy = 560, r = 330, labels, spin = [[0, 0.15], [1, 1.2]], center = 'THE MODEL', stationTimes = [] }) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', 1920); svg.setAttribute('height', 1080);
    css(svg, { position: 'absolute', left: 0, top: 0 });
    root.appendChild(svg);
    const mk = (tag, attrs, parent = svg) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
    const defs = mk('defs', {});
    defs.innerHTML = `<radialGradient id="core"><stop offset="0" stop-color="#6cc3bd" stop-opacity=".55"/><stop offset="1" stop-color="#6cc3bd" stop-opacity="0"/></radialGradient>
      <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#f0a63a"/></marker>`;
    const glow = mk('circle', { cx, cy, r: r * 0.75, fill: 'url(#core)' });
    const ring = mk('circle', { cx, cy, r, fill: 'none', stroke: 'rgba(236,230,218,0.18)', 'stroke-width': 3 });
    const dash = mk('circle', { cx, cy, r: r + 26, fill: 'none', stroke: 'rgba(108,195,189,0.55)', 'stroke-width': 4, 'stroke-dasharray': '6 22' });
    const arcs = [0, 1, 2, 3].map((i) => {
      const a0 = (i * 90 - 90 + 16) * Math.PI / 180, a1 = (i * 90 - 90 + 74) * Math.PI / 180;
      const p = mk('path', { d: `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`, fill: 'none', stroke: '#f0a63a', 'stroke-width': 5, 'marker-end': 'url(#arr)', 'stroke-linecap': 'round' });
      const len = (58 / 360) * 2 * Math.PI * r;
      p.setAttribute('stroke-dasharray', `${len} ${len}`);
      return { p, len };
    });
    const comet = mk('circle', { r: 12, fill: '#fff' });
    const cometGlow = mk('circle', { r: 34, fill: 'rgba(240,166,58,0.35)' });
    const centerTxt = el('div', 'center title', root, center);
    css(centerTxt, { left: cx + 'px', top: cy + 'px', fontSize: '50px', color: 'var(--teal)', letterSpacing: '0.12em' });
    const st = labels.map((txt, i) => {
      const a = (i * 90 - 90) * Math.PI / 180;
      const n = el('div', 'abs', root);
      const lx = cx + (r + 0) * Math.cos(a), ly = cy + (r + 0) * Math.sin(a);
      css(n, { left: lx + 'px', top: ly + 'px', transform: 'translate(-50%,-50%)', background: '#1a2028', border: '2px solid rgba(240,166,58,0.8)', borderRadius: '40px', padding: '14px 30px', whiteSpace: 'nowrap', boxShadow: '0 10px 40px rgba(0,0,0,.5)' });
      n.innerHTML = `<span class="title" style="font-size:36px;letter-spacing:.08em">${txt}</span>`;
      const ts = stationTimes[i] ?? t0 + 0.6 * i;
      cue(ts, 'pop', { freq: 440 + 110 * i });
      return { n, ts };
    });
    // integrate spin speed so the angle is continuous
    const angleAt = (t) => {
      let a = 0; const dt = 1 / 48;
      for (let s = t0; s < t; s += dt) a += keys((s - t0) / (t1 - t0), spin, ease.inOut) * dt * 360;
      return a;
    };
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.6, 0.6);
      const ang = angleAt(t);
      dash.setAttribute('transform', `rotate(${ang} ${cx} ${cy})`);
      const rad = (ang - 90) * Math.PI / 180;
      comet.setAttribute('cx', cx + r * Math.cos(rad)); comet.setAttribute('cy', cy + r * Math.sin(rad));
      cometGlow.setAttribute('cx', cx + r * Math.cos(rad)); cometGlow.setAttribute('cy', cy + r * Math.sin(rad));
      const allIn = Math.max(...st.map((s) => s.ts));
      arcs.forEach(({ p, len }, i) => p.setAttribute('stroke-dashoffset', len * (1 - prog(t, st[i].ts + 0.2, st[i].ts + 0.9))));
      st.forEach(({ n, ts }) => {
        const k = prog(t, ts, ts + 0.5, ease.outBack);
        n.style.opacity = clamp(k);
        n.style.transform = `translate(-50%,-50%) scale(${0.6 + 0.4 * k})`;
      });
      const pulse = 0.85 + 0.15 * Math.sin(ang * Math.PI / 90);
      glow.setAttribute('r', r * 0.75 * pulse * (0.6 + 0.4 * prog(t, allIn, allIn + 2)));
      centerTxt.style.opacity = prog(t, t0 + 0.3, t0 + 1.2);
      comet.style.opacity = cometGlow.style.opacity = prog(t, allIn, allIn + 0.8);
    };
  }

  // Grid of illustrative startup cards that get absorbed by releases.
  function startupGrid(root, { t0, t1, cards, releases }) {
    const cols = 4, cw = 380, ch = 168, gx = 40, gy = 36;
    const ox = (1920 - (cols * cw + (cols - 1) * gx)) / 2, oy = 380;
    const R = rng(77);
    const nodes = cards.map((c, i) => {
      const n = el('div', 'card', root);
      const x = ox + (i % cols) * (cw + gx), y = oy + Math.floor(i / cols) * (ch + gy);
      css(n, { left: x + 'px', top: y + 'px' });
      n.innerHTML = `<div class="cat">${c.cat}</div><div class="nm">${c.name}</div><div class="val">built on a frontier model</div>`;
      const tag = el('div', 'abs', n, 'NOW A FEATURE');
      css(tag, { right: '18px', top: '18px', fontFamily: "'Special Elite'", fontSize: '22px', color: 'var(--red)', border: '3px solid var(--red)', padding: '2px 10px', opacity: 0, transform: 'rotate(6deg)' });
      const appear = t0 + 0.3 + i * 0.12;
      return { n, tag, c, appear, drift: R() * 2 - 1 };
    });
    const ticker = el('div', 'abs', root);
    css(ticker, { left: '0', right: '0', top: '200px', textAlign: 'center' });
    const tLines = releases.map((r) => {
      const d = el('div', 'abs', ticker);
      css(d, { left: '0', right: '0', top: '0' });
      d.innerHTML = `<span class="mono" style="font-size:30px;color:var(--amber);letter-spacing:.25em">${r.date}</span><span class="title" style="font-size:46px;margin-left:30px">${r.title}</span>`;
      if (r.t >= t0) cue(r.t, 'hit', { gain: 0.55 });
      return { d, r };
    });
    nodes.forEach((nd) => {
      const rel = releases.find((r) => r.kills.includes(nd.c.name));
      nd.kill = rel ? rel.t + 0.25 + 0.12 * rel.kills.indexOf(nd.c.name) : null;
      if (nd.kill && nd.kill >= t0) cue(nd.kill, 'stamp', { gain: 0.35 });
    });
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.5, 0.6);
      nodes.forEach(({ n, tag, appear, kill, drift }) => {
        const a = prog(t, appear, appear + 0.5, ease.out);
        let o = a, ty = (1 - a) * 30, rot = 0, gray = 0;
        if (kill) {
          const k = prog(t, kill, kill + 0.25, ease.out);
          const sink = prog(t, kill + 0.6, kill + 1.6, ease.inOut);
          tag.style.opacity = k;
          tag.style.transform = `rotate(6deg) scale(${lerp(1.6, 1, k)})`;
          gray = k; o = a * (1 - 0.45 * sink); ty += sink * 10; rot = sink * 1.5 * drift;
        }
        n.style.opacity = o;
        n.style.filter = `grayscale(${gray}) brightness(${1 - 0.35 * gray})`;
        n.style.transform = `translateY(${ty}px) rotate(${rot}deg)`;
      });
      tLines.forEach(({ d, r }, i) => {
        const next = releases[i + 1];
        d.style.opacity = Math.min(prog(t, r.t, r.t + 0.3), next ? 1 - prog(t, next.t - 0.25, next.t) : 1 - prog(t, t1 - 0.6, t1));
        d.style.transform = `translateY(${(1 - prog(t, r.t, r.t + 0.4, ease.out)) * -20}px)`;
      });
    };
  }

  // Line chart that draws itself.
  function chart(root, { t0, t1, points, x = 360, y = 210, w = 1200, h = 620, yMax = 100, title, foot, drawFrom, drawTo }) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', 1920); svg.setAttribute('height', 1080);
    css(svg, { position: 'absolute', left: 0, top: 0 });
    root.appendChild(svg);
    const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; };
    [0, 25, 50, 75, 100].forEach((v) => {
      const yy = y + h - (v / yMax) * h;
      mk('line', { x1: x, x2: x + w, y1: yy, y2: yy, stroke: 'rgba(236,230,218,0.12)', 'stroke-width': 2 });
      const lab = mk('text', { x: x - 24, y: yy + 10, fill: 'rgba(236,230,218,0.5)', 'font-family': 'IBM Plex Mono', 'font-size': 26, 'text-anchor': 'end' });
      lab.textContent = v + '%';
    });
    const P = points.map((p) => [x + p.fx * w, y + h - (p.v / yMax) * h]);
    let d = `M ${P[0][0]} ${P[0][1]}`;
    for (let i = 1; i < P.length; i++) d += ` L ${P[i][0]} ${P[i][1]}`;
    const area = mk('path', { d: `${d} L ${P[P.length - 1][0]} ${y + h} L ${P[0][0]} ${y + h} Z`, fill: 'rgba(240,166,58,0.12)' });
    const path = mk('path', { d, fill: 'none', stroke: '#f0a63a', 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    const len = P.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - P[i][0], p[1] - P[i][1]), 0);
    path.setAttribute('stroke-dasharray', `${len} ${len}`);
    const dots = points.map((p, i) => {
      const c = mk('circle', { cx: P[i][0], cy: P[i][1], r: 14, fill: '#fff', stroke: '#f0a63a', 'stroke-width': 5 });
      const lab = el('div', 'abs', root);
      css(lab, { left: P[i][0] + (p.dx ?? 0) + 'px', top: P[i][1] + (p.dy ?? -180) + 'px', transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' });
      lab.innerHTML = `<div class="title" style="font-size:64px;color:#fff">${p.label}</div><div class="mono" style="font-size:24px;color:var(--dim);margin-top:4px">${p.sub}</div>`;
      return { c, lab, t: p.t };
    });
    dots.forEach((dt) => cue(dt.t, 'pop', { freq: 700 }));
    const head = el('div', 'abs', root);
    css(head, { left: x + 'px', top: y - 130 + 'px' });
    head.innerHTML = title;
    const ft = el('div', 'abs mono', root, foot);
    css(ft, { left: x + 'px', top: y + h + 40 + 'px', fontSize: '22px', color: 'rgba(236,230,218,0.55)' });
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.5, 0.5);
      const k = prog(t, drawFrom, drawTo, ease.inOut);
      path.setAttribute('stroke-dashoffset', len * (1 - k));
      area.style.opacity = k;
      dots.forEach(({ c, lab, t: dt }) => {
        const a = prog(t, dt, dt + 0.4, ease.outBack);
        c.setAttribute('r', 14 * clamp(a, 0, 1.3));
        lab.style.opacity = prog(t, dt, dt + 0.5);
      });
    };
  }

  // Generic settings panel with a single toggle that stays ON.
  function togglePanel(root, { t0, t1, title, row, note, t: tHover }) {
    const p = el('div', 'panel', root);
    css(p, { left: '460px', top: '300px', width: '1000px', height: '400px', padding: '56px 64px' });
    p.innerHTML = `<div class="mono" style="font-size:24px;color:var(--dim);letter-spacing:.25em">${title}</div>
      <div style="height:2px;background:rgba(255,255,255,.08);margin:28px 0 44px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:44px;font-weight:600">${row}</div>
      </div>
      <div class="mono" style="font-size:24px;color:var(--dim);margin-top:40px">${note}</div>`;
    const tg = el('div', 'toggle', p);
    css(tg, { right: '64px', top: '154px' });
    const knob = el('div', 'knob', tg);
    const cursor = el('div', 'abs', root);
    cursor.innerHTML = `<svg width="54" height="70" viewBox="0 0 24 32"><path d="M2 2 L2 26 L8 20 L12 30 L16 28 L12 18 L20 18 Z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>`;
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.5, 0.5);
      p.style.transform = `translateY(${(1 - prog(t, t0, t0 + 0.7, ease.out)) * 40}px)`;
      const on = 1;
      tg.style.background = on ? '#3fa69c' : '#3a4250';
      knob.style.left = on ? '52px' : '6px';
      // cursor drifts toward the toggle, hesitates, and leaves without clicking
      const cx = keys(t, [[tHover, 1500], [tHover + 1.4, 1395], [tHover + 2.6, 1400], [tHover + 3.8, 1700]]);
      const cy = keys(t, [[tHover, 900], [tHover + 1.4, 500], [tHover + 2.6, 505], [tHover + 3.8, 980]]);
      css(cursor, { left: cx + 'px', top: cy + 'px', opacity: prog(t, tHover - 0.2, tHover + 0.3) * (1 - prog(t, tHover + 3.4, tHover + 3.8)) });
    };
  }


  // Big title card: THE FLYWHEEL, letters resolving out of blur with a light sweep.
  function titleCard(root, { t0, t1, title, sub }) {
    const box = el('div', 'center', root);
    const h = el('div', 'title', box);
    css(h, { fontSize: '200px', fontWeight: 700, letterSpacing: '0.12em', lineHeight: 1, whiteSpace: 'nowrap' });
    const letters = [...title].map((ch) => { const s = el('span', '', h, ch === ' ' ? '&nbsp;' : ch); s.style.display = 'inline-block'; return s; });
    const sb = el('div', 'serif', box, sub);
    css(sb, { fontSize: '44px', fontStyle: 'italic', color: 'rgba(236,230,218,0.8)', marginTop: '34px' });
    const sweep = el('div', 'abs', root);
    css(sweep, { top: '0', bottom: '0', width: '420px', background: 'linear-gradient(90deg, transparent, rgba(255,240,210,0.10), transparent)', transform: 'skewX(-18deg)' });
    cue(t0, 'hit', { gain: 1.0 });
    cue(t0, 'riser', { dur: 2.2, gain: 0.55 });
    return (t) => {
      box.style.opacity = env(t, t0, t1, 0.05, 0.9);
      letters.forEach((s, i) => {
        const k = prog(t, t0 + i * 0.035, t0 + 0.9 + i * 0.035, ease.out);
        s.style.opacity = k;
        s.style.filter = `blur(${(1 - k) * 18}px)`;
        s.style.transform = `translateY(${(1 - k) * 12}px)`;
      });
      h.style.letterSpacing = `${lerp(0.2, 0.12, prog(t, t0, t1, ease.out))}em`;
      sb.style.opacity = prog(t, t0 + 1.2, t0 + 2.2);
      sweep.style.left = `${lerp(-600, 2200, prog(t, t0 + 0.4, t0 + 2.6, ease.inOut))}px`;
    };
  }

  // Centered statement: words resolve in sequence. Used for narration-backed key lines.
  function statement(root, { t0, t1, html, size = 84, cls = 'serif', color = 'var(--text)', gap = 0.16, y = 540, width = 1500, italic = false }) {
    const holder = el('div', 'abs', root);
    css(holder, { left: (1920 - width) / 2 + 'px', width: width + 'px', top: y + 'px', transform: 'translateY(-50%)', textAlign: 'center' });
    const w = E.words(holder, html, { t0, gap, cls, style: { fontSize: size + 'px', lineHeight: 1.25, color, fontStyle: italic ? 'italic' : 'normal' } });
    return (t) => { holder.style.opacity = env(t, t0 - 0.01, t1, 0.01, 0.5); w(t); };
  }

  // Three pillars for the closing: icon, label, stat, source.
  function pillars(root, { items }) {
    const nodes = items.map((it, i) => {
      const col = el('div', 'abs', root);
      css(col, { left: 160 + i * 560 + 'px', top: '250px', width: '480px', textAlign: 'center' });
      col.innerHTML = `<div style="height:150px;display:flex;align-items:center;justify-content:center">${it.icon}</div>
        <div class="mono" style="font-size:28px;letter-spacing:.4em;color:#7a4b1c;margin-top:18px">${it.label}</div>
        <div class="title" style="font-size:${it.statSize || 110}px;color:#2a1d14;margin-top:16px;line-height:1;white-space:nowrap">${it.stat}</div>
        <div style="font-size:30px;color:#4a3a2c;margin-top:18px;line-height:1.35">${it.text}</div>
        <div class="mono" style="font-size:19px;color:rgba(74,58,44,.75);margin-top:22px;line-height:1.4">${it.source}</div>`;
      cue(it.t, 'pop', { freq: 523.25 * [1, 1.25, 1.5][i] });
      return { col, it };
    });
    return (t) => nodes.forEach(({ col, it }) => {
      const k = prog(t, it.t, it.t + 0.8, ease.out);
      col.style.opacity = Math.min(k, 1 - prog(t, it.t1 - 0.5, it.t1));
      col.style.transform = `translateY(${(1 - k) * 40}px)`;
    });
  }

  // Rolling source credits.
  function credits(root, { t0, t1, heading, lines, color = 'rgba(236,230,218,.82)' }) {
    const box = el('div', 'abs', root);
    css(box, { left: '0', right: '0', top: '0', textAlign: 'center' });
    box.innerHTML = `<div class="kicker" style="margin-bottom:40px">${heading}</div>` +
      lines.map((l) => `<div class="mono" style="font-size:24px;line-height:1.75;color:${color}">${l}</div>`).join('');
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.8, 0.8);
      const hgt = box.scrollHeight;
      box.style.transform = `translateY(${lerp(1080, -hgt, prog(t, t0, t1, ease.linear))}px)`;
    };
  }


  // Soft rising sun for the closing (a warm radial glow climbing from the horizon).
  function sun(root, { t0, t1, rise = [[0, 1200], [1, 560]] }) {
    const s = el('div', 'abs', root);
    css(s, { left: '360px', width: '1200px', height: '1200px', borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,247,226,0.95) 0%, rgba(255,214,150,0.55) 22%, rgba(255,190,120,0.18) 45%, transparent 68%)' });
    return (t) => {
      const k = prog(t, t0, t1, ease.linear);
      s.style.top = keys(k, rise) - 600 + 'px';
      s.style.opacity = Math.min(prog(t, t0, t0 + 2), 1);
    };
  }

  // Small archival HUD: case label and running timecode.
  function hud(root, { label, from, to }) {
    const l = el('div', 'abs mono', root, label);
    css(l, { left: '64px', top: '48px', fontSize: '18px', letterSpacing: '0.3em', color: 'rgba(236,230,218,0.45)' });
    const r = el('div', 'abs mono', root);
    css(r, { right: '64px', top: '48px', fontSize: '18px', letterSpacing: '0.2em', color: 'rgba(236,230,218,0.45)' });
    const dot = el('span', '', r, '●&nbsp;&nbsp;');
    dot.style.color = 'var(--red)';
    const tc = el('span', '', r);
    return (t) => {
      const a = env(t, from, to, 0.8, 0.8);
      l.style.opacity = r.style.opacity = a;
      dot.style.opacity = Math.floor(t * 1.2) % 2 ? 0.25 : 1;
      const f = Math.floor((t % 1) * 24), sec = Math.floor(t) % 60, min = Math.floor(t / 60);
      tc.textContent = `00:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
    };
  }


  // A ledger of reasons that tick in one by one; the last row can be emphasised.
  function ledger(root, { t0, t1, title, rows, x = 460, y = 230, w = 1000 }) {
    const box = el('div', 'abs', root);
    css(box, { left: x + 'px', top: y + 'px', width: w + 'px' });
    const h = el('div', 'kicker', box, title);
    h.style.marginBottom = '34px';
    const nodes = rows.map((r) => {
      const row = el('div', '', box);
      css(row, { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid rgba(236,230,218,.14)', padding: '22px 0' });
      row.innerHTML = `<span style="font-size:${r.big ? 60 : 46}px;font-family:${r.big ? "'Playfair Display'" : 'Inter'};font-weight:${r.big ? 700 : 400};color:${r.big ? 'var(--amber)' : 'var(--text)'}">${r.text}</span>
        <span class="mono" style="font-size:22px;color:var(--dim)">${r.note || ''}</span>`;
      cue(r.t, r.big ? 'hit' : 'tick', { gain: r.big ? 0.6 : 0.8 });
      return { row, r };
    });
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.4, 0.5);
      nodes.forEach(({ row, r }) => {
        const k = prog(t, r.t, r.t + 0.5, ease.out);
        row.style.opacity = k;
        row.style.transform = `translateX(${(1 - k) * -40}px)`;
      });
    };
  }

  window.C = { ledger, sun, hud, chapterCard, docCard, bigStat, timeline, flywheel, startupGrid, chart, togglePanel, titleCard, statement, pillars, credits };
})();
