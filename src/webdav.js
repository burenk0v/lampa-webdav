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
