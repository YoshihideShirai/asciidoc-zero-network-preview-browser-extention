import { saveSource } from './storage';
import { asciiDocFilePattern, type FullAsciiDocDiffFile, type GitHubPullRequestRef, type GitLabMergeRequestRef, type StoredSource } from './types';

type GitHubPull = {
  base?: { sha?: string; repo?: { full_name?: string } };
  head?: { sha?: string; repo?: { full_name?: string } };
};

type GitHubPullFile = {
  filename?: string;
  previous_filename?: string;
  status?: string;
};

type GitLabMergeRequest = {
  diff_refs?: {
    base_sha?: string;
    head_sha?: string;
  };
  source_project_id?: number;
  target_project_id?: number;
};

type GitLabMergeRequestDiff = {
  old_path?: string;
  new_path?: string;
  new_file?: boolean;
  deleted_file?: boolean;
  renamed_file?: boolean;
};

const githubNamePattern = /^[A-Za-z0-9_.-]+$/;
const gitlabProjectPathPattern = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/;
const maxFullDiffFileBytes = 1024 * 1024;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'store-source') {
    void saveSource(message.source as StoredSource)
      .then((sourceId) => sendResponse({ sourceId }))
      .catch((error) => sendResponse({ error: String(error instanceof Error ? error.message : error) }));

    return true;
  }

  if (message?.type === 'store-github-pr-full-diff') {
    void saveGitHubPullRequestFullDiff(message.reviewRequest as GitHubPullRequestRef)
      .then((sourceId) => sendResponse({ sourceId }))
      .catch((error) => sendResponse({ error: String(error instanceof Error ? error.message : error) }));

    return true;
  }

  if (message?.type === 'store-gitlab-mr-full-diff') {
    void saveGitLabMergeRequestFullDiff(message.reviewRequest as GitLabMergeRequestRef)
      .then((sourceId) => sendResponse({ sourceId }))
      .catch((error) => sendResponse({ error: String(error instanceof Error ? error.message : error) }));

    return true;
  }

  return false;
});

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
});

async function saveGitHubPullRequestFullDiff(pullRequest: GitHubPullRequestRef): Promise<string> {
  validateGitHubPullRequestRef(pullRequest);

  const pull = await fetchGitHubJson<GitHubPull>(githubApiUrl(`/repos/${pullRequest.owner}/${pullRequest.repo}/pulls/${pullRequest.pullNumber}`));
  const baseSha = requireString(pull.base?.sha, 'Missing pull request base SHA.');
  const headSha = requireString(pull.head?.sha, 'Missing pull request head SHA.');
  const baseRepo = parseGitHubFullName(requireString(pull.base?.repo?.full_name, 'Missing pull request base repository.'));
  const headRepo = parseGitHubFullName(requireString(pull.head?.repo?.full_name, 'Missing pull request head repository.'));
  const changedFiles = (await fetchAllGitHubPullFiles(pullRequest)).filter((file) => (
    typeof file.filename === 'string' && asciiDocFilePattern.test(file.filename)
  ) || (
    typeof file.previous_filename === 'string' && asciiDocFilePattern.test(file.previous_filename)
  ));

  const files: FullAsciiDocDiffFile[] = [];
  for (const file of changedFiles) {
    files.push(await fetchFullAsciiDocDiffFile(file, {
      baseRepo,
      headRepo,
      baseSha,
      headSha,
    }));
  }

  const source: StoredSource = {
    mode: 'full-file-diff',
    files,
    title: `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.pullNumber} AsciiDoc full diff`,
    createdAt: Date.now(),
  };
  if (pullRequest.sourceUrl) {
    source.sourceUrl = pullRequest.sourceUrl;
  }

  return saveSource(source);
}

async function saveGitLabMergeRequestFullDiff(mergeRequest: GitLabMergeRequestRef): Promise<string> {
  validateGitLabMergeRequestRef(mergeRequest);

  const projectId = encodeGitLabProjectId(mergeRequest.projectPath);
  const mr = await fetchGitLabJson<GitLabMergeRequest>(gitlabApiUrl(`/projects/${projectId}/merge_requests/${mergeRequest.mergeRequestIid}`));
  const baseSha = requireString(mr.diff_refs?.base_sha, 'Missing merge request base SHA.');
  const headSha = requireString(mr.diff_refs?.head_sha, 'Missing merge request head SHA.');
  const targetProjectId = requireNumber(mr.target_project_id, 'Missing merge request target project.');
  const sourceProjectId = requireNumber(mr.source_project_id, 'Missing merge request source project.');
  const changedFiles = (await fetchAllGitLabMergeRequestDiffs(mergeRequest)).filter((file) => (
    typeof file.new_path === 'string' && asciiDocFilePattern.test(file.new_path)
  ) || (
    typeof file.old_path === 'string' && asciiDocFilePattern.test(file.old_path)
  ));

  const files: FullAsciiDocDiffFile[] = [];
  for (const file of changedFiles) {
    files.push(await fetchFullAsciiDocGitLabDiffFile(file, {
      sourceProjectId,
      targetProjectId,
      baseSha,
      headSha,
    }));
  }

  const source: StoredSource = {
    mode: 'full-file-diff',
    files,
    title: `${mergeRequest.projectPath}!${mergeRequest.mergeRequestIid} AsciiDoc full diff`,
    createdAt: Date.now(),
  };
  if (mergeRequest.sourceUrl) {
    source.sourceUrl = mergeRequest.sourceUrl;
  }

  return saveSource(source);
}

async function fetchAllGitHubPullFiles(pullRequest: GitHubPullRequestRef): Promise<GitHubPullFile[]> {
  const files: GitHubPullFile[] = [];
  for (let page = 1; page <= 30; page += 1) {
    const pageFiles = await fetchGitHubJson<GitHubPullFile[]>(
      githubApiUrl(`/repos/${pullRequest.owner}/${pullRequest.repo}/pulls/${pullRequest.pullNumber}/files?per_page=100&page=${page}`),
    );
    files.push(...pageFiles);
    if (pageFiles.length < 100) {
      break;
    }
  }
  return files;
}

async function fetchAllGitLabMergeRequestDiffs(mergeRequest: GitLabMergeRequestRef): Promise<GitLabMergeRequestDiff[]> {
  const files: GitLabMergeRequestDiff[] = [];
  const projectId = encodeGitLabProjectId(mergeRequest.projectPath);
  for (let page = 1; page <= 30; page += 1) {
    const pageFiles = await fetchGitLabJson<GitLabMergeRequestDiff[]>(
      gitlabApiUrl(`/projects/${projectId}/merge_requests/${mergeRequest.mergeRequestIid}/diffs?per_page=100&page=${page}`),
    );
    files.push(...pageFiles);
    if (pageFiles.length < 100) {
      break;
    }
  }
  return files;
}

async function fetchFullAsciiDocDiffFile(file: GitHubPullFile, refs: {
  baseRepo: { owner: string; repo: string };
  headRepo: { owner: string; repo: string };
  baseSha: string;
  headSha: string;
}): Promise<FullAsciiDocDiffFile> {
  const status = file.status || 'modified';
  const oldPath = file.previous_filename || file.filename;
  const newPath = file.filename;
  const result: FullAsciiDocDiffFile = { status };

  if (oldPath) {
    result.oldPath = oldPath;
  }
  if (newPath) {
    result.newPath = newPath;
  }

  try {
    if (oldPath && status !== 'added') {
      result.oldSourceUrl = githubRawUrl(refs.baseRepo.owner, refs.baseRepo.repo, refs.baseSha, oldPath);
      result.oldSource = await fetchGitHubText(result.oldSourceUrl);
    }
    if (newPath && status !== 'removed') {
      result.newSourceUrl = githubRawUrl(refs.headRepo.owner, refs.headRepo.repo, refs.headSha, newPath);
      result.newSource = await fetchGitHubText(result.newSourceUrl);
    }
  } catch (error) {
    result.error = String(error instanceof Error ? error.message : error);
  }

  return result;
}

async function fetchFullAsciiDocGitLabDiffFile(file: GitLabMergeRequestDiff, refs: {
  sourceProjectId: number;
  targetProjectId: number;
  baseSha: string;
  headSha: string;
}): Promise<FullAsciiDocDiffFile> {
  const status = file.new_file ? 'added' : file.deleted_file ? 'removed' : file.renamed_file ? 'renamed' : 'modified';
  const oldPath = file.old_path || file.new_path;
  const newPath = file.new_path;
  const result: FullAsciiDocDiffFile = { status };

  if (oldPath) {
    result.oldPath = oldPath;
  }
  if (newPath) {
    result.newPath = newPath;
  }

  try {
    if (oldPath && status !== 'added') {
      result.oldSourceUrl = gitlabRawFileUrl(refs.targetProjectId, refs.baseSha, oldPath);
      result.oldSource = await fetchGitLabText(result.oldSourceUrl);
    }
    if (newPath && status !== 'removed') {
      result.newSourceUrl = gitlabRawFileUrl(refs.sourceProjectId, refs.headSha, newPath);
      result.newSource = await fetchGitLabText(result.newSourceUrl);
    }
  } catch (error) {
    result.error = String(error instanceof Error ? error.message : error);
  }

  return result;
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function fetchGitLabJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`GitLab request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function fetchGitHubText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GitHub raw file request failed: ${response.status} ${response.statusText}`);
  }

  const sizeHeader = response.headers.get('content-length');
  const size = sizeHeader ? Number.parseInt(sizeHeader, 10) : 0;
  if (size > maxFullDiffFileBytes) {
    throw new Error(`AsciiDoc file is larger than ${maxFullDiffFileBytes} bytes.`);
  }

  const text = await response.text();
  if (text.length > maxFullDiffFileBytes) {
    throw new Error(`AsciiDoc file is larger than ${maxFullDiffFileBytes} characters.`);
  }
  return text;
}

async function fetchGitLabText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GitLab raw file request failed: ${response.status} ${response.statusText}`);
  }

  const sizeHeader = response.headers.get('content-length');
  const size = sizeHeader ? Number.parseInt(sizeHeader, 10) : 0;
  if (size > maxFullDiffFileBytes) {
    throw new Error(`AsciiDoc file is larger than ${maxFullDiffFileBytes} bytes.`);
  }

  const text = await response.text();
  if (text.length > maxFullDiffFileBytes) {
    throw new Error(`AsciiDoc file is larger than ${maxFullDiffFileBytes} characters.`);
  }
  return text;
}

function validateGitHubPullRequestRef(pullRequest: GitHubPullRequestRef): void {
  if (!githubNamePattern.test(pullRequest.owner) || !githubNamePattern.test(pullRequest.repo) || !Number.isInteger(pullRequest.pullNumber) || pullRequest.pullNumber < 1) {
    throw new Error('Invalid GitHub pull request reference.');
  }
}

function validateGitLabMergeRequestRef(mergeRequest: GitLabMergeRequestRef): void {
  if (!gitlabProjectPathPattern.test(mergeRequest.projectPath) || !Number.isInteger(mergeRequest.mergeRequestIid) || mergeRequest.mergeRequestIid < 1) {
    throw new Error('Invalid GitLab merge request reference.');
  }
}

function githubApiUrl(path: string): string {
  return `https://api.github.com${path}`;
}

function gitlabApiUrl(path: string): string {
  return `https://gitlab.com/api/v4${path}`;
}

function githubRawUrl(owner: string, repo: string, sha: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(sha)}/${encodeFilePath(filePath)}`;
}

function gitlabRawFileUrl(projectId: number, sha: string, filePath: string): string {
  return gitlabApiUrl(`/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(sha)}`);
}

function encodeGitLabProjectId(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

function encodeFilePath(filePath: string): string {
  return filePath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function requireString(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function requireNumber(value: number | undefined, message: string): number {
  if (value === undefined || !Number.isInteger(value)) {
    throw new Error(message);
  }
  return value;
}

function parseGitHubFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo, extra] = fullName.split('/');
  if (!owner || !repo || extra || !githubNamePattern.test(owner) || !githubNamePattern.test(repo)) {
    throw new Error('Invalid GitHub repository name.');
  }
  return { owner, repo };
}
