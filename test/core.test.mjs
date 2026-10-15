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
