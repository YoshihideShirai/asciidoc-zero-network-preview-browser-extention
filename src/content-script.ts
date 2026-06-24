import { asciiDocFilePattern, type GitHubPullRequestRef, type GitLabMergeRequestRef, type StoredSource } from './types';
import { getSettings } from './storage';
import { isAllowedGitLabHost } from './gitlab-hosts';

const alreadyHandledKey = 'asciidocZeroNetworkPreviewHandled';
const codeReviewControlsId = 'asciidoc-zero-network-preview-code-review-controls';

void maybeOpenPreview();
window.addEventListener('turbo:load', () => {
  void installCodeReviewPreviewButton();
});
window.addEventListener('popstate', () => {
  void installCodeReviewPreviewButton();
});

async function maybeOpenPreview(): Promise<void> {
  if ((window as any)[alreadyHandledKey]) {
    return;
  }

  await installCodeReviewPreviewButton();

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

async function installCodeReviewPreviewButton(): Promise<void> {
  const reviewRequest = await getCodeReviewRequestRef();
  const existingControls = document.getElementById(codeReviewControlsId);
  if (!reviewRequest) {
    existingControls?.remove();
    return;
  }
  const reviewKey = getCodeReviewRequestKey(reviewRequest);
  if (existingControls?.dataset.reviewKey === reviewKey) {
    return;
  }
  existingControls?.remove();

  const controls = document.createElement('div');
  controls.id = codeReviewControlsId;
  controls.dataset.reviewKey = reviewKey;
  Object.assign(controls.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    maxWidth: 'min(720px, calc(100vw - 32px))',
  });

  const status = createCodeReviewPreviewStatus();
  controls.append(createCodeReviewPreviewButton('Full diff preview', `Fetch base and head AsciiDoc files from ${reviewRequest.platform === 'github' ? 'GitHub' : 'GitLab'} and preview full before/after documents`, (button) => {
    void openCodeReviewFullDiff(reviewRequest, button, status);
  }));
  controls.append(status);

  document.body?.append(controls);
}

function createCodeReviewPreviewButton(label: string, title: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
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

function createCodeReviewPreviewStatus(): HTMLElement {
  const status = document.createElement('pre');
  status.setAttribute('role', 'status');
  Object.assign(status.style, {
    display: 'none',
    maxWidth: '520px',
    maxHeight: '160px',
    overflow: 'auto',
    margin: '0',
    padding: '8px 12px',
    border: '1px solid #cf222e',
    borderRadius: '6px',
    background: '#ffebe9',
    color: '#cf222e',
    whiteSpace: 'pre-wrap',
    font: '12px ui-monospace, SFMono-Regular, SFMono, Consolas, "Liberation Mono", monospace',
    lineHeight: '16px',
    boxShadow: '0 8px 24px rgba(31, 35, 40, 0.18)',
  });
  return status;
}

function getCodeReviewRequestKey(reviewRequest: GitHubPullRequestRef | GitLabMergeRequestRef): string {
  if (reviewRequest.platform === 'github') {
    return `github:${reviewRequest.owner}/${reviewRequest.repo}#${reviewRequest.pullNumber}`;
  }
  return `gitlab:${reviewRequest.host}/${reviewRequest.projectPath}!${reviewRequest.mergeRequestIid}`;
}

async function openCodeReviewFullDiff(reviewRequest: GitHubPullRequestRef | GitLabMergeRequestRef, button: HTMLButtonElement, status: HTMLElement): Promise<void> {
  button.disabled = true;
  button.textContent = 'Loading...';
  status.style.display = 'none';
  status.textContent = '';
  try {
    const response = await chrome.runtime.sendMessage({
      type: reviewRequest.platform === 'github' ? 'store-github-pr-full-diff' : 'store-gitlab-mr-full-diff',
      reviewRequest,
    });
    if (response?.sourceId) {
      location.assign(chrome.runtime.getURL(`viewer.html?sourceId=${encodeURIComponent(response.sourceId)}`));
      return;
    }
    throw new Error(response?.error || 'Full diff preview failed.');
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    button.disabled = false;
    button.textContent = 'Full diff preview';
    button.title = message;
    status.textContent = message;
    status.style.display = 'block';
  }
}

async function getCodeReviewRequestRef(): Promise<GitHubPullRequestRef | GitLabMergeRequestRef | undefined> {
  const githubPullRequest = getGitHubPullRequestRef();
  if (githubPullRequest) {
    return githubPullRequest;
  }

  const gitLabMergeRequest = getGitLabMergeRequestRef();
  if (!gitLabMergeRequest) {
    return undefined;
  }

  const settings = await getSettings();
  return isAllowedGitLabHost(gitLabMergeRequest.host, settings.allowedGitLabHosts) ? gitLabMergeRequest : undefined;
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
    platform: 'github',
    owner: match[1] || '',
    repo: match[2] || '',
    pullNumber: Number.parseInt(match[3] || '0', 10),
    sourceUrl: location.href,
  };
}

function getGitLabMergeRequestRef(): GitLabMergeRequestRef | undefined {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') {
    return undefined;
  }

  const match = location.pathname.match(/^\/(.+)\/-\/merge_requests\/(\d+)(?:\/.*)?$/);
  if (!match) {
    return undefined;
  }

  return {
    platform: 'gitlab',
    host: `${location.protocol}//${location.host.toLowerCase()}`,
    projectPath: match[1] || '',
    mergeRequestIid: Number.parseInt(match[2] || '0', 10),
    sourceUrl: location.href,
  };
}
