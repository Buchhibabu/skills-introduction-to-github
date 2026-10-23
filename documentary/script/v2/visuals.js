// v2 shot list: what is on screen under each line. Times come from the recorded performances
// (T: line timings, W: word timestamps from ElevenLabs alignment).
(() => {
  const T = window.TIMINGS.lines;
  const s = (id) => T[id].start;
  const e = (id) => T[id].end;
  const HL = (txt) => `<span class="hl">${txt}</span>`;
  const DARK = '#2a1d14';
  const AI = (words) => `Words: ${words} · read by an AI voice`;

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
      labels: [
        { text: 'ILLUSTRATIVE PROMPTS · AI VOICES · NOT REAL USERS', pos: { left: '64px', bottom: '56px' } },
        { text: 'DOCUMENTARY · ALL VOICES ARE AI-GENERATED', pos: { right: '64px', bottom: '56px' } },
      ],
    },
    'co-gift': { beat: 'type', text: 'It looks like a gift.', size: 96, cps: 15 },
    'co-billion': {
      beat: 'stats',
      items: [
        { x: 620, y: 470, value: 1200000000, label: 'weekly ChatGPT users · Sep 2026', t0: W('co-billion', 'billion', 0.3), countDur: 2.2, size: 132 },
        { x: 1400, y: 470, value: '~1 in 20', label: 'of 900M weekly users paid · Feb 2026', t0: W('co-billion', 'vast', 0.7), size: 132, color: 'var(--amber)' },
      ],
      src: 'OpenAI figures, via TechCrunch (Feb 27 & Sep 29, 2026) · subscribers and weekly users are different measures',
    },
    'co-question': {
      beat: 'combo', until: e('co-question') + 0.45,
      parts: [
        { beat: 'type', text: 'So what are you paying with?', size: 92, cps: 20, color: 'var(--amber)' },
        { beat: 'casefile', at: e('co-question') - 0.15 },
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
          stamp: { text: 'Temporary ban', t: W('a-critics', 'unreliable', 0.25) + 0.8, right: 40, size: 46 } },
        { beat: 'stats', items: [{ x: 1500, y: 470, value: 1000000, label: 'users in 5 days', t0: W('a-critics', 'million', 0.6), countDur: 1.2, size: 120, color: 'var(--amber)' }] },
        { beat: 'label', text: 'SAM ALTMAN ON X, DEC 5, 2022: “TODAY IT CROSSED 1 MILLION USERS!”', pos: { left: '1160px', top: '600px', width: '680px', textAlign: 'center' }, size: 17, at: W('a-critics', 'million', 0.6) + 0.5 },
      ],
      src: 'The Register (Dec 5, 2022) · Sam Altman on X (Dec 5, 2022)',
    },
    'a-whyfree': {
      beat: 'doc', holdTo: 'a-whyfree-doc', head: 'OpenAI · “Introducing ChatGPT”', date: 'Nov 30, 2022',
      html: `“We are excited to introduce ChatGPT ${HL('to get users’ feedback')} and learn about its strengths and weaknesses. During the research preview, usage of ChatGPT is free.”`,
      foot: 'openai.com/index/chatgpt', label: AI('OpenAI launch post (Nov 30, 2022)'),
      hl: [[W('a-whyfree-doc', 'get', 0.45), W('a-whyfree-doc', 'feedback', 0.9) + 0.4]],
      isolate: [e('a-whyfree-doc') + 0.05, s('a-gpt4') - 0.1], src: 'OpenAI launch post, Nov 30, 2022',
    },
    'a-gpt4': {
      beat: 'doc', head: 'OpenAI · GPT-4 System Card', date: 'Mar 2023',
      html: `“Since it ${HL('finished training in August of 2022')}, we have been evaluating, adversarially testing, and iteratively improving the model and the system-level mitigations around it.”`,
      foot: 'cdn.openai.com/papers/gpt-4-system-card.pdf', hl: [[W('a-gpt4', 'trained', 0.45), W('a-gpt4', 'trained', 0.45) + 1.1]],
      stamp: { text: '3 months before ChatGPT', t: W('a-gpt4', 'months', 0.75), right: 50, size: 44, rot: -4 },
      src: 'OpenAI GPT-4 System Card, Mar 14, 2023',
    },
    'a-scale': {
      beat: 'doc', head: 'Kaplan et al. · OpenAI · “Scaling Laws for Neural Language Models”', date: 'Jan 2020', rot: 0.8,
      html: `“The loss scales as a power-law with ${HL('model size, dataset size, and the amount of compute')} used for training”`,
      foot: 'arxiv.org/abs/2001.08361', hl: [[W('a-scale', 'models', 0.4), W('a-scale', 'compute', 0.75) + 0.3]],
      src: 'Bigger model + more data + more compute → predictably lower error',
    },
    'a-refine': {
      beat: 'doc', holdTo: 'a-refine-doc', head: 'OpenAI · GPT-4 announcement', date: 'Mar 14, 2023',
      html: `“We incorporated more human feedback, including ${HL('feedback submitted by ChatGPT users')}, to improve GPT-4’s behavior.”`,
      foot: 'openai.com/index/gpt-4', label: AI('OpenAI GPT-4 announcement (Mar 14, 2023)'),
      hl: [[W('a-refine-doc', 'feedback', 0.3), W('a-refine-doc', 'users', 0.9) + 0.2]], src: 'OpenAI GPT-4 announcement · post-training, not pre-training',
    },
    'a-reveal': {
      beat: 'combo', holdTo: 'a-record',
      parts: [
        { beat: 'timeline', y: 640, events: [
          { t: s('a-reveal') + 0.0, x: 420, date: 'AUG 2022', title: 'GPT-4 trained', sub: 'not yet released', color: 'var(--red)', up: false },
          { t: s('a-reveal') + 0.45, x: 960, date: 'NOV 30, 2022', title: 'ChatGPT, free', sub: '“to get users’ feedback”', up: false },
          { t: s('a-reveal') + 0.9, x: 1500, date: 'MAR 14, 2023', title: 'GPT-4 released', sub: 'refined partly with ChatGPT feedback', up: false },
        ] },
        { beat: 'say', html: 'The free product was shaping the next one.', size: 66, y: 330, at: s('a-reveal') + 0.2, gap: 0.12, until: s('a-record') + 0.2 },
        { beat: 'record', at: s('a-record'), x: 1060, y: 150, w: 760,
          lines: [
            { text: 'Documented: feedback submitted by ChatGPT users, and answers users flagged as not factual.', t: W('a-record', 'documents', 0.3) },
            { text: 'Not every chat.', t: W('a-record', 'every', 0.85), size: 34 },
          ],
          quote: { text: '“we collect real-world ChatGPT data that has been flagged by users as being not factual” — OpenAI, GPT-4 System Card', t: W('a-record', 'flagged', 0.6) } },
      ],
    },

    // ---------------- exhibit B: the wheel ----------------
    'b-name': {
      beat: 'combo', holdTo: 'b-more',
      parts: [
        { beat: 'flywheel', labels: ['YOU USE IT', 'YOUR FEEDBACK', 'BETTER MODEL', 'MORE USERS'],
          stationTimes: [W('b-use', 'use', 0.4), W('b-signal', 'feedback', 0.4), W('b-more', 'model', 0.3), W('b-more', 'more', 0.7)],
          spin: [[0, 0.05], [0.35, 0.2], [0.7, 0.5], [1, 1.1]], center: 'THE MODEL' },
        { beat: 'say', html: 'The data flywheel', cls: 'title', size: 54, y: 110, at: W('b-name', 'data', 0.7), gap: 0.12 },
        { beat: 'bubbles', items: [
          { text: 'Summarize this.', t: s('b-use-v'), x: 1300, y: 860, to: [960, 230], dur: 1.0 },
          { text: 'Perfect. Thumbs up. 👍', t: s('b-signal-v'), x: 1450, y: 820, to: [1290, 560], dur: 1.1 },
        ] },
        { beat: 'label', text: 'ILLUSTRATIVE · AI VOICES', pos: { right: '64px', top: '100px' }, at: s('b-use-v') - 0.2 },
      ],
      src: 'NVIDIA glossary: “a self-improving loop” · a vendor’s definition',
    },
    'b-thumbs': {
      beat: 'doc', holdTo: 'b-flatter', head: 'OpenAI · “Expanding on what we missed with sycophancy”', date: 'May 2, 2025', quoteSize: 46, clean: true,
      html: `“…an additional reward signal based on user feedback—${HL('thumbs-up and thumbs-down data from ChatGPT')}.”<br><br><span style="font-size:32px;color:#5b554b">“User feedback in particular can sometimes favor more agreeable responses”</span>`,
      foot: 'openai.com/index/expanding-on-sycophancy', label: AI('OpenAI postmortem (May 2, 2025)'),
      hl: [[W('b-thumbs-doc', 'thumbs', 0.5), W('b-thumbs-doc', 'ChatGPT', 0.9) + 0.3]],
      stamp: { text: 'Rolled back · Apr 2025', t: W('b-flatter', 'rolled', 0.65), right: 60, size: 48 },
      gloss: { text: 'one of several factors, per OpenAI', t: W('b-flatter', 'rolled', 0.65) + 0.4 },
      src: 'OpenAI postmortem on the Apr 25, 2025 GPT-4o update · as quoted verbatim by Simon Willison (May 2, 2025)',
    },
    'b-reveal': {
      beat: 'combo',
      parts: [
        { beat: 'flywheel', labels: ['YOU USE IT', 'YOUR FEEDBACK', 'BETTER MODEL', 'MORE USERS'], stationTimes: [s('b-reveal') - 0.3, s('b-reveal') - 0.3, s('b-reveal') - 0.3, s('b-reveal') - 0.3],
          spin: [[0, 1.4], [1, 2.2]], center: '' },
        { beat: 'say', html: 'You’re not just the customer.<br><span style="color:var(--amber)">You’re part of the wheel.</span>', size: 88, gap: 0.14 },
      ],
    },

    // ---------------- exhibit C: the steamroller ----------------
    'c-rush': {
      beat: 'combo', holdTo: 'c-record',
      parts: [
        { beat: 'grid',
          cards: [
            { cat: 'Documents', name: 'Chat with your PDF' }, { cat: 'Documents', name: 'Document Q&A' }, { cat: 'Bots', name: 'Chatbot builder' }, { cat: 'Writing', name: 'AI writing assistant' },
            { cat: 'Research', name: 'Research assistant' }, { cat: 'Web', name: 'Browser agent' }, { cat: 'Dev tools', name: 'Agent builder' }, { cat: 'Web', name: 'AI browser' },
          ],
          releases: [{ t: W('c-pdf', 'PDFs', 0.5), date: 'OCT 2023', title: 'ChatGPT reads your PDFs · limited Plus rollout', kills: ['Chat with your PDF', 'Document Q&A'] }] },
        { beat: 'label', text: 'ILLUSTRATIVE CATEGORIES · NOT REAL COMPANIES', pos: { right: '64px', bottom: '120px' } },
        { beat: 'doc', at: s('c-died') - 0.15, until: s('c-record') + 0.1, head: 'Decrypt', date: 'Oct 31, 2023', x: 560, y: 700, w: 800, rot: -2, quoteSize: 44,
          html: '“Many startups just died today”', label: AI('AI researcher Alex Ker, via Decrypt') },
        { beat: 'record', at: s('c-record'), x: 1040, y: 130, w: 800,
          lines: [
            { text: '“Died” was the reaction at the time, not a documented wave of shutdowns.', t: W('c-record', 'reaction', 0.2) },
            { text: 'Squeezed: Jasper (AI writing app) laid off staff and cut its internal valuation ~20% (2023).', t: W('c-record', 'squeezed', 0.7), size: 24 },
            { text: 'Bought: Cursor (AI code editor), valued at $29.3B (Nov 2025), joined SpaceX (Aug 2026).', t: W('c-record', 'bought', 0.9), size: 24 },
          ] },
      ],
      src: 'Decrypt (2023) · Maginative, citing The Information (2023) · AI Business (Nov 2025) · Cursor blog (Aug 2026)',
    },
    'c-steamroll': {
      beat: 'doc', head: 'Sam Altman · 20VC podcast', date: 'Apr 2024', quoteSize: 48,
      html: `<span style="font-size:32px;color:#5b554b">On startups that bet the models won’t improve: they get “steamrolled”</span><br>${HL('“Not because we don’t like you, but because we have a mission.”')}`,
      label: 'Words: Sam Altman, 20VC (Apr 2024), via The Decoder · shown, not voiced',
      hl: [[W('c-steamroll', 'steamrolled', 0.9) - 0.1, W('c-steamroll', 'steamrolled', 0.9) + 1.4]],
      stamp: { text: 'Steamrolled', t: W('c-steamroll', 'steamrolled', 0.9), right: 60 },
      src: '20VC with Harry Stebbings (Apr 2024), as quoted by The Decoder',
    },
    'c-doors': {
      beat: 'grid', until: e('c-doors') + 0.55,
      cards: [
        { cat: 'Documents', name: 'Chat with your PDF' }, { cat: 'Documents', name: 'Document Q&A' }, { cat: 'Bots', name: 'Chatbot builder' }, { cat: 'Writing', name: 'AI writing assistant' },
        { cat: 'Research', name: 'Research assistant' }, { cat: 'Web', name: 'Browser agent' }, { cat: 'Dev tools', name: 'Agent builder' }, { cat: 'Web', name: 'AI browser' },
      ],
      releases: [
        { t: s('c-doors') - 3, date: 'OCT 2023', title: 'ChatGPT reads your PDFs', kills: ['Chat with your PDF', 'Document Q&A'] },
        { t: W('c-doors', 'doors', 0.3), date: 'NOV 6, 2023', title: 'Custom GPTs · Assistants API', kills: ['Chatbot builder', 'AI writing assistant'] },
        { t: W('c-doors', 'next', 0.55), date: '2025', title: 'Operator · Deep Research · AgentKit · Atlas', kills: ['Research assistant', 'Browser agent', 'Agent builder', 'AI browser'] },
      ],
      src: 'Illustrative categories · launches: OpenAI, TechCrunch (2023–2025) · “now a feature” ≠ shut down',
    },

    // ---------------- exhibit D: the acceleration ----------------
    'd-coders': { beat: 'code', strip: 'FEB–MAY 2025 · CLAUDE CODE · OPENAI CODEX · COPILOT CODING AGENT GO PUBLIC' },
    'd-memos': {
      beat: 'combo', until: W('d-2pct', 'about', 0.3),
      parts: [
        { beat: 'doc', at: W('d-memos', 'memos', 0.5), head: 'Shopify · CEO memo to staff', date: 'Apr 2025', x: 120, y: 200, w: 820, rot: -2.2, quoteSize: 40,
          html: '“Reflexive AI usage is now a baseline expectation at Shopify.”', label: 'Words: Tobi Lütke · shown, not voiced' },
        { beat: 'doc', at: W('d-memos', 'memos', 0.5) + 0.5, head: 'Microsoft developer division memo', date: 'Jun 2025', x: 980, y: 170, w: 820, rot: 1.6, quoteSize: 38,
          html: '“using AI is no longer optional—it’s core to every role and every level.”', label: 'As reported by Business Insider, via PC Gamer',
          stamp: { text: 'Reported', t: W('d-memos', 'memos', 0.5) + 0.9, right: 40, size: 40 } },
        { beat: 'doc', at: W('d-memos', 'memos', 0.5) + 1.0, head: 'Coinbase · CEO Brian Armstrong, recalling it on a podcast', date: 'said Aug 2025', x: 520, y: 600, w: 880, rot: -0.8, quoteSize: 38,
          html: 'Engineers told to “at least onboard by the end of the week”', label: 'TechCrunch · shown, not voiced' },
        { beat: 'label', text: 'GENERAL AI-USE MANDATES · NOT COPILOT-SPECIFIC', pos: { left: '0', right: '0', bottom: '60px', textAlign: 'center' }, at: W('d-memos', 'memos', 0.5) + 1.3 },
      ],
    },
    'd-2pct': {
      beat: 'chart', from: W('d-2pct', 'about', 0.3) + 0.2, holdTo: 'd-80pct', drawFrom: W('d-2pct', 'two', 0.5), drawTo: W('d-80pct', 'eighty', 0.6),
      title: '<div class="kicker">Exhibit D · Evidence</div><div class="title" style="font-size:58px;margin-top:12px">Share of real GitHub issues an AI could fix</div>',
      foot: 'SWE-bench (Oct 2023, original set) → SWE-bench Verified (2024–26). Different test versions; lab-reported; OpenAI later called the test contaminated.',
      y: 270, h: 560,
      points: [
        { fx: 0.03, v: 1.96, label: '2%', sub: 'OCT 2023 · Claude 2', t: W('d-2pct', 'two', 0.5), dx: 90 },
        { fx: 0.4, v: 33.2, label: '33%', sub: 'AUG 2024 · GPT-4o', t: (W('d-2pct', 'two', 0.5) + W('d-80pct', 'eighty', 0.6)) / 2 },
        { fx: 0.95, v: 80.8, label: '~80%', sub: 'FEB 2026 · Claude Opus 4.6 (Anthropic)', t: W('d-80pct', 'eighty', 0.6), dx: -190, dy: -150 },
      ],
      src: 'Jimenez et al. 2023 · OpenAI (Aug 2024) · Anthropic (Feb 5, 2026)',
    },
    'd-opus55': {
      beat: 'doc', head: 'Anthropic · Introducing Claude Opus 5.5', date: 'Sep 22, 2026', quoteSize: 48, clean: true,
      html: `“We’re introducing Claude Opus 5.5, the first model in our new Claude 5.5 family. It ${HL('performs at the level of Claude Fable 5.1 on most work')} and costs 40% less to run than Opus 5.”`,
      hl: [[W('d-opus55', 'level', 0.5) - 0.3, W('d-opus55', 'work', 0.95) + 0.2]],
      gloss: { text: 'Fable 5.1 = Anthropic’s larger model', t: W('d-opus55', 'Fable', 0.7) },
      label: 'Anthropic · vendor claim', src: 'Anthropic (Sep 22, 2026) · vendor claim',
    },
    'd-code': {
      beat: 'doc', holdTo: 'd-code-doc', until: e('d-code-doc'), head: 'GitHub Blog · Copilot interaction data policy', date: 'Mar 25, 2026', quoteSize: 36, clean: true,
      html: `“From April 24 onward, interaction data… from Copilot Free, Pro, and Pro+ users ${HL('will be used to train and improve our AI models unless they opt out')}.”<br><br>` +
        `<span style="font-size:46px">“We believe the future of AI-assisted development depends on real-world interaction data from ${HL('developers like you')}.”</span><br><br>` +
        `<span style="font-size:26px;color:#5b554b">Anthropic, Aug 28, 2025, on Claude Free, Pro and Max chats and coding sessions, if users allow it: “This creates a feedback loop that helps models get better over time.”</span>`,
      label: AI('GitHub Blog (Mar 25, 2026)') + ' · personal plans · opt-out available',
      hl: [[W('d-code', 'personal', 0.3), W('d-code', 'plans', 0.9) + 0.4], [W('d-code-doc', 'developers', 0.85), W('d-code-doc', 'you', 0.97) + 0.15]],
      src: 'GitHub Blog (Mar 25, 2026) · Anthropic consumer terms (Aug 28, 2025) · business plans excluded by default',
    },

    // ---------------- exhibit E: the price ----------------
    'e-why': {
      beat: 'ledger', holdTo: 'e-yours', title: 'Who pays for “free”?', y: 190, x: 360, w: 1200,
      rows: [
        { text: 'Investor billions', note: '$110B round · Feb 2026', t: W('e-list', 'investor', 0.05) },
        { text: 'A race for users', note: 'free plans for millions in India · 2025', t: W('e-list', 'race', 0.3) },
        { text: 'Ads', note: 'tests from Feb 2026 · advertisers don’t see chats', t: W('e-list', 'ads', 0.55) },
        { text: 'Falling costs', note: '~10× cheaper per year, same capability', t: W('e-list', 'falling', 0.75) },
        { text: 'Your data', note: 'ChatGPT consumer default: on', t: W('e-data', 'data', 0.6), big: true },
      ],
      src: 'AP, TechCrunch (Feb 2026) · Outlook Business, Engadget (2025) · NBC News (Feb 2026) · a16z “LLMflation” (2024)',
    },
    'e-record': {
      beat: 'combo',
      parts: [
        { beat: 'toggle', title: 'ILLUSTRATION · NOT A REAL SCREEN · SETTINGS › DATA CONTROLS', row: 'Improve the model for everyone',
          note: 'Opting out is one switch away', flipAt: W('e-record', 'switch', 0.7) },
        { beat: 'record', at: s('e-record') + 0.4, x: 1180, y: 690, w: 680,
          lines: [{ text: 'ChatGPT: on by default for consumer chats, free and paid · business plans excluded by default · opt-outs exist at OpenAI, Anthropic, Google and GitHub', size: 21 }] },
      ],
    },
    'e-defaults': {
      beat: 'settings', label: 'ILLUSTRATIVE · ONE SMALL 2011 SURVEY OF SOFTWARE SETTINGS (MICROSOFT WORD USERS), NOT AI DATA CONTROLS',
      quote: '“Less than 5% of the users we surveyed had changed any settings at all.” — Jared Spool, UIE (2011)',
    },
    'e-trade': { beat: 'say', html: 'It’s a trade — often a good one.<br><span style="font-size:52px;color:var(--dim)">You get a better tool. They get a better model.</span>', size: 82, gap: 0.12, push: 0.08 },

    // ---------------- verdict: a warning to builders ----------------
    'v-founder': { beat: 'wrapper', pitch: 'So our app just calls the model', pitchT: s('v-founder'), freezeT: e('v-founder'), label: 'ILLUSTRATIVE PITCH · AI VOICE', push: 0.08 },
    'v-thin': {
      beat: 'say', holdTo: 'v-wheel', until: e('v-wheel') + 1.6,
      html: 'Thin wrapper? <span style="color:var(--amber)">Please, wait.</span><br><span style="font-size:60px;color:var(--dim)">The wheel won’t.</span>', size: 96, gap: 0.22,
    },

    // ---------------- closing: the one asset (dawn) ----------------
    'f-build': {
      beat: 'triple', color: DARK, size: 170,
      words: [{ text: 'Build.', t: W('f-build', 'build', 0.45) }, { text: 'Raise.', t: W('f-build', 'raise', 0.62) }, { text: 'Ship.', t: W('f-build', 'ship', 0.85) }],
    },
    'f-asset': { beat: 'say', html: 'But your biggest asset<br>isn’t on that list.', size: 96, color: DARK, gap: 0.14 },
    'f-attention': {
      beat: 'combo', holdTo: 'f-echo3c', push: 0.02,
      parts: [
        { beat: 'pillars', items: [
          { t: s('f-attention'), label: 'ATTENTION', stat: '47 sec', text: 'average time on one screen before switching (about 2½ min in 2004)', source: 'Gloria Mark, UC Irvine · measures switching, not “attention span”', verb: 'Guard it.', verbT: W('f-attention', 'guard', 0.92),
            icon: '<svg width="140" height="90" viewBox="0 0 140 90"><path d="M5 45 Q70 -15 135 45 Q70 105 5 45Z" fill="none" stroke="#7a4b1c" stroke-width="5"/><circle cx="70" cy="45" r="20" fill="#7a4b1c"/></svg>' },
          { t: s('f-mind'), label: 'MIND', stat: '50% vs 67%', statSize: 92, text: 'quiz scores after learning a new library with AI vs by hand', source: 'Anthropic randomized trial, Jan 2026 · 52 engineers · asking AI to explain helped', verb: 'Train it.', verbT: W('f-mind', 'train', 0.93),
            icon: '<svg width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#7a4b1c" stroke-width="5"/><path d="M60 15 V105 M30 40 Q60 55 90 40 M30 80 Q60 65 90 80" stroke="#7a4b1c" stroke-width="5" fill="none"/></svg>' },
          { t: s('f-body'), label: 'HEALTH', stat: '43%', text: 'fewer poor mental-health days among people who exercise', source: 'Chekroud et al., Lancet Psychiatry 2018 · 1.2M Americans · an association', verb: 'Move it.', verbT: W('f-body', 'move', 0.93),
            icon: '<svg width="130" height="120" viewBox="0 0 130 120"><path d="M65 110 L15 60 A28 28 0 0 1 65 22 A28 28 0 0 1 115 60 Z" fill="none" stroke="#7a4b1c" stroke-width="5"/><path d="M25 62 H50 L58 45 L70 80 L78 62 H105" fill="none" stroke="#7a4b1c" stroke-width="5"/></svg>' },
        ] },
        { beat: 'bubbles', items: [0, 1, 2].flatMap((p) => [0, 1, 2].map((k) => ({
          t: s(['f-echo1a', 'f-echo2a', 'f-echo3a'][p]) + k * 0.12, x: 230 + p * 560 + k * 130, y: 700 + (k % 2) * 40, size: 80 + k * 14, dur: 2.2,
          bg: 'rgba(255,236,200,.65)', alpha: 0.75 }))) },
      ],
    },
    'f-update': { beat: 'say', html: 'No release will update you.<br>Only you can.', size: 92, color: DARK, gap: 0.14 },
    'f-final': { beat: 'say', html: 'Invest consciously.', size: 150, color: DARK, gap: 0.35, push: 0.03 },
  };

  window.ENDCARD = {
    title: 'THE FLYWHEEL',
    lines: [
      'Every exhibit comes from public sources: company posts, research papers and press reports. Full source list in the description.',
      'All voices are AI-generated (ElevenLabs). No real person’s voice was imitated or cloned.',
      'Quotes you hear are read by AI voices, not by the people or companies quoted; most quotes are shown, not voiced. The user prompts, the founder pitch and the startup categories are illustrative.',
    ],
  };
})();
