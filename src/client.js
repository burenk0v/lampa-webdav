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
        var started = Date.now();
        function log(event, details) {
            try { this.onLog({ time: new Date().toISOString(), event: event, details: details || {} }); } catch (ignore) {}
        }
        function fail(message, status, reason) {
            if (completed) return;
            completed = true;
            log.call(this, 'ОШИБКА', { message: message, status: status || 0, reason: reason || '' });
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
                log.call(self, 'CORS GET PROBE START', {
                    method: 'GET', url: url,
                    note: 'Пробный GET без Authorization и пользовательских заголовков. Он проверяет доступность простого cross-origin запроса, но не отправляет OPTIONS вручную.'
                });
                probe.open('GET', url, true);
                probe.timeout = 8000;
                var probeFinished = false;
                function finish(details) {
                    if (probeFinished) return;
                    probeFinished = true;
                    log.call(self, 'CORS GET PROBE RESULT', details);
                    fail.call(self, 'WebDAV request was blocked. See CORS GET PROBE RESULT to distinguish a general CORS block from a PROPFIND/preflight-specific block.', 0, 'network-cors-or-tls');
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
                log.call(self, 'CORS GET PROBE ERROR', { message: error.message || String(error) });
                fail.call(self, 'WebDAV request failed and the CORS GET probe could not start.', 0, 'network-cors-or-tls');
            }
        }

        var pageProtocol = typeof window !== 'undefined' && window.location ? window.location.protocol : '';
        log.call(this, 'СТАРТ WEBDAV', {
            pageProtocol: pageProtocol,
            requestProtocol: String(url).indexOf('https:') === 0 ? 'https:' : 'http:',
            url: url,
            method: 'PROPFIND',
            note: 'HTTP-страница → HTTPS WebDAV допустимо; HTTPS-страница → HTTP может блокироваться как mixed content.'
        });
        try {
            xhr.open('PROPFIND', url, true);
            log.call(this, 'XHR OPEN', { method: 'PROPFIND', url: url, durationMs: Date.now() - started });
            xhr.timeout = 20000;
            xhr.setRequestHeader('Depth', '1');
            xhr.setRequestHeader('Content-Type', 'application/xml; charset=utf-8');
            if (credentials && credentials.username) {
                xhr.setRequestHeader('Authorization', encodeCredentials(credentials.username, credentials.password));
            }
            xhr.onreadystatechange = function () {
                log.call(this, 'XHR READY STATE', { readyState: xhr.readyState, status: xhr.status || 0, durationMs: Date.now() - started });
                if (xhr.readyState !== 4 || completed) return;
                var responseHeaders = '';
                try { responseHeaders = xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : ''; } catch (ignore) {}
                log.call(this, 'HTTP ОТВЕТ', { status: xhr.status || 0, statusText: xhr.statusText || '', durationMs: Date.now() - started, headers: responseHeaders || '(unavailable)', bodyPreview: String(xhr.responseText || '').slice(0, 1500) });
                if (xhr.status === 0) {
                    log.call(this, 'XHR ERROR', { status: 0, readyState: xhr.readyState, durationMs: Date.now() - started, pageProtocol: pageProtocol, url: url, possibleCauses: ['CORS / OPTIONS preflight', 'TLS certificate or hostname validation', 'network/server unavailable'], note: 'Браузер не предоставил HTTP-статус; это не HTTP-ответ сервера.' });
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
                    log.call(this, 'WEBDAV ОТВЕТ РАЗОБРАН', { itemCount: items.length, durationMs: Date.now() - started });
                    if (callbacks.success) callbacks.success(items);
                } catch (error) {
                    fail.call(this, error.message || 'Could not parse WebDAV response', xhr.status, 'xml-parse');
                }
            }.bind(this);
            xhr.onerror = function () {
                log.call(this, 'XHR ERROR', { status: xhr.status || 0, readyState: xhr.readyState, durationMs: Date.now() - started, pageProtocol: pageProtocol, url: url, possibleCauses: ['CORS / OPTIONS preflight', 'TLS certificate or hostname validation', 'network/server unavailable'], note: 'При CORS/TLS-блокировке браузер может не раскрыть HTTP-статус и заголовки.' });
                runSimpleGetProbe();
            }.bind(this);
            xhr.ontimeout = function () {
                log.call(this, 'XHR TIMEOUT', { timeoutMs: xhr.timeout, durationMs: Date.now() - started });
                fail.call(this, 'WebDAV request timed out', 0, 'timeout');
            }.bind(this);
            log.call(this, 'ЗАГОЛОВКИ ЗАПРОСА', {
                Depth: '1', 'Content-Type': 'application/xml; charset=utf-8',
                Authorization: credentials && credentials.username ? '(configured; hidden)' : '(not configured)',
                note: 'PROPFIND и пользовательские заголовки могут вызвать CORS OPTIONS preflight.'
            });
            log.call(this, 'XHR SEND', { method: 'PROPFIND', url: url, bodyLength: BODY.length });
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
