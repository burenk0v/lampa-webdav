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
