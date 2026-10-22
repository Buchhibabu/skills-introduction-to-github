// What is on screen under each narration line. Times come from the narration (T) and from
// Whisper word alignment (W), so every highlight and stamp lands on the spoken word.
(() => {
  const T = window.TIMINGS.lines;
  const s = (id) => T[id].start;
  const e = (id) => T[id].end;
  const HL = (txt) => `<span class="hl"><span class="mark"></span>${txt}</span>`;
  const DARK = '#2a1d14';

  window.VISUALS = {
    // ---------------- cold open ----------------
    'co-gift': { beat: 'type', text: 'It looks like a gift.', size: 96, cps: 15 },
    'co-billion': {
      beat: 'stats',
      items: [
        { x: 620, y: 470, value: 1200000000, label: 'weekly ChatGPT users · Sep 2026', t0: W('co-billion', 'billion', 0.25), countDur: 2.2, size: 132 },
        { x: 1400, y: 470, value: '~1 in 20', label: 'paid a subscription · Feb 2026', t0: W('co-billion', 'vast', 0.6), size: 132, color: 'var(--amber)' },
      ],
      src: 'OpenAI figures, via TechCrunch (Feb 27 & Sep 29, 2026) · subscribers vs weekly users',
    },
    'co-question': { beat: 'type', text: 'So what are you paying with?', size: 92, cps: 20, color: 'var(--amber)', until: s('co-question') + 2.2 },

    // ---------------- exhibit A: the launch ----------------
    'a-launch': { beat: 'type', text: 'NOVEMBER 30, 2022', size: 110, cps: 14, sub: 'CHATGPT LAUNCHES · A FREE “RESEARCH PREVIEW”' },
    'a-critics': {
      beat: 'combo',
      parts: [
        { beat: 'doc', head: 'The Register', date: 'Dec 5, 2022', x: 150, y: 250, w: 980, rot: -1.6, quoteSize: 44,
          html: `Stack Overflow bans ChatGPT answers: “The average rate of getting ${HL('correct answers from ChatGPT is too low')}”`,
          hl: [[W('a-critics', 'unreliable', 0.2), W('a-critics', 'unreliable', 0.2) + 0.9]],
          stamp: { text: 'Banned', t: W('a-critics', 'unreliable', 0.25) + 0.5, right: 50 } },
        { beat: 'stats', items: [{ x: 1500, y: 520, value: 1000000, label: 'users in 5 days', t0: W('a-critics', 'million', 0.6), countDur: 1.2, size: 120, color: 'var(--amber)' }] },
      ],
      src: 'The Register (Dec 5, 2022) · Sam Altman on X (Dec 5, 2022)',
    },
    'a-why-free': {
      beat: 'doc', head: 'OpenAI · “Introducing ChatGPT”', date: 'Nov 30, 2022',
      html: `“We are excited to introduce ChatGPT ${HL('to get users’ feedback')} and learn about its strengths and weaknesses. During the research preview, usage of ChatGPT is free.”`,
      foot: 'openai.com/index/chatgpt', hl: [[W('a-why-free', 'get', 0.55), W('a-why-free', 'feedback', 0.9) + 0.4]], src: 'OpenAI launch post, Nov 30, 2022',
    },
    'a-gpt4': {
      beat: 'doc', head: 'OpenAI · GPT-4 System Card', date: 'Mar 2023',
      html: `“Since it ${HL('finished training in August of 2022')}, we have been evaluating, adversarially testing, and iteratively improving the model…”`,
      foot: 'cdn.openai.com/papers/gpt-4-system-card.pdf', hl: [[W('a-gpt4', 'finished', 0.3), W('a-gpt4', 'training', 0.45) + 0.5]],
      stamp: { text: '3 months before ChatGPT', t: W('a-gpt4', 'months', 0.7), right: 50, size: 46, rot: -4 },
      src: 'OpenAI GPT-4 System Card · public since Mar 2023, easy to miss',
    },
    'a-scale': {
      beat: 'doc', head: 'Kaplan et al. · OpenAI · “Scaling Laws for Neural Language Models”', date: 'Jan 2020', rot: 0.8,
      html: `“The loss scales as a power-law with ${HL('model size, dataset size, and the amount of compute')} used for training”`,
      foot: 'arxiv.org/abs/2001.08361', hl: [[W('a-scale', 'data', 0.45), W('a-scale', 'predictably', 0.8)]],
      src: 'Bigger model + more data + more compute → predictably lower error',
    },
    'a-refine': {
      beat: 'doc', head: 'OpenAI · “GPT-4”', date: 'Mar 14, 2023',
      html: `“We incorporated more human feedback, including ${HL('feedback submitted by ChatGPT users')}, to improve GPT-4’s behavior.”`,
      foot: 'openai.com/index/gpt-4', hl: [[W('a-refine', 'feedback', 0.5), W('a-refine', 'users', 0.95) + 0.3]], src: 'OpenAI GPT-4 announcement, Mar 14, 2023 (post-training, not pre-training)',
    },
    'a-reveal': {
      beat: 'combo',
      parts: [
        { beat: 'timeline', y: 640, events: [
          { t: s('a-reveal') + 0.0, x: 420, date: 'AUG 2022', title: 'GPT-4 trained', sub: 'not yet released', color: 'var(--red)', up: false },
          { t: s('a-reveal') + 0.45, x: 960, date: 'NOV 30, 2022', title: 'ChatGPT, free', sub: '“to get users’ feedback”', up: false },
          { t: s('a-reveal') + 0.9, x: 1500, date: 'MAR 14, 2023', title: 'GPT-4 released', sub: 'refined with ChatGPT feedback', up: false },
        ] },
        { beat: 'say', html: 'The free product was shaping the next one.', size: 66, y: 330, at: s('a-reveal') + 0.2, gap: 0.12 },
      ],
    },

    // ---------------- exhibit B: the wheel ----------------
    'b-name': {
      beat: 'combo', holdTo: 'b-loop',
      parts: [
        { beat: 'flywheel', labels: ['YOU USE IT', 'YOUR FEEDBACK', 'BETTER MODEL', 'MORE USERS'],
          stationTimes: [W('b-loop', 'use', 0.05), W('b-loop', 'feedback', 0.3), W('b-loop', 'model', 0.55), W('b-loop', 'more', 0.8)],
          spin: [[0, 0.05], [0.5, 0.25], [1, 1.1]], center: 'THE MODEL' },
        { beat: 'say', html: 'The data flywheel', cls: 'title', size: 54, y: 120, at: W('b-name', 'data', 0.7), gap: 0.12 },
      ],
      src: 'NVIDIA glossary: “a self-improving loop” where interaction data refines the model',
    },
    'b-thumbs': {
      beat: 'doc', holdTo: 'b-flatter', head: 'OpenAI · “Expanding on what we missed with sycophancy”', date: 'May 2, 2025', quoteSize: 46,
      html: `“…the update introduced an additional reward signal based on user feedback—${HL('thumbs-up and thumbs-down data from ChatGPT')}.”<br><br><span style="font-size:34px;color:#5b554b">“User feedback in particular can sometimes favor more agreeable responses”</span>`,
      foot: 'openai.com/index/expanding-on-sycophancy', hl: [[W('b-thumbs', 'thumbs', 0.45), W('b-thumbs', 'ChatGPT', 0.75) + 0.3]],
      stamp: { text: 'Rolled back · Apr 2025', t: W('b-flatter', 'rolled', 0.5), right: 60, size: 50 },
      src: 'OpenAI postmortem on the GPT-4o update, May 2, 2025',
    },
    'b-reveal': { beat: 'say', html: 'You’re not just the customer.<br><span style="color:var(--amber)">You’re part of the wheel.</span>', size: 88, gap: 0.14 },

    // ---------------- exhibit C: the graveyard ----------------
    'c-rush': {
      beat: 'grid', holdTo: 'c-pdf',
      cards: [
        { cat: 'Documents', name: 'Chat with your PDF' }, { cat: 'Documents', name: 'Document Q&A' }, { cat: 'Bots', name: 'Chatbot builder' }, { cat: 'Writing', name: 'AI writing assistant' },
        { cat: 'Research', name: 'Research assistant' }, { cat: 'Web', name: 'Browser agent' }, { cat: 'Dev tools', name: 'Agent builder' }, { cat: 'Web', name: 'AI browser' },
      ],
      releases: [{ t: W('c-pdf', 'PDFs', 0.35), date: 'OCT 2023', title: 'ChatGPT reads your PDFs', kills: ['Chat with your PDF', 'Document Q&A'] }],
    },
    'c-steamroll': {
      beat: 'doc', head: 'Sam Altman · 20VC podcast', date: 'Apr 2024', quoteSize: 48,
      html: `<span style="font-size:32px;color:#5b554b">On startups that bet the models won’t improve:</span><br>they get “steamrolled” — ${HL('“Not because we don’t like you, but because we have a mission.”')}`,
      hl: [[W('c-steamroll', 'steamrolled', 0.9) - 0.2, W('c-steamroll', 'steamrolled', 0.9) + 1.3]],
      stamp: { text: 'Steamrolled', t: W('c-steamroll', 'steamrolled', 0.9), right: 60 },
      src: '20VC with Harry Stebbings (Apr 2024), as quoted by The Decoder',
    },
    'c-doors': {
      beat: 'grid',
      cards: [
        { cat: 'Documents', name: 'Chat with your PDF' }, { cat: 'Documents', name: 'Document Q&A' }, { cat: 'Bots', name: 'Chatbot builder' }, { cat: 'Writing', name: 'AI writing assistant' },
        { cat: 'Research', name: 'Research assistant' }, { cat: 'Web', name: 'Browser agent' }, { cat: 'Dev tools', name: 'Agent builder' }, { cat: 'Web', name: 'AI browser' },
      ],
      releases: [
        { t: s('c-doors') - 2.0, date: 'OCT 2023', title: 'ChatGPT reads your PDFs', kills: ['Chat with your PDF', 'Document Q&A'] },
        { t: s('c-doors') + 0.2, date: 'NOV 2023', title: 'Custom GPTs · Assistants API', kills: ['Chatbot builder', 'AI writing assistant'] },
        { t: W('c-doors', 'next', 0.55), date: '2025', title: 'Deep Research · Operator · AgentKit · Atlas', kills: ['Research assistant', 'Browser agent', 'Agent builder', 'AI browser'] },
      ],
      src: 'Illustrative categories · launches: OpenAI, TechCrunch (2023–2025) · many companies survived; thin wrappers felt it most',
    },

    // ---------------- exhibit D: the acceleration ----------------
    'd-coders': {
      beat: 'doc', holdTo: 'd-mandate', head: 'Shopify · CEO memo to staff', date: 'Apr 2025', x: 300, w: 1320, quoteSize: 58,
      html: `“${HL('Reflexive AI usage is now a baseline expectation')} at Shopify.”`,
      hl: [[s('d-coders') + 0.6, s('d-coders') + 2.0]],
      stamp: { text: 'Official', t: W('d-mandate', 'official', 0.5), right: 60 },
      src: 'Tobi Lütke memo (Apr 2025) · similar mandates: Duolingo, Coinbase; Microsoft (reported)',
    },
    'd-2pct': {
      beat: 'chart', holdTo: 'd-80pct', drawFrom: W('d-2pct', 'two', 0.5), drawTo: W('d-80pct', 'eighty', 0.6),
      title: '<div class="kicker">Exhibit D · Evidence</div><div class="title" style="font-size:58px;margin-top:12px">Share of real GitHub issues an AI could fix</div>',
      foot: 'SWE-bench (Oct 2023, original set) → SWE-bench Verified (2024–26). Different test versions; lab-reported; OpenAI later called the test contaminated.',
      y: 270, h: 560,
      points: [
        { fx: 0.03, v: 1.96, label: '2%', sub: 'OCT 2023 · Claude 2', t: W('d-2pct', 'two', 0.5), dx: 90 },
        { fx: 0.4, v: 33.2, label: '33%', sub: 'AUG 2024 · GPT-4o', t: (W('d-2pct', 'two', 0.5) + W('d-80pct', 'eighty', 0.6)) / 2 },
        { fx: 0.95, v: 80.8, label: '~80%', sub: 'FEB 2026 · Claude Opus 4.6', t: W('d-80pct', 'eighty', 0.6), dx: -170, dy: -150 },
      ],
      src: 'Jimenez et al. 2023 · OpenAI (Aug 2024) · Anthropic (Feb 2026)',
    },
    'd-opus55': {
      beat: 'doc', head: 'Anthropic · Introducing Claude Opus 5.5', date: 'Sep 22, 2026', quoteSize: 50,
      html: `“We’re introducing Claude Opus 5.5… It ${HL('performs at the level of Claude Fable 5.1 on most work')} and costs 40% less to run than Opus 5.”`,
      hl: [[W('d-opus55', 'level', 0.5) - 0.3, W('d-opus55', 'work', 0.95) + 0.2]], src: 'Anthropic (Sep 22, 2026) · vendor claim',
    },
    'd-code': {
      beat: 'doc', head: 'GitHub Blog · Copilot interaction data policy', date: 'Mar 25, 2026', quoteSize: 42,
      html: `<span style="font-family:Oswald;font-size:64px;text-transform:uppercase">${HL('Real-world data = smarter models')}</span><br><br>“From April 24 onward, interaction data… from Copilot Free, Pro, and Pro+ users will be used to train and improve our AI models unless they opt out.”`,
      hl: [[W('d-code', 'real', 0.6) - 0.1, W('d-code', 'models', 0.95) + 0.2]], src: 'GitHub Blog, Mar 25, 2026 · Business & Enterprise excluded',
    },

    // ---------------- exhibit E: the price ----------------
    'e-why': {
      beat: 'ledger', holdTo: 'e-data', title: 'Who pays for “free”?', y: 200,
      rows: [
        { text: 'Investor billions', note: '$110B round · Feb 2026', t: W('e-list', 'investor', 0.05) },
        { text: 'A race for users', note: 'free plans for millions · 2025', t: W('e-list', 'race', 0.3) },
        { text: 'Ads', note: 'in free ChatGPT since Feb 2026', t: W('e-list', 'ads', 0.55) },
        { text: 'Falling costs', note: '~10× cheaper per year, same capability', t: W('e-list', 'falling', 0.75) },
        { text: 'Your data', note: 'consumer default: on', t: W('e-data', 'data', 0.6), big: true },
      ],
      src: 'TechCrunch/AP (Feb 2026) · Outlook Business, Engadget (2025) · NBC (Feb 2026) · a16z “LLMflation” (2024)',
    },
    'e-optout': {
      beat: 'toggle', title: 'SETTINGS › DATA CONTROLS · ILLUSTRATION', row: 'Improve the model for everyone',
      note: 'On by default for consumer chats · fewer than 5% of users change any settings',
      src: 'OpenAI Help Center · Jared Spool, UIE (2011) · similar switches at Anthropic, Google, GitHub',
    },
    'e-trade': { beat: 'say', html: 'It’s a trade — and often a good one.<br><span style="font-size:52px;color:var(--dim)">You get a better tool. They get a better model.</span>', size: 82, gap: 0.12 },
    'e-thin': { beat: 'say', html: 'Thin wrapper? <span style="color:var(--amber)">Please, wait.</span><br><span style="font-size:60px;color:var(--dim)">The wheel won’t.</span>', size: 96, gap: 0.22 },

    // ---------------- closing: the one asset ----------------
    'f-build': {
      beat: 'triple', color: DARK, size: 170,
      words: [{ text: 'Build.', t: W('f-build', 'build', 0.35) }, { text: 'Raise.', t: W('f-build', 'raise', 0.6) }, { text: 'Ship.', t: W('f-build', 'ship', 0.85) }],
    },
    'f-asset': { beat: 'say', html: 'But your biggest asset<br>is not on that list.', size: 96, color: DARK, gap: 0.14 },
    'f-attention': {
      beat: 'pillars', holdTo: 'f-body', push: 0.02,
      items: [
        { t: s('f-attention'), label: 'ATTENTION', stat: '47 sec', text: 'average time on one screen before switching', source: 'Gloria Mark, UC Irvine', verb: 'Guard it.', verbT: W('f-attention', 'guard', 0.92),
          icon: '<svg width="140" height="90" viewBox="0 0 140 90"><path d="M5 45 Q70 -15 135 45 Q70 105 5 45Z" fill="none" stroke="#7a4b1c" stroke-width="5"/><circle cx="70" cy="45" r="20" fill="#7a4b1c"/></svg>' },
        { t: s('f-mind'), label: 'MIND', stat: '50% vs 67%', statSize: 92, text: 'quiz scores after learning with AI vs by hand', source: 'Anthropic randomized trial, Jan 2026 · 52 engineers', verb: 'Train it.', verbT: W('f-mind', 'train', 0.93),
          icon: '<svg width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#7a4b1c" stroke-width="5"/><path d="M60 15 V105 M30 40 Q60 55 90 40 M30 80 Q60 65 90 80" stroke="#7a4b1c" stroke-width="5" fill="none"/></svg>' },
        { t: s('f-body'), label: 'BODY & MIND', stat: '43%', text: 'fewer poor mental-health days among people who exercise', source: 'Chekroud et al., Lancet Psychiatry 2018 · association', verb: 'Move it.', verbT: W('f-body', 'move', 0.93),
          icon: '<svg width="130" height="120" viewBox="0 0 130 120"><path d="M65 110 L15 60 A28 28 0 0 1 65 22 A28 28 0 0 1 115 60 Z" fill="none" stroke="#7a4b1c" stroke-width="5"/><path d="M25 62 H50 L58 45 L70 80 L78 62 H105" fill="none" stroke="#7a4b1c" stroke-width="5"/></svg>' },
      ],
    },
    'f-update': { beat: 'say', html: 'No release will update you.<br>Only you can.', size: 92, color: DARK, gap: 0.14 },
    'f-final': { beat: 'say', html: 'Invest consciously.', size: 150, color: DARK, gap: 0.35, push: 0.03 },
  };

  window.ENDCARD = { title: 'THE FLYWHEEL', lines: ['Every claim on screen is sourced.', 'Full source list in the description.'] };
})();
