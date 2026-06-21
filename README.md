# AsciiDoc Zero-Network Preview for Chrome and Edge

English | [日本語](README.ja.md)

Chrome / Edge browser extension version of
[`YoshihideShirai/asciidoc-local-preview-vscode`](https://github.com/YoshihideShirai/asciidoc-local-preview-vscode).

It previews `.adoc`, `.ad`, `.asciidoc`, and `.asc` files with bundled local assets. The preview path does not use CDNs, Kroki servers, or remote diagram services.

## Features

- Detects raw AsciiDoc documents opened in Chrome or Edge and redirects them to the extension viewer.
- Adds a **Full diff preview** button on GitHub pull requests and allowed GitLab merge requests for changed AsciiDoc files.
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

## GitHub and GitLab Diff Preview

On GitHub pull requests and allowed GitLab merge requests, the extension adds a floating **Full diff preview** button. Clicking it fetches the changed AsciiDoc files from the base and head revisions, then opens a local full-document before/after preview in the extension viewer.

This preview is limited to changed files ending in `.adoc`, `.ad`, `.asciidoc`, or `.asc`. GitHub pull requests are supported on `github.com`. GitLab merge requests are supported only for hosts listed in the extension options; `https://gitlab.com` is allowed by default.

The diff preview uses the same bundled rendering pipeline as normal AsciiDoc previews, including local diagram renderers and remote image blocking. It is opt-in per review page: network requests for review metadata and changed AsciiDoc file contents are made only after clicking **Full diff preview**.

## Options

Open the extension options page to configure the allowlists used by previews.

| Setting | Default | Description |
| --- | --- | --- |
| Allowed remote image hosts | Empty | Exact hosts that remote images may load from in rendered previews. Host-only entries allow both `http` and `https` for that host; URL entries use the URL host. Remote images from all other hosts are blocked. |
| GitLab full diff preview hosts | `https://gitlab.com` | Exact GitLab hosts where the **Full diff preview** button may appear and where GitLab merge request metadata and changed AsciiDoc files may be fetched. Host-only entries use `https`; use `http://` only for self-hosted HTTP GitLab instances. |

## CI/CD

GitHub Actions builds and verifies the extension on pushes, pull requests, and manual workflow runs. The workflow uploads the packaged zip as an artifact.

Pushing a version tag such as `v0.1.0` also creates or updates the GitHub Release and attaches the generated zip.

## Browser Notes

The browser extension cannot read arbitrary sibling files from an already opened document unless the browser grants that file access path. Inline diagram blocks are fully supported; local diagram file macros are reported as unavailable in the viewer instead of silently reading from disk.

Remote images remain blocked unless their exact host is listed in the extension options.

Code review full diff previews are opt-in. When the **Full diff preview** button is clicked, the extension requests review metadata and changed AsciiDoc base/head files from GitHub (`api.github.com` and `raw.githubusercontent.com`) or an allowed HTTPS GitLab host, then renders those full documents locally with the same bundled preview pipeline. GitLab.com is allowed by default; self-managed GitLab hosts must be added in the extension options before the button appears or the API request is accepted. This review-only fetch path is not used for normal local or raw AsciiDoc previews.
