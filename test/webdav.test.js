const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/webdav.js');

test('normalizes WebDAV base URL', () => {
  assert.equal(core.normalizeBaseUrl('https://example.test/webdav'), 'https://example.test/webdav/');
});

test('rejects unsupported protocols and URL credentials', () => {
  assert.throws(() => core.normalizeBaseUrl('ftp://example.test/dav'));
  assert.throws(() => core.normalizeBaseUrl('https://user:pass@example.test/dav'));
});

test('resolves relative hrefs without allowing another origin', () => {
  assert.equal(core.resolveHref('https://example.test/dav/', 'Movies/'), 'https://example.test/dav/Movies/');
  assert.throws(() => core.resolveHref('https://example.test/dav/', 'https://attacker.test/file'));
});

test('recognizes common video extensions and ignores query strings', () => {
  assert.equal(core.isVideo('https://example.test/Film%20One.MKV?download=1'), true);
  assert.equal(core.isVideo('https://example.test/poster.jpg'), false);
});
