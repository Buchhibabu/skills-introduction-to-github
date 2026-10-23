// Contact sheet for one B-roll shot, plus render cost and a determinism check.
//
//   node build/shot_sheet.mjs <shot> <out.png> [--dur 8] [--frames 6] [--opts '{"mode":"hero"}'] [--overlay doc|title|lower|none]
//
// Writes <out.png> (a 3x2 grid of frames spread over the shot) and <out>_f<N>.png full-size frames.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const [, , shot, outPng, ...rest] = process.argv;
const opt = { dur: 8, frames: 6, opts: '{}', overlay: 'none' };
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
const dur = Number(opt.dur), n = Number(opt.frames);
const here = dirname(new URL(import.meta.url).pathname);
const url = pathToFileURL(resolve(here, '../broll/harness.html')).href +
  `?shot=${encodeURIComponent(shot)}&dur=${dur}&overlay=${opt.overlay}&opts=${encodeURIComponent(opt.opts)}`;

const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb', '--allow-file-access-from-files', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => window.FILM.ready).catch((e) => errors.push(String(e)));
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); await browser.close(); process.exit(1); }

const dir = dirname(resolve(outPng)), stem = basename(outPng, '.png');
mkdirSync(dir, { recursive: true });
const times = Array.from({ length: n }, (_, i) => +(dur * (i + 0.5) / n).toFixed(3));
const files = [], hashes = {};
const t0 = Date.now();
for (const [i, t] of times.entries()) {
  await page.evaluate((t) => window.FILM.seek(t), t);
  const f = join(dir, `${stem}_f${i + 1}.png`);
  const buf = await page.screenshot({ path: f });
  hashes[t] = createHash('md5').update(buf).digest('hex');
  files.push(f);
}
const ms = (Date.now() - t0) / n;
// determinism: seek back to an earlier frame out of order and compare
const tt = times[Math.floor(n / 2)];
await page.evaluate((t) => window.FILM.seek(t), times[n - 1]);
await page.evaluate((t) => window.FILM.seek(t), tt);
const again = createHash('md5').update(await page.screenshot()).digest('hex');
await browser.close();
const cols = 3, rows = Math.ceil(n / cols);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]),
  '-filter_complex', files.map((_, i) => `[${i}:v]scale=640:360[s${i}]`).join(';') + ';' + files.map((_, i) => `[s${i}]`).join('') +
  `xstack=inputs=${files.length}:layout=` + files.map((_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|') + '[o]',
  '-map', '[o]', resolve(outPng)]);
console.log(JSON.stringify({ shot, sheet: resolve(outPng), frames: files, times, ms_per_frame: Math.round(ms), deterministic: again === hashes[tt], errors }));
