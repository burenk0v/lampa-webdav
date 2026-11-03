# Lampa WebDAV

A client-side WebDAV browser plugin for Lampa, initially targeting Samsung TVs running Tizen and a Keenetic WebDAV share.

## Status

Early prototype. The protocol helpers and a testable WebDAV PROPFIND client are implemented. Lampa screen integration and real Keenetic playback still need validation.

## Current implementation

- Normalizes WebDAV base URLs and resolves resource hrefs safely.
- Parses WebDAV 207 Multi-Status XML responses.
- Recognizes common video extensions.
- Sends depth-one PROPFIND requests with optional Basic authentication.
- Reports HTTP, timeout, network, CORS, and TLS failures separately.
- Includes Node.js tests for protocol helpers and the request client.

## Next milestones

1. Add the Lampa settings and folder-browser screen.
2. Validate cross-origin requests against the Keenetic endpoint on Samsung Tizen.
3. Open selected files in Lampa's native player.
4. Validate HTTP Range seeking and authenticated playback.
5. Add posters, metadata, series grouping, search, and favorites.

## Compatibility constraints

- The browser must be allowed by the WebDAV server to send cross-origin PROPFIND requests and the Depth header. If Keenetic does not return suitable CORS headers, a browser-only plugin cannot bypass that restriction.
- Basic credentials can authenticate listing requests. Passing credentials to the native media player is a separate problem: the HTML media stack may not reuse JavaScript request headers. Playback against an authenticated share must be tested on the target TV before it is considered supported.
- Credentials are not embedded in source code.

## Development

Requires Node.js 20 or newer.

```sh
npm test
```

## Installation

A production plugin URL is not published yet. Installation instructions will be added after the Lampa UI and TV-side behavior are validated.
