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
        var currentParentId = object.dlnaParentId || '';

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
                    load();
                } catch (error) {
                    notify('Укажите адрес и порт DLNA в настройках Lampa');
                }
            });
            root.append(connect);
        }

        function openFolder(objectId, title, parentId) {
            window.Lampa.Activity.push({
                url: '',
                title: title,
                component: COMPONENT_ID,
                page: 1,
                dlnaObjectId: objectId,
                dlnaParentId: parentId || ''
            });
        }

        function playFile(item) {
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
            var row = $('<div class="selector lampa-dlna__item"></div>');
            var label = $('<div class="lampa-dlna__name"></div>').text(item.name);
            var meta = $('<div class="lampa-dlna__meta"></div>').text(item.isDirectory ? 'Папка' : 'Видео');
            row.append(label).append(meta);
            row.on('hover:enter', function () {
                if (item.isDirectory) openFolder(item.id, item.name, item.parentId);
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
            request = new window.LampaDLNAClient.DLNAClient().list(
                setting(KEYS.address),
                setting(KEYS.port),
                currentId,
                {
                    success: function (items) {
                        if (destroyed) return;
                        if (self.activity && self.activity.loader) self.activity.loader(false);
                        root.empty();
                        renderSettings();
                        var up = currentParentId;
                        if (up) {
                            var back = $('<div class="selector lampa-dlna__item"></div>');
                            back.append($('<div class="lampa-dlna__name"></div>').text('..  Вверх'));
                            back.on('hover:enter', function () {
                                openFolder(up, 'DLNA', '');
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
                        message(error.message || 'Не удалось открыть DLNA каталог');
                        if (!error.status) {
                            message('Проверьте, разрешает ли DLNA-сервер запросы из браузера телевизора (CORS).');
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