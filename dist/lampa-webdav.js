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
                    fail.call(this, 'No HTTP response. Check CORS/OPTIONS, TLS certificate and network access.', 0, 'network-cors-or-tls');
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
                fail.call(this, 'Network error. Check CORS/OPTIONS, TLS certificate and network access.', 0, 'network-cors-or-tls');
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

(function (window, factory) {
    'use strict';
    factory(window, window.jQuery || window.$);
}(typeof window !== 'undefined' ? window : this, function (window, $) {
    'use strict';

    var COMPONENT_ID = 'lampa_webdav_browser';
    var KEYS = {
        url: 'lampa_webdav_url',
        username: 'lampa_webdav_username',
        password: 'lampa_webdav_password'
    };

    function setting(name) {
        return window.Lampa.Storage.field(name) || '';
    }

    function credentials() {
        return {
            username: setting(KEYS.username),
            password: setting(KEYS.password)
        };
    }

    function notify(message) {
        if (window.Lampa.Noty && window.Lampa.Noty.show) {
            window.Lampa.Noty.show(message);
        }
    }

    function parentUrl(currentUrl, rootUrl) {
        var current = new URL(currentUrl);
        var root = new URL(rootUrl);
        var path = current.pathname.replace(/\/$/, '');
        var rootPath = root.pathname.replace(/\/$/, '');
        if (current.origin !== root.origin || path === rootPath || path.length <= rootPath.length) return '';
        var slash = path.lastIndexOf('/');
        var parentPath = path.substring(0, slash + 1);
        if (parentPath.length < root.pathname.length) return root.toString();
        current.pathname = parentPath;
        current.search = '';
        current.hash = '';
        return current.toString();
    }

    function BrowserComponent(object) {
        object = object || {};
        var self = this;
        var root = $('<div class="lampa-webdav"></div>');
        var request = null;
        var destroyed = false;
        var baseUrl = '';
        var currentUrl = object.webdavUrl || '';
        var diagnosticLines = [];

        function message(text) {
            root.append($('<div class="lampa-webdav__message"></div>').text(text));
        }

        function diagnostic(entry) {
            var line = entry.time + ' | ' + entry.event + ' | ' + JSON.stringify(entry.details || {});
            diagnosticLines.push(line);
            if (diagnosticLines.length > 40) diagnosticLines.shift();
        }

        function renderDiagnostics() {
            var box = $('<div class="lampa-webdav__message lampa-webdav__diagnostics"></div>');
            box.text(diagnosticLines.length ? diagnosticLines.join('\n') : 'Диагностика появится после подключения.');
            root.append(box);
        }

        function renderSettings() {
            root.append($('<div class="lampa-webdav__message"></div>').text('Параметры подключения находятся в Настройки → WebDAV'));

            var connect = $('<div class="selector lampa-webdav__item"></div>');
            connect.append($('<div class="lampa-webdav__name"></div>').text('Открыть каталог / обновить'));
            connect.on('hover:enter', function () {
                try {
                    baseUrl = window.LampaWebDAVCore.normalizeBaseUrl(setting(KEYS.url));
                    currentUrl = baseUrl;
                    load();
                } catch (error) {
                    notify('Укажите адрес WebDAV в настройках Lampa');
                }
            });
            root.append(connect);
        }

        function openFolder(url, title) {
            window.Lampa.Activity.push({
                url: '',
                title: title,
                component: COMPONENT_ID,
                page: 1,
                webdavUrl: url
            });
        }

        function playFile(item) {
            var auth = credentials();
            if (auth.username) {
                notify('Для воспроизведения защищённого WebDAV пока нужна публичная ссылка или доступ без авторизации. Список файлов авторизуется отдельно.');
                return;
            }
            if (!window.Lampa.Player || typeof window.Lampa.Player.play !== 'function') {
                notify('В этой версии Lampa не найден встроенный плеер');
                return;
            }
            window.Lampa.Player.play({
                url: item.href,
                title: item.name
            });
        }

        function addItem(item) {
            var row = $('<div class="selector lampa-webdav__item"></div>');
            var label = $('<div class="lampa-webdav__name"></div>').text(item.name);
            var meta = $('<div class="lampa-webdav__meta"></div>').text(item.isDirectory ? 'Папка' : 'Видео');
            row.append(label).append(meta);
            row.on('hover:enter', function () {
                if (item.isDirectory) openFolder(item.href, item.name);
                else playFile(item);
            });
            root.append(row);
        }

        function load() {
            var auth = credentials();
            if (!currentUrl) {
                root.empty();
                renderSettings();
                message('Укажите адрес WebDAV и выберите «Открыть каталог»');
                return;
            }
            if (request && request.abort) request.abort();
            if (self.activity && self.activity.loader) self.activity.loader(true);
            diagnosticLines = [];
            request = new window.LampaWebDAVClient.WebDAVClient({ onLog: diagnostic }).list(
                currentUrl,
                auth,
                {
                    success: function (items) {
                        if (destroyed) return;
                        if (self.activity && self.activity.loader) self.activity.loader(false);
                        root.empty();
                        renderSettings();
                        var up = parentUrl(currentUrl, baseUrl);
                        if (up) {
                            var back = $('<div class="selector lampa-webdav__item"></div>');
                            back.append($('<div class="lampa-webdav__name"></div>').text('..  Вверх'));
                            back.on('hover:enter', function () {
                                openFolder(up, 'WebDAV');
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
                        renderSettings();
                        message(error.message || 'Не удалось открыть WebDAV каталог');
                        if (error.status === 401) message('HTTP 401: проверьте логин и пароль.');
                        else if (error.status === 403) message('HTTP 403: сервер запретил доступ. Проверим права, путь и правила reverse proxy.');
                        else if (!error.status) message('Нет доступного HTTP-ответа: возможны CORS/OPTIONS, TLS-сертификат или сетевая ошибка.');
                        if (error.requestUrl && error.pageProtocol) {
                            message('Страница: ' + error.pageProtocol + ' | WebDAV: ' + (error.requestUrl.indexOf('https:') === 0 ? 'HTTPS' : 'HTTP'));
                        }
                        renderDiagnostics();
                        notify(error.message || 'Ошибка WebDAV');
                    }
                }
            );
        }

        this.create = function () {
            if (!window.LampaWebDAVCore || !window.LampaWebDAVClient) {
                message('WebDAV-модули не загружены');
                return this.render();
            }
            renderSettings();
            try {
                baseUrl = window.LampaWebDAVCore.normalizeBaseUrl(setting(KEYS.url));
                currentUrl = currentUrl || baseUrl;
                currentUrl = window.LampaWebDAVCore.resolveHref(baseUrl, currentUrl);
                load();
            } catch (error) {
                message('Укажите корректный адрес WebDAV выше');
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
        var item = $('<li class="menu__item selector"><div class="menu__text">WebDAV</div></li>');
        item.on('hover:enter', function () {
            window.Lampa.Activity.push({
                url: '',
                title: 'WebDAV',
                component: COMPONENT_ID,
                page: 1
            });
        });
        menu.append(item);
    }

    function maskPasswordSetting(item) {
        if (!window.MutationObserver || !item || typeof item.find !== 'function') return;

        var value = item.find('.settings-param__value')[0];
        if (!value) return;

        function mask() {
            var current = value.textContent || '';
            if (!current || /^\*+$/.test(current)) return;
            value.textContent = new Array(current.length + 1).join('*');
        }

        var observer = new window.MutationObserver(function () {
            mask();
        });
        observer.observe(value, {
            childList: true,
            characterData: true,
            subtree: true
        });
        mask();
    }

    function registerSettings() {
        var api = window.Lampa.SettingsApi;
        if (!api || typeof api.addComponent !== 'function' || typeof api.addParam !== 'function') {
            notify('Эта сборка Lampa не поддерживает SettingsApi для WebDAV');
            return;
        }

        api.addComponent({
            component: 'lampa_webdav',
            name: 'WebDAV',
            icon: '<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M5 8h34v5H5zm0 11h34v5H5zm0 11h34v5H5z"/></svg>'
        });

        [
            { name: KEYS.url, label: 'Адрес WebDAV', placeholder: 'https://server.example/webdav/' },
            { name: KEYS.username, label: 'Логин', placeholder: 'Необязательно' },
            { name: KEYS.password, label: 'Пароль', placeholder: 'Необязательно' }
        ].forEach(function (item) {
            api.addParam({
                component: 'lampa_webdav',
                param: {
                    name: item.name,
                    type: 'input',
                    values: '',
                    placeholder: item.placeholder,
                    default: ''
                },
                field: { name: item.label },
                onRender: item.name === KEYS.password ? maskPasswordSetting : undefined
            });
        });
    }

    function init() {
        if (window.plugin_lampa_webdav_ready) return;
        window.plugin_lampa_webdav_ready = true;
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
