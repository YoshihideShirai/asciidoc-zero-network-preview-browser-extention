import asciidoctorFactory from '@asciidoctor/core';
import { defaultRenderer, errorRenderer } from 'asciidoctor-kroki-embedded/html';
import numberedCaptions from 'asciidoctor-numbered-captions';
import { emojiMap } from './emoji-map';
import { getSettings, readSource } from './storage';
import type { PreviewSettings, StoredSource } from './types';

const diagramBlockNames = ['mermaid', 'plantuml', 'nomnoml', 'vega', 'vegalite', 'wavedrom', 'bytefield'];
const preview = document.querySelector<HTMLElement>('#preview');
const documentTitle = document.querySelector<HTMLElement>('#document-title');
const openFileButton = document.querySelector<HTMLButtonElement>('#open-file');
const reloadButton = document.querySelector<HTMLButtonElement>('#reload-source');
const toggleWidthButton = document.querySelector<HTMLButtonElement>('#toggle-width');
const fileInput = document.querySelector<HTMLInputElement>('#file-input');

let currentSource: StoredSource | undefined;
let currentSettings: PreviewSettings | undefined;

void boot();

async function boot(): Promise<void> {
  currentSettings = await getSettings();
  applyWidth(currentSettings.previewWidth);

  const sourceId = new URL(location.href).searchParams.get('sourceId');
  currentSource = sourceId ? await readSource(sourceId) : undefined;

  if (currentSource) {
    await renderStoredSource(currentSource);
  } else {
    renderEmptyState();
  }
}

openFileButton?.addEventListener('click', () => fileInput?.click());
reloadButton?.addEventListener('click', () => {
  if (currentSource) {
    void renderStoredSource(currentSource);
  }
});
toggleWidthButton?.addEventListener('click', () => {
  const next = document.body.classList.contains('preview-width-window') ? 'default' : 'window';
  applyWidth(next);
});
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }

  void file.text().then((source) => {
    currentSource = {
      mode: 'source',
      source,
      title: file.name,
      createdAt: Date.now(),
    };
    return renderStoredSource(currentSource);
  });
});

async function renderStoredSource(stored: StoredSource): Promise<void> {
  if (!preview || !currentSettings) {
    return;
  }

  setTitle(stored.title || stored.sourceUrl || 'AsciiDoc document');
  preview.innerHTML = '<p>Rendering...</p>';

  try {
    if (stored.mode === 'full-file-diff') {
      await renderFullFileDiff(stored);
      return;
    }

    const body = convertAsciiDoc(stored.source);
    preview.innerHTML = rewriteSourceDiagramBlocks(rewriteImageUris(body, stored.sourceUrl, currentSettings));
    prepareKrokiEmbeddedDiagrams();
    await Promise.allSettled([renderMath(), renderDiagrams()]);
  } catch (error) {
    preview.innerHTML = `<h1>Preview failed</h1><pre class="preview-error">${escapeHtml(String(error instanceof Error ? error.stack || error.message : error))}</pre>`;
  }
}

async function renderFullFileDiff(stored: Extract<StoredSource, { mode: 'full-file-diff' }>): Promise<void> {
  if (!preview || !currentSettings) {
    return;
  }

  preview.replaceChildren();
  const root = document.createElement('section');
  root.className = 'full-file-diff-preview';

  const heading = document.createElement('h1');
  heading.textContent = 'AsciiDoc full file diff preview';
  root.append(heading);

  const summary = document.createElement('p');
  summary.className = 'full-file-diff-summary';
  summary.textContent = `${stored.files.length} AsciiDoc file${stored.files.length === 1 ? '' : 's'} changed.`;
  root.append(summary);

  if (stored.files.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'full-file-diff-empty';
    empty.textContent = 'No changed AsciiDoc files were found in this pull request.';
    root.append(empty);
    preview.append(root);
    return;
  }

  const selector = document.createElement('label');
  selector.className = 'full-file-diff-selector';
  selector.textContent = 'File';

  const select = document.createElement('select');
  for (const [index, file] of stored.files.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = getFullFileDiffLabel(file);
    select.append(option);
  }
  selector.append(select);
  root.append(selector);

  const selectedFileContainer = document.createElement('div');
  selectedFileContainer.className = 'full-file-diff-selected-file';
  root.append(selectedFileContainer);

  preview.append(root);

  const renderSelectedFile = async (): Promise<void> => {
    const selectedIndex = Number.parseInt(select.value, 10);
    const selectedFile = stored.files[selectedIndex] || stored.files[0];
    if (!selectedFile) {
      return;
    }
    selectedFileContainer.replaceChildren(renderFullFileDiffFile(selectedFile));
    prepareKrokiEmbeddedDiagrams();
    await Promise.allSettled([renderMath(), renderDiagrams()]);
  };

  select.addEventListener('change', () => {
    void renderSelectedFile();
  });
  await renderSelectedFile();
}

function renderFullFileDiffFile(file: Extract<StoredSource, { mode: 'full-file-diff' }>['files'][number]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'full-file-diff-file';

  const fileHeading = document.createElement('h2');
  fileHeading.textContent = file.newPath || file.oldPath || 'AsciiDoc file';
  section.append(fileHeading);

  const status = document.createElement('p');
  status.className = 'full-file-diff-status';
  status.textContent = file.oldPath && file.newPath && file.oldPath !== file.newPath
    ? `${file.status}: ${file.oldPath} -> ${file.newPath}`
    : file.status;
  section.append(status);

  if (file.error) {
    const error = document.createElement('pre');
    error.className = 'preview-error full-file-diff-error';
    error.textContent = file.error;
    section.append(error);
  }

  const columns = document.createElement('div');
  columns.className = 'full-file-diff-frame';
  columns.append(
    renderFullFileDiffColumn('Before', file.oldSource || '', file.oldSourceUrl),
    renderFullFileDiffColumn('After', file.newSource || '', file.newSourceUrl),
  );
  section.append(columns);

  return section;
}

function getFullFileDiffLabel(file: Extract<StoredSource, { mode: 'full-file-diff' }>['files'][number]): string {
  const path = file.newPath || file.oldPath || 'AsciiDoc file';
  if (file.oldPath && file.newPath && file.oldPath !== file.newPath) {
    return `${path} (${file.status}: ${file.oldPath})`;
  }
  return `${path} (${file.status})`;
}

function renderFullFileDiffColumn(label: string, source: string, sourceUrl: string | undefined): HTMLElement {
  const column = document.createElement('section');
  column.className = `full-file-diff-column full-file-diff-${label.toLowerCase()}`;

  const heading = document.createElement('h4');
  heading.textContent = label;
  column.append(heading);

  const body = document.createElement('div');
  body.className = 'full-file-diff-rendered doc';

  if (source.trim()) {
    const converted = convertAsciiDoc(source);
    body.innerHTML = rewriteSourceDiagramBlocks(rewriteImageUris(converted, sourceUrl, currentSettings || { previewWidth: 'default', allowedPreviewHosts: [] }));
  } else {
    const empty = document.createElement('p');
    empty.className = 'full-file-diff-empty';
    empty.textContent = 'No content on this side of the diff.';
    body.append(empty);
  }

  column.append(body);
  return column;
}

function convertAsciiDoc(source: string): string {
  const asciidoctor = asciidoctorFactory();
  const registry = asciidoctor.Extensions.create();

  registerEmbeddedDiagramBlocks(registry);
  registerEmojiMacro(registry);
  numberedCaptions.register(registry, {
    defaultNumbering: 'chaptered',
  });

  return String(asciidoctor.convert(source, {
    safe: 'safe',
    backend: 'html5',
    standalone: false,
    attributes: {
      showtitle: true,
      sectanchors: true,
      icons: 'font',
      stem: 'latexmath',
      'allow-uri-read': false,
    },
    extension_registry: registry,
  }));
}

function registerEmbeddedDiagramBlocks(registry: any): void {
  for (const diagramType of diagramBlockNames) {
    registry.block(diagramType, function (this: any) {
      this.onContext(['listing', 'literal']);
      this.positionalAttributes(['target', 'format']);
      this.process(function (this: any, parent: any, reader: any, attrs: Record<string, string>) {
        const source = applySubs(parent, reader.read(), attrs.subs);
        return this.createBlock(parent, 'pass', defaultRenderer({
          diagramType,
          source,
          attrs,
          document: parent.getDocument(),
          options: { defaultFormat: 'svg' },
        }), attrs);
      });
    });

    registry.blockMacro(diagramType, function (this: any) {
      this.process(function (this: any, parent: any, target: string) {
        return this.createBlock(parent, 'pass', errorRenderer({
          diagramType,
          message: `Local diagram file macros are not available in the browser extension viewer: ${target}`,
        }), {});
      });
    });
  }
}

function registerEmojiMacro(registry: any): void {
  registry.inlineMacro('emoji', function (this: any) {
    this.positionalAttributes('size');
    this.process(function (this: any, parent: any, target: string, attrs: { size?: string }) {
      return this.createInlinePass(parent, renderEmoji(target, attrs?.size));
    });
  });
}

function applySubs(parent: any, value: string, subs?: string): string {
  if (!subs || typeof parent.applySubs !== 'function') {
    return value;
  }
  return parent.applySubs(value, parent.resolveSubs(subs));
}

function renderEmoji(target: string, sizeAttr?: string): string {
  const unicode = emojiMap[target];
  if (!unicode) {
    return `<span class="emoji emoji-missing">[emoji ${escapeHtml(target)} not found]</span>`;
  }

  const label = escapeHtml(target);
  const size = resolveEmojiSize(sizeAttr);
  const emoji = escapeHtml(unicode.split('-').map((codepoint) => String.fromCodePoint(Number.parseInt(codepoint, 16))).join(''));
  return `<span class="emoji" role="img" aria-label="${label}" title="${label}" style="font-size: ${size};">${emoji}</span>`;
}

function resolveEmojiSize(sizeAttr?: string): string {
  const defaultSize = '24px';
  const sizeMap: Record<string, string> = {
    '1x': '17px',
    lg: defaultSize,
    '2x': '34px',
    '3x': '50px',
    '4x': '68px',
    '5x': '85px',
  };
  const trimmed = typeof sizeAttr === 'string' ? sizeAttr.trim() : '';
  if (!trimmed) {
    return defaultSize;
  }
  if (/^\d{1,3}px$/.test(trimmed)) {
    return trimmed;
  }
  return sizeMap[trimmed] || defaultSize;
}

function rewriteSourceDiagramBlocks(html: string): string {
  let rewritten = html;

  for (const diagramType of diagramBlockNames) {
    const pattern = new RegExp(`<div class="listingblock">\\s*<div class="content">\\s*<pre class="highlight"><code class="language-${diagramType}" data-lang="${diagramType}">([\\s\\S]*?)<\\/code><\\/pre>\\s*<\\/div>\\s*<\\/div>`, 'gi');
    rewritten = rewritten.replace(pattern, (_match: string, source: string) => defaultRenderer({
      diagramType,
      source: unescapeHtml(source),
      attrs: { format: 'svg' },
      options: { defaultFormat: 'svg' },
    }));
  }

  return rewritten;
}

function rewriteImageUris(html: string, sourceUrl: string | undefined, settings: PreviewSettings): string {
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (_match, before: string, src: string, after: string) => {
    if (/^(?:https?:|ftp:|\/\/)/i.test(src)) {
      return `${before}${escapeHtmlAttribute(getAllowedRemoteImageSrc(src, settings.allowedPreviewHosts) ?? blockedImageUri())}${after}`;
    }

    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(src) || !sourceUrl) {
      return `${before}${src}${after}`;
    }

    try {
      return `${before}${escapeHtmlAttribute(new URL(src, sourceUrl).href)}${after}`;
    } catch {
      return `${before}${src}${after}`;
    }
  });
}

function getAllowedRemoteImageSrc(src: string, allowedHosts: string[]): string | undefined {
  const normalizedSrc = src.startsWith('//') ? `https:${src}` : src;
  let url: URL;

  try {
    url = new URL(normalizedSrc);
  } catch {
    return undefined;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }

  for (const value of allowedHosts) {
    const allowed = parseAllowedPreviewHost(value);
    if (allowed && allowed.hostname === url.hostname.toLowerCase() && allowed.port === url.port && allowed.schemes.includes(url.protocol.slice(0, -1))) {
      return normalizedSrc;
    }
  }

  return undefined;
}

function parseAllowedPreviewHost(value: string): { hostname: string; port: string; schemes: string[] } | undefined {
  const trimmed = value.trim();
  if (!trimmed || /[*\s]/.test(trimmed)) {
    return undefined;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return undefined;
  }

  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if ((hasScheme && scheme !== 'http' && scheme !== 'https') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    return undefined;
  }

  return {
    hostname: url.hostname.toLowerCase(),
    port: url.port,
    schemes: hasScheme ? [scheme] : ['https', 'http'],
  };
}

function prepareKrokiEmbeddedDiagrams(): void {
  for (const diagram of document.querySelectorAll<HTMLElement>('.kroki-embedded[data-diagram-type]')) {
    const diagramType = diagram.dataset.diagramType || diagram.getAttribute('data-diagram-type');
    const source = diagram.querySelector<HTMLElement>('.kroki-embedded-source');
    const output = diagram.querySelector<HTMLElement>('.kroki-embedded-output');
    if (!diagramType || !source || !output) {
      continue;
    }

    diagram.classList.add(`${diagramType}-diagram`, 'diagram-frame');
    source.classList.add(`${diagramType}-source`, 'diagram-source');
    output.classList.add(`${diagramType}-output`);

    if (diagramType === 'mermaid' && !output.querySelector('.mermaid')) {
      const mermaidSource = document.createElement('pre');
      mermaidSource.className = 'mermaid';
      mermaidSource.textContent = source.textContent || '';
      output.replaceChildren(mermaidSource);
    }
  }
}

async function renderMath(): Promise<void> {
  if (!window.MathJax || !preview) {
    return;
  }

  try {
    await window.MathJax.startup.promise;
    await window.MathJax.typesetPromise([preview]);
  } catch (error) {
    const container = document.createElement('pre');
    container.className = 'mathjax-error';
    container.textContent = String(error instanceof Error ? error.message : error);
    preview.prepend(container);
  }
}

async function renderDiagrams(): Promise<void> {
  await Promise.allSettled([
    runDiagramRenderer('mermaid', renderMermaid),
    runDiagramRenderer('plantuml', renderPlantUml),
    runDiagramRenderer('nomnoml', () => {
      renderNomnoml();
    }),
    runDiagramRenderer('vega', renderVega),
    runDiagramRenderer('wavedrom', () => {
      renderWaveDrom();
    }),
    runDiagramRenderer('bytefield', () => {
      renderBytefield();
    }),
  ]);
}

async function runDiagramRenderer(diagramType: string, render: () => void | Promise<void>): Promise<void> {
  try {
    await render();
  } catch (error) {
    markDiagramRendererError(diagramType, error instanceof Error ? error.message : String(error));
  }
}

function markDiagramRendererError(diagramType: string, message: string): void {
  const outputSelector = diagramType === 'mermaid'
    ? '.mermaid'
    : `.${diagramType}-output`;
  for (const output of document.querySelectorAll<HTMLElement>(outputSelector)) {
    showDiagramError(output, message);
  }
}

async function renderMermaid(): Promise<void> {
  const api = window.mermaid;
  if (!api) {
    return;
  }

  api.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
  });

  try {
    await api.run({ querySelector: '.mermaid' });
  } catch (error) {
    for (const diagram of document.querySelectorAll<HTMLElement>('.mermaid')) {
      diagram.classList.add('mermaid-error');
      diagram.textContent = String(error instanceof Error ? error.message : error);
    }
  }
}

async function renderPlantUml(): Promise<void> {
  const diagrams = [...document.querySelectorAll<HTMLElement>('.plantuml-diagram')];
  if (diagrams.length === 0) {
    return;
  }

  const { renderToString } = await import(chrome.runtime.getURL('media/plantuml.js'));

  for (const diagram of diagrams) {
    const source = diagram.querySelector<HTMLElement>('.plantuml-source');
    const output = diagram.querySelector<HTMLElement>('.plantuml-output');
    if (!source || !output) {
      continue;
    }

    await new Promise<void>((resolve) => {
      try {
        renderToString(
          (source.textContent || '').split(/\r\n|\r|\n/),
          (svg: string) => {
            output.innerHTML = svg;
            resolve();
          },
          (message: string) => {
            showDiagramError(output, message || 'PlantUML rendering failed');
            resolve();
          },
        );
      } catch (error) {
        showDiagramError(output, error instanceof Error ? error.message : String(error));
        resolve();
      }
    });
  }
}

function renderNomnoml(): void {
  for (const diagram of document.querySelectorAll<HTMLElement>('.nomnoml-diagram')) {
    const source = diagram.querySelector<HTMLElement>('.nomnoml-source');
    const output = diagram.querySelector<HTMLElement>('.nomnoml-output');
    if (!source || !output || !window.nomnoml) {
      continue;
    }

    try {
      output.innerHTML = window.nomnoml.renderSvg(source.textContent);
    } catch (error) {
      showDiagramError(output, error instanceof Error ? error.message : String(error));
    }
  }
}

async function renderVega(): Promise<void> {
  for (const diagramType of ['vega', 'vegalite'] as const) {
    for (const diagram of document.querySelectorAll<HTMLElement>(`.${diagramType}-diagram`)) {
      const source = diagram.querySelector<HTMLElement>(`.${diagramType}-source`);
      const output = diagram.querySelector<HTMLElement>(`.${diagramType}-output`);
      if (!source || !output || !window.vega || !window.vegaInterpreter) {
        continue;
      }

      try {
        const spec = JSON.parse(source.textContent || '{}');
        const vegaSpec = diagramType === 'vegalite' ? window.vegaLite.compile(spec).spec : spec;
        const runtime = window.vega.parse(vegaSpec, null, { ast: true });
        const view = new window.vega.View(runtime, {
          expr: window.vegaInterpreter.expressionInterpreter,
          renderer: 'svg',
        }).initialize(output).hover();
        await view.runAsync();
      } catch (error) {
        showDiagramError(output, error instanceof Error ? error.message : String(error));
      }
    }
  }
}

function renderWaveDrom(): void {
  for (const [index, diagram] of [...document.querySelectorAll<HTMLElement>('.wavedrom-diagram')].entries()) {
    const source = diagram.querySelector<HTMLElement>('.wavedrom-source');
    const output = diagram.querySelector<HTMLElement>('.wavedrom-output');
    if (!source || !output || !window.WaveDrom || !window.JSON5) {
      continue;
    }

    try {
      output.id = `WaveDrom_Display_${index}`;
      window.WaveDrom.RenderWaveForm(index, window.JSON5.parse(source.textContent || '{}'), 'WaveDrom_Display_', false);
    } catch (error) {
      showDiagramError(output, error instanceof Error ? error.message : String(error));
    }
  }
}

function renderBytefield(): void {
  for (const diagram of document.querySelectorAll<HTMLElement>('.bytefield-diagram')) {
    const source = diagram.querySelector<HTMLElement>('.bytefield-source');
    const output = diagram.querySelector<HTMLElement>('.bytefield-output');
    if (!source || !output || !window.bitfield || !window.JSON5) {
      continue;
    }

    try {
      const spec = window.JSON5.parse(source.textContent || '{}');
      const fields = Array.isArray(spec) ? spec : spec.reg || spec.fields;
      const options = Array.isArray(spec) ? {} : spec.options || {};
      if (!Array.isArray(fields)) {
        throw new Error('Bytefield source must be an array, or an object with a reg or fields array.');
      }
      output.replaceChildren(createSvgNode(window.bitfield.render(fields, options)));
    } catch (error) {
      showDiagramError(output, error instanceof Error ? error.message : String(error));
    }
  }
}

function createSvgNode(jsonMl: any): Node {
  if (typeof jsonMl === 'string' || typeof jsonMl === 'number' || typeof jsonMl === 'boolean') {
    return document.createTextNode(String(jsonMl));
  }

  const [tagName, maybeAttributes, ...rest] = jsonMl;
  const hasAttributes = maybeAttributes && typeof maybeAttributes === 'object' && !Array.isArray(maybeAttributes);
  const attributes = hasAttributes ? maybeAttributes : {};
  const children = hasAttributes ? rest : [maybeAttributes, ...rest];
  const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);

  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      element.setAttribute(name, String(value));
    }
  }

  for (const child of children) {
    if (child !== undefined && child !== null) {
      element.appendChild(createSvgNode(child));
    }
  }

  return element;
}

function showDiagramError(output: HTMLElement, message: string): void {
  output.classList.add('diagram-error');
  output.textContent = message;
}

function renderEmptyState(): void {
  setTitle('Open an AsciiDoc file');
  if (preview) {
    preview.innerHTML = '<h1>Open an AsciiDoc file</h1><p>Use the Open button, or open a local .adoc, .ad, .asciidoc, or .asc file in Chrome or Edge after enabling file URL access for this extension.</p>';
  }
}

function applyWidth(width: 'default' | 'window'): void {
  document.body.classList.toggle('preview-width-window', width === 'window');
  if (toggleWidthButton) {
    toggleWidthButton.setAttribute('aria-pressed', String(width === 'window'));
  }
}

function setTitle(title: string): void {
  document.title = `${title} - AsciiDoc Preview`;
  if (documentTitle) {
    documentTitle.textContent = title;
  }
}

function blockedImageUri(): string {
  return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
