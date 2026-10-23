// v3 film: the v2 case-file cut, re-paced like a trailer. Same looks and chapter cards, but each card
// slams in on an impact, every impact punches the camera (window.HITS, from the sound design), and the
// only long silence left is "Yours.". One visual beat per narration line (script/v3/visuals.js).
(() => {
  const { scene, el, css, env, prog, keys, lerp, mix, noise, every } = E;
  const T = window.TIMINGS.lines;
  const ids = Object.keys(T);
  const DUR = window.FILM_DURATION;
  const S = (id) => T[id].start, En = (id) => T[id].end;

  const sec = {};
  ids.forEach((id) => {
    const s = T[id].section;
    if (!sec[s]) sec[s] = { start: T[id].start, end: T[id].end, first: id };
    sec[s].end = Math.max(sec[s].end, T[id].end);
  });
  // each chapter card fills the gap before its exhibit (the score's next cue starts on the same frame)
  const CARD_AT = {
    EXHIBIT_A: S('a-launch') - 1.8,
    EXHIBIT_B: En('a-reveal') + 0.25,
    EXHIBIT_C: En('b-reveal') + 0.25,
    EXHIBIT_D: En('c-doors') + 0.3,
    EXHIBIT_E: En('d-github') + 0.6,
  };
  const EXHIBITS = [
    ['EXHIBIT_A', 'Exhibit A', 'The Gift', 'REEL 1'],
    ['EXHIBIT_B', 'Exhibit B', 'The Wheel', 'REEL 2'],
    ['EXHIBIT_C', 'Exhibit C', 'The Steamroller', 'REEL 3'],
    ['EXHIBIT_D', 'Exhibit D', 'The Acceleration', 'REEL 4'],
    ['EXHIBIT_E', 'Exhibit E', 'The Price', 'REEL 5'],
  ];

  // key moments
  const COLD_CUT = En('co-v6');                       // whispers cut to digital black
  const TITLE_AT = En('co-question') + 0.45;          // case file slams, title
  const TITLE_END = CARD_AT.EXHIBIT_A;
  const D_TO_E = En('d-github');                      // hard cut to black
  const SILENCE = [En('e-data') + 0.05, En('e-yours') + 0.15];
  const BURN = En('v-wheel') + 2.5;                   // film burns through to daylight
  const DAWN = BURN + 0.4;
  const END_AT = En('f-final') + 1.5;
  window.FILM_SECTIONS = { ...sec, CARD_AT, COLD_CUT, TITLE_AT, TITLE_END, D_TO_E, SILENCE, BURN, DAWN, END_AT };

  // ---- grade: sepia archive reel (A) -> cold steel (B-D) -> neutral (E) -> warm dawn ----
  const inA = (t) => prog(t, CARD_AT.EXHIBIT_A, CARD_AT.EXHIBIT_A + 0.4) * (1 - prog(t, CARD_AT.EXHIBIT_B - 0.3, CARD_AT.EXHIBIT_B + 0.3));
  const inCold = (t) => prog(t, CARD_AT.EXHIBIT_B - 0.3, CARD_AT.EXHIBIT_B + 0.6) * (1 - prog(t, D_TO_E, D_TO_E + 0.05));
  E.setGrade((t) => {
    const a = inA(t), c = inCold(t);
    if (a > 0) return `sepia(${0.55 * a}) contrast(${1 + 0.06 * a}) brightness(${1 - 0.04 * a})`;
    if (c > 0) return `saturate(${1 - 0.25 * c}) hue-rotate(${-8 * c}deg) contrast(${1 + 0.05 * c})`;
    return '';
  });
  E.setWeave((t) => 2.2 * inA(t));
  const warm = (t) => prog(t, DAWN, DAWN + 2.5);
  E.setBg((t) => {
    const k = warm(t);
    if (k <= 0) return '#0e1116';
    return `linear-gradient(180deg, rgba(14,17,22,${1 - k}) 0%, rgba(14,17,22,${1 - k}) 100%), linear-gradient(180deg, #e9d3b4 0%, #f3d2a6 48%, #f0b789 78%, #d99a7c 100%)`;
  });
  E.setPalette((t) => {
    const k = warm(t), a = inA(t);
    return [mix(mix('#1c2633', '#2e2418', a), '#fff3dc', k), mix('#2a1f1c', '#ffd9a8', k), mix(mix('#18242a', '#2a2116', a), '#f6c4a0', k)];
  });
  E.setGrain((t) => lerp(keys(t, [[0, 0.32], [1.5, 0.2], [COLD_CUT + 1, 0.12]]) + 0.06 * inA(t), 0.05, warm(t)));
  E.setVignette((t) => lerp(1, 0.25, warm(t)));

  // ---- cuts to black ----
  const K = [[0, 1], [1.4, 0], [COLD_CUT - 0.02, 0], [COLD_CUT, 1], [COLD_CUT + 0.8, 1], [COLD_CUT + 1.3, 0],
    [TITLE_AT - 0.06, 0], [TITLE_AT - 0.02, 1], [TITLE_AT + 0.25, 0],
    // the C -> D door latch is a hard cut: black from the end of "them" until the D card slams in
    [En('c-doors') + 0.03, 0], [En('c-doors') + 0.05, 1], [CARD_AT.EXHIBIT_D, 1], [CARD_AT.EXHIBIT_D + 0.08, 0],
    // D -> E: a hard cut on "like you." to half a second of black
    [D_TO_E - 0.02, 0], [D_TO_E, 1], [CARD_AT.EXHIBIT_E, 1], [CARD_AT.EXHIBIT_E + 0.08, 0],
    [END_AT + 8.0, 0], [DUR, 1]];
  K.sort((a, b) => a[0] - b[0]);
  E.setBlackout(K);
  E.burn(CARD_AT.EXHIBIT_A - 0.25, 0.5, { flare: 0.95, hue: 40 });          // projector-gate flash into the archive reel
  E.burn(CARD_AT.EXHIBIT_B - 0.15, 0.6, { flare: 0.5, hue: 200, from: 'right' }); // reel change
  E.glitch(CARD_AT.EXHIBIT_C - 0.15, 0.35);                                 // wheel tears into Exhibit C
  E.burn(BURN, 2.2, { flare: 1.0, hue: 32 });                               // film burns through to daylight

  // ---- impacts: every hit in the sound design punches the camera; the big ones flash ----
  const START_HITS = CARD_AT.EXHIBIT_A - 0.1;   // the cold open keeps its own v2 cutting
  const HITS = (window.HITS || []).filter((h) => h.t >= START_HITS);
  const flash = el('div', 'abs', document.getElementById('fx'));
  css(flash, { inset: '0', background: '#fff7ea', mixBlendMode: 'screen', opacity: 0, pointerEvents: 'none' });
  const layer = document.getElementById('scenes');
  every((t) => {
    let punch = 0, fl = 0, shake = 0;
    for (const h of HITS) {
      const dt = t - h.t;
      if (dt < 0 || dt > 0.7) continue;
      punch += h.k * Math.exp(-dt / 0.2);
      shake += h.k * Math.exp(-dt / 0.12);
      if (h.k >= 0.6) fl += h.k * Math.exp(-dt / 0.07);
    }
    const day = 1 - 0.6 * warm(t);
    layer.style.scale = String(1 + 0.035 * Math.min(punch, 1.5));
    layer.style.rotate = `${noise(t * 40) * 0.35 * Math.min(shake, 1.5)}deg`;
    flash.style.opacity = Math.min(0.55, 0.45 * fl * day);
  });

  // ---- title ----
  scene(TITLE_AT, TITLE_END + 0.2, (root) => C.titleCard(root, { t0: TITLE_AT, t1: TITLE_END + 0.2, title: 'THE FLYWHEEL', sub: 'A case in five exhibits · all from public sources', typewriter: true }), { push: 0.04 });

  // ---- cold open: persistent disclosure labels and the running case timecode ----
  scene(1.5, TITLE_AT, (root) => B.label(root, { t0: 1.5, t1: TITLE_AT }, { text: 'ILLUSTRATIVE PROMPTS · AI VOICES · NOT REAL USERS', pos: { left: '96px', bottom: '56px' }, size: 17 }), { push: 0 });
  scene(1.5, TITLE_AT, (root) => B.label(root, { t0: 1.5, t1: TITLE_AT }, { text: 'DOCUMENTARY · ALL VOICES ARE AI-GENERATED', pos: { right: '96px', bottom: '56px' }, size: 17 }), { push: 0 });
  scene(0.2, TITLE_END, (root) => C.hud(root, { label: 'CASE 0001', from: 0.2, to: TITLE_END }), { push: 0 });
  // a thin ribbon of warm light behind "It looks like a gift."
  scene(S('co-gift') - 0.3, S('co-billion'), (root) => {
    const r = el('div', 'abs', root);
    css(r, { left: '956px', top: '0', bottom: '0', width: '8px', background: 'linear-gradient(180deg, transparent, rgba(255,214,150,.55), transparent)', filter: 'blur(6px)' });
    return (t) => (root.style.opacity = env(t, S('co-gift') - 0.3, S('co-billion'), 0.8, 1.2) * 0.9);
  }, { push: 0 });
  // archive reel: perforated sprocket strip down the left edge during Exhibit A
  scene(CARD_AT.EXHIBIT_A, CARD_AT.EXHIBIT_B, (root) => {
    const strip = el('div', 'abs', root);
    css(strip, { left: '0', top: '-60px', bottom: '-60px', width: '46px', background: 'repeating-linear-gradient(180deg, rgba(0,0,0,.85) 0 26px, rgba(236,220,190,.18) 26px 44px, rgba(0,0,0,.85) 44px 70px)' });
    return (t) => { root.style.opacity = inA(t) * 0.8; strip.style.transform = `translateY(${(t * 120) % 70}px)`; };
  }, { push: 0 });
  // A -> B: the wheel forms under the reel-change card, with two cue-mark flashes
  scene(En('a-reveal') + 0.1, S('b-name') + 0.3, (root) => {
    const w = C.flywheel(root, { t0: En('a-reveal') + 0.1, t1: S('b-name') + 0.3, labels: ['', '', '', ''], center: '', stationTimes: [1e9, 1e9, 1e9, 1e9], spin: [[0, 0.1], [1, 0.4]] });
    const mark = el('div', 'abs', root);
    css(mark, { left: '1730px', top: '90px', width: '60px', height: '60px', borderRadius: '50%', border: '4px solid rgba(255,255,255,.85)' });
    const f1 = En('a-reveal') + 0.45, f2 = f1 + 0.4;
    return (t) => { w(t); mark.style.opacity = (t > f1 && t < f1 + 0.08) || (t > f2 && t < f2 + 0.08) ? 1 : 0; };
  }, { push: 0 });

  // ---- chapter cards + HUD ----
  EXHIBITS.forEach(([key, label, name, reel]) => {
    if (!sec[key]) return;
    const a = CARD_AT[key], b = sec[key].start + 0.1;
    scene(a, b, (root) => C.chapterCard(root, { label: label.toUpperCase(), name, t0: a, t1: b, slam: key !== 'EXHIBIT_A' }), { push: 0.03 });
    const hudEnd = key === 'EXHIBIT_E' ? sec.VERDICT.start - 0.2 : sec[key].end + 0.2;
    scene(sec[key].start, hudEnd, (root) => C.hud(root, { label: `CASE 0001 · ${reel} · ${name.toUpperCase()}`, from: sec[key].start, to: hudEnd }), { push: 0 });
  });
  scene(sec.VERDICT.start - 0.2, BURN, (root) => C.hud(root, { label: 'A WARNING TO BUILDERS', from: sec.VERDICT.start - 0.2, to: BURN }), { push: 0 });

  // rising sun under the closing
  scene(DAWN, DUR, (root) => C.sun(root, { t0: DAWN, t1: DUR, rise: [[0, 1250], [1, 520]] }), { push: 0 });

  // ---- per-line visuals ----
  const V = window.VISUALS || {};
  const vis = ids.filter((id) => V[id]);
  vis.forEach((id, i) => {
    const line = T[id];
    const spec = V[id];
    const t0 = (spec.from ?? line.start) - 0.3;
    const next = vis[i + 1];
    let t1 = spec.until ?? (next ? (V[next].from ?? T[next].start) - 0.3 : END_AT);
    if (spec.holdTo) t1 = Math.max(t1, T[spec.holdTo].end + 0.4);
    if (spec.holdTo && next && T[next].start - 0.3 < t1) t1 = Math.min(t1, (V[next].from ?? T[next].start) - 0.3);
    // clear the frame before the next exhibit's chapter card
    const nextSec = next && T[next].section;
    if (nextSec && nextSec !== line.section && CARD_AT[nextSec]) t1 = Math.min(t1, CARD_AT[nextSec] - 0.4);
    scene(t0, t1 + 0.4, (root) => B[spec.beat](root, { t0, t1: t1 + 0.4, line, id }, spec), { push: spec.push ?? 0.035 });
  });

  // ---- end card ----
  scene(END_AT, DUR, (root) => B.endcard(root, { t0: END_AT, t1: DUR }, window.ENDCARD), { push: 0.02 });
})();
