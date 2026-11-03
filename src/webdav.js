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
