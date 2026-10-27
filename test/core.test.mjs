import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './load.mjs';

const C = load('core.js').ZapazkaCore;

test('Lite keeps text areas only', () => {
  assert.equal(C.kind({ tag: 'textarea', name: 'message' }), 'long');
  assert.equal(C.kind({ tag: 'div', editable: true }), '');
  for (const type of ['', 'text', 'search', 'email']) assert.equal(C.kind({ tag: 'input', type, name: 'subject' }), '', type);
});

test('never kept: passwords, cards, codes, hidden, disabled and read-only fields', () => {
  for (const type of ['password', 'hidden', 'number', 'date', 'checkbox', 'file']) assert.equal(C.kind({ tag: 'input', type }), '', type);
  for (const autocomplete of ['current-password', 'one-time-code', 'cc-number']) assert.equal(C.kind({ tag: 'textarea', autocomplete }), '', autocomplete);
  for (const name of ['password2', 'card_number', 'cvv', 'iban', 'otp', 'api_token', 'pin', 'ssn']) assert.equal(C.kind({ tag: 'textarea', name }), '', name);
  assert.equal(C.kind({ tag: 'textarea', label: 'Your secret recovery phrase' }), '');
  assert.equal(C.kind({ tag: 'textarea', disabled: true }), '');
  assert.equal(C.kind({ tag: 'textarea', readOnly: true }), '');
  assert.equal(C.kind({ tag: 'textarea', hidden: true }), '');
  assert.equal(C.kind({ tag: 'textarea', name: 'spinner' }), 'long', 'pin only as a word');
});

test('excluded sites, with and without *', () => {
  assert.equal(C.excluded('mail.example.com', ['example.com']), true);
  assert.equal(C.excluded('notexample.com', ['example.com']), false);
  assert.equal(C.excluded('login.bank.test', ['login.*']), true);
  assert.equal(C.excluded('www.bank.test', ['*.bank.test']), true);
  assert.equal(C.excluded('bank.test', ['https://bank.test/path']), true);
  assert.equal(C.excluded('a.test', []), false);
});

test('field keys: page without query, then name, id, label or position', () => {
  assert.equal(C.fieldKey('https://forum.example/post/new?draft=1#top', { tag: 'textarea', name: 'body' }, 0), 'z:https://forum.example/post/new|body');
  assert.equal(C.fieldKey('https://a.test/', { tag: 'textarea', label: 'Comment' }, 2), 'z:https://a.test/|Comment');
  assert.equal(C.fieldKey('https://a.test/', { tag: 'div' }, 3), 'z:https://a.test/|div#3');
});

test('versions: typing continues one version, a pause or a big deletion starts a new one', () => {
  const e = { versions: [] };
  const t0 = 1_000_000;
  C.addVersion(e, 'Dear team,', t0, 10);
  C.addVersion(e, 'Dear team, the report', t0 + 5_000, 10);
  assert.equal(e.versions.length, 1);
  assert.equal(e.versions[0].text, 'Dear team, the report');
  C.addVersion(e, 'Dear team, the report is attached.', t0 + 120_000, 10);
  assert.equal(e.versions.length, 2);
  C.addVersion(e, 'x', t0 + 125_000, 10);
  assert.equal(e.versions.length, 3, 'select-all and type: the long text stays as an older version');
  assert.equal(e.versions[1].text, 'Dear team, the report is attached.');
  C.addVersion(e, '', t0 + 126_000, 10);
  assert.equal(e.versions.at(-1).text, 'x', 'an emptied field keeps its text');
  for (let i = 0; i < 20; i++) C.addVersion(e, `v${i}`, t0 + 200_000 + i * 61_000, 10);
  assert.equal(e.versions.length, 10);
  assert.equal(e.versions.at(-1).text, 'v19');
});

test('expiry after the days set', () => {
  const now = Date.UTC(2026, 9, 15);
  const day = 86400000;
  const store = { settings: { days: 7 }, 'z:a|x': { updated: now - 8 * day }, 'z:b|y': { updated: now - 6 * day }, 'z:c|z': {} };
  assert.deepEqual(JSON.parse(JSON.stringify(C.expired(store, now, 7))), ['z:a|x', 'z:c|z']);
});

test('times and previews in English and Bulgarian', () => {
  const now = 10_000_000;
  assert.equal(C.ago(now - 30_000, now, 'en'), 'just now');
  assert.equal(C.ago(now - 180_000, now, 'en'), '3 min ago');
  assert.equal(C.ago(now - 2 * 3600_000, now, 'bg'), 'преди 2 ч');
  assert.equal(C.ago(now - 86400_000, now, 'bg'), 'преди 1 ден');
  assert.equal(C.preview('a  b\n\nc', 10), 'a b c');
  assert.equal(C.preview('abcdefghijkl', 5), 'abcd…');
  assert.equal(C.words('  one two\nthree '), 3);
});

test('both languages have every message, placeholders included', () => {
  const en = JSON.parse(readFileSync(new URL('../extension/_locales/en/messages.json', import.meta.url)));
  const bg = JSON.parse(readFileSync(new URL('../extension/_locales/bg/messages.json', import.meta.url)));
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  for (const k of Object.keys(en)) assert.deepEqual(Object.keys(bg[k].placeholders || {}), Object.keys(en[k].placeholders || {}), k);
  const used = new Set();
  for (const f of ['content.js', 'popup.js', 'manifest.json']) {
    for (const m of readFileSync(new URL(`../extension/${f}`, import.meta.url), 'utf8').matchAll(/(?<![\w.$])(?:t|msg)\('([A-Za-z]+)'|__MSG_([A-Za-z]+)__/g)) used.add(m[1] || m[2]);
  }
  for (const k of used) assert.ok(en[k], `missing message ${k}`);
});

// ---- 1.1.0: the text itself is checked, and every refusal has a reason and a receipt --------------

const J = (x) => JSON.parse(JSON.stringify(x));

test('why: every refusal names its reason', () => {
  assert.deepEqual(J(C.why({ tag: 'textarea', disabled: true })), { kind: '', reason: 'disabled' });
  assert.deepEqual(J(C.why({ tag: 'textarea', readOnly: true })), { kind: '', reason: 'readonly' });
  assert.deepEqual(J(C.why({ tag: 'textarea', hidden: true })), { kind: '', reason: 'hidden' });
  assert.deepEqual(J(C.why({ tag: 'input', type: 'text', autocomplete: 'cc-number' })), { kind: '', reason: 'autocomplete' });
  assert.deepEqual(J(C.why({ tag: 'input', type: 'text', name: 'card_number' })), { kind: '', reason: 'name' });
  assert.deepEqual(J(C.why({ tag: 'input', type: 'checkbox' })), { kind: '', reason: 'type' });
  assert.deepEqual(J(C.why({ tag: 'div', editable: true })), { kind: '', reason: 'type' }, 'Lite: text areas only');
  assert.deepEqual(J(C.why({ tag: 'textarea', name: 'body' })), { kind: 'long', reason: '' });
});

test('Bulgarian field names are never kept either', () => {
  for (const label of ['Парола', 'Нова парола', 'ПИН код', 'Номер на карта', 'Код за потвърждение', 'Еднократен код', 'API токен', 'Тайна фраза']) {
    assert.equal(C.kind({ tag: 'textarea', label }), '', label);
  }
  for (const label of ['Спинер', 'Коментар', 'Отговор', 'Съобщение']) assert.equal(C.kind({ tag: 'textarea', label }), 'long', label);
});

test('card numbers are found in the text by the Luhn check, with or without separators', () => {
  assert.equal(C.luhn('4111111111111111'), true);
  assert.equal(C.luhn('4111111111111112'), false);
  for (const t of ['pay with 4111 1111 1111 1111 please', '5500-0000-0000-0004', 'amex 378282246310005 thanks', 'card:6011111111111117.']) assert.equal(C.contentRisk(t), 'card', t);
  for (const t of ['order 4111111111111112', 'ticket 1234567890123', 'call +359 888 123 456', 'ref 2026-10-27 1030', 'a long number 12345678901234567890123']) assert.equal(C.contentRisk(t), '', t);
});

test('IBANs are found by the ISO 7064 check', () => {
  assert.equal(C.ibanOk('BG80 BNBG 9661 1020 3456 78'), true);
  assert.equal(C.ibanOk('BG80 BNBG 9661 1020 3456 79'), false);
  assert.equal(C.contentRisk('my account is DE89 3704 0044 0532 0130 00, thanks'), 'iban');
  assert.equal(C.contentRisk('Pay to GB82WEST12345698765432 today'), 'iban');
  assert.equal(C.contentRisk('Pay to GB82WEST12345698765433 today'), '');
  assert.equal(C.contentRisk('see section AB12 CDEF and GHIJ'), '');
});

test('private keys, API tokens and "password: ..." in the text', () => {
  assert.equal(C.contentRisk('-----BEGIN OPENSSH PRIVATE KEY-----\nb3Blbn'), 'privatekey');
  assert.equal(C.contentRisk('-----BEGIN PGP PRIVATE KEY BLOCK-----'), 'privatekey');
  assert.equal(C.contentRisk('-----BEGIN PUBLIC KEY-----'), '');
  assert.equal(C.contentRisk('key AKIAIOSFODNN7EXAMPLE here'), 'token');
  assert.equal(C.contentRisk(`token ghp_${'a1'.repeat(18)}`), 'token');
  assert.equal(C.contentRisk(`${'eyJhbGciOiJIUzI1NiJ9'}.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk`), 'token');
  assert.equal(C.contentRisk('login: bob password: s3cret!'), 'password');
  assert.equal(C.contentRisk('паролата ми: abcd1234'), '');
  assert.equal(C.contentRisk('парола: abcd1234'), 'password');
  assert.equal(C.contentRisk('the password is required'), '');
  assert.equal(C.contentRisk('A normal paragraph about a skill-based game and passwords in general.'), '');
});

test('the user\'s own never-keep words, case-insensitive', () => {
  assert.equal(C.contentRisk('About Project Falcon', ['falcon']), 'custom');
  assert.equal(C.contentRisk('About Project Eagle', ['falcon', ' ']), '');
  assert.equal(C.contentRisk('About Project Eagle'), '');
});

test('verdict: field, content, or the user\'s own switches', () => {
  const s = { ...C.DEFAULTS, enabled: true, never: [] };
  const area = { tag: 'textarea', name: 'body' };
  assert.deepEqual(J(C.verdict(area, 'hello there', s, 'a.test')), { keep: true, reason: '', scope: '' });
  assert.deepEqual(J(C.verdict({ tag: 'textarea', name: 'otp_code' }, 'hello', s, 'a.test')), { keep: false, reason: 'name', scope: 'field' });
  assert.deepEqual(J(C.verdict(area, 'card 4111 1111 1111 1111', s, 'a.test')), { keep: false, reason: 'card', index: 5, scope: 'content' });
  assert.deepEqual(J(C.verdict(area, 'hello', { ...s, enabled: false }, 'a.test')), { keep: false, reason: 'paused', scope: 'user' });
  assert.deepEqual(J(C.verdict(area, 'hello', s, 'accounts.google.com')), { keep: false, reason: 'site', scope: 'user' });
  assert.deepEqual(J(C.verdict({ tag: 'input', type: 'text', name: 'subject' }, 'a subject line of some length', s, 'a.test')), { keep: false, reason: 'type', scope: 'field' });
  // A risky text is refused even when the site is excluded or saving is paused: the reason shown is the sensitive one.
  assert.equal(C.verdict(area, 'iban DE89370400440532013000', { ...s, enabled: false }, 'a.test').reason, 'iban');
});

test('ledger: one row per field and reason with a count, newest first, capped, and never any text', () => {
  let rows = [];
  rows = C.ledgerAdd(rows, { field: 'Message', reason: 'card', scope: 'content', page: '/contact' }, 1000, 5);
  rows = C.ledgerAdd(rows, { field: 'Message', reason: 'card', scope: 'content' }, 2000, 5);
  rows = C.ledgerAdd(rows, { field: 'Message', reason: 'iban', scope: 'content' }, 3000, 5);
  assert.equal(rows.length, 2);
  assert.deepEqual(J(rows.map((r) => [r.reason, r.n, r.t])), [['iban', 1, 3000], ['card', 2, 2000]]);
  for (let i = 0; i < 10; i++) rows = C.ledgerAdd(rows, { field: `f${i}`, reason: 'name', scope: 'field' }, 4000 + i, 5);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].field, 'f9');
  assert.ok(!JSON.stringify(rows).includes('4111'));
  assert.equal(C.ledgerAdd([], { field: 'x'.repeat(200), reason: 'name', scope: 'field' }, 1, 5)[0].field.length, 60);
});

test('ledger expiry follows the days set, like the texts', () => {
  const day = 86400000;
  const now = 100 * day;
  const store = {
    settings: {},
    'l:old.test': { items: [{ t: now - 9 * day }] },
    'l:mixed.test': { items: [{ t: now - 9 * day, field: 'a' }, { t: now - day, field: 'b' }] },
    'l:new.test': { items: [{ t: now - day }] },
    'z:https://a.test/|x': { updated: 0 },
  };
  const r = C.ledgerExpire(store, now, 7);
  assert.deepEqual(J(r.drop), ['l:old.test']);
  assert.deepEqual(Object.keys(r.keep), ['l:mixed.test']);
  assert.equal(r.keep['l:mixed.test'].items.length, 1);
  assert.deepEqual(J(C.expired(store, now, 7)), ['z:https://a.test/|x'], 'ledger rows are not texts');
});

test('every refusal reason has a message in both languages', () => {
  const en = JSON.parse(readFileSync(new URL('../extension/_locales/en/messages.json', import.meta.url)));
  const bg = JSON.parse(readFileSync(new URL('../extension/_locales/bg/messages.json', import.meta.url)));
  for (const r of C.REFUSALS) {
    assert.ok(en[`r_${r}`] && bg[`r_${r}`], r);
    assert.match(bg[`r_${r}`].message, /[а-я]/i, `${r} is Bulgarian`);
  }
});

test('scrub: the first digits of a number kept at a pause are removed once it is complete', () => {
  const full = 'Refund please, card 4111 1111 1111 1111 thanks';
  const e = { versions: [{ t: 1, text: 'Refund please' }, { t: 2, text: 'Refund please, card 4111 1111 11' }, { t: 3, text: 'Other draft' }] };
  const risk = C.riskAt(full);
  assert.equal(risk.reason, 'card');
  assert.equal(risk.index, full.indexOf('4111'));
  assert.equal(C.scrub(e, full, risk.index), 1);
  assert.deepEqual(J(e.versions.map((v) => v.text)), ['Refund please', 'Other draft']);
  assert.equal(C.scrub(e, full, risk.index), 0);
  // text before the number is not touched, even when it ends right at it
  const f = { versions: [{ t: 1, text: 'Refund please, card ' }] };
  assert.equal(C.scrub(f, full, risk.index), 0);
});
