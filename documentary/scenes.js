// The film: global look per section, then one visual beat per narration line (see script/visuals.js).
(() => {
  const { scene, el, css, env, prog, keys, lerp, mix, cue } = E;
  const T = window.TIMINGS.lines;
  const ids = Object.keys(T);
  const DUR = window.FILM_DURATION;

  // ---- sections ----
  const SECTIONS = ['COLD_OPEN', 'EXHIBIT_A', 'EXHIBIT_B', 'EXHIBIT_C', 'EXHIBIT_D', 'EXHIBIT_E', 'CLOSING'];
  const sec = {};
  ids.forEach((id) => {
    const s = T[id].section;
    if (!sec[s]) sec[s] = { start: T[id].start, end: T[id].end, first: id };
    sec[s].end = T[id].end;
  });
  const NAMES = { EXHIBIT_A: 'The Launch', EXHIBIT_B: 'The Wheel', EXHIBIT_C: 'The Steamroller', EXHIBIT_D: 'The Acceleration', EXHIBIT_E: 'The Price', CLOSING: 'The One Asset' };
  const LETTER = { EXHIBIT_A: 'Exhibit A', EXHIBIT_B: 'Exhibit B', EXHIBIT_C: 'Exhibit C', EXHIBIT_D: 'Exhibit D', EXHIBIT_E: 'Exhibit E', CLOSING: 'Conclusion' };

  const TITLE_AT = sec.COLD_OPEN.end + 1.0;          // title card lands in the pause after the cold open
  const DAWN = sec.CLOSING.start - 1.6;               // light starts to come up as the closing begins
  const CREDITS = window.CREDITS_AT || (sec.CLOSING.end + 2.6);
  window.FILM_SECTIONS = { ...sec, TITLE_AT, DAWN, CREDITS };

  // ---- global look ----
  const warm = (t) => prog(t, DAWN, DAWN + 3.5);
  E.setBg((t) => {
    const k = warm(t);
    if (k <= 0) return '#0e1116';
    return `linear-gradient(180deg, rgba(14,17,22,${1 - k}) 0%, rgba(14,17,22,${1 - k}) 100%), linear-gradient(180deg, #e9d3b4 0%, #f3d2a6 48%, #f0b789 78%, #d99a7c 100%)`;
  });
  E.setPalette((t) => {
    const k = warm(t);
    return [mix('#1c2633', '#fff3dc', k), mix('#2a1f1c', '#ffd9a8', k), mix('#18242a', '#f6c4a0', k)];
  });
  // heavy static in the first seconds, settling to a fine film grain
  E.setGrain((t) => lerp(keys(t, [[0, 0.5], [1.2, 0.5], [3.5, 0.08]]), 0.05, warm(t)));
  E.setVignette((t) => lerp(1, 0.25, warm(t)));
  E.setBlackout([[0, 1], [0.6, 1], [1.6, 0], [TITLE_AT - 0.5, 0], [TITLE_AT - 0.08, 1], [TITLE_AT, 0], [DUR - 1.2, 0], [DUR, 1]]);
  cue(0.0, 'static', { dur: Math.max(3, sec.COLD_OPEN.start + 1.5), release: 1.5 });
  E.glitch(TITLE_AT - 0.35, 0.3);

  // title
  scene(TITLE_AT, TITLE_AT + 3.4, (root) => C.titleCard(root, { t0: TITLE_AT, t1: TITLE_AT + 3.4, title: 'THE FLYWHEEL', sub: 'Why AI is almost free — and what else you pay with' }), { push: 0.05 });

  // chapter cards in the pause before each exhibit, and a small running HUD inside each
  SECTIONS.slice(1).forEach((s) => {
    if (!sec[s]) return;
    const a = sec[s].start - 1.5, b = sec[s].start + 0.15;
    if (s === 'CLOSING') return;  // the closing is announced by the light, not a card
    scene(a, b, (root) => C.chapterCard(root, { label: LETTER[s].toUpperCase(), name: NAMES[s], t0: a, t1: b }), { push: 0.02 });
    scene(sec[s].start, sec[s].end + 0.8, (root) => C.hud(root, { label: `${LETTER[s].toUpperCase()} · ${NAMES[s].toUpperCase()}`, from: sec[s].start, to: sec[s].end + 0.8 }), { push: 0 });
  });

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
    let t1 = spec.until ?? (next ? (V[next].from ?? T[next].start) - 0.3 : CREDITS);
    // clear the frame before the next exhibit's chapter card
    if (next && T[next].section !== line.section && T[next].section !== 'CLOSING') t1 = Math.min(t1, sec[T[next].section].start - 1.5 - 0.45);
    if (spec.holdTo) t1 = T[spec.holdTo].end + 0.4;
    scene(t0, t1 + 0.4, (root) => B[spec.beat](root, { t0, t1: t1 + 0.4, line, id }, spec), { push: spec.push ?? 0.035 });
  });

  // ---- credits ----
  scene(CREDITS, DUR, (root) => B.endcard(root, { t0: CREDITS, t1: DUR }, window.ENDCARD), { push: 0.02 });

  // ---- music plan (read by build/score.py via build/cues.mjs) ----
  const M = [];
  const add = (a, b, mood, extra = {}) => { if (a != null && b != null && b > a) M.push({ t0: +a.toFixed(2), t1: +b.toFixed(2), mood, ...extra }); };
  add(0, TITLE_AT, 'static');
  add(sec.COLD_OPEN.start, TITLE_AT, 'tension', { heartbeat: true, level: 0.7 });
  add(TITLE_AT, sec.EXHIBIT_A.end + 1, 'tension', { heartbeat: false });
  add(sec.EXHIBIT_A.end + 1, sec.EXHIBIT_B.end + 1, 'pulse', { bpm: [84, 112] });
  add(sec.EXHIBIT_B.end + 1, sec.EXHIBIT_C.end + 1, 'clock');
  add(sec.EXHIBIT_C.end + 1, sec.EXHIBIT_D.end + 1, 'pulse', { bpm: [104, 132] });
  add(sec.EXHIBIT_D.end + 1, DAWN, 'reveal');
  add(DAWN, CREDITS, 'dawn', { piano: true });
  add(CREDITS - 1, DUR, 'outro', { piano: true });
  window.MUSIC = M;
})();
