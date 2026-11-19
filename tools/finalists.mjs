// Finalist render driver for VICE SUNSET Cover Studio.
//
// Serves app/ locally, configures each finalist through the editor's own
// controls, then produces the cover through the app's own export path
// (window.ViceSunsetStudio.exportCover). For every finalist it writes:
//   <id>.png        1080x1080 app export (PNG)
//   <id>.jpg        768px-wide JPEG q80
//   <id>-land.jpg   1920x1080 export scaled to 1280x720 JPEG q82
//   <id>-port.jpg   1080x1350 export scaled to 1024x1280 JPEG q82
//   <id>-editor.jpg 1280x960 live-editor screenshot, JPEG q82
// Every JPEG is kept at or below 256 KiB by lowering quality when needed.
//
// Usage:
//   node tools/finalists.mjs [f01 f02 f03]

import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const APP_ROOT = join(REPO, 'app');
const OUT_DIR = join(REPO, 'tournament', 'finalists');
const MAX_JPEG_BYTES = 256 * 1024; // 256 KiB
const EDITOR_VIEWPORT = { width: 1280, height: 960 };

const CAPTIONS = {
  headline: 'VICE SUNSET',
  kicker: 'THE CITY THAT NEVER SLEEPS IN',
  subline: 'EVERY STREET HAS A PRICE'
};

const NOTE_TEXT = "dear judge, this one's for you";
const DEFAULT_HEADLINE_SIZE = 0.125;
const HEADLINE_SIZE = DEFAULT_HEADLINE_SIZE * 1.1; // 0.1375, ~10% above default
const BOULEVARD_SRC = 'samples/boulevard.jpg';

const FINALISTS = {
  f01: { layout: 'hero-stack', grade: 'vice-sunset' },
  f02: { layout: 'hero-stack', grade: 'neon-night' },
  f03: { layout: 'hero-band', grade: 'vice-sunset' }
};

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
  const userDir = join(tmpdir(), 'vice-finalists-chrome-' + process.pid);
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

/* ---------- per-finalist configuration ---------- */

function configureScript(finalist) {
  return `(async () => {
    const studio = window.ViceSunsetStudio;
    if (!studio) throw new Error('ViceSunsetStudio not exposed');
    const v = ${JSON.stringify(finalist)};
    const captions = ${JSON.stringify(CAPTIONS)};
    const noteText = ${JSON.stringify(NOTE_TEXT)};
    const headlineSize = ${HEADLINE_SIZE};
    const boulevardSrc = ${JSON.stringify(BOULEVARD_SRC)};

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

    const boulevardId = Object.entries(studio.images).find(([, im]) =>
      String(im.src).includes(boulevardSrc)
    )?.[0];
    if (!boulevardId) throw new Error('missing boulevard sample');

    const layoutTile = document.querySelector('#layout-grid .tile[data-id="' + v.layout + '"]');
    if (!layoutTile) throw new Error('layout tile not found: ' + v.layout);
    layoutTile.click();
    await wait(40);

    const gradeTile = document.querySelector('#grade-grid .tile[data-id="' + v.grade + '"]');
    if (!gradeTile) throw new Error('grade tile not found: ' + v.grade);
    gradeTile.click();
    await wait(40);

    const setInput = (sel, value) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('missing input ' + sel);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setInput('#headline', captions.headline);
    setInput('#kicker', captions.kicker);
    setInput('#subline', captions.subline);

    // Headline size through the real range control.
    const size = document.querySelector('#headline-size');
    if (!size) throw new Error('missing headline-size control');
    size.value = String(headlineSize);
    size.dispatchEvent(new Event('input', { bubbles: true }));

    // Note switch through the real checkbox.
    const noteToggle = document.querySelector('#note-toggle');
    if (!noteToggle) throw new Error('missing note-toggle');
    if (!noteToggle.checked) {
      noteToggle.checked = true;
      noteToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setInput('#note-text', noteText);
    await wait(30);

    // Boulevard in all panels through the target chip + thumbnail.
    const allChip = document.querySelector('#panel-targets .chip');
    if (!allChip) throw new Error('missing all-panels chip');
    allChip.click();
    await wait(20);
    const wantSrc = studio.images[boulevardId].src;
    const thumb = Array.from(document.querySelectorAll('#photo-thumbs .thumb')).find((t) => {
      const img = t.querySelector('img');
      return img && img.src === wantSrc;
    });
    if (!thumb) throw new Error('boulevard thumb not found');
    thumb.click();
    await wait(60);

    studio.render();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    return {
      layoutId: studio.state.layoutId,
      gradeId: studio.state.gradeId,
      headline: studio.state.headline,
      kicker: studio.state.kicker,
      subline: studio.state.subline,
      noteOn: studio.state.noteOn,
      noteText: studio.state.noteText,
      headlineSize: studio.state.headlineSize,
      headlineSizeControl: size.value,
      activePhotoId: studio.state.activePhotoId,
      panelImages: (studio.state.panelImages || []).slice(),
      boulevardId
    };
  })()`;
}

function verifyConfiguration(id, finalist, got) {
  const problems = [];
  if (got.layoutId !== finalist.layout) problems.push('layout=' + got.layoutId);
  if (got.gradeId !== finalist.grade) problems.push('grade=' + got.gradeId);
  if (got.headline !== CAPTIONS.headline) problems.push('headline=' + got.headline);
  if (got.kicker !== CAPTIONS.kicker) problems.push('kicker=' + got.kicker);
  if (got.subline !== CAPTIONS.subline) problems.push('subline=' + got.subline);
  if (got.noteOn !== true) problems.push('note is off');
  if (got.noteText !== NOTE_TEXT) problems.push('note text=' + got.noteText);
  // The range input snaps to its 0.005 step, so allow one step of drift from
  // the nominal +10% target (0.1375 lands on 0.14).
  if (Math.abs(got.headlineSize - HEADLINE_SIZE) > 0.005 + 1e-9) {
    problems.push('headlineSize=' + got.headlineSize);
  }
  if (got.activePhotoId !== got.boulevardId) problems.push('active photo is not boulevard');
  if (got.panelImages.length !== 0) problems.push('panel overrides present');
  if (problems.length) {
    throw new Error(id + ' configuration mismatch: ' + problems.join(', '));
  }
}

/* ---------- export + downscale (runs in the page) ---------- */

function exportScript(presetId, returnPng) {
  return `(async () => {
    const studio = window.ViceSunsetStudio;
    const preset = studio.sizes.find((s) => s.id === ${JSON.stringify(presetId)});
    if (!preset) throw new Error('export preset missing: ' + ${JSON.stringify(presetId)});
    const blob = await studio.exportCover(studio.state, studio.images, preset);
    if (!blob || !blob.size) throw new Error('export returned empty blob');
    const buf = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
    }
    const b64 = btoa(binary);
    window.__finalistExport = {
      b64,
      preset: preset.id,
      width: preset.width,
      height: preset.height,
      bytes: blob.size
    };
    const info = { preset: preset.id, width: preset.width, height: preset.height, bytes: blob.size };
    if (${returnPng ? 'true' : 'false'}) info.pngBase64 = b64;
    return info;
  })()`;
}

function downscaleStoredScript(width, quality, maxBytes) {
  return `(async () => {
    const exp = window.__finalistExport;
    if (!exp) throw new Error('no exported image in page');
    const img = new Image();
    const src = 'data:image/png;base64,' + exp.b64;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('png decode failed'));
      img.src = src;
    });
    const w = ${width};
    const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    let q = ${quality};
    let blob = null;
    while (q >= 0.3) {
      blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));
      if (!blob) throw new Error('jpeg encode failed');
      if (blob.size <= ${maxBytes}) break;
      q = Math.round((q - 0.02) * 100) / 100;
    }
    if (!blob || blob.size > ${maxBytes}) {
      throw new Error('could not encode jpeg under ' + ${maxBytes} + ' bytes');
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    }
    return { jpegBase64: btoa(binary), bytes: blob.size, quality: q, width: w, height: h };
  })()`;
}

function editorPrepScript() {
  return `(async () => {
    const studio = window.ViceSunsetStudio;
    if (!studio) throw new Error('ViceSunsetStudio not exposed');
    studio.render();
    window.scrollTo(0, 0);
    const rail = document.querySelector('.rail');
    if (rail) rail.scrollTop = 0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 180));
    const canvas = document.getElementById('cover-canvas');
    const cr = canvas.getBoundingClientRect();
    const rr = rail ? rail.getBoundingClientRect() : null;
    return {
      viewport: [window.innerWidth, window.innerHeight],
      canvas: { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) },
      rail: rr ? {
        x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.width), h: Math.round(rr.height),
        scrollTop: rail.scrollTop, scrollHeight: rail.scrollHeight
      } : null
    };
  })()`;
}

async function captureEditorJpeg(cdp, sessionId) {
  let quality = 0.82;
  while (quality >= 0.4) {
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: Math.round(quality * 100),
      fromSurface: true,
      captureBeyondViewport: false
    }, sessionId);
    const buf = Buffer.from(data, 'base64');
    if (buf.length <= MAX_JPEG_BYTES) return { buf, quality };
    quality = Math.round((quality - 0.02) * 100) / 100;
  }
  throw new Error('editor screenshot could not be brought under 256 KiB');
}

/* ---------- verification helpers ---------- */

function imageSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      i += 2;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const len = buf.readUInt16BE(i);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { type: 'jpeg', width: buf.readUInt16BE(i + 5), height: buf.readUInt16BE(i + 3) };
      }
      i += len;
    }
  }
  return null;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KiB';
}

/* ---------- main ---------- */

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const wanted = ids.length ? ids : Object.keys(FINALISTS);
  for (const id of wanted) {
    if (!FINALISTS[id]) { console.error('Unknown finalist: ' + id); process.exit(2); }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const bin = findChromium();
  const { server, port } = await startServer();

  const chrome = await launchChromium(bin);
  let cdp;
  try {
    cdp = await connectCDP(chrome.wsUrl);
    try { await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }); } catch {}
    const sessionId = await openPage(cdp);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: EDITOR_VIEWPORT.width,
      height: EDITOR_VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: EDITOR_VIEWPORT.width,
      screenHeight: EDITOR_VIEWPORT.height
    }, sessionId);

    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' }, sessionId);
    await loaded;

    for (let i = 0; i < 100; i++) {
      const ready = await evalInPage(cdp, sessionId, '!!window.ViceSunsetStudio');
      if (ready) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    for (const id of wanted) {
      const finalist = FINALISTS[id];
      console.log('\n' + id + ' (' + finalist.layout + ' / ' + finalist.grade + ')');

      const cfg = await evalInPage(cdp, sessionId, configureScript(finalist), true);
      verifyConfiguration(id, finalist, cfg);
      console.log('  configured: headlineSize control=' + cfg.headlineSizeControl +
        ' state=' + cfg.headlineSize + ', note=' + cfg.noteOn + ', boulevard in all panels');

      // 1. Square 1080x1080: app PNG + 768px JPEG.
      const square = await evalInPage(cdp, sessionId, exportScript('square', true), true);
      const pngPath = join(OUT_DIR, id + '.png');
      await writeFile(pngPath, Buffer.from(square.pngBase64, 'base64'));
      const squareJpg = await evalInPage(cdp, sessionId, downscaleStoredScript(768, 0.8, MAX_JPEG_BYTES), true);
      await writeFile(join(OUT_DIR, id + '.jpg'), Buffer.from(squareJpg.jpegBase64, 'base64'));
      console.log('  square: ' + square.width + 'x' + square.height + ' PNG ' + kb(square.bytes) +
        ' -> 768px JPEG ' + kb(squareJpg.bytes) + ' q' + Math.round(squareJpg.quality * 100));

      // 2. Wide 1920x1080 -> 1280x720 JPEG.
      const wide = await evalInPage(cdp, sessionId, exportScript('wide', false), true);
      const land = await evalInPage(cdp, sessionId, downscaleStoredScript(1280, 0.82, MAX_JPEG_BYTES), true);
      await writeFile(join(OUT_DIR, id + '-land.jpg'), Buffer.from(land.jpegBase64, 'base64'));
      console.log('  wide: ' + wide.width + 'x' + wide.height + ' export -> ' + land.width + 'x' + land.height +
        ' JPEG ' + kb(land.bytes) + ' q' + Math.round(land.quality * 100));

      // 3. Portrait 1080x1350 -> 1024x1280 JPEG.
      const portrait = await evalInPage(cdp, sessionId, exportScript('portrait', false), true);
      const port = await evalInPage(cdp, sessionId, downscaleStoredScript(1024, 0.82, MAX_JPEG_BYTES), true);
      await writeFile(join(OUT_DIR, id + '-port.jpg'), Buffer.from(port.jpegBase64, 'base64'));
      console.log('  portrait: ' + portrait.width + 'x' + portrait.height + ' export -> ' + port.width + 'x' + port.height +
        ' JPEG ' + kb(port.bytes) + ' q' + Math.round(port.quality * 100));

      // 4. Live editor screenshot at 1280x960.
      const prep = await evalInPage(cdp, sessionId, editorPrepScript(), true);
      const shot = await captureEditorJpeg(cdp, sessionId);
      await writeFile(join(OUT_DIR, id + '-editor.jpg'), shot.buf);
      console.log('  editor: viewport ' + prep.viewport.join('x') + ', cover ' + prep.canvas.w + 'x' + prep.canvas.h +
        ', screenshot ' + kb(shot.buf.length) + ' q' + Math.round(shot.quality * 100));
    }
  } finally {
    try { if (cdp) await cdp.send('Browser.close'); } catch {}
    try { chrome.proc.kill('SIGKILL'); } catch {}
    server.close();
  }

  // Verify every expected file exists, has the right dimensions, and every
  // JPEG is under the 256 KiB cap.
  const expected = [];
  for (const id of wanted) {
    expected.push({ name: id + '.png', type: 'png', width: 1080, height: 1080 });
    expected.push({ name: id + '.jpg', type: 'jpeg', width: 768, height: 768 });
    expected.push({ name: id + '-land.jpg', type: 'jpeg', width: 1280, height: 720 });
    expected.push({ name: id + '-port.jpg', type: 'jpeg', width: 1024, height: 1280 });
    expected.push({ name: id + '-editor.jpg', type: 'jpeg', width: 1280, height: 960 });
  }

  console.log('\nVerified files in tournament/finalists:');
  const failures = [];
  for (const spec of expected) {
    const path = join(OUT_DIR, spec.name);
    if (!existsSync(path)) { failures.push(spec.name + ' missing'); continue; }
    const info = await stat(path);
    const buf = await readFile(path);
    const dim = imageSize(buf);
    const problems = [];
    if (!dim) problems.push('unreadable image');
    else {
      if (dim.type !== spec.type) problems.push('type=' + dim.type);
      if (dim.width !== spec.width || dim.height !== spec.height) {
        problems.push('size=' + dim.width + 'x' + dim.height);
      }
    }
    if (spec.type === 'jpeg' && info.size > MAX_JPEG_BYTES) problems.push('over 256 KiB');
    const note = problems.length ? '  <-- ' + problems.join(', ') : '';
    console.log('  ' + spec.name.padEnd(18) + String(info.size).padStart(9) + ' B  ' +
      kb(info.size).padStart(9) + '  ' + (dim ? dim.width + 'x' + dim.height : '?') + note);
    if (problems.length) failures.push(spec.name + ': ' + problems.join(', '));
  }

  if (failures.length) {
    throw new Error('final verification failed: ' + failures.join('; '));
  }
  console.log('\nAll finalist files verified.');
}

main().catch((err) => {
  console.error('\nFinalists failed: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
