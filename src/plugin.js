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