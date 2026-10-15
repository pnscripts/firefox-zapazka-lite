// Zapazka Lite by PN Scripts (MIT): the rules shared by the content script and the popup.
// A classic script (content scripts cannot import modules): it sets globalThis.ZapazkaCore.
(function (root) {
  'use strict';

  const DEFAULTS = { enabled: true, days: 7, minLength: 20, versions: 1, excluded: ['accounts.google.com', 'login.microsoftonline.com'], chip: true };

  // Never kept, whatever the page says: passwords, card data, codes and secrets.
  const SECRET_AUTOCOMPLETE = /^(current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp|cc-exp-month|cc-exp-year|cc-name|transaction-amount)$/i;
  const SECRET_NAME = /(pass(word|wd)?|pwd|pin\b|cvv|cvc|csc|card.?(no|num)|cc-?num|iban|ssn|social.?sec|otp|one.?time|token|secret|2fa|totp|verification.?code|security.?code|captcha)/i;

  /**
   * f: { tag, type, name, id, autocomplete, label, editable, readOnly, disabled, hidden }
   * Returns 'long' for a text area that may be kept, '' otherwise.
   */
  function kind(f) {
    if (f.disabled || f.readOnly || f.hidden) return '';
    const hint = [f.name, f.id, f.label, f.placeholder].filter(Boolean).join(' ');
    if (SECRET_AUTOCOMPLETE.test(f.autocomplete || '') || SECRET_NAME.test(hint)) return '';
    // Lite keeps text areas; the full edition also keeps rich editors and one-line fields.
    return f.tag === 'textarea' ? 'long' : '';
  }

  function hostMatches(host, pattern) {
    const p = pattern.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!p) return false;
    const h = host.toLowerCase();
    if (!p.includes('*')) return h === p || h.endsWith('.' + p);
    const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return re.test(h);
  }

  function excluded(host, patterns) {
    return (patterns || []).some((p) => hostMatches(host, p));
  }

  /** Storage key of a field: page address without query and hash, plus the field's name, id, label or position. */
  function fieldKey(href, f, index) {
    const u = new URL(href);
    const who = f.name || f.id || f.label || f.placeholder || `${f.tag}#${index}`;
    return `z:${u.origin}${u.pathname}|${who}`;
  }

  /**
   * Adds text to an entry's versions. Typing on continues the newest version; a new version starts when
   * the newest is older than a minute, or when most of the text was deleted at once, so an accidental
   * select-all and delete can be undone.
   */
  function addVersion(entry, text, now, max) {
    const v = entry.versions;
    const last = v[v.length - 1];
    if (last && last.text === text) return entry;
    if (!text.trim()) return entry; // an emptied field keeps what it had
    const bigCut = last && text.length < last.text.length * 0.5 && last.text.length - text.length > 20;
    if (last && now - last.t < 60000 && !bigCut) {
      last.text = text;
      last.t = now;
    } else {
      v.push({ t: now, text });
    }
    while (v.length > max) v.shift();
    entry.updated = now;
    return entry;
  }

  /** Keys of entries older than `days`. */
  function expired(entries, now, days) {
    const limit = now - days * 86400000;
    return Object.entries(entries).filter(([k, e]) => k.startsWith('z:') && (!e || !e.updated || e.updated < limit)).map(([k]) => k);
  }

  function ago(t, now, lang) {
    const s = Math.max(0, Math.round((now - t) / 1000));
    const bg = lang === 'bg';
    if (s < 60) return bg ? 'току-що' : 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return bg ? `преди ${m} мин` : `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return bg ? `преди ${h} ч` : `${h} h ago`;
    const d = Math.round(h / 24);
    return bg ? `преди ${d} ${d === 1 ? 'ден' : 'дни'}` : `${d} day${d === 1 ? '' : 's'} ago`;
  }

  function preview(text, n) {
    const one = text.replace(/\s+/g, ' ').trim();
    return one.length > n ? one.slice(0, n - 1) + '…' : one;
  }

  function words(text) {
    const m = text.trim().match(/\S+/g);
    return m ? m.length : 0;
  }

  const api = { DEFAULTS, kind, hostMatches, excluded, fieldKey, addVersion, expired, ago, preview, words };
  root.ZapazkaCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
