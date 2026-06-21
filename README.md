# AsciiDoc Zero-Network Preview for Chrome and Edge

Chrome / Edge browser extension version of
[`YoshihideShirai/asciidoc-local-preview-vscode`](https://github.com/YoshihideShirai/asciidoc-local-preview-vscode).

It previews `.adoc`, `.ad`, `.asciidoc`, and `.asc` files with bundled local assets. The preview path does not use CDNs, Kroki servers, or remote diagram services.

## Features

- Detects raw AsciiDoc documents opened in Chrome or Edge and redirects them to the extension viewer.
- Adds a **Full diff preview** button on GitHub pull requests and GitLab.com merge requests for changed AsciiDoc files.
- Provides an explicit **Open** button for local file selection.
- Converts AsciiDoc in the browser with Asciidoctor.js.
- Renders MathJax, Mermaid, PlantUML, Nomnoml, Vega, Vega-Lite, WaveDrom, and Bytefield with bundled assets.
- Supports `emoji:name[]` as local Unicode emoji.
- Applies chapter-aware numbered captions through `asciidoctor-numbered-captions`.
- Blocks remote images by default, with exact-host allowlisting in the options page.
- Installs browser network API guards before bundled preview renderer scripts load.

## Development

```sh
npm install
npm run test
```

`npm run test` runs TypeScript checks, builds `dist/`, and runs the no-network audit.

Create a browser-installable zip package:

```sh
npm run package:zip
```

The zip file is written under `packages/`.

## Load the Extension

1. Run `npm run build`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable developer mode.
4. Load unpacked extension from the generated `dist/` directory.
5. For local `file://` previews, enable **Allow access to file URLs** for this extension.

## CI/CD

GitHub Actions builds and verifies the extension on pushes, pull requests, and manual workflow runs. The workflow uploads the packaged zip as an artifact.

Pushing a version tag such as `v0.1.0` also creates or updates the GitHub Release and attaches the generated zip.

## Browser Notes

The browser extension cannot read arbitrary sibling files from an already opened document unless the browser grants that file access path. Inline diagram blocks are fully supported; local diagram file macros are reported as unavailable in the viewer instead of silently reading from disk.

Remote images remain blocked unless their exact host is listed in the extension options.

Code review full diff previews are opt-in. When the **Full diff preview** button is clicked, the extension requests review metadata and changed AsciiDoc base/head files from GitHub (`api.github.com` and `raw.githubusercontent.com`) or GitLab.com (`gitlab.com/api/v4`), then renders those full documents locally with the same bundled preview pipeline. This review-only fetch path is not used for normal local or raw AsciiDoc previews.
