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
