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

    function saveSetting(name, value) {
        window.Lampa.Storage.set(name, name === KEYS.password ? String(value || '') : String(value || '').trim());
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

        function message(text) {
            root.append($('<div class="lampa-webdav__message"></div>').text(text));
        }

        function editSetting(key, title, placeholder) {
            if (!window.Lampa.Input || typeof window.Lampa.Input.show !== 'function') {
                notify('В этой версии Lampa недоступен ввод текста');
                return;
            }
            window.Lampa.Input.show({
                title: title,
                value: setting(key),
                placeholder: placeholder,
                onComplite: function (value) {
                    saveSetting(key, value);
                    if (key === KEYS.url) currentUrl = '';
                    notify(title + ': сохранено');
                },
                onBack: function () {
                    if (window.Lampa.Controller && window.Lampa.Controller.toggle) {
                        window.Lampa.Controller.toggle('content');
                    }
                }
            });
        }

        function addSettingRow(title, value, key, placeholder) {
            var row = $('<div class="selector lampa-webdav__item"></div>');
            row.append($('<div class="lampa-webdav__name"></div>').text(title));
            row.append($('<div class="lampa-webdav__meta"></div>').text(value || 'Не задано'));
            row.on('hover:enter', function () {
                editSetting(key, title, placeholder);
            });
            root.append(row);
        }

        function renderSettings() {
            root.append($('<div class="lampa-webdav__message"></div>').text('Настройки подключения'));
            addSettingRow('Адрес WebDAV', setting(KEYS.url), KEYS.url, 'https://server.example/webdav/');
            addSettingRow('Логин', setting(KEYS.username), KEYS.username, 'Логин (необязательно)');
            addSettingRow('Пароль', setting(KEYS.password) ? '••••••••' : '', KEYS.password, 'Пароль (необязательно)');

            var connect = $('<div class="selector lampa-webdav__item"></div>');
            connect.append($('<div class="lampa-webdav__name"></div>').text('Открыть каталог / обновить'));
            connect.on('hover:enter', function () {
                try {
                    baseUrl = window.LampaWebDAVCore.normalizeBaseUrl(setting(KEYS.url));
                    currentUrl = baseUrl;
                    load();
                } catch (error) {
                    notify('Укажите корректный адрес WebDAV');
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
            request = new window.LampaWebDAVClient.WebDAVClient().list(
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
                        if (!error.status) {
                            message('Проверьте CORS для PROPFIND и заголовка Depth, TLS-сертификат и доступность сервера.');
                        }
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

    function init() {
        if (window.plugin_lampa_webdav_ready) return;
        window.plugin_lampa_webdav_ready = true;
        registerMenu();
    }

    if (window.appready) init();
    else if (window.Lampa && window.Lampa.Listener) {
        window.Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    }
}));
