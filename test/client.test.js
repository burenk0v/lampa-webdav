const test = require('node:test');
const assert = require('node:assert/strict');
const { WebDAVClient, propfindBody } = require('../src/client.js');

function createMockRequest() {
  return {
    headers: {},
    readyState: 0,
    status: 0,
    responseText: '',
    open(method, url, async) { this.method = method; this.url = url; this.async = async; },
    setRequestHeader(name, value) { this.headers[name] = value; },
    send(body) { this.body = body; },
    abort() { this.aborted = true; },
    complete(status, responseText) {
      this.status = status;
      this.responseText = responseText || '';
      this.readyState = 4;
      this.onreadystatechange();
    }
  };
}

test('sends a depth-one WebDAV PROPFIND request', () => {
  const xhr = createMockRequest();
  const client = new WebDAVClient({ createRequest: () => xhr, parse: () => [] });
  client.list('https://example.test/webdav/', {}, {});
  assert.equal(xhr.method, 'PROPFIND');
  assert.equal(xhr.url, 'https://example.test/webdav/');
  assert.equal(xhr.async, true);
  assert.equal(xhr.headers.Depth, '1');
  assert.match(xhr.headers['Content-Type'], /application\/xml/);
  assert.match(xhr.body, /<d:propfind/);
});

test('adds Basic authorization only when a username is configured', () => {
  const xhr = createMockRequest();
  const client = new WebDAVClient({ createRequest: () => xhr, parse: () => [] });
  client.list('https://example.test/dav/', { username: 'user', password: 'pass' }, {});
  assert.equal(xhr.headers.Authorization, 'Basic dXNlcjpwYXNz');
});

test('returns parsed entries only for a 207 Multi-Status response', () => {
  const xhr = createMockRequest();
  const expected = [{ name: 'Film.mkv', isVideo: true }];
  let received;
  const client = new WebDAVClient({
    createRequest: () => xhr,
    parse: () => expected
  });
  client.list('https://example.test/dav/', {}, { success: items => { received = items; } });
  xhr.complete(207, '<multistatus/>');
  assert.equal(received, expected);
});

test('reports unexpected HTTP status once', () => {
  const xhr = createMockRequest();
  let failure;
  let calls = 0;
  const client = new WebDAVClient({ createRequest: () => xhr, parse: () => [] });
  client.list('https://example.test/dav/', {}, { error: error => { failure = error; calls++; } });
  xhr.complete(401);
  xhr.onreadystatechange();
  assert.equal(failure.status, 401);
  assert.match(failure.message, /HTTP 401/);
  assert.equal(calls, 1);
});

test('reports browser network and CORS failures', () => {
  const xhr = createMockRequest();
  let failure;
  const client = new WebDAVClient({ createRequest: () => xhr, parse: () => [] });
  client.list('https://example.test/dav/', {}, { error: error => { failure = error; } });
  xhr.onerror();
  assert.match(failure.message, /CORS\/OPTIONS.*TLS certificate/);
});

test('allows an in-flight request to be aborted', () => {
  const xhr = createMockRequest();
  const client = new WebDAVClient({ createRequest: () => xhr, parse: () => [] });
  const request = client.list('https://example.test/dav/', {}, {});
  request.abort();
  assert.equal(xhr.aborted, true);
});


test('logs WebDAV request stages without exposing authorization credentials', () => {
  const xhr = createMockRequest();
  const logs = [];
  const client = new WebDAVClient({ createRequest: () => xhr, parse: () => [], onLog: entry => logs.push(entry) });
  client.list('https://example.test/dav/', { username: 'user', password: 'secret' }, {});
  xhr.complete(207, '<multistatus/>');
  const events = logs.map(entry => entry.event);
  assert.ok(events.includes('СТАРТ WEBDAV'));
  assert.ok(events.includes('XHR OPEN'));
  assert.ok(events.includes('ЗАГОЛОВКИ ЗАПРОСА'));
  assert.ok(events.includes('XHR SEND'));
  assert.ok(events.includes('HTTP ОТВЕТ'));
  assert.ok(events.includes('WEBDAV ОТВЕТ РАЗОБРАН'));
  const headers = logs.find(entry => entry.event === 'ЗАГОЛОВКИ ЗАПРОСА');
  assert.equal(headers.details.Authorization, '(configured; hidden)');
  assert.equal(JSON.stringify(logs).includes('secret'), false);
});

test('logs network failures with CORS and TLS as possible causes', () => {
  const xhr = createMockRequest();
  const logs = [];
  const client = new WebDAVClient({ createRequest: () => xhr, parse: () => [], onLog: entry => logs.push(entry) });
  client.list('https://example.test/dav/', {}, {});
  xhr.onerror();
  const failure = logs.find(entry => entry.event === 'XHR ERROR');
  assert.ok(failure);
  assert.ok(failure.details.possibleCauses.includes('CORS / OPTIONS preflight'));
  assert.ok(failure.details.possibleCauses.includes('TLS certificate or hostname validation'));
});


test('classifies readyState 4 with status 0 as a network failure, not HTTP status', () => {
  const xhr = createMockRequest();
  let failure;
  const logs = [];
  const client = new WebDAVClient({ createRequest: () => xhr, parse: () => [], onLog: entry => logs.push(entry) });
  client.list('https://example.test/dav/', {}, { error: error => { failure = error; } });
  xhr.complete(0);
  assert.equal(failure.reason, 'network-cors-or-tls');
  assert.match(failure.message, /No HTTP response/);
  assert.ok(logs.some(entry => entry.event === 'XHR ERROR'));
});

test('runs a plain GET probe after PROPFIND network failure and classifies readable GET', () => {
  const main = createMockRequest();
  const probe = createMockRequest();
  const requests = [main, probe];
  const logs = [];
  let failure;
  const client = new WebDAVClient({
    createRequest: () => requests.shift(),
    parse: () => [],
    onLog: entry => logs.push(entry)
  });
  client.list('https://example.test/dav/', {}, { error: error => { failure = error; } });
  main.onerror();
  assert.equal(probe.method, 'GET');
  assert.equal(probe.headers.Authorization, undefined);
  assert.equal(probe.headers.Depth, undefined);
  probe.complete(401, 'Unauthorized');
  const result = logs.find(entry => entry.event === 'CORS GET PROBE RESULT');
  assert.equal(result.details.status, 401);
  assert.match(result.details.interpretation, /PROPFIND OPTIONS preflight/);
  assert.equal(failure.reason, 'network-cors-or-tls');
});
