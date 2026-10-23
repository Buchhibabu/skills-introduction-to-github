// Renders film.html frame by frame with headless Chromium and encodes the frames with ffmpeg.
//
//   node build/render.mjs film.html out/video.mp4 [--fps 24] [--workers 3] [--from 0] [--to 999]
//   node build/render.mjs film.html out/stills --stills 3,12.5,40      (PNG stills for review)
//
// film.html must expose window.FILM = { duration, ready: Promise, seek(t) }.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const [, , filmPath, outPath, ...rest] = process.argv;
const opt = { fps: 24, workers: 3, from: 0, to: Infinity, stills: null };
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
const fps = Number(opt.fps);
const url = pathToFileURL(resolve(filmPath)).href;

async function openFilm(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(url);
  await page.evaluate(() => window.FILM.ready);
  return page;
}

function encoder(file) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg',
    '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  return { ff, done };
}

// file access lets module scripts (three.js B-roll) load from disk; SwiftShader renders WebGL without a GPU
const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb', '--allow-file-access-from-files', '--enable-unsafe-swiftshader'] });

if (opt.stills) {
  mkdirSync(outPath, { recursive: true });
  const page = await openFilm(browser);
  for (const t of String(opt.stills).split(',').map(Number)) {
    await page.evaluate((t) => window.FILM.seek(t), t);
    await page.screenshot({ path: join(outPath, `still_${t.toFixed(2).padStart(7, '0')}.png`) });
  }
  await browser.close();
  process.exit();
}

const probe = await openFilm(browser);
const duration = await probe.evaluate(() => window.FILM.duration);
await probe.close();
const first = Math.round(Number(opt.from) * fps);
const last = Math.min(Math.round(Math.min(Number(opt.to), duration) * fps), Math.round(duration * fps));
const workers = Number(opt.workers);
const per = Math.ceil((last - first) / workers);
const tmp = join(dirname(resolve(outPath)), '.segments');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const started = Date.now();
let doneFrames = 0;
const segs = await Promise.all(Array.from({ length: workers }, async (_, w) => {
  const a = first + w * per, b = Math.min(last, a + per);
  const file = join(tmp, `seg${w}.mp4`);
  if (a >= b) return null;
  const page = await openFilm(browser);
  const { ff, done } = encoder(file);
  for (let f = a; f < b; f++) {
    await page.evaluate((t) => window.FILM.seek(t), f / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (++doneFrames % 240 === 0) console.log(`${doneFrames}/${last - first} frames, ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await done;
  await page.close();
  return file;
}));
await browser.close();

const list = join(tmp, 'list.txt');
writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outPath], { stdio: 'inherit' })
  .on('close', (c) => (c === 0 ? res() : rej(new Error('concat ' + c)))));
rmSync(tmp, { recursive: true, force: true });
console.log(`rendered ${last - first} frames in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${outPath}`);
