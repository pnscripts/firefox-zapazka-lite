// Zapazka Lite by PN Scripts (MIT): the toolbar popup, the texts kept on the current site.
/* global ZapazkaCore */
const C = ZapazkaCore;
const t = (k, s) => browser.i18n.getMessage(k, s) || k;
const lang = (browser.i18n.getUILanguage() || 'en').toLowerCase().startsWith('bg') ? 'bg' : 'en';
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function currentTab() {
  const q = new URLSearchParams(location.search).get('tab'); // the tests open the popup as a page for a given tab
  if (q) return browser.tabs.get(Number(q));
  return (await browser.tabs.query({ active: true, currentWindow: true }))[0];
}

async function render() {
  const tab = await currentTab();
  const url = tab && tab.url ? new URL(tab.url) : null;
  $('title').textContent = t('popupTitle');
  $('site').textContent = url ? url.hostname : '';
  $('foot').textContent = t('liteFoot');
  const all = await browser.storage.local.get(null);
  const notes = $('notes');
  notes.textContent = '';
  if (url && C.excluded(url.hostname, C.DEFAULTS.excluded)) notes.append(el('div', 'note', t('excludedHere')));
  let here = [];
  try {
    here = (await browser.tabs.sendMessage(tab.id, { type: 'zapazka-fields' })) || [];
  } catch (e) {
    here = [];
  }
  await renderReport(tab, all, { ...C.DEFAULTS }, url);
  const prefix = url ? `z:${url.origin}` : '\u0000';
  const entries = Object.entries(all).filter(([k]) => k.startsWith(prefix + '/'))
    .sort(([ka, a], [kb, b]) => (here.includes(kb) - here.includes(ka)) || b.updated - a.updated);
  const list = $('list');
  list.textContent = '';
  if (!entries.length) list.append(el('div', 'note', t('popupEmpty')));
  for (const [key, e] of entries) list.append(item(key, e, here.includes(key), tab));
}

// The page report: each text field on the page, kept or refused, and the reason.
async function renderReport(tab, all, settings, url) {
  const box = $('report');
  box.textContent = '';
  let rep = null;
  try {
    rep = await browser.tabs.sendMessage(tab.id, { type: 'zapazka-report' }, { frameId: 0 });
  } catch (e) {
    rep = null;
  }
  const head = el('div', 'rhead');
  head.append(el('strong', '', t('reportTitle')));
  box.append(head);
  if (!rep) {
    box.append(el('div', 'note', t('reportNone')));
    return;
  }
  const off = !settings.enabled || (url && C.excluded(url.hostname, settings.excluded));
  const kept = rep.rows.filter((r) => !r.reason);
  const refused = rep.rows.filter((r) => r.reason);
  head.append(el('span', 'meta', t('reportSummary', [String(off ? 0 : kept.length), String(refused.length), String(rep.ignored)])));
  for (const r of rep.rows) {
    const row = el('div', 'rrow');
    row.append(el('span', 'label', r.label));
    if (r.reason) {
      row.classList.add('refused');
      row.append(el('span', 'why', `${t('stRefused')}: ${t('r_' + r.reason)}`));
    } else {
      const e = all[r.key];
      row.append(el('span', 'why ok', off ? t('stOff') : e ? t('stSaved', [String(e.versions.length)]) : t('stReady')));
    }
    box.append(row);
  }
  if (!rep.rows.length) box.append(el('div', 'note', t('reportEmpty')));
  // Refusals recorded earlier on this site whose field is not on the page now (for example the text was cleared or sent).
  const shown = new Set(rep.rows.filter((r) => r.reason).map((r) => `${r.label}|${r.reason}`));
  const earlier = ((url && all[`l:${url.hostname}`]) || { items: [] }).items.filter((r) => !shown.has(`${r.field}|${r.reason}`));
  if (earlier.length) {
    box.append(el('div', 'rhead', t('ledgerHere')));
    for (const r of earlier.slice(0, 8)) {
      const row = el('div', 'rrow refused');
      row.append(el('span', 'label', r.field || '…'));
      row.append(el('span', 'why', `${t('stRefused')}: ${t('r_' + r.reason)} · ${C.ago(r.t, Date.now(), lang)}`));
      box.append(row);
    }
  }
}

function item(key, e, onPage, tab) {
  const box = el('div', 'item');
  const head = el('div', 'head');
  head.append(el('span', 'label', e.label || e.title || e.url));
  if (onPage) head.append(el('span', 'here', t('onThisPage')));
  const versions = [...e.versions].reverse();
  const current = versions[0];
  const meta = el('span', 'meta', `${C.ago(current.t, Date.now(), lang)} · ${t('words', [String(C.words(current.text))])}`);
  head.append(meta);
  const text = el('div', 'text', C.preview(current.text, 400));
  const row = el('div', 'row');
  const fill = el('button', 'main', t('fill'));
  fill.type = 'button';
  fill.addEventListener('click', async () => {
    let ok = false;
    try {
      ok = await browser.tabs.sendMessage(tab.id, { type: 'zapazka-restore', key, text: current.text });
    } catch (err) {
      ok = false;
    }
    $('status').textContent = ok ? t('filled') : t('notOnPage');
  });
  if (!onPage) fill.disabled = true;
  const copy = el('button', '', t('copy'));
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(current.text);
    $('status').textContent = t('copied');
  });
  const del = el('button', 'danger', t('delete'));
  del.type = 'button';
  del.addEventListener('click', async () => {
    await browser.storage.local.remove(key);
    render();
  });
  row.append(fill, copy, del);
  box.append(head, text, row);
  return box;
}

render();
