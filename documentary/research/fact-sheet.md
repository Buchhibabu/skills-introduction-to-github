# Fact Sheet: "You Are the Flywheel" (3-minute exposé documentary)

Prepared 2026-10-22 from the adversarially verified research. Each item keeps its verification confidence (high or medium).

**Naming rule:** say "Claude Opus 4.6" and "Claude Opus 5.5" (Anthropic). Never say "OpenAI 4.6" or "OpenAI 5.5".

---

## 1. Corrections to the creator's claims

### Claim 1: "When ChatGPT 3.5 came, everyone thought it was junk. People used it anyway, and that started the data flywheel."
**Verdict: partly accurate.**
- OpenAI launched ChatGPT on Nov 30, 2022 as a free "research preview". It was fine-tuned from a GPT-3.5-series model. OpenAI said it was releasing it free "to get users' feedback". (high)
- "Everyone" is wrong. Experts and institutions were skeptical:
  - Stack Overflow banned ChatGPT answers on Dec 5, 2022.
  - Yann LeCun called it "not particularly innovative" in Jan 2023.
- The public, meanwhile, flocked to it: 1M users in about 5 days, and an estimated ~100M monthly users by Jan 2023. (high)
- Altman's "incredibly limited" tweet was a warning against over-trusting ChatGPT, not a dismissal.
- The loop started before ChatGPT. InstructGPT (Mar 2022) was already trained partly on prompts sent through OpenAI's API. ChatGPT made the loop happen at public scale.
- **Say instead:** "Experts called it a toy. The public called it magic. And OpenAI's own launch post said it was free to get users' feedback."

### Claim 2: "GPT-4 was already there before that. It's just a scaling law."
**Verdict: the first half is accurate. "Just scaling" is partly accurate.**
- GPT-4 finished training in Aug 2022, about 3 months before ChatGPT launched. It was released on Mar 14, 2023, about 7 months after training finished. OpenAI itself says "6 months" of alignment. (high)
- Scaling laws are real and predictive:
  - Kaplan et al., Jan 2020.
  - Chinchilla, Mar 2022.
  - OpenAI predicted parts of GPT-4's performance from models using at most 1/1,000th of its compute. (high)
- Scale is not the whole story:
  - In InstructGPT, a 1.3B model trained on human feedback was preferred over the 175B GPT-3.
  - GPT-4's reward models were trained partly on ChatGPT answers that users had flagged. (high)
- **Say instead:** "GPT-4 was already built before ChatGPT launched. Scale built the engine. Your feedback tuned it."

### Claim 3: "Startups built on GPT-4 got nuked by each new release. Their IP evaporates every time."
**Verdict: partly accurate. The pattern is real, but "all IP evaporates" is inaccurate.**
- OpenAI repeatedly moved into startup territory (high):
  - PDF upload in ChatGPT, Oct 2023.
  - DevDay on Nov 6, 2023: GPTs, the Assistants API and GPT-4 Turbo.
  - In 2025: Operator, then Deep Research, ChatGPT agent, AgentKit and the Atlas browser.
- Altman said in Apr 2024 that startups betting the models won't improve will get "steamrolled". (high)
- The damage is documented (high):
  - Jasper cut its internal valuation about 20% and laid off staff.
  - Chegg's stock fell 48% in one day.
- But "killed" was how people reacted, not what happened. There was no documented wave of shutdowns. Jasper pivoted. Cursor reached a $29.3B valuation and was acquired by SpaceX on Aug 14, 2026. (medium)
- **Say instead:** "Thin wrappers get steamrolled. Strong companies get squeezed, or bought."

### Claim 4: "Workers were told to use Copilot. It got extremely better within months. Then 'OpenAI 4.6', then 'OpenAI 5.5'."
**Verdict: the mandates are accurate. "Within months" is partly accurate. The model names are wrong as spoken.**
- **Mandates.** These were general AI-use mandates, not Copilot-specific:
  - Shopify, Apr 2025 (high).
  - Duolingo "AI-first", Apr 28, 2025 (high).
  - Microsoft's developer division, June 2025, known only from a reported leak (medium).
  - Coinbase, Aug 2025 (medium).
- **Speed.** Copilot took about 4 years to go from autocomplete (Jun 2021) to a coding agent (May 2025), not months. The steep part came in 2024–2026 (medium):
  - On SWE-bench, scores went from ~2% (Oct 2023) to 33% (Aug 2024) to ~80% (Feb 2026).
  - These are lab-reported numbers on different versions of the test.
  - OpenAI later said the test was contaminated.
- **"4.6".** OpenAI has no model called 4.6. The model meant is Anthropic's Claude Opus 4.6, released Feb 5, 2026. (high)
- **"5.5".** Both names exist (high):
  - Claude Opus 5.5 (Anthropic), Sep 22, 2026.
  - GPT-5.5 (OpenAI), Apr 23, 2026.
  - Because the creator pairs it with Opus 4.6, the intended model is Claude Opus 5.5.
- "Another 4.6-level release" is the creator's opinion. Present it as opinion.
- **Say instead:** "First companies asked. Then they required it. In February 2026, Anthropic's Claude Opus 4.6 arrived, and for many developers there was no going back. In September 2026, Claude Opus 5.5 raised the bar again." The "no going back" part is opinion framing; back it with the stock sell-off fact.

### Claim 5: "It's free and subsidized because you are the data. You have no other option."
**Verdict: partly accurate.**
- **True: consumer use feeds training by default.** (high)
  - OpenAI: ChatGPT's "Improve the model for everyone" setting is on by default.
  - Anthropic: since Aug 28, 2025, Claude Free, Pro and Max users, including Claude Code, choose whether their chats train models.
  - GitHub: Copilot Free, Pro and Pro+ data trains models from Apr 24, 2026 unless users opt out.
  - Google Gemini uses collected data to improve its models.
  - Stanford: all six major US developers appear to train on chats by default.
- **True: the labs describe the loop in their own words.** (high)
  - Anthropic: "feedback loop".
  - GitHub: "Real-world data = smarter models".
  - OpenAI's GPT-4 System Card.
  - OpenAI's GPT-4o thumbs-up/down reward signal.
- **Overstated: data is not the only reason it's free.** (medium)
  - Investor money: a $110B round in Feb 2026.
  - Ads: in free ChatGPT since Feb 9, 2026.
  - Market-share land grabs: free plans in India.
  - Costs fall about 10x a year at a fixed capability level.
  - OpenAI ran an operating loss of about $21B in 2025.
  - No lab has said "it's free because you are the data". That link is the creator's interpretation.
- **Wrong: "no other option".**
  - Opt-outs exist at OpenAI, Anthropic, Google, GitHub and X.
  - Temporary Chat exists.
  - Business and API tiers are excluded from training by default.
  - The real force is defaults: most people never change them.
- **The split is consumer versus business, not free versus paid.** A paying ChatGPT Plus user is also in by default.
- **Say instead:** "If you're not paying full price, you're paying partly in data and partly in attention. There is a switch. Almost nobody touches it." Drop "you idiots".

### Claim 6: "Invest in your attention span, mental health and physical health."
**Verdict: supported as advice.** It is a value judgment, and the evidence backs each part.
- Time on one screen before switching fell from ~2.5 min (2004) to ~47 s (Gloria Mark). (high)
- Leaning on AI has measurable costs (high, with study-design caveats):
  - PNAS RCT: students scored 17% lower once AI access was removed.
  - Anthropic RCT: 50% vs 67% on a quiz.
  - Endoscopy: detection without AI fell from 28.4% to 22.4%.
  - Microsoft/CMU: more trust in AI went with less critical thinking.
- Body and sleep (high):
  - People who exercise report about 43% fewer poor-mental-health days.
  - WHO recommends 150–300 min of moderate activity a week.
  - 1.8B adults worldwide are not active enough.
  - About 1 in 3 US adults don't get enough sleep.
- Guardrails:
  - The 47 seconds measures switching, not attention span.
  - No goldfish line.
  - No "brain rot".
- **Say instead:** "You can't out-build the flywheel. But it can't sleep for you, train for you, or focus for you. That's the asset that compounds."

---

## 2. Narrative sequence

Target length: about 3:00, roughly 420 spoken words.
- **CORE** marks the strongest items.
- **OPT** marks items to use if there is time.
- Caption format: date · claim, then source.

### Beat 1: Cold open (0:00–0:12)
*Sound: low drone and keyboard clicks. Text appears on black.*

**1a CORE**
- **Narration:** "In February 2026, 900 million people used ChatGPT every week. Only 50 million paid. Today, OpenAI says, it's 1.2 billion a week. So what is everyone else paying with?"
- **Captions:**
  - FEB 27, 2026 · 900M weekly users · 50M paying (OpenAI, via TechCrunch)
  - SEP 29, 2026 · 1.2B weekly users (OpenAI DevDay, via TechCrunch)
- **Sources:**
  - https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users
  - https://techcrunch.com/2026/09/29/openais-latest-features-take-direct-aim-at-the-app-store-model/
- **Confidence:** high.
- **Note:** don't compute a "% free" share from 1.2B. Only the February pair (~1 in 20 paying) matches.

**1b OPT (reveal quote)**
- **On screen:** "When you share your content with us, it helps our models become more accurate."
- **Caption:** OpenAI data-usage policy (updated Mar 13, 2026)
- **Source:** https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/
- **Confidence:** medium. Check the live page before showing it.

### Beat 2: The ChatGPT launch (0:12–0:30)

**2a CORE**
- **Narration:** "November 30, 2022. OpenAI releases ChatGPT, free, as a 'research preview'. Its launch post says why: 'to get users' feedback'."
- **Caption:** NOV 30, 2022 · "We are excited to introduce ChatGPT to get users' feedback" (OpenAI, "Introducing ChatGPT")
- **Source:** https://openai.com/index/chatgpt/
- **Confidence:** high.

**2b CORE**
- **Narration:** "Experts called it a toy. Within days, Stack Overflow banned its answers because too many were wrong. Even OpenAI's CEO warned it was 'incredibly limited'."
- **Captions:**
  - DEC 5, 2022 · Stack Overflow bans ChatGPT answers: correct-answer rate "too low" (The Register)
  - DEC 10, 2022 · Altman: "incredibly limited" (VentureBeat)
- **Sources:**
  - https://www.theregister.com/2022/12/05/stack_overflow_bans_chatgpt/
  - https://venturebeat.com/ai/openai-ceo-admits-chatgpt-risks-what-now-the-ai-beat
- **Confidence:** high.
- **Note:** frame Altman's line as a caution, not a dismissal.

**2c CORE**
- **Narration:** "The public didn't care. One million users in five days. An estimated 100 million in two months, the fastest ramp analysts had seen at the time."
- **Caption:** 5 DAYS · 1M users (Sam Altman, Dec 5, 2022) · 2 MONTHS · est. 100M monthly users (UBS/Similarweb, via Reuters, Feb 1, 2023)
- **Source:** https://finance.yahoo.com/news/1-chatgpt-sets-record-fastest-051929384.html
- **Confidence:** high.

**2d OPT**
- **Narration:** "And every user was invited to flag bad answers, right in the app."
- **Caption:** "Users are encouraged to provide feedback on problematic model outputs through the UI" (OpenAI, Nov 30, 2022)
- **Source:** https://openai.com/index/chatgpt/
- **Confidence:** high.

### Beat 3: GPT-4 already existed, and the role of scaling (0:30–0:45)

**3a CORE**
- **Narration:** "Here's what almost nobody knew: GPT-4 was already built. It finished training in August 2022, three months before ChatGPT launched."
- **Caption:** AUG 2022 · GPT-4 finishes training, 3 months before ChatGPT launches (OpenAI GPT-4 System Card, Mar 14, 2023)
- **Source:** https://cdn.openai.com/papers/gpt-4-system-card.pdf
- **Confidence:** high.

**3b OPT**
- **Narration:** "Its raw power came from scale. Bigger models, more data and more compute make models better, predictably. So predictably that OpenAI forecast parts of GPT-4's performance from models using a thousandth of its compute."
- **Caption:** 2020 · "The loss scales as a power-law with model size, dataset size, and the amount of compute" (Kaplan et al., OpenAI)
- **Sources:**
  - https://arxiv.org/abs/2001.08361
  - https://arxiv.org/abs/2303.08774
- **Confidence:** high.

**3c CORE**
- **Narration:** "But size alone doesn't make an assistant. In 2022, OpenAI showed that a small model trained on human feedback beat GPT-3, a model 100 times bigger. Its starting material included prompts customers had sent through OpenAI's API."
- **Caption:** MAR 2022 · 1.3B model + human feedback preferred over the 175B GPT-3 (Ouyang et al., OpenAI, arXiv:2203.02155)
- **Source:** https://arxiv.org/abs/2203.02155
- **Confidence:** high.

### Beat 4: The flywheel and the evidence (0:45–1:10)

**4a CORE**
- **Narration:** "The industry has a name for this: the data flywheel. Use creates data. Data improves the model. A better model brings more users."
- **Caption:** "A self-improving loop" (NVIDIA, "What is a Data Flywheel?")
- **Source:** https://www.nvidia.com/en-us/glossary/data-flywheel/
- **Confidence:** high. This is a vendor's definition.

**4b CORE**
- **Narration:** "Before GPT-4 went public, OpenAI spent six months refining it using lessons from ChatGPT. Its own system card says it took ChatGPT answers users had flagged as wrong, and used them to train GPT-4's reward models."
- **Caption:** MAR 14, 2023 · "We collect real-world ChatGPT data that has been flagged by users as being not factual" (OpenAI, GPT-4 System Card)
- **Sources:**
  - https://cdn.openai.com/papers/gpt-4-system-card.pdf
  - https://simonwillison.net/2023/Mar/14/openai/
- **Confidence:** high.

**4c OPT**
- **Narration:** "OpenAI's GPT-4 announcement said it 'incorporated more human feedback, including feedback submitted by ChatGPT users'."
- **Caption:** MAR 14, 2023 (OpenAI, "GPT-4")
- **Source:** https://openai.com/index/gpt-4/
- **Confidence:** high.

**4d CORE**
- **Narration:** "Even your thumbs-up counts. In April 2025, OpenAI added a reward signal built from ChatGPT thumbs-up and thumbs-down data. It helped make the model so flattering that OpenAI rolled the update back within days."
- **Caption:** MAY 2, 2025 · "an additional reward signal based on user feedback—thumbs-up and thumbs-down data from ChatGPT" (OpenAI postmortem)
- **Sources:**
  - https://openai.com/index/expanding-on-sycophancy/
  - https://simonwillison.net/2025/May/2/what-we-missed-with-sycophancy/
- **Confidence:** high.
- **Note:** say "helped make". OpenAI named it as one of several factors.

**4e CORE**
- **Narration:** "The labs say it in their own words. Anthropic, 2025: 'This creates a feedback loop that helps models get better over time.' GitHub, 2026: 'Real-world data = smarter models.'"
- **Captions:**
  - AUG 28, 2025 (Anthropic, "Updates to Consumer Terms")
  - MAR 25, 2026 · Copilot Free/Pro/Pro+ data trains models from APR 24, 2026 unless you opt out (GitHub Blog)
- **Sources:**
  - https://www.anthropic.com/news/updates-to-our-consumer-terms
  - https://github.blog/news-insights/company-news/updates-to-github-copilot-interaction-data-usage-policy/
- **Confidence:** high.

**4f OPT**
- **Narration:** "GitHub says a year of training on Microsoft employees' Copilot use produced 'meaningful improvements, including increased acceptance rates in multiple languages'."
- **Source:** same GitHub URL as 4e.
- **Confidence:** high. GitHub published no metrics behind the claim.

**4g CORE**
- **Narration:** "Stanford researchers read the privacy policies of six major US AI developers. All six appear to train on users' chats by default."
- **Caption:** OCT 15, 2025 · All 6 major US AI developers appear to train on chats by default (Stanford HAI)
- **Sources:**
  - https://hai.stanford.edu/news/be-careful-what-you-tell-your-ai-chatbot
  - https://arxiv.org/abs/2509.05382
- **Confidence:** high.
- **Note:** the study read policies, not internal practice, and "appear to" is the paper's own hedge.

**4h OPT**
- **On screen:** "Please don't enter confidential information that you wouldn't want a reviewer to see"
- **Caption:** Google, Gemini Apps Privacy Hub (updated Oct 19, 2026)
- **Source:** https://support.google.com/gemini/answer/13594961?hl=en
- **Confidence:** high.

### Beat 5: The startup graveyard (1:10–1:35)

**5a CORE**
- **Narration:** "October 2023: ChatGPT lets some paying users upload PDFs. A whole wave of 'chat with your PDF' startups had just lost their product. One AI researcher posted: 'Many startups just died today.'"
- **Caption:** OCT 2023 · "Many startups just died today" (Alex Ker, via Decrypt, Oct 31, 2023)
- **Source:** https://decrypt.co/203920/openai-pdf-chatbot-ai-startups-sherlocked
- **Confidence:** high. "Died" was the reaction at the time, not documented shutdowns.

**5b CORE**
- **Narration:** "Days later, OpenAI's first DevDay shipped custom GPTs, an Assistants API, and a cheaper GPT-4 Turbo. TechCrunch's lesson for founders: 'Build a company, not a feature.'"
- **Caption:** NOV 6, 2023 · GPTs, Assistants API, GPT-4 Turbo with 128K context (OpenAI; TechCrunch)
- **Sources:**
  - https://openai.com/index/new-models-and-developer-products-announced-at-devday/
  - https://techcrunch.com/2023/11/06/get-the-pdf-outta-here/
- **Confidence:** high.

**5c CORE**
- **Narration:** "Sam Altman's advice to founders in April 2024: bet that the models keep getting better, or get 'steamrolled'. 'Not because we don't like you, but because we have a mission.'"
- **Caption:** APR 2024 · Altman: startups betting the model won't improve will get "steamrolled" (20VC podcast, via The Decoder)
- **Source:** https://the-decoder.com/sam-altman-explains-why-openai-might-steamroll-your-ai-startup/
- **Confidence:** high.

**5d OPT**
- **Narration:** "Jasper, an AI writing startup valued at $1.5 billion six weeks before ChatGPT launched, laid off staff and cut its internal valuation about 20% within a year."
- **Caption:** OCT 18, 2022 · $125M raise at $1.5B (TechCrunch) → 2023 · layoffs, ~20% valuation cut, revenue forecast cut ≥30% (The Information, via Maginative)
- **Source:** https://www.maginative.com/article/jasper-cuts-internal-valuation-as-ai-growth-slows/
- **Confidence:** high. Jasper was squeezed, not killed.

**5e OPT**
- **Narration:** "Chegg, the homework-help giant, lost 48% of its stock value in a single day after saying ChatGPT was hurting new sign-ups."
- **Caption:** MAY 2, 2023 · Chegg stock −48% in one day (AP)
- **Source:** https://www.news4jax.com/business/2023/05/02/cheggs-stock-plunges-on-fears-of-competition-from-chatgpt/
- **Confidence:** high. Chegg was a public company, not an AI startup.

**5f OPT**
- **Narration:** "In 2025 it kept going: a browser agent, deep research, an agent builder, a browser. Each one landed in territory startups were already building in."
- **Caption:** 2025 · Operator (Jan 23) → Deep Research (Feb 2) → ChatGPT agent (Jul 17) → AgentKit (Oct 6) → Atlas (Oct 21) (TechCrunch)
- **Source:** https://techcrunch.com/2025/10/21/openai-launches-an-ai-powered-browser-chatgpt-atlas
- **Confidence:** high.

**5g CORE (counterweight)**
- **Narration:** "Not everyone got crushed. Cursor, an AI code editor running on the labs' models, reached a $29.3 billion valuation, and in August 2026 it was bought by SpaceX, whose AI arm builds its own models. Thin wrappers get steamrolled. Strong ones get bought."
- **Caption:** NOV 2025 · Cursor valued at $29.3B (AI Business) → AUG 14, 2026 · acquired by SpaceX (Cursor)
- **Sources:**
  - https://aibusiness.com/generative-ai/cursor-raises-billions-continued-momentum
  - https://cursor.com/blog/joining-spacex
- **Confidence:** medium. Don't state a deal price.

### Beat 6: Coding agents, Opus 4.6 and Opus 5.5 (1:35–1:55)

**6a OPT**
- **Narration:** "Developers saw it first. GitHub Copilot launched in 2021 as autocomplete. By 2025 it was an agent: assign it an issue and it opens its own pull request."
- **Caption:** JUN 29, 2021 · Copilot preview → MAY 19, 2025 · Copilot coding agent (GitHub Blog)
- **Source:** https://github.blog/news-insights/product-news/github-copilot-meet-the-new-coding-agent/
- **Confidence:** high.

**6b CORE**
- **Narration:** "Then the memos came. Shopify: 'Reflexive AI usage is now a baseline expectation.' Microsoft's developer division, reportedly: 'Using AI is no longer optional.' Coinbase's CEO said he fired engineers who didn't onboard AI coding tools within a week."
- **Captions:**
  - APR 2025 · Shopify CEO memo (Digital Commerce 360)
  - JUN 2025 · Microsoft memo, as reported by Business Insider
  - AUG 2025 · Coinbase CEO Brian Armstrong (TechCrunch)
- **Sources:**
  - https://www.digitalcommerce360.com/2025/04/08/internal-memo-shopify-ceo-declares-ai-non-optional/
  - https://tech.yahoo.com/ai/articles/ai-no-longer-optional-microsoft-183003779.html
  - https://techcrunch.com/2025/08/22/coinbase-ceo-explains-why-he-fired-engineers-who-didnt-try-ai-immediately
- **Confidence:** Shopify high; Microsoft and Coinbase medium.

**6c OPT**
- **Narration:** "In the first half of 2025, autonomous coding agents went public: Claude Code, OpenAI's Codex, and GitHub's Copilot agent."
- **Caption:** FEB–MAY 2025 · Claude Code (preview Feb 24, GA May 22) · Codex (May 16) · Copilot agent (May 19)
- **Sources:**
  - https://www.anthropic.com/news/claude-3-7-sonnet
  - https://openai.com/index/introducing-codex/
- **Confidence:** high.

**6d CORE**
- **Narration:** "And the curve went near-vertical. In 2023, the best AI could fix about 2% of real GitHub issues in a standard test. By early 2026, labs were reporting around 80%."
- **Caption:** AI fixing real GitHub bugs: ~2% (Oct 2023) → 33% (Aug 2024) → ~80% (Feb 2026). Small print: lab-reported, different test versions.
- **Sources:**
  - https://arxiv.org/abs/2310.06770
  - https://openai.com/index/introducing-swe-bench-verified/
  - https://www.anthropic.com/news/claude-opus-4-6
- **Confidence:** medium.
- **Note:** OpenAI stopped reporting this test on Feb 23, 2026, calling it contaminated.

**6e CORE**
- **Narration:** "February 5, 2026: Anthropic releases Claude Opus 4.6. That week, Anthropic's releases, first plug-ins for its Cowork agent and then Opus 4.6, rattled software and data stocks."
- **Captions:**
  - FEB 5, 2026 · Claude Opus 4.6 (Anthropic)
  - FEB 3–5, 2026 · software-stock sell-off; FactSet falls ~10% twice in one week (Reuters; Fortune)
- **Sources:**
  - https://www.anthropic.com/news/claude-opus-4-6
  - https://finance.yahoo.com/news/anthropics-ai-tools-deepen-selloff-054551832.html
  - https://fortune.com/2026/02/06/anthropic-claude-opus-4-6-stock-selloff-new-upgrade/
- **Confidence:** Opus 4.6 high; sell-off medium.
- **Note:** don't put a dollar total on screen.

**6f CORE**
- **Narration:** "September 22, 2026: Claude Opus 5.5. Anthropic says it performs at the level of its larger Claude Fable 5.1 model on most work, at 40% less to run than Opus 5."
- **Caption:** SEP 22, 2026 · Claude Opus 5.5: "at the level of Claude Fable 5.1 on most work", 40% cheaper to run (Anthropic)
- **Sources:**
  - https://www.anthropic.com/claude-opus-5-5
  - https://techcrunch.com/2026/09/22/anthropic-releases-opus-5-5-with-lower-prices-and-fable-level-performance/
- **Confidence:** high.

### Beat 7: The subsidy, and who pays (1:55–2:15)

**7a CORE**
- **Narration:** "So is it free because you're the data? Partly. The losses are real. In 2025, OpenAI brought in about $13 billion and spent about $34 billion."
- **Caption:** 2025 · OpenAI revenue ~$13.1B, costs ~$34B, operating loss ~$21B (leaked audited financials, verified by the FT)
- **Source:** https://finance.yahoo.com/markets/stocks/articles/openai-2025-financials-leaked-38-121508294.html
- **Confidence:** medium.

**7b OPT**
- **Narration:** "Even the $200-a-month plan lost money. Altman: 'people use it much more than we expected.'"
- **Caption:** JAN 5, 2025 · "we are currently losing money on openai pro subscriptions!" (Altman on X, via Fortune)
- **Source:** https://fortune.com/2025/01/07/sam-altman-openai-chatgpt-pro-subscription-losing-money-tech
- **Confidence:** high. This applies to one plan in early 2025.

**7c CORE**
- **Narration:** "Who covers the gap? Investors: a $110 billion round in February 2026. Advertisers: since February 2026, ads in free ChatGPT, which can be matched to your conversations. And a race for users: free premium AI plans handed out across India."
- **Captions:**
  - FEB 27, 2026 · $110B round at $730B pre-money valuation (AP)
  - FEB 9, 2026 · ads arrive in free ChatGPT (TechCrunch; NBC News)
  - 2025 · ChatGPT Go, Perplexity Pro and Google AI Pro given away free in India (Outlook Business; Engadget)
- **Sources:**
  - https://mynews13.com/fl/orlando/ap-top-news/2026/02/27/chatgpt-maker-openai-receives-110b-in-investments-from-amazon-nvidia-and-softbank
  - https://www.nbcnews.com/tech/internet/openai-starts-testing-ads-chatgpt-rcna258242
  - https://www.outlookbusiness.com/artificial-intelligence/openai-offers-free-one-year-chatgpt-go-access-in-india-starting-november-4
- **Confidence:** medium (funding) / high (ads, India offers).

**7d OPT**
- **Narration:** "And it keeps getting cheaper to run. Altman: 'The cost to use a given level of AI falls about 10x every 12 months.'"
- **Caption:** Same AI, 1,000x cheaper in 3 years: $60 → $0.06 per million tokens (a16z, Nov 2024)
- **Sources:**
  - https://www.a16z.com/llmflation-llm-inference-cost
  - https://blog.samaltman.com/three-observations
- **Confidence:** high. This holds at a fixed capability level only.

**7e CORE (synthesis)**
- **Narration:** "If you're not paying full price, you're paying partly in data and partly in attention. Your chats can train the next model. Your eyes are the new ad inventory."
- **Caption:** Why it's cheap: market share + investor cash + falling costs + your data and attention
- **Confidence:** medium. This is a synthesis, not one source's claim.

### Beat 8: Opt-outs exist, but defaults win (2:15–2:28)

**8a CORE**
- **Narration:** "Here's the twist: there is a switch. OpenAI, Anthropic, Google and GitHub all let you opt out of training. Paying businesses are excluded by default. But a paying ChatGPT Plus subscriber is still opted in. The line isn't free versus paid. It's consumer versus business."
- **Caption:** OpenAI: no training on API data by default since MAR 1, 2023 · business tiers excluded at OpenAI, Anthropic and GitHub
- **Sources:**
  - https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance
  - https://techcrunch.com/2023/03/01/addressing-criticism-openai-will-no-longer-use-customer-data-to-train-its-models-by-default/
- **Confidence:** high.

**8b CORE**
- **Narration:** "But defaults win. In one well-known study, fewer than 5% of users had changed any settings at all."
- **Caption:** "Less than 5% of the users we surveyed had changed any settings at all" (Jared Spool, UIE, 2011)
- **Source:** https://archive.uie.com/brainsparks/2011/09/14/do-users-change-their-settings/
- **Confidence:** medium. A small, informal survey; present it as illustrative.

**8c OPT**
- **Narration:** "If you let Anthropic train on your Claude chats, they're kept for five years instead of 30 days."
- **Caption:** AUG 28, 2025 · 5-year retention if you opt in (Anthropic)
- **Source:** https://www.anthropic.com/news/updates-to-our-consumer-terms
- **Confidence:** high.

### Beat 9: Inner capital, the close (2:28–3:00)
*Tone shift: lighter music, daylight.*

**9a CORE**
- **Narration:** "Meanwhile, something else is being spent. In 2004, office workers stayed on one screen for about two and a half minutes before switching. Today it's about 47 seconds."
- **Caption:** 2004: ~2.5 MIN → TODAY: ~47 SEC on one screen before switching (Gloria Mark, UC Irvine, "Attention Span")
- **Source:** https://www.universityofcalifornia.edu/news/how-sharpen-your-attention-and-meet-your-goals-2024
- **Confidence:** high.

**9b CORE**
- **Narration:** "Leaning on the tool has a cost. In a randomized study of nearly 1,000 students, unrestricted GPT-4 raised practice grades 48%. When the AI was taken away, those students scored 17% lower than students who never had it."
- **Caption:** PNAS, JUN 2025 · With AI: +48% · AI removed: −17% vs never-users (Bastani et al.)
- **Source:** https://doi.org/10.1073/pnas.2422633122
- **Confidence:** high.
- **Note:** a tutor version with safeguards largely avoided the drop. How you use it matters.

**9c OPT**
- **Narration:** "Anthropic tested its own kind of product. Engineers who learned a new library with AI help scored 50% on a quiz, against 67% for those who coded by hand."
- **Caption:** JAN 2026 · AI-assisted 50% vs hand-coding 67% (Anthropic)
- **Source:** https://www.anthropic.com/research/AI-assistance-coding-skills
- **Confidence:** high.

**9d OPT**
- **Narration:** "After doctors started using AI in colonoscopies, they found fewer precancerous growths when working without it: 28.4% before, 22.4% after."
- **Caption:** AUG 2025 · Detection without AI: 28.4% → 22.4% (Lancet Gastroenterology & Hepatology)
- **Source:** https://doi.org/10.1016/S2468-1253(25)00133-5
- **Confidence:** high. Observational study.

**9e OPT**
- **Narration:** "Microsoft researchers found that the more people trust AI, the less critical thinking they report doing."
- **Caption:** CHI 2025 · 319 knowledge workers: more trust in AI = less critical thinking (Lee et al., Microsoft Research & CMU)
- **Source:** https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/
- **Confidence:** high. Correlational and self-reported.
- **Possible on-screen line:** "...leaving them atrophied and unprepared when the exceptions do arise" (Lee et al., on Bainbridge).

**9f CORE**
- **Narration:** "Your body is part of the answer. Across 1.2 million Americans, people who exercised reported about 43% fewer bad mental-health days a month. The WHO's target is 150 to 300 minutes a week, and some is better than none."
- **Captions:**
  - LANCET PSYCHIATRY, 2018 · 1.49 (43%) fewer poor-mental-health days/month (Chekroud et al.)
  - WHO 2020 · 150–300 min moderate activity/week
- **Sources:**
  - https://doi.org/10.1016/S2215-0366(18)30227-X
  - https://doi.org/10.1136/bjsports-2020-102955
- **Confidence:** high. The Chekroud result is an association.

**9g OPT**
- **Narration:** "1.8 billion adults don't move enough. One in three American adults don't sleep enough."
- **Captions:**
  - WHO, JUN 2024 · 1.8B adults (31%) not active enough
  - CDC · 1 in 3 US adults get less than 7 hours of sleep
- **Sources:**
  - https://www.who.int/news/item/26-06-2024-nearly-1.8-billion-adults-at-risk-of-disease-from-not-doing-enough-physical-activity
  - https://www.cdc.gov/sleep/data-research/facts-stats/adults-sleep-facts-and-stats.html
- **Confidence:** high.

**9h CORE (final line)**
- **Narration:** "So build the startup. Raise the round. Use the tools. Being part of the flywheel can be a fair trade. But know what you're feeding, and invest first in what no model can train for you: your attention, your mind, your body."
- **Caption:** *(none, end card)*

---

## 3. Do not say

| Don't say | Why |
|---|---|
| "Everyone thought ChatGPT was junk" | The public adopted it instantly. Only some experts and institutions were skeptical. |
| "Altman dismissed ChatGPT" | His "incredibly limited" tweet warned against over-trusting it. |
| "The flywheel started with ChatGPT" | InstructGPT (Mar 2022) already used API prompts. Say "went public-scale". |
| "It's just scaling laws" | Human feedback (RLHF) and user data were essential alongside scale. |
| "Every chat you typed trained GPT-4" / "your chats trained GPT-4 from scratch" | The documented use is user-flagged and feedback data, plus prompts, used in post-training and reward models, not pretraining. |
| "Fastest-growing app ever" / "100 million users" stated as fact | Say "at the time" (Threads passed it in Jul 2023) and "an estimated 100 million" (an analyst estimate from web traffic). |
| "OpenAI 4.6" / "OpenAI 5.5" | No OpenAI 4.6 exists. Say Claude Opus 4.6 / Claude Opus 5.5. GPT-5.5 (Apr 23, 2026) is a different model. |
| "Opus 5.5 is another 4.6-level leap" stated as fact | That's opinion. Anthropic itself says benchmark margins are a less reliable guide. |
| "Anthropic's best coding model" (Opus 4.6) | Anthropic's wording was "our smartest model". |
| GPT-5.5 82.7% vs Opus 5.5 66.4% | Different tests (Terminal-Bench 2.0 vs 4.0). Don't compare them. |
| "Trillion-dollar sell-off" or any dollar total; "Opus 4.6 caused the crash" | Estimates vary, and the Cowork plug-ins drove most of the sell-off. |
| "81.42% on SWE-bench" as a clean score | It used a prompt modification, and the benchmark was flagged as contaminated. Use "~80%, lab-reported". |
| "Copilot went from autocomplete to agent within months" | It took about 4 years (Jun 2021 to May 2025). |
| "Startups were nuked/killed"; "Jasper died"; "Chegg was an AI startup" | No reputable report ties specific shutdowns to these launches. Jasper pivoted. Chegg was a public homework-help company. |
| "We will steamroll you" as a verbatim Altman quote | That's the newsletter's summary. Use "steamrolled". |
| Fast Company "killed the wrapper market" quote | Unverified; the page couldn't be fetched. |
| Cursor's "$60B" acquisition price; Jasper "$1.7B" | The price is unverified. Jasper's figure was corrected to $1.5B. |
| "It's free because you are the data" as fact | No lab says this. Investors, ads, market share and falling costs also explain it. |
| "You have no other option" | Opt-outs exist, plus Temporary Chat. Business and API tiers are excluded by default. |
| "Free users are in, paying users are out" | ChatGPT Plus users are also in by default. The split is consumer vs business. |
| "94% of 1.2 billion users don't pay" | There's no subscriber figure matching 1.2B. Say "about 1 in 20" (Feb 2026) or "the vast majority". |
| "$38.5B loss" | Inflated by non-cash charges from the for-profit conversion. Use the ~$21B operating loss. |
| "Every plan loses money today" | Altman's Pro remark is from Jan 2025 and covers one plan. |
| "Advertisers read your chats" | OpenAI says advertisers don't see chats. Ads "can be" matched to them. Ad revenue figures are projections, not results. |
| "Meta trains on your AI chats with no opt-out" | Meta's no-opt-out change (Dec 16, 2025) is for ad personalization, not model training. |
| "Rating a reply sends your whole chat into training even if you opted out" | The researchers disagreed on whether this could be verified (medium). Check the live OpenAI help page before using it. |
| "Anthropic's toggle defaults to On"; "Sept 28 deadline" | The toggle claim is second-hand (via The Verge). Anthropic's live page says Oct 8, 2025. |
| "Frontier AI gets 10x cheaper every year" | That holds only at a fixed capability level. |
| "Our attention span is 47 seconds" / "8 seconds, shorter than a goldfish" | 47 s is time on one screen before switching. The goldfish claim has no study behind it. |
| "It takes 23 minutes to refocus" | Not verified. |
| "ChatGPT makes you dumber" / "brain rot" / "damage" | The MIT authors explicitly ask people not to say this. It's a preprint with 54 participants. |
| "AI causes a decline in critical thinking"; "83 of 319" or "36%" | The Microsoft/CMU study is correlational and self-reported, and those numbers are unverified. |
| "AI makes doctors worse"; calling the endoscopy study a "randomized trial" | It's observational. AI-assisted colonoscopy still finds more growths overall. |
| "Exercise is 1.5x more effective than therapy or medication" | The comparison was against usual care, and 77 of the 97 reviews were rated low quality. |
| "AI users scored 17% lower" (Anthropic study) | Ambiguous. Show 50% vs 67% (17 points). |
| Crediting the "atrophied" quote to Bainbridge | It's the Microsoft authors' (Lee et al.) paraphrase. |
| "Shopify/Duolingo ordered staff to use Copilot"; "Microsoft formally reviews AI use" | These were general AI mandates. The Microsoft memo is a reported leak, and a spokesperson denied any formal review. |
| "You idiots" | Undermines credibility with the very audience the video is trying to reach. |

---

## 4. Sources

**Origins and scaling**
- Introducing ChatGPT, OpenAI, 2022-11-30: https://openai.com/index/chatgpt/
- ChatGPT sets record for fastest-growing user base (analyst note), Reuters via Yahoo Finance, 2023-02-01: https://finance.yahoo.com/news/1-chatgpt-sets-record-fastest-051929384.html
- ChatGPT Crosses 1 Million Users In 5 Days, Entrepreneur India, 2022-12: https://india.entrepreneur.com/news-and-trends/internet-sensation-chatgpt-crosses-1-million-users-in-5-days/440390
- Stack Overflow bans ChatGPT, The Register, 2022-12-05: https://www.theregister.com/2022/12/05/stack_overflow_bans_chatgpt/
- OpenAI CEO admits ChatGPT risks, VentureBeat, 2022-12-12: https://venturebeat.com/ai/openai-ceo-admits-chatgpt-risks-what-now-the-ai-beat
- ChatGPT "not particularly innovative" (LeCun), NYU Tandon / ZDNet, 2023-01-23: https://engineering.nyu.edu/news/chatgpt-not-particularly-innovative-and-nothing-revolutionary-says-metas-chief-ai-scientist
- GPT-4 System Card, OpenAI, 2023-03-14: https://cdn.openai.com/papers/gpt-4-system-card.pdf
- GPT-4 Technical Report, OpenAI / arXiv, 2023-03-15: https://arxiv.org/abs/2303.08774
- GPT-4, OpenAI, 2023-03-14: https://openai.com/index/gpt-4/
- GPT-4 announcement copy, Simon Willison, 2023-03-14: https://simonwillison.net/2023/Mar/14/openai/
- Scaling Laws for Neural Language Models, Kaplan et al. / arXiv, 2020-01-23: https://arxiv.org/abs/2001.08361
- Training Compute-Optimal LLMs (Chinchilla), DeepMind / arXiv, 2022-03-29: https://arxiv.org/abs/2203.15556
- Training language models to follow instructions with human feedback (InstructGPT), OpenAI / arXiv, 2022-03-04: https://arxiv.org/abs/2203.02155

**The flywheel and data policies**
- What is a Data Flywheel?, NVIDIA, undated: https://www.nvidia.com/en-us/glossary/data-flywheel/
- How your data is used to improve model performance, OpenAI, updated 2026-03-13: https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/
- Same topic, OpenAI Help Center: https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance
- New ways to manage your data in ChatGPT, OpenAI, 2023-04-25: https://openai.com/index/new-ways-to-manage-your-data-in-chatgpt
- OpenAI will no longer use customer data to train by default, TechCrunch, 2023-03-01: https://techcrunch.com/2023/03/01/addressing-criticism-openai-will-no-longer-use-customer-data-to-train-its-models-by-default/
- Do OpenAI use customers' prompts for training? (quotes the API FAQ), OpenAI Developer Community, 2023: https://community.openai.com/t/do-openai-use-customers-prompts-for-training-their-models/166615
- OpenAI clarifies its data privacy practices for API users, Maginative, 2023-07-24: https://www.maginative.com/article/openai-clarifies-its-data-privacy-practices-for-api-users/
- Expanding on what we missed with sycophancy, OpenAI, 2025-05-02: https://openai.com/index/expanding-on-sycophancy/
- What we missed with sycophancy, Simon Willison, 2025-05-02: https://simonwillison.net/2025/May/2/what-we-missed-with-sycophancy/
- OpenAI explains why ChatGPT became too sycophantic, TechCrunch, 2025-04-29: https://techcrunch.com/2025/04/29/openai-explains-why-chatgpt-became-too-sycophantic
- Updates to Consumer Terms and Privacy Policy, Anthropic, 2025-08-28: https://www.anthropic.com/news/updates-to-our-consumer-terms
- Anthropic to use Claude chats for AI training (citing The Verge), Communications Today, 2025-09-02: https://www.communicationstoday.co.in/anthropic-to-use-claude-chats-for-ai-training-by-sept-28/
- Updates to GitHub Copilot interaction data usage policy, GitHub Blog, 2026-03-25: https://github.blog/news-insights/company-news/updates-to-github-copilot-interaction-data-usage-policy/
- Updates to our Privacy Statement and Terms of Service, GitHub Changelog, 2026-03-25: https://github.blog/changelog/2026-03-25-updates-to-our-privacy-statement-and-terms-of-service-how-we-use-your-data/
- GitHub will train Copilot models with user data (opt-out), heise, 2026-03: https://www.heise.de/en/news/Only-with-opt-out-GitHub-will-train-Copilot-models-with-user-data-in-the-future-11226787.html
- Gemini Apps Privacy Hub, Google, updated 2026-10-19: https://support.google.com/gemini/answer/13594961?hl=en
- Be Careful What You Tell Your AI Chatbot, Stanford HAI, 2025-10-15: https://hai.stanford.edu/news/be-careful-what-you-tell-your-ai-chatbot
- User Privacy and LLMs (King et al.), arXiv / AIES, 2025-09-05: https://arxiv.org/abs/2509.05382
- Do users change their settings?, UIE / Jared Spool, 2011-09-14: https://archive.uie.com/brainsparks/2011/09/14/do-users-change-their-settings/
- Improving your recommendations with AI at Meta, Meta, 2025-10-01: https://about.fb.com/news/2025/10/improving-your-recommendations-apps-ai/
- Meta will use AI conversations to personalize ads, The Register, 2025-10-01: https://www.theregister.com/2025/10/01/meta_ai_use_informs_ads/
- How to stop X using your data to train Grok, TechCrunch, 2024-07-26: https://techcrunch.com/2024/07/26/heres-how-to-disable-x-twitter-from-using-your-data-to-train-its-grok-ai

**Startup graveyard**
- New models and developer products announced at DevDay, OpenAI, 2023-11-06: https://openai.com/index/new-models-and-developer-products-announced-at-devday/
- OpenAI launches GPT-4 Turbo, TechCrunch, 2023-11-06: https://techcrunch.com/2023/11/06/openai-launches-gpt-4-turbo-and-launches-fine-tuning-program-for-gpt-4/
- OpenAI launches Assistants API, TechCrunch, 2023-11-06: https://techcrunch.com/2023/11/06/openai-launches-api-that-lets-developers-build-assistants-into-their-apps/
- ChatGPT now has 100 million weekly active users, TechCrunch, 2023-11-06: https://techcrunch.com/2023/11/06/openais-chatgpt-now-has-100-million-weekly-active-users/
- A ChatGPT update could wreck a bunch of AI startups, Decrypt, 2023-10-31: https://decrypt.co/203920/openai-pdf-chatbot-ai-startups-sherlocked
- Startups learn the hard way that relying on OpenAI can burn them, TechCrunch, 2023-11-06: https://techcrunch.com/2023/11/06/get-the-pdf-outta-here/
- Altman explains why OpenAI might steamroll your startup, The Decoder, 2024-04-17: https://the-decoder.com/sam-altman-explains-why-openai-might-steamroll-your-ai-startup/
- 20VC Newsletter, 20VC, 2024-04-21: https://20vc.substack.com/p/20vc-newsletter-apr-21st-2024
- Altman: OpenAI "going to steamroll you", Tech Startups, 2024-04-22: https://techstartups.com/2024/04/22/sam-altman-openai-is-going-to-steamroll-you-if-your-startup-is-a-wrapper-on-gpt-4/
- Jasper raises $125M at $1.5B, TechCrunch, 2022-10-18: https://techcrunch.com/2022/10/18/ai-content-platform-jasper-raises-125m-at-a-1-7b-valuation/
- Jasper laying off staff, Voicebot.ai, 2023-07-17: https://voicebot.ai/2023/07/17/jasper-ai-laying-off-staff-9-months-after-125m-raise/
- Jasper cuts internal valuation, Maginative (citing The Information), 2023-09-29: https://www.maginative.com/article/jasper-cuts-internal-valuation-as-ai-growth-slows/
- Chegg's stock plunges, AP via News4Jax, 2023-05-02: https://www.news4jax.com/business/2023/05/02/cheggs-stock-plunges-on-fears-of-competition-from-chatgpt/
- Chegg slashing 45% of staff, Fortune, 2025-10-28: https://www.fortune.com/2025/10/28/chegg-layoffs-ceo-dan-rosensweig-poster-child-ai-slashing-staff-shares
- OpenAI launches Operator, TechCrunch, 2025-01-23: https://techcrunch.com/2025/01/23/openai-launches-operator-an-ai-agent-that-performs-tasks-autonomously/
- OpenAI launches a general-purpose agent in ChatGPT, TechCrunch, 2025-07-17: https://techcrunch.com/2025/07/17/openai-launches-a-general-purpose-agent-in-chatgpt/
- OpenAI launches AgentKit, TechCrunch, 2025-10-06: https://techcrunch.com/2025/10/06/openai-launches-agentkit-to-help-developers-build-and-ship-ai-agents
- OpenAI launches ChatGPT Atlas, TechCrunch, 2025-10-21: https://techcrunch.com/2025/10/21/openai-launches-an-ai-powered-browser-chatgpt-atlas
- Recap: OpenAI DevDay 2025, Artificial Ignorance, 2025-10-07: https://www.ignorance.ai/p/recap-openai-devday-2025
- ChatGPT Deep Research, Wikipedia: https://en.wikipedia.org/wiki/ChatGPT_Deep_Research
- Cursor raises $2.3B at $29.3B, AI Business, 2025-11-14: https://aibusiness.com/generative-ai/cursor-raises-billions-continued-momentum
- Cursor recurring revenue doubles to $2B, Bloomberg, 2026-03-02: https://www.bloomberg.com/news/articles/2026-03-02/cursor-recurring-revenue-doubles-in-three-months-to-2-billion
- Cursor is now a part of SpaceX, Cursor, 2026-08-14: https://cursor.com/blog/joining-spacex

**Coding agents and models**
- Introducing GitHub Copilot, GitHub Blog, 2021-06-29: https://github.blog/2021-06-29-introducing-github-copilot-ai-pair-programmer/
- Copilot available to individual developers, GitHub Changelog, 2022-06-21: https://github.blog/changelog/2022-06-21-github-copilot-is-now-available-to-individual-developers/
- Meet the new coding agent, GitHub Blog, 2025-05-19: https://github.blog/news-insights/product-news/github-copilot-meet-the-new-coding-agent/
- Copilot coding agent generally available, GitHub Changelog, 2025-09-25: https://github.blog/changelog/2025-09-25-copilot-coding-agent-is-now-generally-available/
- Shopify CEO declares AI non-optional, Digital Commerce 360, 2025-04-08: https://www.digitalcommerce360.com/2025/04/08/internal-memo-shopify-ceo-declares-ai-non-optional/
- Duolingo goes "AI first", Computing, 2025-04-29: https://www.computing.co.uk/news/2025/ai/duolingo-goes-ai-first-as-it-phases-out-human-contractors
- Duolingo to use AI instead of contractors, Tom's Guide, 2025-04: https://www.tomsguide.com/ai/duolingo-wants-to-ditch-contractors-in-favor-of-ai
- AI is no longer optional at Microsoft, PC Gamer via Yahoo Tech, 2025-06-29: https://tech.yahoo.com/ai/articles/ai-no-longer-optional-microsoft-183003779.html
- Coinbase CEO fired engineers who didn't try AI, TechCrunch, 2025-08-22: https://techcrunch.com/2025/08/22/coinbase-ceo-explains-why-he-fired-engineers-who-didnt-try-ai-immediately
- Coinbase AI coding mandate, Fortune, 2025-08-25: https://fortune.com/2025/08/25/coinbase-ceo-brian-armstrong-ai-coding-assistants-mandate-tech
- Claude 3.7 Sonnet and Claude Code, Anthropic, 2025-02-24: https://www.anthropic.com/news/claude-3-7-sonnet
- Introducing Claude 4, Anthropic, 2025-05-22: https://www.anthropic.com/news/claude-4
- Introducing Codex, OpenAI, 2025-05-16: https://openai.com/index/introducing-codex/
- Introducing Claude Opus 4.6, Anthropic, 2026-02-05: https://www.anthropic.com/news/claude-opus-4-6
- Anthropic's AI tools deepen sell-off, Reuters via Yahoo Finance, 2026-02-03: https://finance.yahoo.com/news/anthropics-ai-tools-deepen-selloff-054551832.html
- Claude triggered a trillion-dollar selloff, Fortune, 2026-02-06: https://fortune.com/2026/02/06/anthropic-claude-opus-4-6-stock-selloff-new-upgrade/
- Introducing Claude Opus 5.5, Anthropic, 2026-09-22: https://www.anthropic.com/claude-opus-5-5
- Anthropic releases Opus 5.5, TechCrunch, 2026-09-22: https://techcrunch.com/2026/09/22/anthropic-releases-opus-5-5-with-lower-prices-and-fable-level-performance/
- OpenAI releases GPT-5.5, TechCrunch, 2026-04-23: https://techcrunch.com/2026/04/23/openai-chatgpt-gpt-5-5-ai-model-superapp/
- GPT-4.5 and GPT-5.5, Wikipedia: https://en.wikipedia.org/wiki/GPT-4.5 · https://en.wikipedia.org/wiki/GPT-5.5
- SWE-bench (Jimenez et al.), arXiv, 2023-10-10: https://arxiv.org/abs/2310.06770
- Introducing SWE-bench Verified, OpenAI, 2024-08-13: https://openai.com/index/introducing-swe-bench-verified/
- Why we no longer evaluate SWE-bench Verified, OpenAI, 2026-02-23: https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/

**Subsidy and who pays**
- ChatGPT reaches 900M weekly active users, TechCrunch, 2026-02-27: https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users
- OpenAI's latest features take aim at the app store model, TechCrunch, 2026-09-29: https://techcrunch.com/2026/09/29/openais-latest-features-take-direct-aim-at-the-app-store-model/
- OpenAI Dev Day 2026 live updates, Engadget, 2026-09-29: https://www.engadget.com/2271985/openai-dev-day-live-blog-chatgpt-news/
- ChatGPT reaches 1.2 billion people every week, The Decoder, 2026-09-29: https://the-decoder.com/chatgpt-now-reaches-1-2-billion-people-every-week-openai-says
- ChatGPT has hit 800M weekly active users, TechCrunch, 2025-10-06: https://techcrunch.com/2025/10/06/sam-altman-says-chatgpt-has-hit-800m-weekly-active-users/
- OpenAI receives $110B in investments, AP via Spectrum News 13, 2026-02-27: https://mynews13.com/fl/orlando/ap-top-news/2026/02/27/chatgpt-maker-openai-receives-110b-in-investments-from-amazon-nvidia-and-softbank
- OpenAI raised a record $110 billion, Entrepreneur, 2026-02-27: https://www.entrepreneur.com/business-news/openai-just-raised-record-110-billion
- Only 5 percent of ChatGPT users pay, The Decoder (citing The Information), 2026-01-05: https://the-decoder.com/only-5-percent-of-chatgpts-900-million-weekly-users-pay-and-reportedly-most-arent-worth-much-to-advertisers/
- OpenAI sees $5 billion loss in 2024, Fortune, 2024-09-28: https://fortune.com/2024/09/28/openai-5-billion-loss-2024-revenue-forecasts-fundraising-chapgpt-fee-hikes
- OpenAI 2025 financials leaked, Yahoo Finance, 2026-06-16: https://finance.yahoo.com/markets/stocks/articles/openai-2025-financials-leaked-38-121508294.html
- OpenAI expects to burn $115B through 2029, Reuters via Yahoo Finance, 2025-09-06: https://finance.yahoo.com/news/openai-expects-business-burn-115-022035561.html
- Altman: losing money on $200 Pro, Fortune, 2025-01-07: https://fortune.com/2025/01/07/sam-altman-openai-chatgpt-pro-subscription-losing-money-tech
- Even at $200/mo, ChatGPT Pro struggles to turn a profit, The Register, 2025-01-06: https://www.theregister.com/2025/01/06/altman_gpt_profits/
- ChatGPT rolls out ads, TechCrunch, 2026-02-09: https://www.techcrunch.com/2026/02/09/chatgpt-rolls-out-ads/
- OpenAI starts testing ads in ChatGPT, NBC News, 2026-02-09: https://www.nbcnews.com/tech/internet/openai-starts-testing-ads-chatgpt-rcna258242
- OpenAI to test ads across Free and Go tiers, SiliconANGLE, 2026-01-16: https://siliconangle.com/2026/01/16/openai-start-testing-chatgpt-ads-across-free-go-tiers/
- OpenAI brings advertising to ChatGPT, Forklog, 2026-02-09: https://forklog.com/en/news/openai-brings-advertising-to-chatgpt
- OpenAI projects $100B ad revenue by 2030, PYMNTS (citing Axios), 2026-04-09: https://www.pymnts.com/artificial-intelligence-2/2026/openai-projects-steep-advertising-growth-targeting-100-billion-by-2030/
- Free ChatGPT Go in India, Outlook Business, 2025-10-28: https://www.outlookbusiness.com/artificial-intelligence/openai-offers-free-one-year-chatgpt-go-access-in-india-starting-november-4
- Free Gemini on Jio, Engadget, 2025-10-31: https://engadget.com/ai/google-brings-free-gemini-access-to-indias-largest-carrier-130627625.html
- Airtel and Perplexity tie-up, Outlook Business, 2025-07-17: https://www.outlookbusiness.com/corporate/airtel-beats-jio-to-ai-chatbot-punch-with-perplexity-tie-up
- Altman defends the ChatGPT ad model, Analytics India Magazine, 2026-02-05: https://analyticsindiamag.com/ai-news/sam-altman-pans-anthropic-super-bowl-ad-defends-chatgpt-ad-model
- Welcome to LLMflation, a16z, 2024-11-12: https://www.a16z.com/llmflation-llm-inference-cost
- Three Observations, Sam Altman, 2025-02-09: https://blog.samaltman.com/three-observations

**Inner capital**
- How to sharpen your attention (Gloria Mark), UC Newsroom, 2024-01-02: https://www.universityofcalifornia.edu/news/how-sharpen-your-attention-and-meet-your-goals-2024
- Our 47-Second Attention Span (transcript), Steelcase: https://www.steelcase.com/research/articles/our-47-second-attention-span-with-gloria-mark-s5-ep3-transcript/
- "Constant, constant, multi-tasking craziness" (CHI 2004), González & Mark via OpenAlex, 2004-04-25: https://api.openalex.org/works/doi:10.1145/985692.985707
- Gloria Mark's 47-second figure (analysis), Silicon Canals: https://siliconcanals.com/t-screen-attention-47-seconds-gloria-mark/
- Busting the attention span myth, BBC World Service, 2017-03-10: https://www.bbc.com/news/health-38896790
- Goldfish MythBusting (reproduces the BBC and WSJ pieces), UW-Madison: https://internet.psych.wisc.edu/wp-content/uploads/532-Master/532-UnitPages/Unit-09/Goldfish_MythBusting.pdf
- The Cost of Interrupted Work, Mark et al. / CHI 2008, 2008-04: https://www.interruptions.net/literature/Mark-CHI08.pdf
- Your Brain on ChatGPT, Kosmyna et al. / arXiv, 2025-06-10: https://arxiv.org/abs/2506.08872
- Study site and FAQ, MIT Media Lab: https://www.brainonllm.com/ · https://www.brainonllm.com/faq
- Comment on "Your Brain on ChatGPT", Stankovic et al. / arXiv, 2025-12-29: https://arxiv.org/abs/2601.00856
- Impact of GenAI on Critical Thinking, Microsoft Research / CHI 2025, 2025-04: https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/ (PDF: https://advait.org/files/lee_2025_ai_critical_thinking_survey.pdf)
- Generative AI without guardrails can harm learning, PNAS, 2025-06-25: https://doi.org/10.1073/pnas.2422633122
- How AI assistance impacts coding skills, Anthropic, 2026-01-29: https://www.anthropic.com/research/AI-assistance-coding-skills (paper: https://arxiv.org/abs/2601.20245)
- Endoscopist deskilling after AI exposure, Lancet Gastroenterology & Hepatology, 2025-08-12: https://doi.org/10.1016/S2468-1253(25)00133-5
- Exercise and mental health in 1.2M individuals, Lancet Psychiatry, 2018-08-08: https://doi.org/10.1016/S2215-0366(18)30227-X
- Physical activity for depression, anxiety and distress, BJSM, 2023-02-16: https://doi.org/10.1136/bjsports-2022-106195
- WHO 2020 physical activity guidelines, BJSM / WHO, 2020-11-25: https://doi.org/10.1136/bjsports-2020-102955 · https://www.who.int/publications/i/item/9789240015128
- Nearly 1.8 billion adults insufficiently active, WHO, 2024-06-26: https://www.who.int/news/item/26-06-2024-nearly-1.8-billion-adults-at-risk-of-disease-from-not-doing-enough-physical-activity
- 1 in 3 adults don't get enough sleep, CDC, 2016-02-18: https://archive.cdc.gov/www_cdc_gov/media/releases/2016/p0215-enough-sleep.html
- Adults Sleep Facts and Stats, CDC, 2024-05-15: https://www.cdc.gov/sleep/data-research/facts-stats/adults-sleep-facts-and-stats.html