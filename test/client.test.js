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
  assert.match(failure.message, /CORS or TLS/);
});

test('allows an in-flight request to be aborted', () => {
  const xhr = createMockRequest();
  const client = new WebDAVClient({ createRequest: () => xhr, parse: () => [] });
  const request = client.list('https://example.test/dav/', {}, {});
  request.abort();
  assert.equal(xhr.aborted, true);
});
