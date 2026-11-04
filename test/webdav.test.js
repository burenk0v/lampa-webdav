const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/webdav.js');

test('normalizes DLNA host and port', () => {
  assert.equal(core.normalizeAddress('192.168.1.1'), '192.168.1.1');
  assert.equal(core.normalizeAddress('http://media.local/'), 'media.local');
  assert.equal(core.normalizePort('8200'), 8200);
  assert.equal(core.serverUrl('192.168.1.1', 8200), 'http://192.168.1.1:8200/');
});

test('rejects invalid DLNA address and port', () => {
  assert.throws(() => core.normalizeAddress(''));
  assert.throws(() => core.normalizeAddress('192.168.1.1/path'));
  assert.throws(() => core.normalizePort('0'));
  assert.throws(() => core.normalizePort('65536'));
  assert.throws(() => core.normalizePort('abc'));
});

test('resolves media URLs and recognizes common video formats', () => {
  assert.equal(core.resolveUrl('http://192.168.1.1:8200/', '/media/Film%20One.MKV'), 'http://192.168.1.1:8200/media/Film%20One.MKV');
  assert.equal(core.isVideo('http://192.168.1.1/Film%20One.MKV?x=1'), true);
  assert.equal(core.isVideo('http://192.168.1.1/poster.jpg'), false);
});

test('escapes object identifiers for SOAP XML', () => {
  assert.equal(core.escapeXml('folder&<1>'), 'folder&amp;&lt;1&gt;');
});

