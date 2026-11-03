(function (window, factory) {
    'use strict';
    factory(window, window.jQuery || window.$);
}(typeof window !== 'undefined' ? window : this, function (window, $) {
    'use strict';

    var PLUGIN_ID = 'lampa_webdav';
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

        function message(text) {
            var row = $('<div class="lampa-webdav__message"></div>').text(text);
            root.append(row);
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
            if (self.activity && self.activity.loader) self.activity.loader(true);
            request = new window.LampaWebDAVClient.WebDAVClient().list(
                currentUrl,
                auth,
                {
                    success: function (items) {
                        if (destroyed) return;
                        if (self.activity && self.activity.loader) self.activity.loader(false);
                        root.empty();
                        var up = parentUrl(currentUrl, baseUrl);
                        if (up) {
                            var back = $('<div class="selector lampa-webdav__item"></div>');
                            back.append($('<div class="lampa-webdav__name"></div>').text('..  Вверх'));
                            back.on('hover:enter', function () {
                                window.Lampa.Activity.push({
                                    url: '',
                                    title: 'WebDAV',
                                    component: COMPONENT_ID,
                                    page: 1,
                                    webdavUrl: up
                                });
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
                        message(error.message || 'Не удалось открыть WebDAV каталог');
                        if (!error.status) {
                            message('Если сервер находится на другом домене, проверьте CORS для PROPFIND и заголовка Depth, а также TLS-сертификат.');
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
            try {
                baseUrl = window.LampaWebDAVCore.normalizeBaseUrl(setting(KEYS.url));
                currentUrl = currentUrl || baseUrl;
                currentUrl = window.LampaWebDAVCore.resolveHref(baseUrl, currentUrl);
            } catch (error) {
                message('Укажите корректный WebDAV URL в Настройки → WebDAV');
                return this.render();
            }
            load();
            return this.render();
        };

        this.render = function () {
            return root;
        };

        this.destroy = function () {
            destroyed = true;
            if (request && request.abort) request.abort();
            root.remove();
        };
    }

    function registerSettings() {
        var lampa = window.Lampa;
        lampa.SettingsApi.addComponent({
            component: PLUGIN_ID,
            name: 'WebDAV',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M3 4h7l2 2h9v14H3z"/></svg>',
            after: 'server'
        });
        lampa.SettingsApi.addParam({
            component: PLUGIN_ID,
            param: { name: KEYS.url, type: 'input', default: '', placeholder: 'https://server.example/webdav/' },
            field: { name: 'Адрес WebDAV', description: 'Полный URL каталога WebDAV, например https://host:port/webdav/' }
        });
        lampa.SettingsApi.addParam({
            component: PLUGIN_ID,
            param: { name: KEYS.username, type: 'input', default: '', placeholder: 'Логин' },
            field: { name: 'Логин WebDAV' }
        });
        lampa.SettingsApi.addParam({
            component: PLUGIN_ID,
            param: { name: KEYS.password, type: 'input', default: '', placeholder: 'Пароль' },
            field: { name: 'Пароль WebDAV', description: 'Внимание: Lampa хранит это значение в локальном хранилище без шифрования. Не используйте пароль от важных аккаунтов.' }
        });
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
