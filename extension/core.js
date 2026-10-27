// Zapazka Lite by PN Scripts (MIT): the rules shared by the content script and the popup.
// A classic script (content scripts cannot import modules): it sets globalThis.ZapazkaCore.
(function (root) {
  'use strict';

  const DEFAULTS = { enabled: true, days: 7, minLength: 20, versions: 1, excluded: ['accounts.google.com', 'login.microsoftonline.com'], chip: true, never: [] };

  // Never kept, whatever the page says: passwords, card data, codes and secrets.
  const SECRET_AUTOCOMPLETE = /^(current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp|cc-exp-month|cc-exp-year|cc-name|transaction-amount)$/i;
  const SECRET_NAME = /(pass(word|wd)?|pwd|pin\b|cvv|cvc|csc|card.?(no|num)|cc-?num|iban|ssn|social.?sec|otp|one.?time|token|secret|2fa|totp|verification.?code|security.?code|captcha)/i;
  // The same idea in Bulgarian (the JS word boundary does not know Cyrillic, so letters are checked by hand).
  const SECRET_NAME_BG = /(парол|тайн|(?<![\p{L}])пин(?![\p{L}])|еднократен код|код за (потвърждение|сигурност)|номер на карта|картов номер|токен)/iu;

  /**
   * f: { tag, type, name, id, autocomplete, label, editable, readOnly, disabled, hidden }
   * Says whether a field may be kept and, when it may not, why. The reason is what the page report and
   * the ledger show: 'disabled', 'readonly', 'hidden', 'autocomplete' (the page itself marks the field as
   * a password, card or code), 'name' (its name, id, label or placeholder says so), 'type' (not a text field).
   * Returns { kind: 'long' | '', reason } (Lite keeps text areas only).
   */
  function why(f) {
    if (f.disabled) return { kind: '', reason: 'disabled' };
    if (f.readOnly) return { kind: '', reason: 'readonly' };
    if (f.hidden) return { kind: '', reason: 'hidden' };
    const hint = [f.name, f.id, f.label, f.placeholder].filter(Boolean).join(' ');
    if (SECRET_AUTOCOMPLETE.test(f.autocomplete || '')) return { kind: '', reason: 'autocomplete' };
    if (SECRET_NAME.test(hint) || SECRET_NAME_BG.test(hint)) return { kind: '', reason: 'name' };
    // Lite keeps text areas; the full edition also keeps rich editors and one-line fields.
    if (f.tag === 'textarea') return { kind: 'long', reason: '' };
    return { kind: '', reason: 'type' };
  }

  /** Returns 'long' for a text area that may be kept, '' otherwise. */
  function kind(f) {
    return why(f).kind;
  }

  // ---- The text itself is checked too, not only the field's name ---------------------------------

  function luhn(digits) {
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits.charCodeAt(i) - 48;
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  // IBAN length by country (SWIFT registry); a number with another length is not an IBAN.
  const IBAN_LEN = Object.fromEntries('AD24 AE23 AL28 AT20 AZ28 BA20 BE16 BG22 BH22 BR29 BY28 CH21 CR22 CY28 CZ24 DE22 DK18 DO28 EE20 EG29 ES24 FI18 FO18 FR27 GB22 GE22 GI23 GL18 GR27 GT28 HR21 HU28 IE22 IL23 IQ23 IS26 IT27 JO30 KW30 KZ20 LB28 LC32 LI21 LT20 LU20 LV21 MC27 MD24 ME22 MK19 MR27 MT31 MU30 NL18 NO15 PK24 PL28 PS29 PT25 QA29 RO24 RS22 SA24 SC31 SE24 SI19 SK24 SM27 ST25 SV28 TL23 TN24 TR26 UA29 VA22 VG24 XK20'.split(' ').map((x) => [x.slice(0, 2), Number(x.slice(2))]));

  function ibanOk(raw) {
    const s = raw.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s) || IBAN_LEN[s.slice(0, 2)] !== s.length) return false;
    let rem = 0;
    for (const ch of s.slice(4) + s.slice(0, 4)) {
      const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
      for (const d of v) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
    }
    return rem === 1;
  }

  const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;
  const TOKEN = /(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|glpat-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|npm_[A-Za-z0-9]{36}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/;
  const PASSWORD_IN_TEXT = /(?:pass(?:word|wd)?|pwd|парола)\s*[:=]\s*\S{4,}/iu;

  /** True when the text holds an IBAN (spaces allowed between its groups); returns where it starts, or -1. */
  function ibanAt(text) {
    for (const m of text.matchAll(/(?<![A-Za-z0-9])[A-Za-z]{2}\d{2}[A-Za-z0-9 ]{11,45}/g)) {
      const want = IBAN_LEN[m[0].slice(0, 2).toUpperCase()];
      if (!want) continue;
      let n = 0;
      let end = -1;
      for (let i = 0; i < m[0].length && end < 0; i++) {
        if (m[0][i] === ' ') continue;
        n += 1;
        if (n === want) end = i + 1;
      }
      if (end < 0) continue;
      const next = m.index + end < text.length ? text[m.index + end] : '';
      if (next && /[A-Za-z0-9]/.test(next)) continue; // longer than an IBAN of that country
      if (ibanOk(m[0].slice(0, end))) return m.index;
    }
    return -1;
  }

  /**
   * Looks at the typed text, whatever the field is called. Returns null when nothing is wrong, otherwise
   * { reason, index }: 'card' (a card number that passes the Luhn check), 'iban' (an IBAN that passes the
   * ISO 7064 check), 'privatekey', 'token' (API keys and tokens with a known shape), 'password'
   * ("password: ..." in the text, also "парола: ...") or 'custom' (one of the words the user listed), and
   * where in the text it starts. A text that returns a reason is not kept at all.
   */
  function riskAt(text, never) {
    if (!text) return null;
    let m = PRIVATE_KEY.exec(text);
    if (m) return { reason: 'privatekey', index: m.index };
    m = TOKEN.exec(text);
    if (m) return { reason: 'token', index: m.index };
    for (const c of text.matchAll(/(?<![\d-])[2-6](?:[ -]?\d){12,18}(?![\d])/g)) {
      const d = c[0].replace(/\D/g, '');
      if (d.length >= 13 && d.length <= 19 && luhn(d)) return { reason: 'card', index: c.index };
    }
    const at = ibanAt(text);
    if (at >= 0) return { reason: 'iban', index: at };
    m = PASSWORD_IN_TEXT.exec(text);
    if (m) return { reason: 'password', index: m.index };
    const low = text.toLowerCase();
    for (const w of never || []) {
      const x = String(w || '').trim().toLowerCase();
      if (x && low.includes(x)) return { reason: 'custom', index: low.indexOf(x) };
    }
    return null;
  }

  function contentRisk(text, never) {
    const r = riskAt(text, never);
    return r ? r.reason : '';
  }

  /**
   * A card number is typed digit by digit, and a pause can keep the first digits before the number is
   * complete. When the text turns out to hold something sensitive, the earlier versions that are the
   * start of this same text and already reach into it are removed. Returns how many were removed.
   */
  function scrub(entry, text, index) {
    const before = entry.versions.length;
    entry.versions = entry.versions.filter((v) => !(v.text.length > index && text.startsWith(v.text)));
    return before - entry.versions.length;
  }

  /**
   * The full decision for one field and its text: { keep, reason, scope }.
   * scope 'field' = decided by the field itself, 'content' = decided by the text, 'user' = the user's own
   * switches (paused, excluded site, too short) which are not refusals of anything sensitive.
   */
  function verdict(f, text, settings, host) {
    const w = why(f);
    if (!w.kind) return { keep: false, reason: w.reason, scope: 'field' };
    const risk = riskAt(text, settings.never);
    if (risk) return { keep: false, reason: risk.reason, index: risk.index, scope: 'content' };
    if (!settings.enabled) return { keep: false, reason: 'paused', scope: 'user' };
    if (excluded(host, settings.excluded)) return { keep: false, reason: 'site', scope: 'user' };
    if (w.kind === 'line' && text.trim().length < settings.minLength) return { keep: false, reason: 'short', scope: 'user' };
    return { keep: true, reason: '', scope: '' };
  }

  // Reasons that are recorded in the ledger (never the text itself) and shown in the page report.
  const REFUSALS = ['autocomplete', 'name', 'card', 'iban', 'privatekey', 'token', 'password', 'custom'];

  /**
   * The ledger of one site: what was refused, where and why, never the refused text.
   * items: [{ field, reason, scope, t, n }]; the same field and reason is one row with a count.
   */
  function ledgerAdd(items, rec, now, max) {
    const list = (items || []).slice();
    const field = String(rec.field || '').slice(0, 60);
    const row = list.find((r) => r.field === field && r.reason === rec.reason);
    if (row) {
      row.t = now;
      row.n += 1;
      if (rec.page) row.page = rec.page;
    } else {
      list.push({ field, reason: rec.reason, scope: rec.scope, page: rec.page || '', t: now, n: 1 });
    }
    list.sort((a, b) => b.t - a.t);
    return list.slice(0, max || 40);
  }

  /** Keys of ledger rows (l:<host>) whose rows are all older than `days`, and the pruned rows of the others. */
  function ledgerExpire(store, now, days) {
    const limit = now - days * 86400000;
    const drop = [];
    const keep = {};
    for (const [k, v] of Object.entries(store)) {
      if (!k.startsWith('l:')) continue;
      const rows = ((v && v.items) || []).filter((r) => r.t >= limit);
      if (!rows.length) drop.push(k);
      else if (rows.length !== v.items.length) keep[k] = { items: rows };
    }
    return { drop, keep };
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

  const api = { DEFAULTS, REFUSALS, why, kind, luhn, ibanOk, contentRisk, riskAt, scrub, verdict, ledgerAdd, ledgerExpire, hostMatches, excluded, fieldKey, addVersion, expired, ago, preview, words };
  root.ZapazkaCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
