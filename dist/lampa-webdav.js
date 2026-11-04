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
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;');
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
    }

    DLNAClient.prototype.list = function (address, port, objectId, callbacks) {
        callbacks = callbacks || {};
        var self = this;
        var completed = false;
        var active = null;
        var baseUrl;
        var service;

        function fail(message, status) {
            if (completed) return;
            completed = true;
            if (callbacks.error) callbacks.error({ message: message, status: status || 0 });
        }

        function request(method, url, body, headers, done) {
            var xhr = self.createRequest();
            active = xhr;
            xhr.open(method, url, true);
            xhr.timeout = 20000;
            Object.keys(headers || {}).forEach(function (name) {
                xhr.setRequestHeader(name, headers[name]);
            });
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4 || completed) return;
                if (xhr.status < 200 || xhr.status >= 300) {
                    fail('DLNA-сервер вернул HTTP ' + xhr.status, xhr.status);
                    return;
                }
                done(xhr.responseText);
            };
            xhr.onerror = function () { fail('Не удалось подключиться к DLNA-серверу. Проверьте адрес, порт и доступность сервера.'); };
            xhr.ontimeout = function () { fail('Истекло время ожидания ответа DLNA-сервера'); };
            xhr.send(body || null);
        }

        try {
            baseUrl = 'http://' + String(address).trim() + ':' + String(port).trim() + '/';
            request('GET', baseUrl + 'rootDesc.xml', null, {}, function (description) {
                try {
                    service = self.parseDevice(description, baseUrl);
                } catch (error) {
                    fail(error.message);
                    return;
                }
                var soap = '<?xml version="1.0" encoding="utf-8"?>' +
                    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
                    '<s:Body><u:Browse xmlns:u="' + service.serviceType + '">' +
                    '<ObjectID>' + escapeXml(objectId || '0') + '</ObjectID>' +
                    '<BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter>' +
                    '<StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount><SortCriteria></SortCriteria>' +
                    '</u:Browse></s:Body></s:Envelope>';
                request('POST', service.controlUrl, soap, {
                    'Content-Type': 'text/xml; charset="utf-8"',
                    'SOAPAction': '"' + service.serviceType + '#Browse"'
                }, function (response) {
                    try {
                        var result = self.parseBrowse(response, baseUrl);
                        completed = true;
                        if (callbacks.success) callbacks.success(result.items);
                    } catch (error) {
                        fail(error.message);
                    }
                });
            });
        } catch (error) {
            fail(error.message || 'Не удалось начать DLNA-запрос');
        }
        return {
            abort: function () {
                if (!completed && active && active.abort) active.abort();
                completed = true;
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
                    history = [];
                    load();
                } catch (error) {
                    notify('Укажите адрес и порт DLNA в настройках Lampa');
                }
            });
            root.append(connect);
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
