(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LampaWebDAVCore = api;
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    var VIDEO_EXTENSIONS = /\.(avi|mkv|mp4|m4v|mov|wmv|mpg|mpeg|ts|m2ts|webm|ogv)$/i;

    function normalizeBaseUrl(value) {
        var url = new URL(String(value || '').trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('WebDAV URL must use HTTP or HTTPS');
        }
        if (url.username || url.password) {
            throw new Error('Put credentials in the username and password fields, not in the URL');
        }
        url.hash = '';
        url.search = '';
        if (!/\/$/.test(url.pathname)) url.pathname += '/';
        return url.toString();
    }

    function resolveHref(baseUrl, href) {
        var resolved = new URL(href, baseUrl);
        var base = new URL(baseUrl);
        if (resolved.origin !== base.origin) {
            throw new Error('WebDAV server returned a resource on another origin');
        }
        return resolved.toString();
    }

    function isVideo(href) {
        try {
            return VIDEO_EXTENSIONS.test(decodeURIComponent(new URL(href, 'http://localhost/').pathname));
        } catch (error) {
            return false;
        }
    }

    function parseMultistatus(xmlText, requestUrl) {
        if (typeof DOMParser === 'undefined') throw new Error('This browser does not support XML parsing');
        var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XML response from WebDAV server');
        var responses = doc.getElementsByTagNameNS('*', 'response');
        var items = [];
        var requested = new URL(requestUrl);
        for (var i = 0; i < responses.length; i++) {
            var response = responses[i];
            var hrefNode = response.getElementsByTagNameNS('*', 'href')[0];
            if (!hrefNode || !hrefNode.textContent) continue;
            var href = resolveHref(requestUrl, hrefNode.textContent.trim());
            if (href.replace(/\/$/, '') === requested.toString().replace(/\/$/, '')) continue;

            var propstats = response.getElementsByTagNameNS('*', 'propstat');
            var prop = null;
            for (var j = 0; j < propstats.length; j++) {
                var status = propstats[j].getElementsByTagNameNS('*', 'status')[0];
                if (status && /\s2\d\d\s/.test(status.textContent)) {
                    prop = propstats[j].getElementsByTagNameNS('*', 'prop')[0];
                    break;
                }
            }
            if (!prop) continue;
            var resourceTypes = prop.getElementsByTagNameNS('*', 'resourcetype')[0];
            var isDirectory = !!(resourceTypes && resourceTypes.getElementsByTagNameNS('*', 'collection').length);
            var displayName = prop.getElementsByTagNameNS('*', 'displayname')[0];
            var size = prop.getElementsByTagNameNS('*', 'getcontentlength')[0];
            var modified = prop.getElementsByTagNameNS('*', 'getlastmodified')[0];
            var name = displayName && displayName.textContent.trim();
            if (!name) {
                var path = new URL(href).pathname.replace(/\/$/, '');
                name = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1));
            }
            items.push({
                name: name,
                href: href,
                isDirectory: isDirectory,
                isVideo: !isDirectory && isVideo(href),
                size: size ? Number(size.textContent) : 0,
                modified: modified ? modified.textContent : ''
            });
        }
        items.sort(function (a, b) {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        return items;
    }

    function basicAuthorization(username, password) {
        if (typeof btoa !== 'function') throw new Error('Base64 encoding is unavailable');
        var value = unescape(encodeURIComponent(String(username || '') + ':' + String(password || '')));
        return 'Basic ' + btoa(value);
    }

    return {
        normalizeBaseUrl: normalizeBaseUrl,
        resolveHref: resolveHref,
        isVideo: isVideo,
        parseMultistatus: parseMultistatus,
        basicAuthorization: basicAuthorization
    };
}));

(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LampaWebDAVClient = api;
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    var BODY = '<?xml version="1.0" encoding="utf-8"?>' +
        '<d:propfind xmlns:d="DAV:"><d:prop>' +
        '<d:resourcetype/><d:displayname/><d:getcontentlength/><d:getlastmodified/>' +
        '</d:prop></d:propfind>';

    function encodeCredentials(username, password) {
        var value = String(username || '') + ':' + String(password || '');
        var binary = unescape(encodeURIComponent(value));
        if (typeof btoa === 'function') return 'Basic ' + btoa(binary);
        if (typeof Buffer !== 'undefined') return 'Basic ' + Buffer.from(value, 'utf8').toString('base64');
        throw new Error('Base64 encoding is unavailable');
    }

    function WebDAVClient(options) {
        options = options || {};
        this.createRequest = options.createRequest || function () {
            return new XMLHttpRequest();
        };
        this.parse = options.parse || function (xml, url) {
            if (!root.LampaWebDAVCore) throw new Error('WebDAV parser is not loaded');
            return root.LampaWebDAVCore.parseMultistatus(xml, url);
        };
    }

    WebDAVClient.prototype.list = function (url, credentials, callbacks) {
        callbacks = callbacks || {};
        var xhr = this.createRequest();
        var completed = false;

        function fail(message, status) {
            if (completed) return;
            completed = true;
            if (callbacks.error) callbacks.error({ message: message, status: status || 0 });
        }

        try {
            xhr.open('PROPFIND', url, true);
            xhr.timeout = 20000;
            xhr.setRequestHeader('Depth', '1');
            xhr.setRequestHeader('Content-Type', 'application/xml; charset=utf-8');
            if (credentials && credentials.username) {
                xhr.setRequestHeader('Authorization', encodeCredentials(credentials.username, credentials.password));
            }
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4 || completed) return;
                if (xhr.status !== 207) {
                    fail(xhr.status ? 'WebDAV server returned HTTP ' + xhr.status : 'WebDAV request failed. Check CORS, TLS certificate and network access.', xhr.status);
                    return;
                }
                try {
                    var items = this.parse(xhr.responseText, url);
                    completed = true;
                    if (callbacks.success) callbacks.success(items);
                } catch (error) {
                    fail(error.message || 'Could not parse WebDAV response', xhr.status);
                }
            }.bind(this);
            xhr.onerror = function () {
                fail('Network error. The TV browser may have blocked the WebDAV request because of CORS or TLS.');
            };
            xhr.ontimeout = function () {
                fail('WebDAV request timed out');
            };
            xhr.send(BODY);
        } catch (error) {
            fail(error.message || 'Could not start WebDAV request');
        }
        return {
            abort: function () {
                if (!completed && xhr.abort) xhr.abort();
                completed = true;
            }
        };
    };

    return { WebDAVClient: WebDAVClient, propfindBody: BODY };
}));

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('built plugin registers settings, browser component and menu entry', () => {
  const registered = { settings: [], params: [], components: {}, menuItems: 0 };
  const menu = {
    length: 1,
    append() { registered.menuItems++; },
    eq() { return this; }
  };
  function jquery() {
    return {
      length: 1,
      eq() { return this; },
      append() { registered.menuItems++; return this; },
      on() { return this; },
      text() { return this; },
      empty() { return this; },
      remove() { return this; }
    };
  }
  const lampa = {
    Storage: { field() { return ''; } },
    SettingsApi: {
      addComponent(value) { registered.settings.push(value); },
      addParam(value) { registered.params.push(value); }
    },
    Component: {
      get(name) { return registered.components[name]; },
      add(name, component) { registered.components[name] = component; }
    },
    Activity: { push() {} },
    Listener: { follow() {} }
  };
  const context = {
    console,
    URL,
    window: null,
    Lampa: lampa,
    jQuery: jquery,
    $: jquery,
    appready: true
  };
  context.window = context;
  context.Lampa = lampa;
  context.LampaWebDAVCore = { normalizeBaseUrl: value => value, resolveHref: (base, value) => value };
  context.LampaWebDAVClient = { WebDAVClient: function () {} };
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  assert.equal(registered.settings.length, 1);
  assert.equal(registered.params.length, 3);
  assert.equal(typeof registered.components.lampa_webdav_browser, 'function');
  assert.equal(registered.menuItems, 1);
});

test('built plugin is guarded against duplicate initialization', () => {
  let settingsCalls = 0;
  const lampa = {
    Storage: { field() { return ''; } },
    SettingsApi: {
      addComponent() { settingsCalls++; },
      addParam() {}
    },
    Component: { get() { return true; }, add() {} },
    Listener: { follow() {} }
  };
  const jquery = function () {
    return { length: 1, eq() { return this; }, append() { return this; }, on() { return this; } };
  };
  const context = { URL, window: null, Lampa: lampa, $: jquery, jQuery: jquery, appready: true };
  context.window = context;
  context.Lampa = lampa;
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  assert.equal(settingsCalls, 1);
});
