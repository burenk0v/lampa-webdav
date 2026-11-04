# Lampa DLNA

A client-side DLNA / UPnP ContentDirectory browser plugin for Lampa, targeting Samsung TVs running Tizen and media servers such as Keenetic.

## Current implementation

- Connects to a DLNA server by address and HTTP port.
- Reads the UPnP device description from `/rootDesc.xml` and discovers its ContentDirectory control URL.
- Browses folders and media through SOAP `BrowseDirectChildren` requests.
- Parses DIDL-Lite containers and media resources.
- Opens video resource URLs in Lampa's native player.
- Provides address and port settings directly on the DLNA plugin page.
- Uses ES5-compatible browser code.

## Build and test

Requires Node.js 20 or newer.

```sh
npm test
```

The command builds `dist/lampa-webdav.js`, checks its JavaScript syntax, and runs the automated tests.

## Install in Lampa

The recommended URL (published through GitHub Pages after the Pages deployment workflow completes) is:

```
https://burenk0v.github.io/lampa-webdav/dist/lampa-webdav.js
```

Open **DLNA** from the Lampa menu. Enter the DLNA server address and port in the plugin settings. Keenetic installations commonly use port `8200`; verify the actual port in the router's DLNA settings.

## Compatibility notes

- The browser plugin uses HTTP GET for `rootDesc.xml` and SOAP HTTP POST for ContentDirectory browsing. The TV browser and DLNA server must permit these cross-origin requests (CORS).
- SSDP discovery is not used because browser JavaScript cannot send or receive the required UDP multicast traffic. The server address and port are entered manually.
- Media playback is delegated to Lampa's native player using the resource URL advertised by the DLNA server.
- Seeking depends on the media server supporting HTTP byte ranges.
- Real Samsung Tizen + Keenetic end-to-end testing has not yet been completed.
