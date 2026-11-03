# Lampa WebDAV

A client-side WebDAV browser plugin for Lampa, targeting Samsung TVs running Tizen and WebDAV shares such as Keenetic.

## Current implementation

- Normalizes WebDAV base URLs and resolves resource hrefs safely.
- Parses WebDAV 207 Multi-Status XML responses.
- Lists folders and common video formats through depth-one \`PROPFIND\`.
- Supports Basic authentication for directory listing.
- Opens unauthenticated video URLs in Lampa's native player.
- Reports HTTP, timeout, network, CORS, and TLS failures.
- Builds a single ES5-compatible plugin file for installation in Lampa.
- Provides URL, username, and password editing directly on the WebDAV plugin page; no global Lampa settings section is used.

## Build and test

Requires Node.js 20 or newer.

\`\`\`sh
npm test
\`\`\`

The command builds \`dist/lampa-webdav.js\`, checks its JavaScript syntax, and runs the automated tests.

## Install in Lampa

The recommended URL (published through GitHub Pages after the Pages deployment workflow completes) is:

\`\`\`
https://burenk0v.github.io/lampa-webdav/dist/lampa-webdav.js
\`\`\`

The raw GitHub URL remains available as a fallback:

\`\`\`
https://raw.githubusercontent.com/burenk0v/lampa-webdav/main/dist/lampa-webdav.js
\`\`\`

Open **WebDAV** from the Lampa menu. Enter the server URL, optional username and password directly on that page, then select **Открыть каталог / обновить**.

## GitHub Pages

Every change to \`dist/lampa-webdav.js\` on \`main\` triggers a Pages deployment. The workflow publishes only the distributable plugin and a small landing page; source files and repository metadata are not published.

## Security and compatibility notes

- Lampa stores plugin settings in its local browser storage. The WebDAV password is therefore stored locally without encryption. Use a dedicated, low-privilege account; do not reuse an important password.
- Basic credentials are sent for directory listing only. The native media player does not inherit JavaScript Authorization headers, so playback of authenticated files is deliberately blocked. Use an unauthenticated/read-only share or a server-side public media URL for playback.
- Cross-origin WebDAV requires the server to allow \`PROPFIND\` and the \`Depth\` header via CORS. A browser-only plugin cannot bypass a CORS policy enforced by Tizen.
- HTTP Range support is required for reliable seeking. This still needs validation on the actual Keenetic server and Samsung TV.
- Real Samsung Tizen + Keenetic end-to-end testing has not yet been completed.
