// Design-tournament driver for VICE SUNSET Cover Studio.
//
// Serves app/ locally, drives the editor's own controls (layout tiles, grade
// tiles, photo targeting, caption fields, note switch), then produces the
// cover through the app's own export path (window.ViceSunsetStudio.exportCover)
// at 1080x1080. Each render is downscaled to a 768px-wide JPEG under
// tournament/renders/<id>.jpg, and tournament/manifest.md is kept in sync.
//
// Usage:
//   node tools/tournament.mjs v01 v02 v03
// Existing non-trivial renders are skipped, so re-runs resume.

import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const APP_ROOT = join(REPO, 'app');
const OUT_DIR = join(REPO, 'tournament', 'renders');
const MANIFEST = join(REPO, 'tournament', 'manifest.md');
const MIN_RENDER_BYTES = 6 * 1024; // anything smaller is treated as blank/broken
const EXPORT_SIZE = 'square';      // 1080 x 1080

/* ---------- variant table ---------- */

const CAPTIONS = {
  headline: 'VICE SUNSET',
  kicker: 'THE CITY THAT NEVER SLEEPS IN',
  subline: 'EVERY STREET HAS A PRICE'
};

const NOTE_TEXT = "dear judge, this one's for you";

// photo keys map to the two bundled samples.
const PHOTO_SRC = {
  boulevard: 'samples/boulevard.jpg',
  pier: 'samples/pier.jpg'
};

const VARIANTS = {
  v01: { layout: 'hero-stack', grade: 'vice-sunset', photos: 'boulevard-all' },
  v02: { layout: 'quad-grid', grade: 'vice-sunset', photos: 'boulevard-all' },
  v03: { layout: 'hero-strip', grade: 'neon-night', photos: 'boulevard-all' },
  v04: { layout: 'triptych', grade: 'ocean-drive', photos: 'pier-all' },
  v05: { layout: 'collage-four', grade: 'palm-dusk', photos: 'pier-hero-boulevard-rest' },
  v06: { layout: 'hero-band', grade: 'neon-night', photos: 'boulevard-all' },
  v07: { layout: 'hero-stack', grade: 'neon-night', photos: 'boulevard-all' },
  v08: { layout: 'quad-grid', grade: 'ocean-drive', photos: 'pier-all' },
  v09: { layout: 'triptych', grade: 'vice-sunset', photos: 'boulevard-hero-pier-rest' },
  v10: { layout: 'hero-strip', grade: 'palm-dusk', photos: 'pier-all' },
  v11: { layout: 'collage-four', grade: 'monochrome-noir', photos: 'boulevard-all' },
  v12: { layout: 'hero-band', grade: 'vice-sunset', photos: 'boulevard-all' },
  n01: { layout: 'hero-stack', grade: 'vice-sunset', photos: 'boulevard-all', note: false },
  n02: { layout: 'hero-stack', grade: 'vice-sunset', photos: 'boulevard-all', note: true },
  n03: { layout: 'hero-band', grade: 'neon-night', photos: 'boulevard-all', note: false },
  n04: { layout: 'hero-band', grade: 'neon-night', photos: 'boulevard-all', note: true },
  n05: { layout: 'hero-stack', grade: 'neon-night', photos: 'boulevard-all', note: false },
  n06: { layout: 'hero-stack', grade: 'neon-night', photos: 'boulevard-all', note: true }
};

const LAYOUT_NAMES = {
  'quad-grid': 'Quad Grid',
  'hero-stack': 'Hero & Stack',
  'hero-strip': 'Hero Over Strip',
  triptych: 'Triptych',
  'collage-four': 'Collage Four',
  'hero-band': 'Hero Band'
};
const GRADE_NAMES = {
  'vice-sunset': 'Vice Sunset',
  'neon-night': 'Neon Night',
  'ocean-drive': 'Ocean Drive',
  'palm-dusk': 'Palm Dusk',
  'monochrome-noir': 'Monochrome Noir'
};

function describePhotos(key) {
  switch (key) {
    case 'boulevard-all': return 'boulevard in all panels';
    case 'pier-all': return 'pier in all panels';
    case 'pier-hero-boulevard-rest': return 'pier in hero, boulevard in others';
    case 'boulevard-hero-pier-rest': return 'boulevard in hero, pier in others';
    default: return key;
  }
}

/* ---------- static server (mirrors tools/serve.mjs) ---------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const relative = normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const full = join(APP_ROOT, relative || 'index.html');
  if (full !== APP_ROOT && !full.startsWith(APP_ROOT + sep)) return null;
  return full;
}

function startServer() {
  return new Promise((resolvePromise) => {
    const server = createServer(async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end('Method not allowed');
        return;
      }
      let target = safePath(req.url || '/');
      if (!target) { res.writeHead(403); res.end('Forbidden'); return; }
      try {
        let info = await stat(target);
        if (info.isDirectory()) { target = join(target, 'index.html'); info = await stat(target); }
        const body = await readFile(target);
        res.writeHead(200, {
          'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
          'Content-Length': body.length,
          'Cache-Control': 'no-store'
        });
        if (req.method === 'HEAD') res.end(); else res.end(body);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      resolvePromise({ server, port: server.address().port });
    });
  });
}

/* ---------- chromium discovery ---------- */

function chromiumCandidates() {
  const home = process.env.HOME || '/root';
  const list = [];
  const pw = join(home, '.cache', 'ms-playwright');
  if (existsSync(pw)) {
    for (const dir of readdirSync(pw)) {
      if (dir.startsWith('chromium-') && !dir.includes('headless')) {
        list.push(join(pw, dir, 'chrome-linux64', 'chrome'));
        list.push(join(pw, dir, 'chrome-linux', 'chrome'));
      }
    }
  }
  for (const p of [
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable', '/usr/bin/chrome'
  ]) list.push(p);
  return list;
}

function findChromium() {
  const env = process.env.CHROMIUM_PATH;
  if (env && existsSync(env)) return env;
  for (const p of chromiumCandidates()) if (existsSync(p)) return p;
  throw new Error('No Chromium binary found. Set CHROMIUM_PATH.');
}

/* ---------- minimal CDP client ---------- */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
        else res(msg.result);
      } else if (msg.method) {
        const handlers = this.events.get(msg.method);
        if (handlers) handlers.forEach((fn) => fn(msg.params));
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((res, reject) => {
      this.pending.set(id, { resolve: res, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  once(method) {
    return new Promise((res) => {
      const fn = (params) => {
        const arr = this.events.get(method);
        if (arr) arr.delete(fn);
        res(params);
      };
      if (!this.events.has(method)) this.events.set(method, new Set());
      this.events.get(method).add(fn);
    });
  }
}

async function launchChromium(bin) {
  const userDir = join(tmpdir(), 'vice-tournament-chrome-' + process.pid);
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    '--user-data-dir=' + userDir,
    'about:blank'
  ];
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chromium did not report a DevTools endpoint in time')), 20000);
    proc.stderr.on('data', (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); res(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error('Chromium exited early (code ' + code + ')')); });
  });
  return { proc, wsUrl, userDir };
}

async function connectCDP(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, reject) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
  });
  return new CDP(ws);
}

async function openPage(cdp) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  let page = targetInfos.find((t) => t.type === 'page');
  if (!page) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    page = { targetId };
  }
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  return sessionId;
}

async function evalInPage(cdp, sessionId, expression, awaitPromise = false) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true
  }, sessionId);
  if (exceptionDetails) {
    const text = exceptionDetails.exception?.description || exceptionDetails.text || 'evaluation failed';
    throw new Error(text);
  }
  return result.value;
}

/* ---------- per-variant drive ---------- */

function variantScript(variant, id) {
  // Runs inside the page. Uses the app's exposed studio + real DOM controls.
  return `(async () => {
    const studio = window.ViceSunsetStudio;
    if (!studio) throw new Error('ViceSunsetStudio not exposed');
    const state = studio.state;
    const v = ${JSON.stringify(variant)};
    const captions = ${JSON.stringify(CAPTIONS)};
    const noteText = ${JSON.stringify(NOTE_TEXT)};
    const photoSrc = ${JSON.stringify(PHOTO_SRC)};

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    // Wait for both bundled samples to decode.
    const waitForImages = async () => {
      for (let i = 0; i < 200; i++) {
        const imgs = Object.values(studio.images);
        if (imgs.length >= 2 && imgs.every((im) => im.complete && im.naturalWidth > 0)) return;
        await wait(50);
      }
      throw new Error('sample images did not load');
    };
    await waitForImages();
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }

    // Map the two bundled samples to their image ids by source path.
    const idFor = (name) => {
      const entry = Object.entries(studio.images).find(([, im]) => String(im.src).includes(photoSrc[name]));
      if (!entry) throw new Error('missing sample ' + name);
      return entry[0];
    };
    const boulevardId = idFor('boulevard');
    const pierId = idFor('pier');

    // Layout through the real tile.
    const layoutTile = document.querySelector('#layout-grid .tile[data-id="' + v.layout + '"]');
    if (!layoutTile) throw new Error('layout tile not found: ' + v.layout);
    layoutTile.click();
    await wait(30);

    // Grade through the real tile.
    const gradeTile = document.querySelector('#grade-grid .tile[data-id="' + v.grade + '"]');
    if (!gradeTile) throw new Error('grade tile not found: ' + v.grade);
    gradeTile.click();
    await wait(30);

    // Captions through the real inputs.
    const setInput = (sel, value) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('missing input ' + sel);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setInput('#headline', captions.headline);
    setInput('#kicker', captions.kicker);
    setInput('#subline', captions.subline);

    // Note switch through the real checkbox.
    const noteToggle = document.querySelector('#note-toggle');
    const wantNote = v.note === true;
    if (noteToggle.checked !== wantNote) {
      noteToggle.checked = wantNote;
      noteToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (wantNote) setInput('#note-text', noteText);
    await wait(30);

    // Photos through the app's target chips + thumbnails (real controls).
    const panels = (function () {
      // Use the layout tile's data to know panel count via the target chips.
      return Array.from(document.querySelectorAll('#panel-targets .chip')).slice(1);
    })();
    const allChip = document.querySelector('#panel-targets .chip');
    const thumbs = Array.from(document.querySelectorAll('#photo-thumbs .thumb'));
    const clickThumb = (imageId) => {
      const idx = Object.keys(studio.images).indexOf(imageId);
      // Thumb order mirrors photoStore order; pick by matching the img src.
      const want = studio.images[imageId].src;
      const thumb = thumbs.find((t) => {
        const img = t.querySelector('img');
        return img && img.src === want;
      });
      if (!thumb) throw new Error('thumb not found for ' + imageId);
      thumb.click();
    };

    const photoPlan = (() => {
      if (v.photos === 'boulevard-all') return { all: boulevardId };
      if (v.photos === 'pier-all') return { all: pierId };
      if (v.photos === 'pier-hero-boulevard-rest') return { hero: pierId, rest: boulevardId };
      if (v.photos === 'boulevard-hero-pier-rest') return { hero: boulevardId, rest: pierId };
      throw new Error('unknown photo plan ' + v.photos);
    })();

    if (photoPlan.all) {
      allChip.click();
      clickThumb(photoPlan.all);
    } else {
      // hero is chip index matching the layout hero; hero is always first chip
      // for these layouts (hero index 0), but handle triptych hero=1 too.
      const heroChip = document.querySelector('#panel-targets .chip.is-hero') || panels[0];
      const total = panels.length;
      const heroIdx = panels.indexOf(heroChip);
      for (let i = 0; i < total; i++) {
        panels[i].click();
        clickThumb(i === heroIdx ? photoPlan.hero : photoPlan.rest);
      }
      allChip.click(); // leave targeting in the neutral state
    }
    await wait(60);

    // Produce the cover through the app's own export path.
    const preset = studio.sizes.find((s) => s.id === ${JSON.stringify(EXPORT_SIZE)});
    if (!preset) throw new Error('square preset missing');
    const blob = await studio.exportCover(state, studio.images, preset);
    if (!blob || !blob.size) throw new Error('export returned empty blob');
    const buf = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
    }
    return { pngBase64: btoa(binary), bytes: blob.size, layout: state.layoutId, grade: state.gradeId };
  })()`;
}

/* ---------- JPEG downscale inside the browser ---------- */

function downscaleScript(pngBase64, width, quality) {
  return `(async () => {
    const img = new Image();
    const src = 'data:image/png;base64,' + ${JSON.stringify(pngBase64)};
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('png decode failed')); img.src = src; });
    const w = ${width};
    const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', ${quality}));
    if (!blob) throw new Error('jpeg encode failed');
    const buf = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(binary);
  })()`;
}

/* ---------- manifest ---------- */

async function readManifestRows() {
  if (!existsSync(MANIFEST)) return new Map();
  const text = await readFile(MANIFEST, 'utf8');
  const rows = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*(v\d+|n\d+)\s*\|/);
    if (m) rows.set(m[1], line);
  }
  return rows;
}

async function writeManifest(rows) {
  const header = [
    '# VICE SUNSET — Design Tournament',
    '',
    'Renders live in `tournament/renders/<id>.jpg` (768px wide JPEG, q80).',
    '',
    '| id | layout | grade | photos | note |',
    '| --- | --- | --- | --- | --- |'
  ];
  const order = Object.keys(VARIANTS);
  const body = order.filter((id) => rows.has(id)).map((id) => rows.get(id));
  await writeFile(MANIFEST, header.concat(body).join('\n') + '\n');
}

/* ---------- main ---------- */

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (!ids.length) {
    console.error('Usage: node tools/tournament.mjs <id> [id...]');
    process.exit(2);
  }
  for (const id of ids) {
    if (!VARIANTS[id]) { console.error('Unknown variant: ' + id); process.exit(2); }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const manifestRows = await readManifestRows();

  const pending = [];
  for (const id of ids) {
    const dest = join(OUT_DIR, id + '.jpg');
    if (existsSync(dest)) {
      const info = await stat(dest);
      if (info.size >= MIN_RENDER_BYTES) {
        console.log('skip ' + id + ' (existing render ' + info.size + ' B)');
        continue;
      }
    }
    pending.push(id);
  }
  if (!pending.length) {
    console.log('All requested renders already exist; nothing to do.');
    return;
  }

  const bin = findChromium();
  console.log('Chromium: ' + bin);
  const { server, port } = await startServer();
  console.log('Serving app/ on http://127.0.0.1:' + port + '/');

  const chrome = await launchChromium(bin);
  let cdp;
  try {
    cdp = await connectCDP(chrome.wsUrl);
    const sessionId = await openPage(cdp);
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' }, sessionId);
    await loaded;

    // Give boot() a beat to expose the studio.
    for (let i = 0; i < 100; i++) {
      const ready = await evalInPage(cdp, sessionId, '!!window.ViceSunsetStudio');
      if (ready) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    for (const id of pending) {
      const variant = VARIANTS[id];
      process.stdout.write('render ' + id + ' ... ');
      const result = await evalInPage(cdp, sessionId, variantScript(variant, id), true);
      const jpegB64 = await evalInPage(cdp, sessionId, downscaleScript(result.pngBase64, 768, 0.8), true);
      const jpeg = Buffer.from(jpegB64, 'base64');
      const dest = join(OUT_DIR, id + '.jpg');
      await writeFile(dest, jpeg);
      const info = await stat(dest);
      if (info.size < MIN_RENDER_BYTES) {
        throw new Error(id + ' render is suspiciously small (' + info.size + ' B)');
      }
      console.log('ok ' + info.size + ' B (source PNG ' + result.bytes + ' B)');

      const noteOn = variant.note === true;
      const noteCell = noteOn ? 'on ("' + NOTE_TEXT + '")' : 'off';
      manifestRows.set(id, '| ' + id + ' | ' + LAYOUT_NAMES[variant.layout] + ' | ' +
        GRADE_NAMES[variant.grade] + ' | ' + describePhotos(variant.photos) + ' | ' + noteCell + ' |');
      await writeManifest(manifestRows);
    }
  } finally {
    try { if (cdp) await cdp.send('Browser.close'); } catch {}
    try { chrome.proc.kill('SIGKILL'); } catch {}
    server.close();
  }
}

main().catch((err) => {
  console.error('\nTournament failed: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
