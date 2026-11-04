(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LampaDLNACore = api;
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    var VIDEO_EXTENSIONS = /\.(avi|mkv|mp4|m4v|mov|wmv|mpg|mpeg|ts|m2ts|webm|ogv)$/i;
    var SERVICE_TYPE = 'urn:schemas-upnp-org:service:ContentDirectory:1';

    function normalizeAddress(value) {
        var address = String(value || '').trim();
        if (!address) throw new Error('Укажите адрес DLNA-сервера');
        if (/^https?:\/\//i.test(address)) {
            var parsed = new URL(address);
            if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
                throw new Error('Укажите только IP-адрес или имя хоста без протокола и пути');
            }
            address = parsed.hostname;
        }
        if (/[/\s?#@]/.test(address)) throw new Error('Некорректный адрес DLNA-сервера');
        return address;
    }

    function normalizePort(value) {
        var port = Number(value);
        if (!isFinite(port) || Math.floor(port) !== port || port < 1 || port > 65535) {
            throw new Error('Порт должен быть числом от 1 до 65535');
        }
        return port;
    }

    function serverUrl(address, port) {
        return 'http://' + normalizeAddress(address) + ':' + normalizePort(port) + '/';
    }

    function resolveUrl(base, value) {
        return new URL(value, base).toString();
    }

    function isVideo(value) {
        try {
            return VIDEO_EXTENSIONS.test(decodeURIComponent(new URL(value, 'http://localhost/').pathname));
        } catch (error) {
            return false;
        }
    }

    function textOf(parent, name) {
        var nodes = parent.getElementsByTagNameNS('*', name);
        return nodes.length ? nodes[0].textContent : '';
    }

    function parseDeviceDescription(xmlText, baseUrl) {
        if (typeof DOMParser === 'undefined') throw new Error('XML parsing is not supported by this browser');
        var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('Некорректное описание DLNA-сервера');
        var services = doc.getElementsByTagNameNS('*', 'service');
        for (var i = 0; i < services.length; i++) {
            var type = textOf(services[i], 'serviceType');
            if (type.indexOf('ContentDirectory') !== -1) {
                var control = textOf(services[i], 'controlURL');
                if (!control) break;
                return {
                    controlUrl: resolveUrl(baseUrl, control),
                    serviceType: type || SERVICE_TYPE
                };
            }
        }
        throw new Error('DLNA-сервер не объявляет службу ContentDirectory');
    }

    function parseBrowseResponse(xmlText, baseUrl) {
        if (typeof DOMParser === 'undefined') throw new Error('XML parsing is not supported by this browser');
        var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('Некорректный ответ DLNA-сервера');
        var result = textOf(doc, 'Result');
        var numberReturned = Number(textOf(doc, 'NumberReturned') || 0);
        if (!result) {
            var fault = textOf(doc, 'faultstring') || textOf(doc, 'errorDescription');
            throw new Error(fault || 'DLNA-сервер вернул пустой результат');
        }
        var didl = new DOMParser().parseFromString(result, 'application/xml');
        if (didl.getElementsByTagName('parsererror').length) throw new Error('Некорректный DIDL-Lite ответ');
        var entries = [];
        var containers = didl.getElementsByTagNameNS('*', 'container');
        var media = didl.getElementsByTagNameNS('*', 'item');
        function add(node, isDirectory) {
            var title = textOf(node, 'title') || 'Без названия';
            var id = node.getAttribute('id') || '';
            var parentId = node.getAttribute('parentID') || '0';
            var resources = node.getElementsByTagNameNS('*', 'res');
            var resource = resources.length ? resources[0].textContent.trim() : '';
            var href = resource ? resolveUrl(baseUrl, resource) : '';
            var classes = textOf(node, 'class');
            entries.push({
                id: id,
                parentId: parentId,
                name: title,
                href: href,
                isDirectory: isDirectory,
                isVideo: !isDirectory && (!!resource && (isVideo(href) || /video/i.test(classes))),
                size: resources.length ? Number(resources[0].getAttribute('size') || 0) : 0
            });
        }
        for (var i = 0; i < containers.length; i++) add(containers[i], true);
        for (var j = 0; j < media.length; j++) add(media[j], false);
        entries.sort(function (a, b) {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        return { items: entries, numberReturned: numberReturned };
    }

    function escapeXml(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    return {
        normalizeAddress: normalizeAddress,
        normalizePort: normalizePort,
        serverUrl: serverUrl,
        resolveUrl: resolveUrl,
        isVideo: isVideo,
        parseDeviceDescription: parseDeviceDescription,
        parseBrowseResponse: parseBrowseResponse,
        escapeXml: escapeXml,
        serviceType: SERVICE_TYPE
    };
}));

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
        this.fetchTimeoutMs = options.fetchTimeoutMs || 8000;
        this.setTimeout = options.setTimeout || (root && typeof root.setTimeout === 'function' ? function (callback, delay) { return root.setTimeout(callback, delay); } : setTimeout);
        this.clearTimeout = options.clearTimeout || (root && typeof root.clearTimeout === 'function' ? function (timer) { return root.clearTimeout(timer); } : clearTimeout);
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
            var settled = false;
            var timer = null;
            function clearProbeTimer() {
                if (timer !== null) {
                    self.clearTimeout(timer);
                    timer = null;
                }
            }
            log('FETCH GET СТАРТ', {method:'GET', url:url, headers:'без дополнительных заголовков', timeoutMs:self.fetchTimeoutMs});
            timer = self.setTimeout(function () {
                if (settled) return;
                settled = true;
                log('FETCH GET ТАЙМ-АУТ', {
                    url:url,
                    timeoutMs:self.fetchTimeoutMs,
                    durationMs:Date.now() - started,
                    note:'Fetch не завершился за отведённое время; это не доказывает CORS-блокировку.'
                });
            }, self.fetchTimeoutMs);
            try {
                self.fetch(url).then(function (response) {
                    if (settled) return;
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
                        corsReadSucceeded:true,
                        headers:responseHeaders,
                        headersNote:'Показаны только доступные JavaScript заголовки; Access-Control-Allow-Origin может быть скрыт браузером.'
                    });
                    return response.text().then(function (body) {
                        if (settled) return;
                        settled = true;
                        clearProbeTimer();
                        log('FETCH GET ТЕЛО', {length:body.length, preview:preview(body, 4000)});
                    });
                }).catch(function (error) {
                    if (settled) return;
                    settled = true;
                    clearProbeTimer();
                    log('FETCH GET ОШИБКА', {
                        name:error && error.name || '',
                        message:error && error.message || String(error),
                        durationMs:Date.now() - started,
                        note:'Браузер не дал прочитать ответ; возможна CORS-блокировка или сетевая ошибка.'
                    });
                });
            } catch (error) {
                if (!settled) {
                    settled = true;
                    clearProbeTimer();
                    log('FETCH GET ОШИБКА', {
                        name:error.name || '',
                        message:error.message || String(error),
                        durationMs:Date.now() - started
                    });
                }
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
                    log('XHR ERROR', {stage:stage, method:method, url:url, status:xhr.status || 0, durationMs:Date.now()-started, preflightLikely:method === 'POST', note:method === 'POST' ? 'Для SOAP POST браузер может выполнять скрытый CORS OPTIONS preflight из-за Content-Type и SOAPAction; JavaScript не может прочитать его ответ напрямую.' : 'Браузер не предоставил детали ошибки; возможны CORS или недоступность сервера.'});
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
                log('CORS PREFLIGHT ОЖИДАЕТСЯ', {method:'OPTIONS', targetMethod:'POST', controlUrl:service.controlUrl, requestHeaders:['Content-Type: text/xml; charset="utf-8"','SOAPAction'], note:'OPTIONS отправляет браузер автоматически перед SOAP POST. Страница не может напрямую прочитать preflight-ответ; при ошибке POST смотрите XHR ERROR и preflightLikely.'});
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

(function (window, factory) {
    'use strict';
    factory(window, window.jQuery || window.$);
}(typeof window !== 'undefined' ? window : this, function (window, $) {
    'use strict';

    var COMPONENT_ID = 'lampa_dlna_browser';
    var KEYS = { address: 'lampa_dlna_address', port: 'lampa_dlna_port' };

    function setting(name) {
        return window.Lampa.Storage.field(name) || '';
    }

    function notify(message) {
        if (window.Lampa.Noty && window.Lampa.Noty.show) {
            window.Lampa.Noty.show(message);
        }
    }

    function BrowserComponent(object) {
        object = object || {};
        var self = this;
        var root = $('<div class="lampa-dlna"></div>');
        var request = null;
        var destroyed = false;
        var currentId = object.dlnaObjectId || '0';
        var history = object.dlnaHistory || [];
        var debugEntries = [];
        var debugView = null;

        function formatLog(entry) {
            var details;
            try { details = JSON.stringify(entry.details || {}); } catch (error) { details = String(entry.details || ''); }
            return entry.time + ' [' + entry.event + '] ' + details;
        }

        function renderDebug() {
            if (!debugView) {
                root.append($('<div class="lampa-dlna__message"></div>').text('Диагностический журнал DLNA (последние 120 событий)'));
                debugView = $('<pre class="lampa-dlna__debug"></pre>');
                root.append(debugView);
            }
            debugView.text(debugEntries.map(formatLog).join('\n'));
        }

        function logEntry(entry) {
            debugEntries.push(entry);
            if (debugEntries.length > 120) debugEntries.shift();
            renderDebug();
        }

        function message(text) {
            root.append($('<div class="lampa-dlna__message"></div>').text(text));
        }

        function renderSettings() {
            root.append($('<div class="lampa-dlna__message"></div>').text('Параметры подключения находятся в Настройки → DLNA'));

            var connect = $('<div class="selector lampa-dlna__item"></div>');
            connect.append($('<div class="lampa-dlna__name"></div>').text('Открыть каталог / обновить'));
            connect.on('hover:enter', function () {
                try {
                    window.LampaDLNACore.normalizeAddress(setting(KEYS.address));
                    window.LampaDLNACore.normalizePort(setting(KEYS.port));
                    currentId = '0';
                    history = [];
                    load();
                } catch (error) {
                    notify('Укажите адрес и порт DLNA в настройках Lampa');
                }
            });
            root.append(connect);
            debugView = null;
            renderDebug();
        }

        function openFolder(objectId, title, nextHistory) {
            window.Lampa.Activity.push({
                url: '',
                title: title,
                component: COMPONENT_ID,
                page: 1,
                dlnaObjectId: objectId,
                dlnaHistory: nextHistory || []
            });
        }

        function playFile(item) {
                        if (!window.Lampa.Player || typeof window.Lampa.Player.play !== 'function') {
                notify('В этой версии Lampa не найден встроенный плеер');
                return;
            }
            logEntry({time:new Date().toISOString(), event:'ЗАПУСК ПЛЕЕРА', details:{url:item.href,title:item.name}});
            window.Lampa.Player.play({
                url: item.href,
                title: item.name
            });
        }

        function addItem(item) {
            var row = $('<div class="selector lampa-dlna__item"></div>');
            var label = $('<div class="lampa-dlna__name"></div>').text(item.name);
            var meta = $('<div class="lampa-dlna__meta"></div>').text(item.isDirectory ? 'Папка' : 'Видео');
            row.append(label).append(meta);
            row.on('hover:enter', function () {
                if (item.isDirectory) openFolder(item.id, item.name, history.concat([currentId]));
                else playFile(item);
            });
            root.append(row);
        }

        function load() {
            if (!setting(KEYS.address) || !setting(KEYS.port)) {
                root.empty();
                renderSettings();
                message('Укажите адрес DLNA-сервера и порт, затем выберите «Открыть каталог»');
                return;
            }
            if (request && request.abort) request.abort();
            if (self.activity && self.activity.loader) self.activity.loader(true);
            request = new window.LampaDLNAClient.DLNAClient({ onLog: logEntry }).list(
                setting(KEYS.address),
                setting(KEYS.port),
                currentId,
                {
                    success: function (items) {
                        if (destroyed) return;
                        if (self.activity && self.activity.loader) self.activity.loader(false);
                        root.empty();
                        debugView = null;
                        renderSettings();
                        var up = history.length ? history[history.length - 1] : '';
                        if (up) {
                            var back = $('<div class="selector lampa-dlna__item"></div>');
                            back.append($('<div class="lampa-dlna__name"></div>').text('..  Вверх'));
                            back.on('hover:enter', function () {
                                openFolder(up, 'DLNA', history.slice(0, -1));
                            });
                            root.append(back);
                        }
                        var visible = items.filter(function (item) {
                            return item.isDirectory || item.isVideo;
                        });
                        if (!visible.length) message('В этой папке нет видеофайлов');
                        visible.forEach(addItem);
                    },
                    error: function (error) {
                        if (destroyed) return;
                        if (self.activity && self.activity.loader) self.activity.loader(false);
                        root.empty();
                        debugView = null;
                        renderSettings();
                        message(error.message || 'Не удалось открыть DLNA каталог');
                        if (!error.status) {
                            var pageProtocol = window.location && window.location.protocol ? window.location.protocol : 'не определён';
                            var serverAddress = window.LampaDLNACore.serverUrl(setting(KEYS.address), setting(KEYS.port));
                            message('Диагностика: страница Lampa открыта по ' + pageProtocol);
                            message('Адрес DLNA: ' + serverAddress);
                            message('HTTP 0: подробности доступны в журнале ниже.');
                        }
                        notify(error.message || 'Ошибка DLNA');
                    }
                }
            );
        }

        this.create = function () {
            if (!window.LampaDLNACore || !window.LampaDLNAClient) {
                message('DLNA-модули не загружены');
                return this.render();
            }
            renderSettings();
            try {
                window.LampaDLNACore.normalizeAddress(setting(KEYS.address));
                window.LampaDLNACore.normalizePort(setting(KEYS.port));
                load();
            } catch (error) {
                message('Укажите корректный адрес DLNA-сервера и порт');
            }
            return this.render();
        };

        this.render = function () {
            return root;
        };

        this.start = function () {
            var controller = window.Lampa.Controller;
            if (!controller || typeof controller.add !== 'function') return;

            controller.add('content', {
                toggle: function () {
                    if (typeof controller.collectionSet === 'function') {
                        controller.collectionSet(root);
                    }
                    if (typeof controller.collectionFocus === 'function') {
                        controller.collectionFocus(false, root);
                    }
                },
                left: function () {
                    if (typeof controller.toggle === 'function') controller.toggle('menu');
                },
                right: function () {
                    var navigator = window.Lampa.Navigator || window.Navigator;
                    if (navigator && typeof navigator.move === 'function') navigator.move('right');
                },
                up: function () {
                    var navigator = window.Lampa.Navigator || window.Navigator;
                    if (navigator && typeof navigator.move === 'function') navigator.move('up');
                },
                down: function () {
                    var navigator = window.Lampa.Navigator || window.Navigator;
                    if (navigator && typeof navigator.move === 'function') navigator.move('down');
                },
                back: function () {
                    if (window.Lampa.Activity && typeof window.Lampa.Activity.backward === 'function') {
                        window.Lampa.Activity.backward();
                    }
                }
            });

            if (typeof controller.toggle === 'function') controller.toggle('content');
        };

        this.pause = function () {};

        this.stop = function () {};

        this.destroy = function () {
            destroyed = true;
            if (request && request.abort) request.abort();
            root.remove();
        };
    }

    function registerMenu() {
        if (!$ || !window.Lampa.Component) return;
        if (!window.Lampa.Component.get(COMPONENT_ID)) {
            window.Lampa.Component.add(COMPONENT_ID, BrowserComponent);
        }
        var menu = $('.menu .menu__list').eq(0);
        if (!menu.length) return;
        var item = $('<li class="menu__item selector"><div class="menu__text">DLNA</div></li>');
        item.on('hover:enter', function () {
            window.Lampa.Activity.push({
                url: '',
                title: 'DLNA',
                component: COMPONENT_ID,
                page: 1
            });
        });
        menu.append(item);
    }

    function registerSettings() {
        var api = window.Lampa.SettingsApi;
        if (!api || typeof api.addComponent !== 'function' || typeof api.addParam !== 'function') {
            notify('Эта сборка Lampa не поддерживает SettingsApi для DLNA');
            return;
        }

        api.addComponent({
            component: 'lampa_dlna',
            name: 'DLNA',
            icon: '<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M5 8h34v5H5zm0 11h34v5H5zm0 11h34v5H5z"/></svg>'
        });

        [
            { name: KEYS.address, label: 'Адрес DLNA-сервера', placeholder: '192.168.1.1' },
            { name: KEYS.port, label: 'Порт DLNA', placeholder: '8200' }
        ].forEach(function (item) {
            api.addParam({
                component: 'lampa_dlna',
                param: {
                    name: item.name,
                    type: 'input',
                    values: '',
                    placeholder: item.placeholder,
                    default: item.name === KEYS.port ? '8200' : ''
                },
                field: { name: item.label }
            });
        });
    }

    function init() {
        if (window.plugin_lampa_dlna_ready) return;
        window.plugin_lampa_dlna_ready = true;
        registerSettings();
        registerMenu();
    }

    if (window.appready) init();
    else if (window.Lampa && window.Lampa.Listener) {
        window.Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    }
}));
