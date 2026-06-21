import { asciiDocFilePattern, type GitHubPullRequestRef, type StoredSource } from './types';

const alreadyHandledKey = 'asciidocZeroNetworkPreviewHandled';
const pullRequestControlsId = 'asciidoc-zero-network-preview-pr-controls';

void maybeOpenPreview();
window.addEventListener('turbo:load', installGitHubPullRequestPatchButton);
window.addEventListener('popstate', installGitHubPullRequestPatchButton);

async function maybeOpenPreview(): Promise<void> {
  if ((window as any)[alreadyHandledKey]) {
    return;
  }

  installGitHubPullRequestPatchButton();

  const source = readRawDocumentText();
  if (!source) {
    return;
  }

  if (!asciiDocFilePattern.test(location.pathname) || !looksLikeAsciiDoc(source)) {
    return;
  }

  await openPreview({
    mode: 'source',
    source,
    sourceUrl: location.href,
    title: decodeURIComponent(location.pathname.split('/').pop() || 'AsciiDoc document'),
    createdAt: Date.now(),
  });
}

async function openPreview(source: StoredSource): Promise<void> {
  (window as any)[alreadyHandledKey] = true;

  const response = await chrome.runtime.sendMessage({
    type: 'store-source',
    source,
  });

  if (response?.sourceId) {
    location.replace(chrome.runtime.getURL(`viewer.html?sourceId=${encodeURIComponent(response.sourceId)}`));
  }
}

function readRawDocumentText(): string {
  const pre = document.body?.querySelector('pre');
  if (pre && document.body.children.length === 1) {
    return pre.textContent || '';
  }

  const bodyText = document.body?.innerText || '';
  const contentType = document.contentType || '';
  return /^text\/plain\b/i.test(contentType) ? bodyText : '';
}

function looksLikeAsciiDoc(source: string): boolean {
  return /^(=|\[[a-z0-9_-]+\]|include::|image::|:[a-z0-9_-]+:|\w+::)/im.test(source);
}

function installGitHubPullRequestPatchButton(): void {
  const pullRequest = getGitHubPullRequestRef();
  const existingControls = document.getElementById(pullRequestControlsId);
  if (!pullRequest) {
    existingControls?.remove();
    return;
  }
  if (existingControls) {
    return;
  }

  const controls = document.createElement('div');
  controls.id = pullRequestControlsId;
  Object.assign(controls.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  });

  controls.append(createPullRequestPreviewButton('Full diff preview', 'Fetch base and head AsciiDoc files from GitHub and preview full before/after documents', (button) => {
    void openGitHubPullRequestFullDiff(pullRequest, button);
  }));

  document.body?.append(controls);
}

function createPullRequestPreviewButton(label: string, title: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  Object.assign(button.style, {
    padding: '8px 12px',
    border: '1px solid #1f883d',
    borderRadius: '6px',
    background: '#1f883d',
    color: '#ffffff',
    font: '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    lineHeight: '20px',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(31, 35, 40, 0.18)',
  });
  button.addEventListener('click', () => {
    onClick(button);
  });
  return button;
}

async function openGitHubPullRequestFullDiff(pullRequest: GitHubPullRequestRef, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = 'Loading...';
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'store-github-pr-full-diff',
      pullRequest,
    });
    if (response?.sourceId) {
      location.assign(chrome.runtime.getURL(`viewer.html?sourceId=${encodeURIComponent(response.sourceId)}`));
      return;
    }
    throw new Error(response?.error || 'Full diff preview failed.');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Full diff preview';
    button.title = String(error instanceof Error ? error.message : error);
  }
}

function getGitHubPullRequestRef(): GitHubPullRequestRef | undefined {
  if (location.hostname !== 'github.com') {
    return undefined;
  }

  const match = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/);
  if (!match) {
    return undefined;
  }

  return {
    owner: match[1] || '',
    repo: match[2] || '',
    pullNumber: Number.parseInt(match[3] || '0', 10),
    sourceUrl: location.href,
  };
}
