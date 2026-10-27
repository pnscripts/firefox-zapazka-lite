// Zapazka Lite by PN Scripts (MIT): keeps what you type in this page's text areas, in this browser only,
// and offers it back when you return to an empty field.
(function () {
  'use strict';
  if (window.__zapazka) return;
  window.__zapazka = true;
  if (browser.extension.inIncognitoContext) return; // private windows are never kept

  const C = globalThis.ZapazkaCore;
  const lang = (browser.i18n.getUILanguage() || 'en').toLowerCase().startsWith('bg') ? 'bg' : 'en';
  const msg = (k, subs) => browser.i18n.getMessage(k, subs) || k;
  let settings = { ...C.DEFAULTS };
  const timers = new Map();

  function editableRoot(el) {
    if (!(el instanceof HTMLElement) || !el.isContentEditable) return null;
    let root = el;
    while (root.parentElement && root.parentElement.isContentEditable) root = root.parentElement;
    return root;
  }

  function fieldOf(target) {
    if (!(target instanceof HTMLElement)) return null;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return target;
    return editableRoot(target);
  }

  function labelOf(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return l.textContent.trim();
    }
    const wrap = el.closest('label');
    if (wrap) return wrap.textContent.trim();
    return '';
  }

  function describe(el) {
    const editable = !(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement);
    return {
      tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', name: el.getAttribute('name') || '', id: el.id || '',
      autocomplete: el.getAttribute('autocomplete') || '', label: labelOf(el).slice(0, 80), placeholder: (el.getAttribute('placeholder') || '').slice(0, 80),
      editable, readOnly: !!el.readOnly, disabled: !!el.disabled, hidden: el.type === 'hidden' || el.getClientRects().length === 0,
    };
  }

  function fields() {
    const all = [...document.querySelectorAll('textarea, input, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')]
      .map((el) => fieldOf(el)).filter((el, i, a) => el && a.indexOf(el) === i);
    return all.filter((el) => C.kind(describe(el)));
  }

  function keyOf(el) {
    return C.fieldKey(location.href, describe(el), fields().indexOf(el));
  }

  function textOf(el) {
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : el.innerText.replace(/\n$/, '');
  }

  function setText(el, text) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
    } else {
      el.focus();
      el.innerText = text;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // What was refused on this page and why, never the text: the page report asks for it, and (in the ledger) so does the options page.
  const contentRefused = new Map();
  const logged = new Set();

  // One write at a time, so two refusals at once do not overwrite each other's row.
  let writing = Promise.resolve();
  function record(d, v) {
    writing = writing.then(() => write(d, v)).catch(() => {});
    return writing;
  }

  async function write(d, v) {
    if (!C.REFUSALS.includes(v.reason)) return;
    const field = d.label || d.placeholder || d.name || d.id || d.tag;
    const id = `${field}|${v.reason}`;
    if (logged.has(id)) return;
    logged.add(id);
    const key = `l:${location.hostname}`;
    const got = (await browser.storage.local.get(key))[key];
    await browser.storage.local.set({ [key]: { items: C.ledgerAdd(got && got.items, { field, reason: v.reason, scope: v.scope, page: location.pathname }, Date.now(), 40) } });
  }

  async function save(el) {
    const d = describe(el);
    const text = textOf(el);
    const v = C.verdict(d, text, settings, location.hostname);
    if (v.scope === 'content') contentRefused.set(el, v.reason);
    else contentRefused.delete(el);
    if (!v.keep) {
      if (v.scope === 'content') {
        // The first digits of a card number may have been kept at a pause before the number was complete.
        const key = keyOf(el);
        const got = (await browser.storage.local.get(key))[key];
        if (got && C.scrub(got, text, v.index)) {
          if (got.versions.length) await browser.storage.local.set({ [key]: got });
          else await browser.storage.local.remove(key);
        }
      }
      if (v.scope !== 'user' && text.trim() && settings.enabled && !C.excluded(location.hostname, settings.excluded)) await record(d, v);
      return;
    }
    const k = C.kind(d);
    const key = keyOf(el);
    const got = await browser.storage.local.get(key);
    const entry = got[key] || { url: location.origin + location.pathname, title: document.title.slice(0, 120), label: d.label || d.placeholder || d.name || d.id || d.tag, kind: k, versions: [] };
    entry.title = document.title.slice(0, 120) || entry.title;
    C.addVersion(entry, text, Date.now(), settings.versions);
    if (entry.versions.length) await browser.storage.local.set({ [key]: entry });
  }

  function later(el) {
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => {
      timers.delete(el);
      save(el).catch(() => {});
    }, 500));
  }

  function flush() {
    for (const [el, t] of timers) {
      clearTimeout(t);
      save(el).catch(() => {});
    }
    timers.clear();
  }

  // The restore chip: shown when you come back to an empty field that had text.
  let chip = null;
  function hideChip() {
    if (chip) chip.remove();
    chip = null;
  }

  async function offer(el) {
    hideChip();
    if (!settings.enabled || !settings.chip || textOf(el).trim()) return;
    if (C.excluded(location.hostname, settings.excluded)) return;
    const key = keyOf(el);
    const entry = (await browser.storage.local.get(key))[key];
    const last = entry && entry.versions[entry.versions.length - 1];
    if (!last || document.activeElement !== el && !el.contains(document.activeElement)) return;
    const host = document.createElement('zapazka-chip');
    const shadow = host.attachShadow({ mode: 'open' });
    const r = el.getBoundingClientRect();
    const top = r.bottom + 6 + 34 > window.innerHeight ? r.top - 40 : r.bottom + 6;
    const style = document.createElement('style');
    style.textContent = `:host{all:initial;position:fixed;z-index:2147483647;left:${Math.max(4, r.left)}px;top:${Math.max(4, top)}px}
      .c{display:flex;align-items:center;gap:6px;font:13px/1.3 system-ui,sans-serif;background:#16313a;color:#fff;border-radius:8px;padding:5px 6px 5px 10px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
      button{font:inherit;border:0;border-radius:6px;cursor:pointer} .r{background:#f2b450;color:#1b1b1b;font-weight:700;padding:4px 10px} .x{background:transparent;color:#cfe;padding:2px 6px;font-size:15px}`;
    const box = document.createElement('div');
    box.className = 'c';
    const text = document.createElement('span');
    text.textContent = msg('chipText', [String(last.text.length), C.ago(last.t, Date.now(), lang)]);
    const restore = document.createElement('button');
    restore.className = 'r';
    restore.textContent = msg('restore');
    const close = document.createElement('button');
    close.className = 'x';
    close.textContent = '×';
    close.title = msg('dismiss');
    box.append(text, restore, close);
    shadow.append(style, box);
    restore.addEventListener('mousedown', (e) => e.preventDefault());
    restore.addEventListener('click', () => {
      setText(el, last.text);
      hideChip();
      el.focus();
    });
    close.addEventListener('mousedown', (e) => e.preventDefault());
    close.addEventListener('click', hideChip);
    document.documentElement.appendChild(host);
    chip = host;
  }

  document.addEventListener('input', (e) => {
    const el = fieldOf(e.target);
    if (!el) return;
    hideChip();
    later(el);
  }, true);
  // Offered on focus, and on a click into a field that already had focus (autofocus, or a window that
  // was in the background when the field got focus).
  const maybeOffer = (e) => {
    const el = fieldOf(e.target);
    if (el && !chip && C.kind(describe(el))) offer(el).catch(() => {});
  };
  document.addEventListener('focusin', maybeOffer, true);
  document.addEventListener('click', maybeOffer, true);
  document.addEventListener('focusout', (e) => {
    const el = fieldOf(e.target);
    if (el && timers.has(el)) {
      clearTimeout(timers.get(el));
      timers.delete(el);
      save(el).catch(() => {});
    }
    setTimeout(() => {
      if (chip && !fieldOf(document.activeElement)) hideChip();
    }, 150);
  }, true);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  setTimeout(badge, 0); // Lite has no settings: the defaults apply

  // The page report: every text field on this page and whether Zapazka keeps it, or refuses it and why.
  function allFields() {
    return [...document.querySelectorAll('textarea, input, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')]
      .map((el) => fieldOf(el)).filter((el, i, a) => el && a.indexOf(el) === i);
  }

  function report() {
    const keys = fields();
    const rows = [];
    let ignored = 0;
    for (const el of allFields()) {
      const d = describe(el);
      const w = C.why(d);
      const content = contentRefused.get(el);
      if (content) {
        rows.push({ label: d.label || d.placeholder || d.name || d.id || d.tag, reason: content, scope: 'content' });
      } else if (w.kind) {
        rows.push({ label: d.label || d.placeholder || d.name || d.id || d.tag, key: C.fieldKey(location.href, d, keys.indexOf(el)), kind: w.kind });
      } else if (w.reason === 'autocomplete' || w.reason === 'name') {
        rows.push({ label: d.label || d.placeholder || d.name || d.id || d.tag, reason: w.reason, scope: 'field' });
      } else {
        ignored += 1;
      }
    }
    return { rows, ignored, frame: window === window.top ? 'top' : 'frame' };
  }

  // The toolbar badge says whether Zapazka is watching this page: the number of fields it protects here.
  let badgeTimer = null;
  function badge() {
    if (window !== window.top) return;
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      const state = !settings.enabled ? 'paused' : C.excluded(location.hostname, settings.excluded) ? 'site' : 'on';
      browser.runtime.sendMessage({ type: 'zapazka-badge', n: state === 'on' ? fields().length : 0, state }).catch(() => {});
    }, 400);
  }
  new MutationObserver(() => badge()).observe(document.documentElement, { childList: true, subtree: true });

  // The popup asks which saved texts belong to fields on this page, and fills one back.
  browser.runtime.onMessage.addListener((m) => {
    if (m && m.type === 'zapazka-fields') return Promise.resolve(fields().map(keyOf));
    if (m && m.type === 'zapazka-report') return Promise.resolve(report());
    if (m && m.type === 'zapazka-restore') {
      const el = fields().find((f) => keyOf(f) === m.key);
      if (!el) return Promise.resolve(false);
      setText(el, m.text);
      el.scrollIntoView({ block: 'center' });
      el.focus();
      return Promise.resolve(true);
    }
    return undefined;
  });
})();
