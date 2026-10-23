// Visual "beats": each one is a function (root, ctx, opts) => update(t).
// ctx = { t0, t1, line, id } where t0/t1 are the scene window and line is the narration line it accompanies.
// W(id, word, fallbackFraction) returns when the narrator says `word` in line `id` (Whisper alignment).
(() => {
  const { el, css, env, prog, keys, ease, lerp, cue, typewriter, source } = E;
  const T = window.TIMINGS.lines;
  const WORDS = window.WORDS || {};

  function W(id, word, frac = 0.5) {
    const ln = T[id];
    const ws = WORDS[id] || [];
    const target = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hit = ws.find((w) => w.w.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(target));
    return hit ? hit.start : ln.start + (ln.end - ln.start) * frac;
  }

  const B = {};

  // Typewriter line in the middle of a dark frame.
  B.type = (root, { t0, t1, line }, { text, size = 84, cps = 18, y = 540, color = 'var(--text)', sub }) => {
    const tw = typewriter(root, text, { t0: line.start + 0.05, cps, cls: 'type center', style: { fontSize: size + 'px', top: y + 'px', color, width: '1600px', lineHeight: 1.3 } });
    let s = null;
    if (sub) {
      s = el('div', 'center mono', root, sub);
      css(s, { top: y + size * 0.9 + 'px', fontSize: '24px', color: 'var(--dim)', letterSpacing: '0.2em' });
    }
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.15, 0.5);
      tw(t);
      if (s) s.style.opacity = prog(t, line.start + text.length / cps, line.start + text.length / cps + 0.6);
    };
  };

  // One or two big numbers, each appearing on cue.
  B.stats = (root, { t0, t1 }, { items, src }) => {
    const ups = items.map((it) => C.bigStat(root, { ...it, t1 }));
    const so = src ? source(root, src, { t0: t0 + 0.6, t1 }) : null;
    return (t) => { root.style.opacity = env(t, t0, t1, 0.3, 0.5); ups.forEach((u) => u(t)); so && so(t); };
  };

  // Paper evidence document.
  B.doc = (root, { t0, t1 }, o) => {
    const d = C.docCard(root, { t0, t1, ...o });
    const so = o.src ? source(root, o.src, { t0: t0 + 0.5, t1 }) : null;
    return (t) => { d(t); so && so(t); };
  };

  // Statement words on screen.
  B.say = (root, { t0, t1, line }, o) => {
    const s = C.statement(root, { t0: o.at ?? line.start, t1, ...o });
    const so = o.src ? source(root, o.src, { t0: t0 + 0.5, t1 }) : null;
    let k = null;
    if (o.kicker) {
      k = el('div', 'center kicker', root, o.kicker);
      css(k, { top: (o.y ?? 540) - (o.size ?? 84) - 40 + 'px' });
    }
    return (t) => { s(t); so && so(t); if (k) k.style.opacity = env(t, t0, t1, 0.4, 0.5); };
  };

  B.timeline = (root, { t0, t1 }, o) => C.timeline(root, { t0, t1, ...o });
  B.flywheel = (root, { t0, t1 }, o) => C.flywheel(root, { t0, t1, ...o });
  B.grid = (root, { t0, t1 }, o) => C.startupGrid(root, { t0, t1, ...o });
  B.ledger = (root, { t0, t1 }, o) => {
    const l = C.ledger(root, { t0, t1, ...o });
    const so = o.src ? source(root, o.src, { t0: t0 + 0.5, t1 }) : null;
    return (t) => { l(t); so && so(t); };
  };
  B.toggle = (root, { t0, t1, line }, o) => {
    const p = C.togglePanel(root, { t0, t1, t: line.start + 0.4, ...o });
    const so = o.src ? source(root, o.src, { t0: t0 + 0.5, t1 }) : null;
    return (t) => { p(t); so && so(t); };
  };
  B.chart = (root, { t0, t1 }, o) => {
    const c = C.chart(root, { t0, t1, ...o });
    const so = o.src ? source(root, o.src, { t0: t0 + 0.5, t1 }) : null;
    return (t) => { c(t); so && so(t); };
  };

  // Several statements side by side or stacked, each on its own cue (e.g. "Build. Raise. Ship.").
  B.triple = (root, { t0, t1 }, { words: ws, size = 150, color = 'var(--text)', gap = 120 }) => {
    const row = el('div', 'center', root);
    css(row, { display: 'flex', gap: gap + 'px', whiteSpace: 'nowrap' });
    const nodes = ws.map((w) => {
      const n = el('div', 'title', row, w.text);
      css(n, { fontSize: size + 'px', color });
      cue(w.t, 'stamp', { gain: 0.5 });
      return { n, w };
    });
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.2, 0.5);
      nodes.forEach(({ n, w }) => {
        const k = prog(t, w.t, w.t + 0.35, ease.out);
        n.style.opacity = k;
        n.style.transform = `scale(${lerp(1.25, 1, k)})`;
        n.style.filter = `blur(${(1 - k) * 8}px)`;
      });
    };
  };


  // Several beats layered in one scene.
  B.combo = (root, ctx, { parts }) => {
    const ups = parts.map((p) => {
      const layer = el('div', 'abs', root); css(layer, { inset: '0' });
      return B[p.beat](layer, { ...ctx, t0: p.at ?? ctx.t0, t1: p.until ?? ctx.t1 }, p);
    });
    return (t) => { root.style.opacity = env(t, ctx.t0, ctx.t1, 0.3, 0.5); ups.forEach((u) => u(t)); };
  };

  // Closing pillars with a spoken verb under each.
  B.pillars = (root, { t0, t1 }, { items }) => {
    const p = C.pillars(root, { items: items.map((it) => ({ ...it, t1 })) });
    const verbs = items.map((it, i) => {
      const v = el('div', 'abs serif', root, it.verb);
      css(v, { left: 160 + i * 560 + 'px', width: '480px', top: '830px', textAlign: 'center', fontSize: '58px', fontStyle: 'italic', color: '#7a3f12' });
      return { v, t: it.verbT };
    });
    return (t) => {
      root.style.opacity = env(t, t0, t1, 0.3, 0.6);
      p(t);
      verbs.forEach(({ v, t: vt }) => { const k = prog(t, vt, vt + 0.5, ease.out); v.style.opacity = k; v.style.transform = `translateY(${(1 - k) * 16}px)`; });
    };
  };

  // Static end card.
  B.endcard = (root, { t0, t1 }, { title, lines }) => {
    const box = el('div', 'center', root);
    box.innerHTML = `<div class="title" style="font-size:64px;letter-spacing:.3em;color:#2a1d14">${title}</div>` +
      lines.map((l) => `<div class="mono" style="font-size:24px;color:rgba(42,29,20,.8);margin-top:22px;letter-spacing:.06em">${l}</div>`).join('');
    return (t) => { box.style.opacity = env(t, t0, t1, 0.8, 0.8); };
  };


  B.prompts = (root, { t0, t1 }, o) => C.promptWall(root, { t0, t1, ...o });
  B.voiceprint = (root, { t0, t1 }, o) => C.voicePrint(root, { t0, t1, ...o });


  B.whispers = (root, { t0, t1 }, o) => C.whispers(root, { t0, t1, ...o });
  B.casefile = (root, { t1 }, o) => C.caseFile(root, { t1, ...o });
  B.record = (root, { t0, t1 }, o) => C.recordCard(root, { at: o.at ?? t0, t1, ...o });
  B.code = (root, { t0, t1 }, o) => C.codeFrame(root, { t0, t1, ...o });
  B.settings = (root, { t0, t1 }, o) => C.settingsGrid(root, { t0, t1, ...o });
  B.wrapper = (root, { t0, t1 }, o) => C.wrapperCard(root, { t0, t1, ...o });
  B.bubbles = (root, ctx, o) => C.bubbles(root, o);
  B.label = (root, { t0, t1 }, { text, pos, size = 18, color = 'var(--amber)' }) => {
    const n = el('div', 'abs mono', root, text);
    css(n, { ...pos, fontSize: size + 'px', letterSpacing: '0.2em', color });
    return (t) => (n.style.opacity = env(t, t0, t1, 0.4, 0.4));
  };

  window.B = B;
  window.W = W;
})();
