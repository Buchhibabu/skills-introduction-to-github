// Dumps the film's sound cues and music sections so the score can be synced to the picture.
//   node build/cues.mjs film.html out/cues.json
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const [, , film, out] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(resolve(film)).href);
await page.evaluate(() => window.FILM.ready);
const cues = await page.evaluate(() => ({ duration: window.FILM.duration, music: window.MUSIC || [], sfx: window.FILM.sfx }));
await browser.close();
cues.sfx.sort((a, b) => a.t - b.t);
writeFileSync(out, JSON.stringify(cues, null, 1));
console.log(`${cues.sfx.length} sfx cues, ${cues.music.length} music sections, ${cues.duration}s`);
