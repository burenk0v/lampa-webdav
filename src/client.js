(function (root, factory) {
    'use strict';
    var api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LampaDLNAClient = api;
}(typeof window !== 'undefined' ? window : this, function (root) {
    'use strict';

    function escapeXml(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    function DLNAClient(options) {
        options = options || {};
        this.createRequest = options.createRequest || function () { return new XMLHttpRequest(); };
        this.parseDevice = options.parseDevice || function (xml, url) {
            return root.LampaDLNACore.parseDeviceDescription(xml, url);
        };
        this.parseBrowse = options.parseBrowse || function (xml, url) {
            return root.LampaDLNACore.parseBrowseResponse(xml, url);
        };
        this.onLog = typeof options.onLog === 'function' ? options.onLog : function () {};
        this.fetch = typeof options.fetch === 'function' ? options.fetch : (root && typeof root.fetch === 'function' ? function (url) { return root.fetch(url); } : null);
    }

    DLNAClient.prototype.list = function (address, port, objectId, callbacks) {
        callbacks = callbacks || {};
        var self = this;
        var completed = false;
        var active = null;
        var baseUrl;
        var service;

        function log(event, details) {
            try { self.onLog({time:new Date().toISOString(), event:event, details:details || {}}); } catch (ignore) {}
        }

        function preview(value, limit) {
            value = String(value == null ? '' : value);
            return value.length > limit ? value.slice(0, limit) + '\n...[обрезано, всего ' + value.length + ' символов]' : value;
        }

        function probeDescription(url) {
            if (!self.fetch) {
                log('FETCH GET НЕДОСТУПЕН', {url:url, reason:'fetch API не поддерживается браузером'});
                return;
            }
            var started = Date.now();
            log('FETCH GET СТАРТ', {method:'GET', url:url, headers:'без дополнительных заголовков'});
            try {
                self.fetch(url).then(function (response) {
                    var responseHeaders = {};
                    try {
                        if (response.headers && response.headers.forEach) {
                            response.headers.forEach(function (value, name) { responseHeaders[name] = value; });
                        }
                    } catch (ignoreHeaders) {}
                    log('FETCH GET ОТВЕТ', {
                        status:response.status,
                        ok:response.ok,
                        type:response.type || '',
                        durationMs:Date.now() - started,
                        headers:responseHeaders
                    });
                    return response.text().then(function (body) {
                        log('FETCH GET ТЕЛО', {length:body.length, preview:preview(body, 4000)});
                    });
                }).catch(function (error) {
                    log('FETCH GET ОШИБКА', {
                        name:error && error.name || '',
                        message:error && error.message || String(error),
                        durationMs:Date.now() - started,
                        note:'Браузер не дал прочитать ответ; возможна CORS-блокировка или сетевая ошибка.'
                    });
                });
            } catch (error) {
                log('FETCH GET ОШИБКА', {
                    name:error.name || '',
                    message:error.message || String(error),
                    durationMs:Date.now() - started
                });
            }
        }

        function fail(stage, message, status) {
            if (completed) return;
            completed = true;
            log('ОШИБКА', {stage:stage, message:message, status:status || 0});
            if (callbacks.error) callbacks.error({
                stage: stage,
                message: stage + ': ' + message,
                status: status || 0
            });
        }

        function request(stage, method, url, body, headers, done) {
            var xhr = self.createRequest();
            var started = Date.now();
            var seen = {};
            active = xhr;
            log('ПОДГОТОВКА ЗАПРОСА', {stage:stage, method:method, url:url, headers:headers || {}, body:body ? preview(body, 12000) : null});
            try {
                xhr.open(method, url, true);
                log('XHR OPEN', {stage:stage, method:method, url:url});
                xhr.timeout = 20000;
                Object.keys(headers || {}).forEach(function (name) {
                    xhr.setRequestHeader(name, headers[name]);
                    log('ЗАГОЛОВОК ЗАПРОСА', {stage:stage, name:name, value:headers[name]});
                });
                xhr.onreadystatechange = function () {
                    if (seen[xhr.readyState]) return;
                    seen[xhr.readyState] = true;
                    log('XHR READY STATE', {stage:stage, readyState:xhr.readyState, status:xhr.status || 0});
                    if (xhr.readyState !== 4 || completed) return;
                    var text = '', responseHeaders = '';
                    try { text = xhr.responseText || ''; } catch (ignoreText) {}
                    try { responseHeaders = xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : ''; } catch (ignoreHeaders) {}
                    log('HTTP ОТВЕТ', {stage:stage, status:xhr.status || 0, statusText:xhr.statusText || '', durationMs:Date.now()-started, responseHeaders:responseHeaders || '(недоступны или пусты)', responseText:preview(text,16000)});
                    if (xhr.status < 200 || xhr.status >= 300) { fail(stage, 'сервер вернул HTTP ' + xhr.status, xhr.status); return; }
                    try { log('ОБРАБОТКА ОТВЕТА', {stage:stage, responseLength:text.length}); done(text); }
                    catch (error) { log('ОШИБКА ОБРАБОТКИ', {stage:stage, name:error.name || '', message:error.message || String(error)}); fail(stage, error.message || 'не удалось обработать ответ'); }
                };
                xhr.onerror = function () {
                    log('XHR ERROR', {stage:stage, status:xhr.status || 0, durationMs:Date.now()-started, note:'Браузер не предоставил детали ошибки; возможны CORS, preflight или недоступность сервера.'});
                    fail(stage, 'браузер не смог прочитать ответ. Возможны CORS, блокировка HTTP/HTTPS или недоступность сервера.');
                };
                xhr.ontimeout = function () { log('XHR TIMEOUT', {stage:stage, timeoutMs:xhr.timeout, durationMs:Date.now()-started}); fail(stage, 'истекло время ожидания ответа'); };
                xhr.onabort = function () { log('XHR ABORT', {stage:stage}); if (!completed) fail(stage, 'запрос был прерван'); };
                log('XHR SEND', {stage:stage, bodyLength:body ? body.length : 0});
                xhr.send(body || null);
            } catch (error) {
                log('ИСКЛЮЧЕНИЕ XHR', {stage:stage, name:error.name || '', message:error.message || String(error)});
                fail(stage, error.message || 'не удалось отправить запрос');
            }
        }

        try {
            baseUrl = 'http://' + String(address).trim() + ':' + String(port).trim() + '/';
            log('СТАРТ DLNA', {pageUrl:root.location ? root.location.href : '', pageProtocol:root.location ? root.location.protocol : '', serverUrl:baseUrl, objectId:objectId || '0', userAgent:root.navigator ? root.navigator.userAgent : ''});
            probeDescription(baseUrl + 'rootDesc.xml');
            request('Загрузка rootDesc.xml', 'GET', baseUrl + 'rootDesc.xml', null, {}, function (description) {
                log('ROOT DESCRIPTION ПОЛУЧЕН', {length:description.length, xml:preview(description,16000)});
                service = self.parseDevice(description, baseUrl);
                log('CONTENT DIRECTORY НАЙДЕН', {serviceType:service.serviceType, controlUrl:service.controlUrl});
                var soap = '<?xml version="1.0" encoding="utf-8"?>' +
                    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
                    '<s:Body><u:Browse xmlns:u="' + service.serviceType + '">' +
                    '<ObjectID>' + escapeXml(objectId || '0') + '</ObjectID>' +
                    '<BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter>' +
                    '<StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount><SortCriteria></SortCriteria>' +
                    '</u:Browse></s:Body></s:Envelope>';
                log('SOAP ПОДГОТОВЛЕН', {action:service.serviceType + '#Browse', controlUrl:service.controlUrl, objectId:objectId || '0', xml:preview(soap,12000)});
                request('SOAP Browse', 'POST', service.controlUrl, soap, {
                    'Content-Type': 'text/xml; charset="utf-8"',
                    'SOAPAction': '"' + service.serviceType + '#Browse"'
                }, function (response) {
                    log('SOAP ОТВЕТ ПОЛУЧЕН', {length:response.length, xml:preview(response,16000)});
                    var result = self.parseBrowse(response, baseUrl);
                    log('DIDL РАЗОБРАН', {itemCount:result.items.length, numberReturned:result.numberReturned, items:result.items.map(function (item) { return {id:item.id,name:item.name,isDirectory:item.isDirectory,isVideo:item.isVideo,href:item.href,size:item.size}; })});
                    completed = true;
                    log('DLNA ЗАВЕРШЕНО', {itemCount:result.items.length});
                    if (callbacks.success) callbacks.success(result.items);
                });
            });
        } catch (error) {
            log('ОШИБКА ПОДГОТОВКИ', {name:error.name || '', message:error.message || String(error)});
            fail('Подготовка DLNA-запроса', error.message || 'не удалось начать запрос');
        }
        return {
            abort: function () {
                if (completed) return;
                completed = true;
                if (active && active.abort) active.abort();
            }
        };
    };

    return { DLNAClient: DLNAClient };
}));
