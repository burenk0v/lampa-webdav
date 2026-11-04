const test = require('node:test');
const assert = require('node:assert/strict');
const { DLNAClient } = require('../src/client.js');

function createMockRequest() {
  return {
    headers: {}, readyState: 0, status: 0, responseText: '',
    open(method, url, async) { this.method = method; this.url = url; this.async = async; },
    setRequestHeader(name, value) { this.headers[name] = value; },
    send(body) { this.body = body; },
    abort() { this.aborted = true; },
    complete(status, responseText) {
      this.status = status; this.responseText = responseText || '';
      this.readyState = 4; this.onreadystatechange();
    }
  };
}

test('discovers ContentDirectory then sends a SOAP Browse request', () => {
  const requests = [];
  const client = new DLNAClient({
    createRequest() { const xhr = createMockRequest(); requests.push(xhr); return xhr; },
    parseDevice() { return { controlUrl: 'http://192.168.1.1:8200/ctl/ContentDir', serviceType: 'urn:schemas-upnp-org:service:ContentDirectory:1' }; },
    parseBrowse() { return { items: [{ name: 'Film.mkv', isVideo: true }] }; }
  });
  let received;
  client.list('192.168.1.1', '8200', '0', { success(items) { received = items; } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].url, 'http://192.168.1.1:8200/rootDesc.xml');
  requests[0].complete(200, '<root/>');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].url, 'http://192.168.1.1:8200/ctl/ContentDir');
  assert.match(requests[1].headers.SOAPAction, /#Browse/);
  assert.match(requests[1].body, /<ObjectID>0<\/ObjectID>/);
  requests[1].complete(200, '<Envelope/>');
  assert.equal(received[0].name, 'Film.mkv');
});

test('reports HTTP failures once', () => {
  const xhr = createMockRequest();
  const client = new DLNAClient({ createRequest: () => xhr });
  let failure;
  client.list('192.168.1.1', 8200, '0', { error(error) { failure = error; } });
  xhr.complete(403);
  assert.equal(failure.status, 403);
  assert.match(failure.message, /HTTP 403/);
});

test('aborts an in-flight discovery request', () => {
  const xhr = createMockRequest();
  const client = new DLNAClient({ createRequest: () => xhr });
  const request = client.list('192.168.1.1', 8200, '0', {});
  request.abort();
  assert.equal(xhr.aborted, true);
});
