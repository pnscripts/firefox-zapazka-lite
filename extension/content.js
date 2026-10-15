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

  async function save(el) {
    if (!settings.enabled || C.excluded(location.hostname, settings.excluded)) return;
    const d = describe(el);
    const k = C.kind(d);
    if (!k) return;
    const text = textOf(el);
    if (k === 'line' && text.trim().length < settings.minLength) return;
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


  // The popup asks which saved texts belong to fields on this page, and fills one back.
  browser.runtime.onMessage.addListener((m) => {
    if (m && m.type === 'zapazka-fields') return Promise.resolve(fields().map(keyOf));
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
