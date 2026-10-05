// Static integrity checks for the site files — catch broken wiring without a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const app = read('app.js');
const css = read('styles.css');

const ALLOWED_SCRIPT_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];

test('index.html references only files that exist, lib.js before app.js', () => {
  const srcs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const s of srcs.filter((s) => !/^https?:/.test(s))) {
    assert.ok(fs.existsSync(path.join(root, s)), `missing local file: ${s}`);
  }
  assert.ok(html.indexOf('lib.js') < html.indexOf('app.js'), 'lib.js must load before app.js');
});

test('external scripts come only from allowed CDNs', () => {
  const ext = [...html.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map((m) => new URL(m[1]).host);
  for (const h of ext) assert.ok(ALLOWED_SCRIPT_HOSTS.includes(h), `script host not allowed: ${h}`);
});

test('every data-action used in markup has a click handler', () => {
  const used = new Set([...(html + app).matchAll(/data-action="([a-z-]+)"/g)].map((m) => m[1]));
  const handled = new Set([...app.matchAll(/a === '([a-z-]+)'/g)].map((m) => m[1]));
  for (const a of used) assert.ok(handled.has(a), `no handler for data-action="${a}"`);
});

test('every event type has badge and pill styles', () => {
  const { TYPES } = require('../lib.js');
  for (const t of Object.keys(TYPES)) {
    assert.ok(css.includes(`.badge.${t}`), `missing .badge.${t}`);
    assert.ok(css.includes(`.pill.${t}`), `missing .pill.${t}`);
  }
});

test('theme tokens are defined for light and both dark selectors', () => {
  assert.match(css, /:root\s*{[^}]*--bg:/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\]\s*{/);
});

test('app.js does not touch localStorage outside try/catch helpers', () => {
  const uses = app.split('\n').filter((l) => l.includes('localStorage'));
  for (const l of uses) assert.match(l, /try|const raw/, `unguarded storage access: ${l.trim()}`);
});
