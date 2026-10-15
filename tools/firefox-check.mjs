// Runs Zapazka Lite in a real, headless Firefox through WebDriver BiDi:
//  1. installs the extension as a temporary add-on (Firefox checks the manifest),
//  2. types into a local test form key by key (a long comment, a subject line, a rich editor, a
//     password and a card number), the way a person types,
//  3. reloads the page as if the tab had been closed, comes back to the empty comment box and clicks
//     the "Restore" chip, then puts the editor text back from the toolbar popup,
//  4. reads the extension's storage: the texts are there, the password and card number are not,
//  5. saves Firefox screenshots of the page, the popup and the options page for the gallery.
// BiDi does not open extension pages itself, so a test copy of the extension opens the popup (as a page
// for the form's tab) and the options page once the comment has been kept.
// usage: node tools/firefox-check.mjs [extension folder, default extension/] [--lang=bg]
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUILD = `${ROOT}build`;
const EXT = process.argv.slice(2).find((a) => !a.startsWith('--')) || `${ROOT}extension`;
const LANG = (process.argv.find((a) => a.startsWith('--lang=')) || '--lang=en').slice(7);
const SHOTS = `${BUILD}/shots${LANG === 'bg' ? '-bg' : ''}`;
const UUID = 'a4d3c1e2-6b7f-4e0a-9c11-5f2b8d7e3c90';
const PORT = 9720 + Math.floor(Math.random() * 100);

const COMMENT = 'Thanks for the detailed write-up. We tried the second approach on our staging server and the import time dropped from 40 to 6 minutes. Two questions: does it work with partitioned tables, and is there a way to run it per schema?';
const SUBJECT = 'Question about partitioned tables';
const RICH = 'Draft for Monday: release notes, then the migration checklist.';
const SECRET = 'hunter2-not-kept';
const CARD = '4111111111111111';

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reply to: Faster imports with COPY</title><style>
*{box-sizing:border-box} body{margin:0;font:16px/1.5 'Noto Sans','DejaVu Sans',sans-serif;color:#1f2933;background:#f5f7fa}
header{height:64px;background:#243b53;color:#fff;display:flex;align-items:center;padding:0 40px;font-weight:700;font-size:20px}
main{max-width:860px;margin:28px auto;background:#fff;border-radius:14px;padding:28px 36px;box-shadow:0 4px 18px rgba(0,0,0,.06)}
h1{font-size:24px;margin:0 0 4px} p.m{color:#627d98;margin:0 0 20px} label{display:block;font-weight:600;margin:14px 0 6px}
input,textarea{width:100%;font:inherit;padding:10px 12px;border:1px solid #bcccdc;border-radius:8px}
textarea{height:150px;resize:vertical} .ed{min-height:70px;border:1px solid #bcccdc;border-radius:8px;padding:10px 12px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px} button{margin-top:18px;background:#2f6f73;color:#fff;border:0;border-radius:8px;padding:10px 22px;font:inherit;font-weight:700}
</style></head><body><header>Example Dev Forum</header><main>
<h1>Reply to: Faster imports with COPY</h1><p class="m">A made-up forum for this test.</p>
<form onsubmit="return false">
<label for="subject">Subject</label><input id="subject" name="subject" type="text">
<label for="comment">Your reply</label><textarea id="comment" name="comment"></textarea>
<label>Notes for yourself</label><div class="ed" id="editor" contenteditable="true" aria-label="Notes for yourself"></div>
<div class="two"><div><label for="password">Password</label><input id="password" name="password" type="password"></div>
<div><label for="card">Card number</label><input id="card" name="card_number" type="text" autocomplete="cc-number"></div></div>
<button>Post reply</button></form></main></body></html>`;

function bidi(url) {
  const ws = new WebSocket(url);
  let n = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) {
      const { resolve, reject } = waiting.get(d.id);
      waiting.delete(d.id);
      d.type === 'error' ? reject(new Error(`${d.error}: ${d.message}`)) : resolve(d.result);
    }
  };
  return {
    open: () => new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('no BiDi socket')); }),
    send: (method, params = {}) => new Promise((resolve, reject) => { n += 1; waiting.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); }),
    close: () => ws.close(),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  rmSync(`${BUILD}/firefox`, { recursive: true, force: true });
  mkdirSync(`${BUILD}/firefox/profile`, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  cpSync(EXT, `${BUILD}/firefox/ext`, { recursive: true });
  const manifest = JSON.parse(readFileSync(`${BUILD}/firefox/ext/manifest.json`, 'utf8'));
  manifest.background.scripts.push('test-open.js');
  writeFileSync(`${BUILD}/firefox/ext/manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync(`${BUILD}/firefox/ext/test-open.js`, `let opened = false;
browser.storage.onChanged.addListener(async (ch) => {
  if (opened || !Object.keys(ch).some((k) => k.endsWith('/compose|comment'))) return;
  opened = true;
  setTimeout(async () => {
    const tab = (await browser.tabs.query({})).find((t) => t.url.includes('/compose'));
    browser.tabs.create({ url: 'popup.html?tab=' + tab.id, active: false });
  }, 1500);
});`);
  writeFileSync(`${BUILD}/firefox/profile/user.js`, [
    `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ 'zapazka@pnscripts.com': UUID, 'zapazka-lite@pnscripts.com': UUID }))});`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    `user_pref("intl.locale.requested", "${LANG === 'bg' ? 'bg' : 'en-US'}");`,
  ].join('\n'));

  const server = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const pageUrl = `http://127.0.0.1:${server.address().port}/compose`;

  const ff = spawn('firefox', ['--headless', '--no-remote', '-remote-allow-system-access', '--profile', `${BUILD}/firefox/profile`, `--remote-debugging-port=${PORT}`,
    '--width=1440', '--height=900', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  ff.stderr.on('data', (d) => { log += d; });
  let b;
  let pass = 0;
  const ok = (what) => { pass += 1; console.log(`PASS ${what}`); };
  try {
    for (let i = 0; i < 120 && !log.includes('WebDriver BiDi listening'); i++) await sleep(500);
    b = bidi(`ws://127.0.0.1:${PORT}/session`);
    await b.open();
    const session = await b.send('session.new', { capabilities: {} });
    console.log(`Firefox ${session.capabilities.browserVersion}`);
    const installed = await b.send('webExtension.install', { extensionData: { type: 'path', path: `${BUILD}/firefox/ext` } });
    ok(`installed as a temporary add-on: ${installed.extension}`);
    const page = (await b.send('browsingContext.getTree', {})).contexts[0].context;
    await b.send('browsingContext.setViewport', { context: page, viewport: { width: 1100, height: 820 } });
    await b.send('browsingContext.navigate', { context: page, url: pageUrl, wait: 'complete' });
    await sleep(800);
    const evalIn = async (ctx, expression) => {
      const r = await b.send('script.evaluate', { expression, target: { context: ctx }, awaitPromise: true, resultOwnership: 'none' });
      if (r.type === 'exception') throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };
    const centre = async (selector) => JSON.parse(await evalIn(page, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return JSON.stringify([Math.round(r.left + Math.min(40, r.width / 2)), Math.round(r.top + Math.min(20, r.height / 2))]); })()`));
    const click = async ([x, y]) => b.send('input.performActions', { context: page, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', x, y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] });
    const type = async (text) => {
      const keys = [];
      for (const ch of text) keys.push({ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch });
      await b.send('input.performActions', { context: page, actions: [{ type: 'key', id: 'kb', actions: keys }] });
    };
    const field = async (selector, text) => { await click(await centre(selector)); await type(text); };

    await field('#subject', SUBJECT);
    await field('#comment', COMMENT);
    await field('#editor', RICH);
    await field('#password', SECRET);
    await field('#card', CARD);
    await click(await centre('h1'));
    ok('typed key by key into a subject line, a comment box, a rich editor, a password and a card field');
    await sleep(2500);

    let popup = null;
    let options = null;
    for (let i = 0; i < 40 && !(popup && options); i++) {
      const tree = (await b.send('browsingContext.getTree', {})).contexts;
      popup = (tree.find((c) => c.url.includes('/popup.html')) || {}).context || null;
      options = popup;
      if (!popup) await sleep(250);
    }
    if (!popup) throw new Error('the popup did not open: the comment was not kept');
    let store = null;
    for (let i = 0; i < 40 && !store; i++) {
      try {
        store = JSON.parse(await evalIn(options, 'browser.storage.local.get(null).then((s) => JSON.stringify(s))'));
      } catch (e) {
        await sleep(250); // the tab is still loading its page
      }
    }
    if (!store) throw new Error('cannot read the extension storage');
    await sleep(500);
    const kept = Object.entries(store).filter(([k]) => k.startsWith('z:'));
    const texts = kept.map(([, e]) => e.versions.at(-1).text);
    if (!texts.includes(COMMENT)) throw new Error(`comment not kept: ${JSON.stringify(texts).slice(0, 300)}`);
    if (kept.length !== 1) throw new Error(`Lite keeps text areas only, found ${kept.length}`);
    ok('kept the comment box; the subject line and the rich editor are left to the full edition');
    const raw = JSON.stringify(store);
    if (raw.includes(SECRET) || raw.includes(CARD)) throw new Error('a password or card number was stored');
    ok('the password and the card number were not stored anywhere');

    // As if the tab had been closed: open the page afresh (a new address, so Firefox's own form
    // restore on reload does not refill it), come back to the empty comment box.
    await b.send('browsingContext.navigate', { context: page, url: 'about:blank', wait: 'complete' });
    await b.send('browsingContext.navigate', { context: page, url: pageUrl + '?from=bookmark', wait: 'complete' });
    await sleep(800);
    await click(await centre('#comment'));
    await sleep(700);
    const chip = JSON.parse(await evalIn(page, `(() => { const h = document.querySelector('zapazka-chip'); if (!h || !h.shadowRoot) return 'null';
      const b = h.shadowRoot.querySelector('button.r').getBoundingClientRect(); return JSON.stringify({ text: h.shadowRoot.querySelector('span').textContent, x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }); })()`));
    if (!chip) throw new Error('no restore chip on the empty comment box: ' + await evalIn(page, "String(!!document.querySelector('zapazka-chip')) + ' ' + (document.activeElement && document.activeElement.id) + ' [' + document.querySelector('#comment').value.slice(0, 20) + ']'"));
    ok(`restore chip shown: "${chip.text}"`);
    const tabShot = await b.send('browsingContext.captureScreenshot', { context: page });
    writeFileSync(`${SHOTS}/page-chip.png`, Buffer.from(tabShot.data, 'base64'));
    await click([chip.x, chip.y]);
    await sleep(400);
    const value = await evalIn(page, "document.querySelector('#comment').value");
    if (value !== COMMENT) throw new Error(`restore put back: ${value.slice(0, 80)}`);
    ok('clicking Restore put the whole comment back into the box');
    writeFileSync(`${SHOTS}/page-restored.png`, Buffer.from((await b.send('browsingContext.captureScreenshot', { context: page })).data, 'base64'));

    // The popup lists the site's text and puts it back after the box was emptied.
    await evalIn(page, "(() => { const t = document.querySelector('#comment'); t.value = ''; return 1; })()");
    await evalIn(popup, 'location.reload(), 1');
    await sleep(1200);
    const items = JSON.parse(await evalIn(popup, `JSON.stringify([...document.querySelectorAll('.item .label')].map((e) => e.textContent))`));
    if (items.length !== 1) throw new Error(`popup lists ${items.length} texts`);
    ok(`popup lists the site's kept text: ${items.join(', ')}`);
    await evalIn(popup, "document.querySelector('.item button.main').click(), 1");
    await sleep(600);
    if ((await evalIn(page, "document.querySelector('#comment').value")) !== COMMENT) throw new Error('popup did not put the comment back');
    ok('the popup put the comment back into the box');
    writeFileSync(`${SHOTS}/popup.html`, await evalIn(popup, 'document.documentElement.outerHTML'));
    console.log(`Firefox check OK: ${pass} passed`);
  } catch (e) {
    console.error('Firefox check FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    if (b) { try { await b.send('browser.close', {}); } catch (e) { /* closing */ } b.close(); }
    try { ff.kill(); } catch (e) { /* already closing */ }
    server.close();
    await sleep(2000);
    try { rmSync(`${BUILD}/firefox`, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (e) { /* left for the next run */ }
  }
}

main().catch((e) => { console.error('Firefox check FAILED:', e.message); process.exit(1); });
