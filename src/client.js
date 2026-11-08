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
        this.onLog = typeof options.onLog === 'function' ? options.onLog : function () {}; 
        this.parse = options.parse || function (xml, url) {
            if (!root.LampaWebDAVCore) throw new Error('WebDAV parser is not loaded');
            return root.LampaWebDAVCore.parseMultistatus(xml, url);
        };
    }

    WebDAVClient.prototype.list = function (url, credentials, callbacks) {
        callbacks = callbacks || {};
        var xhr = this.createRequest();
        var completed = false;
        function log(event, details) {
            try { this.onLog({ time: new Date().toISOString(), event: event, details: details || {} }); } catch (ignore) {}
        }
        function fail(message, status, reason) {
            if (completed) return;
            completed = true;
            if (callbacks.error) callbacks.error({ message: message, status: status || 0, reason: reason || '', requestUrl: url, pageProtocol: (typeof window !== 'undefined' && window.location ? window.location.protocol : '') });
        }

        var corsProbeStarted = false;
        var self = this;
        function runSimpleGetProbe() {
            if (corsProbeStarted || completed) return;
            corsProbeStarted = true;
            var probe;
            try {
                probe = self.createRequest();
                probe.open('GET', url, true);
                probe.timeout = 8000;
                var probeFinished = false;
                function finish(details) {
                    if (probeFinished) return;
                    probeFinished = true;
                    log.call(self, 'CORS GET PROBE RESULT', details);
                    fail.call(self, 'WebDAV request was blocked. See CORS GET probe result to distinguish a general CORS block from a PROPFIND/preflight-specific block.', 0, 'network-cors-or-tls');
                }
                probe.onreadystatechange = function () {
                    if (probe.readyState !== 4 || probeFinished) return;
                    var headers = '';
                    try { headers = probe.getAllResponseHeaders ? probe.getAllResponseHeaders() : ''; } catch (ignore) {}
                    finish({
                        status: probe.status || 0,
                        statusText: probe.statusText || '',
                        headers: headers || '(unavailable)',
                        bodyPreview: String(probe.responseText || '').slice(0, 500),
                        interpretation: probe.status
                            ? 'Simple GET response is readable by Lampa; investigate PROPFIND OPTIONS preflight, allowed methods and allowed headers.'
                            : 'Simple GET is also blocked or has no HTTP response; investigate CORS for GET, TLS and network.'
                    });
                };
                probe.onerror = function () {
                    finish({ status: probe.status || 0, error: 'GET probe network/CORS error', interpretation: 'Simple GET is also blocked or has no HTTP response; investigate CORS for GET, TLS and network.' });
                };
                probe.ontimeout = function () {
                    finish({ status: probe.status || 0, error: 'GET probe timeout', interpretation: 'Probe timed out; check network/server reachability.' });
                };
                probe.send(null);
            } catch (error) {
                log.call(self, 'CORS GET PROBE RESULT', { status: 0, error: error.message || String(error), interpretation: 'The simple GET probe could not start; check browser support and network access.' });
                fail.call(self, 'WebDAV request failed and the CORS GET probe could not start.', 0, 'network-cors-or-tls');
            }
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
                if (xhr.status === 0) {
                    runSimpleGetProbe();
                    return;
                }
                if (xhr.status !== 207) {
                    fail.call(this, 'WebDAV server returned HTTP ' + xhr.status, xhr.status, 'http-status');
                    return;
                }
                try {
                    var items = this.parse(xhr.responseText, url);
                    completed = true;
                    if (callbacks.success) callbacks.success(items);
                } catch (error) {
                    fail.call(this, error.message || 'Could not parse WebDAV response', xhr.status, 'xml-parse');
                }
            }.bind(this);
            xhr.onerror = function () {
                runSimpleGetProbe();
            }.bind(this);
            xhr.ontimeout = function () {
                fail.call(this, 'WebDAV request timed out', 0, 'timeout');
            }.bind(this);
            xhr.send(BODY);
        } catch (error) {
            fail.call(this, error.message || 'Could not start WebDAV request', 0, 'exception');
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
