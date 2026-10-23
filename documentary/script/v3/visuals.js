// v3 shot list: what is on screen under each line (VISUALS: the evidence, on top) and, from Exhibit A on,
// the cinematic 3D B-roll under it (BROLL: broll/shots/*.js). No quote is voiced by anyone but the narrator.
// Times come from the recorded performances (T: line timings, W: word timestamps from ElevenLabs alignment).
(() => {
  const T = window.TIMINGS.lines;
  const s = (id) => T[id].start;
  const e = (id) => T[id].end;
  const HL = (txt) => `<span class="hl">${txt}</span>`;
  const DARK = '#2a1d14';
  const Q = (words) => `Words: ${words} · quoted by the narrator`;

  window.VISUALS = {
    // ---------------- cold open: a billion whispers ----------------
    'co-v1': {
      beat: 'whispers', until: e('co-v6'), push: 0.06,
      spoken: [
        { text: 'Fix my cover letter?', t: s('co-v1'), x: 260, y: 420 },
        { text: 'Why won’t my code run?', t: s('co-v2'), x: 1120, y: 230 },
        { text: 'Is this contract fair?', t: s('co-v3'), x: 1150, y: 700 },
        { text: 'Plan my week.', t: s('co-v4'), x: 300, y: 210 },
        { text: 'Help me say sorry.', t: s('co-v5'), x: 720, y: 560 },
        { text: 'Am I doing this right?', t: s('co-v6'), x: 690, y: 380 },
      ],
      filler: ['Summarize this.', 'Translate this email.', 'What should I cook tonight?', 'Explain this error.', 'Rewrite this politely.', 'Is this normal?',
        'Make it shorter.', 'What does this mean?', 'Check my math.', 'Write a toast.', 'Fix the bug.', 'Should I take the job?'],
      labels: [],
    },
    'co-gift': { beat: 'type', text: 'It looks like a gift.', size: 96, cps: 15 },
    'co-billion': {
      beat: 'stats',
      items: [
        { x: 620, y: 470, value: 1200000000, label: 'weekly ChatGPT users · Sep 2026', t0: W('co-billion', 'billion', 0.3), countDur: 2.2, size: 132,
          fmt: (v) => (v >= 1.199e9 ? '1.2 BILLION+' : Math.round(v).toLocaleString('en-US')) },
        { x: 1400, y: 470, value: '~1 in 20', label: 'of 900M weekly users paid · Feb 2026', t0: W('co-billion', 'vast', 0.7), size: 132, color: 'var(--amber)' },
      ],
      src: 'OpenAI figures, via TechCrunch (Feb 27 & Sep 29, 2026) · subscribers and weekly users are different measures · no paid figure exists for 1.2B',
    },
    'co-question': {
      beat: 'combo', until: e('co-question') + 0.45,
      parts: [
        { beat: 'type', text: 'So what are you paying with?', size: 92, cps: 20, color: 'var(--amber)' },
        { beat: 'casefile', at: W('co-question', 'with', 0.85) + 0.05 },
      ],
    },

    // ---------------- exhibit A: the gift (archive reel) ----------------
    'a-launch': { beat: 'type', text: 'NOVEMBER 30, 2022', size: 110, cps: 14, sub: 'CHATGPT LAUNCHES · A FREE “RESEARCH PREVIEW”' },
    'a-critics': {
      beat: 'combo',
      parts: [
        { beat: 'doc', head: 'The Register', date: 'Dec 5, 2022', x: 150, y: 250, w: 980, rot: -1.6, quoteSize: 42,
          html: `Stack Overflow temporarily bans ChatGPT answers: “The average rate of getting ${HL('correct answers from ChatGPT is too low')}”`,
          hl: [[W('a-critics', 'unreliable', 0.2), W('a-critics', 'unreliable', 0.2) + 1.0]],
          stamp: { text: 'Temporary ban', t: W('a-critics', 'unreliable', 0.25) + 1.0, right: 40, size: 46 } },
        { beat: 'stats', items: [{ x: 1500, y: 470, value: 1000000, label: 'users in 5 days', t0: W('a-critics', 'million', 0.6), countDur: 1.2, size: 120, color: 'var(--amber)' }] },
        { beat: 'label', text: 'SAM ALTMAN ON X, DEC 5, 2022: “TODAY IT CROSSED 1 MILLION USERS!”', pos: { left: '1160px', top: '600px', width: '680px', textAlign: 'center' }, size: 17, at: W('a-critics', 'million', 0.6) + 0.5 },
      ],
      src: 'The Register (Dec 5, 2022) · Sam Altman on X (Dec 5, 2022)',
    },
    'a-whyfree': {
      beat: 'doc', head: 'OpenAI · “Introducing ChatGPT”', date: 'Nov 30, 2022', x: 120, w: 1060, rot: -1.4,
      html: `“We are excited to introduce ChatGPT ${HL('to get users’ feedback')} and learn about its strengths and weaknesses. During the research preview, usage of ChatGPT is free.”`,
      foot: 'openai.com/index/chatgpt', label: Q('OpenAI launch post (Nov 30, 2022)'),
      hl: [[W('a-whyfree', 'get', 0.75), W('a-whyfree', 'feedback', 0.95) + 0.4]],
      isolate: [e('a-whyfree') + 0.05, s('a-gpt4') - 0.1], src: 'OpenAI launch post, Nov 30, 2022',
    },
    'a-gpt4': {
      beat: 'doc', head: 'OpenAI · GPT-4 System Card', date: 'Mar 2023', x: 120, w: 1060, flash: { text: 'AUG 2022', t: W('a-gpt4', 'trained', 0.45) },
      html: `“Since it ${HL('finished training in August of 2022')}, we have been evaluating, adversarially testing, and iteratively improving the model and the system-level mitigations around it.”`,
      foot: 'cdn.openai.com/papers/gpt-4-system-card.pdf', hl: [[W('a-gpt4', 'trained', 0.45), W('a-gpt4', 'trained', 0.45) + 1.1]],
      stamp: { text: '3 months before ChatGPT', t: W('a-gpt4', 'months', 0.75) + 0.2, right: 50, size: 44, rot: -4 },
      src: 'OpenAI GPT-4 System Card, Mar 14, 2023',
    },
    'a-scale': {
      beat: 'doc', head: 'Kaplan et al. · OpenAI · “Scaling Laws…”', date: 'Jan 2020', rot: 0.8, x: 860, y: 560, w: 960, quoteSize: 34, at: W('a-scale', 'models', 0.4) - 0.3,
      html: `“The loss scales as a power-law with ${HL('model size, dataset size, and the amount of compute')} used for training…”`,
      foot: 'arxiv.org/abs/2001.08361', hl: [[W('a-scale', 'models', 0.4), W('a-scale', 'compute', 0.75) + 0.3]],
      src: 'Bigger model + more data + more compute → predictably lower error',
    },
    'a-refine': {
      beat: 'combo', src: 'OpenAI GPT-4 announcement (Mar 14, 2023) · GPT-4 System Card · post-training, not pre-training',
      parts: [
        { beat: 'doc', head: 'OpenAI · GPT-4 announcement', date: 'Mar 14, 2023', x: 150, w: 1080, rot: -1.2, quoteSize: 50,
          html: `“We incorporated more human feedback, including ${HL('feedback submitted by ChatGPT users')}, to improve GPT-4’s behavior.”`,
          foot: 'openai.com/index/gpt-4', label: Q('OpenAI GPT-4 announcement (Mar 14, 2023)'),
          hl: [[W('a-refine', 'including', 0.5) + 0.2, W('a-refine', 'users', 0.95) + 0.2]] },
        { beat: 'record', at: W('a-refine', 'including', 0.5) - 0.1, x: 1270, y: 300, w: 560,
          lines: [
            { text: 'Documented: feedback from ChatGPT users, and answers users flagged as not factual.', t: W('a-refine', 'including', 0.5), cps: 70, size: 26 },
            { text: 'Not every chat.', t: W('a-refine', 'users', 0.95) + 0.1, size: 34, cps: 40 },
          ],
          quote: { text: '“we collect real-world ChatGPT data that has been flagged by users as being not factual” — OpenAI, GPT-4 System Card', t: W('a-refine', 'users', 0.95) + 0.4 } },
      ],
    },
    'a-reveal': {
      beat: 'combo',
      parts: [
        { beat: 'timeline', y: 640, events: [
          { t: s('a-reveal') + 0.0, x: 420, date: 'AUG 2022', title: 'GPT-4 trained', sub: 'not yet released', color: 'var(--red)', up: false },
          { t: s('a-reveal') + 0.45, x: 960, date: 'NOV 30, 2022', title: 'ChatGPT, free', sub: '“to get users’ feedback”', up: false },
          { t: s('a-reveal') + 0.9, x: 1500, date: 'MAR 14, 2023', title: 'GPT-4 released', sub: 'refined partly with ChatGPT feedback', up: false },
        ] },
        { beat: 'say', html: 'The free product was shaping the next one.', size: 66, y: 330, at: s('a-reveal') + 0.2, gap: 0.1 },
      ],
    },

    // ---------------- exhibit B: the wheel ----------------
    'b-name': {
      beat: 'combo', holdTo: 'b-more',
      parts: [
        { beat: 'flywheel', labels: ['YOU USE IT', 'YOUR FEEDBACK', 'BETTER MODEL', 'MORE USERS'],
          stationTimes: [W('b-use', 'use', 0.4), W('b-signal', 'feedback', 0.4), W('b-more', 'model', 0.3), W('b-more', 'more', 0.7)],
          spin: [[0, 0.05], [0.35, 0.2], [0.7, 0.5], [1, 1.1]], center: 'THE MODEL', r: 390 },
        { beat: 'say', html: 'The data flywheel', cls: 'title', size: 54, y: 110, at: W('b-name', 'data', 0.7), gap: 0.12 },
        { beat: 'bubbles', items: [
          { text: 'Summarize this.', t: s('b-use-v') - 0.15, x: 1300, y: 860, to: [960, 190], dur: 1.4 },
          { text: 'Perfect. Thumbs up. 👍', t: W('b-signal-v', 'perfect', 0.2) - 0.15, x: 1450, y: 820, to: [1350, 560], dur: 1.9 },
        ] },
        { beat: 'label', text: 'ILLUSTRATIVE · AI VOICES', pos: { right: '64px', top: '100px' }, at: s('b-use-v') - 0.2 },
      ],
      src: 'NVIDIA glossary: “a self-improving loop” · a vendor’s definition',
    },
    'b-thumbs': {
      beat: 'doc', holdTo: 'b-flatter', head: 'OpenAI · “Expanding on what we missed with sycophancy”', date: 'May 2, 2025', quoteSize: 42, clean: true, x: 140, w: 1120,
      html: `“…an additional reward signal based on user feedback—${HL('thumbs-up and thumbs-down data from ChatGPT')}.”<br><br><span style="font-size:32px;color:#5b554b">“User feedback in particular can sometimes favor more agreeable responses”</span>`,
      foot: 'openai.com/index/expanding-on-sycophancy', label: 'OpenAI postmortem (May 2, 2025) · shown, not voiced · the Apr 25, 2025 GPT-4o update',
      hl: [[W('b-thumbs', 'reward', 0.6), W('b-thumbs', 'data', 0.95) + 0.3]],
      stamp: { text: 'Rolled back · Apr 2025', t: W('b-flatter', 'rolled', 0.65) + 0.1, right: 60, size: 48 },
      gloss: { text: 'one of several factors, per OpenAI', t: W('b-flatter', 'rolled', 0.65) + 0.4 },
      src: 'OpenAI postmortem on the Apr 25, 2025 GPT-4o update · as quoted verbatim by Simon Willison (May 2, 2025)',
    },
    'b-reveal': {
      beat: 'combo',
      parts: [
        { beat: 'flywheel', labels: ['', '', '', ''], stationTimes: [s('b-reveal') - 0.3, s('b-reveal') - 0.3, s('b-reveal') - 0.3, s('b-reveal') - 0.3],
          spin: [[0, 1.4], [1, 2.2]], center: '', r: 420 },
        { beat: 'say', html: 'You’re not just the customer.', size: 88, gap: 0.14, y: 480 },
        { beat: 'say', html: '<span style="color:var(--amber)">You’re part of the wheel.</span>', size: 88, gap: 0.14, y: 600, at: W('b-reveal', 'part', 0.75) - 0.25 },
      ],
    },

    // ---------------- exhibit C: the steamroller ----------------
    'c-rush': {
      beat: 'combo', holdTo: 'c-hedge',
      parts: [
        { beat: 'label', text: 'OCT 2023 · CHATGPT READS YOUR PDFS · LIMITED PLUS ROLLOUT', pos: { left: '96px', top: '110px' }, size: 22, color: 'var(--red)', at: W('c-pdf', 'PDFs', 0.5) },
        { beat: 'label', text: 'ILLUSTRATIVE · NOT REAL COMPANIES', pos: { right: '64px', bottom: '120px' } },
        { beat: 'doc', at: s('c-died') - 0.15, until: s('c-hedge') + 0.1, head: 'Decrypt', date: 'Oct 31, 2023', x: 420, y: 630, w: 900, rot: -2, quoteSize: 44,
          html: '“Many startups just died today”', label: Q('AI researcher Alex Ker, via Decrypt') },
        { beat: 'record', at: s('c-hedge') - 0.1, x: 1040, y: 330, w: 800,
          lines: [
            { text: '“Died” was the reaction at the time, not a documented wave of shutdowns.', t: W('c-hedge', 'reaction', 0.1), cps: 90 },
            { text: 'Squeezed: Jasper (AI writing app) laid off staff and cut its internal valuation ~20% (2023).', t: W('c-hedge', 'thin', 0.4), size: 24, cps: 120 },
            { text: 'Bought: Cursor (AI code editor), valued at $29.3B (Nov 2025), joined SpaceX (Aug 2026).', t: W('c-hedge', 'strong', 0.7), size: 24, cps: 120 },
          ] },
      ],
      src: 'Decrypt (2023) · Maginative, citing The Information (2023) · AI Business (Nov 2025) · Cursor blog (Aug 2026)',
    },
    'c-steamroll': {
      beat: 'doc', from: W('c-steamroll', 'bet', 0.3) - 0.2, head: 'Sam Altman · 20VC podcast', date: 'Apr 2024', quoteSize: 40, x: 110, y: 110, w: 1060,
      html: `<span style="font-size:32px;color:#5b554b">On startups that bet the models won’t improve: they get steamrolled</span><br>${HL('“Not because we don’t like you, but because we have a mission.”')}`,
      label: 'Words: Sam Altman, 20VC (Apr 2024), via The Decoder · paraphrased in narration · quote shown, not voiced',
      hl: [[W('c-steamroll', 'steamrolled', 0.9) - 0.1, W('c-steamroll', 'steamrolled', 0.9) + 1.4]],
      stamp: { text: 'Steamrolled', t: W('c-steamroll', 'steamrolled', 0.9), right: 60 },
      src: '20VC with Harry Stebbings (Apr 2024), as quoted by The Decoder',
    },
    'c-doors': {
      beat: 'combo', until: e('c-doors') + 0.55,
      parts: [
        { beat: 'label', text: 'NOV 6, 2023 · CUSTOM GPTS · ASSISTANTS API', pos: { left: '96px', top: '110px' }, size: 22, color: 'var(--red)', at: W('c-doors', 'doors', 0.3) },
        { beat: 'label', text: '2025 · OPERATOR · DEEP RESEARCH · AGENTKIT · ATLAS', pos: { left: '96px', top: '150px' }, size: 22, color: 'var(--red)', at: W('c-doors', 'next', 0.55) },
        { beat: 'label', text: 'LAUNCHES: OPENAI, TECHCRUNCH · “NOW A FEATURE” ≠ SHUT DOWN', pos: { left: '0', right: '0', bottom: '120px', textAlign: 'center' } },
      ],
    },

    // ---------------- exhibit D: the acceleration ----------------
    'd-coders': { beat: 'label', text: 'FEB–MAY 2025 · CLAUDE CODE · OPENAI CODEX · COPILOT CODING AGENT GO PUBLIC', pos: { left: '0', right: '0', bottom: '120px', textAlign: 'center' }, size: 22 },
    'd-memos': {
      beat: 'combo', until: W('d-2pct', 'about', 0.3),
      parts: [
        { beat: 'doc', at: W('d-memos', 'shopify', 0.35) - 0.2, head: 'Shopify · CEO memo to staff', date: 'Apr 2025', x: 90, y: 160, w: 740, rot: -2.2, quoteSize: 36,
          html: '“Reflexive AI usage is now a baseline expectation at Shopify.”', label: 'Words: Tobi Lütke · shown, not voiced' },
        { beat: 'doc', at: W('d-memos', 'microsoft', 0.65) - 0.2, head: 'Microsoft developer division memo', date: 'Jun 2025', x: 1090, y: 150, w: 740, rot: 1.6, quoteSize: 34,
          html: '“using AI is no longer optional—it’s core to every role and every level.”', label: 'Leaked memo, as reported by Business Insider, via PC Gamer · shown, not voiced',
          stamp: { text: 'Reported', t: W('d-memos', 'reportedly', 0.75), right: 40, size: 40 } },
        { beat: 'doc', at: W('d-memos', 'use', 0.25), head: 'Coinbase · CEO Brian Armstrong, recalling it on a podcast', date: 'said Aug 2025', x: 560, y: 640, w: 860, rot: -0.8, quoteSize: 28,
          html: 'Engineers told to onboard to AI coding tools (GitHub Copilot, Cursor): “at least onboard by the end of the week”. Some who didn’t were fired.', label: 'TechCrunch · shown, not voiced' },
        { beat: 'label', text: 'GENERAL AI-USE MANDATES · NOT COPILOT-SPECIFIC', pos: { left: '0', right: '0', top: '96px', textAlign: 'center' }, at: W('d-memos', 'use', 0.25) + 0.3 },
      ],
      src: 'Tobi Lütke memo, posted on X (Apr 2025), via Digital Commerce 360 · Business Insider, via PC Gamer (Jun 29, 2025) · TechCrunch (Aug 22, 2025)',
    },
    'd-2pct': {
      beat: 'combo', from: W('d-2pct', 'about', 0.3) - 0.6, holdTo: 'd-80pct',
      parts: [
        { beat: 'label', text: 'EXHIBIT D · EVIDENCE · SHARE OF REAL GITHUB ISSUES AN AI COULD FIX', pos: { left: '96px', top: '100px' }, size: 24 },
        { beat: 'label', text: 'SWE-bench (Oct 2023, original set) → SWE-bench Verified (2024–26) · different test versions · lab-reported · OpenAI later called the test contaminated',
          pos: { left: '0', right: '0', bottom: '128px', textAlign: 'center' }, size: 18, color: 'rgba(236,230,218,.8)' },
      ],
      src: 'Jimenez et al. 2023 · OpenAI (Aug 2024) · Anthropic (Feb 5, 2026)',
    },
    'd-opus55': {
      beat: 'doc', head: 'Anthropic · Introducing Claude Opus 5.5', date: 'Sep 22, 2026', quoteSize: 42, clean: true, x: 120, w: 1080,
      html: `“We’re introducing Claude Opus 5.5, the first model in our new Claude 5.5 family. It ${HL('performs at the level of Claude Fable 5.1 on most work')} and costs 40% less to run than Opus 5.”`,
      hl: [[W('d-opus55', 'level', 0.5) - 0.3, W('d-opus55', 'work', 0.95) + 0.2]],
      gloss: { text: 'Fable 5.1 = Anthropic’s larger model', t: W('d-opus55', 'Fable', 0.7) },
      label: 'Anthropic · vendor claim', src: 'Anthropic (Sep 22, 2026) · vendor claim',
    },
    'd-code': {
      beat: 'combo', holdTo: 'd-github', until: e('d-github'),
      parts: [
        { beat: 'doc', head: 'GitHub Blog · Copilot interaction data policy', date: 'Mar 25, 2026', quoteSize: 32, clean: true, x: 120, w: 1120,
      html: `“From April 24 onward, interaction data… from Copilot Free, Pro, and Pro+ users ${HL('will be used to train and improve our AI models unless they opt out')}.”<br><br>` +
        `<span style="font-size:46px">“We believe the future of AI-assisted development depends on ${HL('real-world interaction data')} from ${HL('developers like you')}.”</span><br><br>` +
        `<span style="font-size:26px;color:#5b554b">Anthropic, Aug 28, 2025, on Claude Free, Pro and Max chats and coding sessions, if users allow it: “This creates a feedback loop that helps models get better over time.”</span>`,
      label: Q('GitHub Blog (Mar 25, 2026)') + ' · personal plans · opt-out available',
      hl: [[W('d-code', 'personal', 0.3), W('d-code', 'plans', 0.9) + 0.4], [W('d-github', 'real', 0.6), W('d-github', 'data', 0.75) + 0.3], [W('d-github', 'developers', 0.85), W('d-github', 'you', 0.97) + 0.15]] }],
      src: 'GitHub Blog (Mar 25, 2026) · Anthropic consumer terms (Aug 28, 2025) · business plans excluded by default',
    },

    // ---------------- exhibit E: the price ----------------
    'e-why': {
      beat: 'ledger', until: W('e-data', 'paid', 0.5) - 0.2, title: 'Who pays for “free”?', y: 190, x: 360, w: 1200, isolateAt: 1e9,
      rows: [
        { text: 'Investor billions', note: '$110B round · Feb 2026', t: W('e-list', 'investor', 0.05) },
        { text: 'A race for users', note: 'free plans for millions in India · 2025', t: W('e-list', 'race', 0.3) },
        { text: 'Ads', note: 'tests from Feb 2026 · can be matched to your chats · OpenAI says advertisers don’t see them', t: W('e-list', 'ads', 0.55) },
        { text: 'Falling costs', note: '~10× cheaper per year, same capability', t: W('e-list', 'falling', 0.75) },
      ],
      src: 'AP, TechCrunch (Feb 2026) · Outlook Business, Engadget (2025) · NBC News (Feb 2026) · a16z “LLMflation” (2024)',
    },
    'e-data': {
      beat: 'combo', holdTo: 'e-yours', whip: false,
      parts: [
        { beat: 'label', text: 'YOUR DATA', pos: { left: '0', right: '0', top: '150px', textAlign: 'center' }, size: 40, color: 'var(--amber)', at: W('e-data', 'data', 0.6) },
        { beat: 'label', text: 'CHATGPT CONSUMER DEFAULT: ON · BUSINESS AND API PLANS EXCLUDED BY DEFAULT · OPT-OUTS EXIST', pos: { left: '0', right: '0', bottom: '110px', textAlign: 'center' }, size: 18, color: 'rgba(236,230,218,.8)', at: W('e-data', 'data', 0.6) + 0.4 },
      ],
    },
    'e-switch': {
      beat: 'combo',
      parts: [
        { beat: 'toggle', until: W('e-switch', 'most', 0.5) + 0.1, title: 'ILLUSTRATION · NOT A REAL SCREEN · SETTINGS › DATA CONTROLS', row: 'Improve the model for everyone',
          note: 'Opting out is one switch away', flipAt: W('e-switch', 'switch', 0.3) + 0.15 },
        { beat: 'settings', at: W('e-switch', 'most', 0.5) - 0.2, label: 'ILLUSTRATIVE · ONE SMALL 2011 SURVEY OF SOFTWARE SETTINGS (MICROSOFT WORD USERS), NOT AI DATA CONTROLS',
          quote: '“Less than 5% of the users we surveyed had changed any settings at all.” — Jared Spool, UIE (2011)' },
        { beat: 'record', at: s('e-switch') + 0.1, x: 1180, y: 690, w: 680,
          lines: [{ text: 'ChatGPT: on by default for consumer chats, free and paid · business and API plans excluded by default · opt-outs exist at OpenAI, Anthropic, Google and GitHub', size: 21, t: s('e-switch') + 0.2, cps: 160 }] },
      ],
    },
    'e-trade': { beat: 'say', html: 'It’s a trade — often a good one.<br><span style="font-size:52px;color:var(--amber)">Just know what you’re trading.</span>', size: 82, gap: 0.1, push: 0.08 },

    // ---------------- verdict: a warning to builders ----------------
    'v-founder': { beat: 'wrapper', pitch: 'So our app just calls the model—', pitchT: s('v-founder'), freezeT: e('v-founder'), label: 'ILLUSTRATIVE PITCH · AI VOICE', push: 0.08 },
    'v-thin': {
      beat: 'combo', holdTo: 'v-wheel', until: e('v-wheel') + 3.4, push: 0.02,
      parts: [
        { beat: 'say', html: 'Thin wrapper?', size: 96, y: 430, at: W('v-thin', 'thin', 0.25) - 0.1, until: e('v-wheel') + 1.6 },
        { beat: 'say', html: '<span style="color:var(--amber)">Wait.</span>', size: 120, y: 560, at: W('v-thin', 'wait', 0.9) - 0.05, until: e('v-wheel') + 1.6 },
        { beat: 'say', html: 'The wheel won’t.', size: 84, y: 720, at: s('v-wheel') - 0.05, until: e('v-wheel') + 1.6 },
      ],
    },

    // ---------------- closing: the one asset (dawn) ----------------
    'f-build': {
      beat: 'triple', color: DARK, size: 170,
      words: [{ text: 'Build.', t: W('f-build', 'build', 0.45) }, { text: 'Raise.', t: W('f-build', 'raise', 0.62) }, { text: 'Ship.', t: W('f-build', 'ship', 0.85) }],
    },
    'f-asset': { beat: 'say', html: 'But your biggest asset<br>isn’t on that list.', size: 96, color: DARK, gap: 0.14 },
    'f-attention': {
      beat: 'asset', holdTo: 'f-echo1', label: 'ATTENTION', stat: '47 sec', text: 'average time on one screen before switching (about 2½ min in 2004)',
      source: 'Gloria Mark, UC Irvine · measures switching, not “attention span”', verb: 'Guard it.', verbT: W('f-attention', 'guard', 0.92),
    },
    'f-mind': {
      beat: 'asset', holdTo: 'f-echo2', label: 'MIND', stat: '50% vs 67%', statSize: 96, text: 'quiz scores after learning a new library with AI vs by hand',
      source: 'Anthropic randomized trial, Jan 2026 · 52 engineers · asking AI to explain helped', verb: 'Train it.', verbT: W('f-mind', 'train', 0.93),
    },
    'f-body': {
      beat: 'asset', holdTo: 'f-echo3', label: 'HEALTH', stat: '43%', text: 'fewer poor mental-health days among people who exercise',
      source: 'Chekroud et al., Lancet Psychiatry 2018 · 1.2M Americans · an association', verb: 'Move it.', verbT: W('f-body', 'move', 0.93),
    },
    'f-update': {
      beat: 'combo',
      parts: [
        { beat: 'say', html: 'No release will update you.', size: 92, color: DARK, gap: 0.14, y: 480 },
        { beat: 'say', html: 'Only you can.', size: 92, color: DARK, gap: 0.14, y: 600, at: W('f-update', 'only', 0.75) - 0.1 },
      ],
    },
    'f-final': { beat: 'say', html: 'Invest consciously.', size: 150, color: DARK, gap: 0.35, push: 0.03 },
  };

  // ---------------- B-roll: the cinematic 3D footage under the evidence ----------------
  // Each entry is one continuous shot from `from` to `to` (film seconds); option times are local to the shot.
  const card = { B: e('a-reveal') + 0.25, C: e('b-reveal') + 0.25, D: e('c-doors') + 0.3, E: e('d-github') + 0.6 };
  const dawn = e('v-wheel') + 2.9;
  const R = (shot, from, to, opts = {}, extra = {}) => ({ shot, from, to, opts, ...extra });
  const L = (t, from) => +(t - from).toFixed(3);   // film time -> shot-local time
  const at = {};
  at.city = s('a-launch') - 0.3;
  at.scale = s('a-scale') - 0.3;
  at.roll = s('c-steamroll') - 0.3;
  at.doors = s('c-doors') - 0.3;
  at.chart = W('d-2pct', 'about', 0.3) - 0.9;
  at.person = s('e-data') - 0.3;
  at.eye = s('f-attention') - 0.3;
  at.mind = s('f-mind') - 0.3;
  window.BROLL = [
    // Exhibit A (graded sepia): the launch spreads over a city at night
    R('night_city', at.city, e('a-critics') + 0.3, { waveFrom: (W('a-launch', 'free', 0.9) - at.city) / (e('a-critics') + 0.3 - at.city), waveTo: 0.95, seed: 3 }),
    R('feedback_stream', s('a-whyfree') - 0.3, e('a-whyfree') + 0.3, { icon: 'bubble', seed: 11 }),
    R('server_hall', s('a-gpt4') - 0.3, e('a-gpt4') + 0.3, { mode: 'dolly' }),
    R('server_hall', at.scale, e('a-scale') + 0.3, { mode: 'reveal', pulses: ['models', 'data', 'compute'].map((w) => L(W('a-scale', w, 0.5), at.scale)) }),
    R('feedback_stream', s('a-refine') - 0.3, e('a-refine') + 0.3, { icon: 'mixed', seed: 12 }),
    // the wheel appears on the reveal and spins up under the Exhibit B card
    R('flywheel_3d', s('a-reveal') - 0.3, s('b-name') - 0.1, { mode: 'hero', spin: [[0, 0.02], [0.6, 0.08], [1, 0.25]] }, { fadeOut: 0.3 }),
    // Exhibit B (cold steel)
    R('flywheel_3d', s('b-name') - 0.3, e('b-more') + 0.3, { mode: 'hero', spin: [[0, 0.25], [1, 0.6]] }, { opacity: 0.4, blur: 3, fadeIn: 0.3 }),
    R('feedback_stream', s('b-thumbs') - 0.3, e('b-flatter') + 0.3, { icon: 'thumb', seed: 21 }),
    R('flywheel_3d', s('b-reveal') - 0.3, card.C, { mode: 'reveal', spin: [[0, 0.5], [1, 0.8]] }, { fadeOut: 0.05 }),
    // Exhibit C
    R('startup_field', s('c-rush') - 0.3, s('c-died') - 0.2, { mode: 'field', seed: 5 }),
    R('startup_field', s('c-died') - 0.2, e('c-hedge') + 0.3, { mode: 'field', seed: 9, variant: 'b' }, { fadeIn: 0.05 }),
    R('startup_field', at.roll, e('c-steamroll') + 0.3, { mode: 'roll', seed: 5, rollFrom: L(W('c-steamroll', 'bet', 0.3), at.roll), rollTo: L(W('c-steamroll', 'steamrolled', 0.9) + 0.5, at.roll) }),
    R('doors_corridor', at.doors, e('c-doors') + 0.05, { closeAt: L(W('c-doors', 'next', 0.55), at.doors), closeDur: e('c-doors') - W('c-doors', 'next', 0.55) }, { fadeOut: 0.01 }),
    // Exhibit D: from the black on the door latch straight into the code tunnel under the card
    R('code_tunnel', card.D, e('d-coders') + 0.3, { speed: [[0, 6], [0.5, 14], [1, 30]] }, { fadeIn: 0.02 }),
    R('office_screens', s('d-memos') - 0.3, e('d-memos') + 0.3, { waveAt: 0.2, waveDur: 2.5 }),
    R('rising_chart', at.chart, e('d-80pct') + 0.3, {
      drawFrom: L(W('d-2pct', 'two', 0.5), at.chart), drawTo: L(W('d-80pct', 'eighty', 0.6) + 0.4, at.chart),
      points: [{ fx: 0.03, v: 1.96, label: '2%', sub: 'OCT 2023 · CLAUDE 2' }, { fx: 0.45, v: 33.2, label: '33%', sub: 'AUG 2024 · GPT-4o' },
        { fx: 0.95, v: 80.8, label: '~80%', sub: 'FEB 2026 · CLAUDE OPUS 4.6' }] }),
    R('server_hall', s('d-opus55') - 0.3, e('d-opus55') + 0.3, { mode: 'dolly' }),
    R('office_screens', s('d-code') - 0.3, e('d-github') + 0.05, { waveAt: -10, waveDur: 0.1 }, { fadeOut: 0.01 }),
    // Exhibit E: the race for users, then the price in silence
    R('globe_users', card.E, e('e-list') + 0.3, { growFrom: 0.1, growTo: 1, arcs: true }, { opacity: 0.55, fadeIn: 0.02 }),
    R('particle_person', at.person, e('e-yours') + 0.9, { dissolveAt: L(W('e-data', 'data', 0.6), at.person), dissolveDur: e('e-yours') + 0.5 - W('e-data', 'data', 0.6) }, { scrim: 0.4 }),
    R('flywheel_3d', s('e-trade') - 0.3, e('e-trade') + 0.3, { mode: 'hero', spin: [[0, 0.3], [1, 0.5]] }, { opacity: 0.5, blur: 2 }),
    // Verdict: the rim rushes past
    R('flywheel_3d', s('v-thin') - 0.3, e('v-wheel') + 2.6, { mode: 'close', spin: [[0, 0.6], [0.8, 1.4], [1, 2.0]] }),
    // Closing (warm daylight)
    R('dawn_landscape', dawn, e('f-asset') + 0.3, { mode: 'rise' }, { fadeIn: 1.2, scrim: 0 }),
    R('eye_macro', at.eye, e('f-echo1') + 0.3, { lookAt: L(W('f-attention', 'guard', 0.92) - 0.6, at.eye) }, { scrim: 0.35 }),
    R('neural_bloom', at.mind, e('f-echo2') + 0.3, { lightAt: L(W('f-mind', 'train', 0.93), at.mind) }, { scrim: 0.35 }),
    R('runner_ridge', s('f-body') - 0.3, e('f-echo3') + 0.3, {}, { scrim: 0.35 }),
    R('dawn_landscape', s('f-update') - 0.3, window.FILM_DURATION, { mode: 'wide' }, { fadeOut: 0.01, scrim: 0 }),
  ];

  window.ENDCARD = {
    title: 'THE FLYWHEEL', panel: true,
    lines: [
      'Every exhibit is from public sources. Full source list in the description.',
      'All voices, music and sound effects are AI-generated (ElevenLabs). No real person’s voice was imitated or cloned.',
      'Quotes are shown on screen and read by the narrator, an AI voice, not by the people or companies quoted. The users’ voices, the founder pitch and the startup categories are illustrative.',
    ],
  };
})();
