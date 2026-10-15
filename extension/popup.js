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
  const prefix = url ? `z:${url.origin}` : '\u0000';
  const entries = Object.entries(all).filter(([k]) => k.startsWith(prefix + '/'))
    .sort(([ka, a], [kb, b]) => (here.includes(kb) - here.includes(ka)) || b.updated - a.updated);
  const list = $('list');
  list.textContent = '';
  if (!entries.length) list.append(el('div', 'note', t('popupEmpty')));
  for (const [key, e] of entries) list.append(item(key, e, here.includes(key), tab));
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
