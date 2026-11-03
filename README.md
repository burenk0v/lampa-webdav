# Lampa WebDAV

A client-side WebDAV browser plugin for Lampa, initially targeting Samsung TVs running Tizen and a Keenetic WebDAV share.

## Status

Early prototype. The protocol helpers and automated tests are in place; TV-side integration and real Keenetic playback still need validation.

## First milestone

- Configure a WebDAV endpoint and credentials in Lampa.
- Browse folders using WebDAV `PROPFIND`.
- Show common video files and open them with Lampa's native player.
- Validate HTTP Range seeking and Samsung remote navigation.
- Diagnose browser CORS/preflight restrictions explicitly.

## Compatibility constraints

- The browser must be allowed by the WebDAV server to send cross-origin `PROPFIND` requests and the `Depth` header. If Keenetic does not return suitable CORS headers, a browser-only plugin cannot bypass that restriction.
- Basic credentials can authenticate listing requests. Passing credentials to the native media player is a separate problem: the HTML media stack may not reuse JavaScript request headers. Playback against an authenticated share must be tested on the target TV before it is considered supported.
- Credentials are not embedded in source code.

## Development

Requires Node.js 20 or newer.

```sh
npm test
```

## Installation (after the prototype is validated)

Host the built plugin over HTTPS and add its URL in Lampa: **Settings → Extensions → Add plugin**.

A production plugin URL is not published yet.
