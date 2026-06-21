export type FullAsciiDocDiffFile = {
  oldPath?: string;
  newPath?: string;
  status: string;
  oldSource?: string;
  newSource?: string;
  oldSourceUrl?: string;
  newSourceUrl?: string;
  error?: string;
};

export type StoredAsciiDocSource = {
  mode?: 'source';
  source: string;
  sourceUrl?: string;
  title?: string;
  createdAt: number;
};

export type StoredFullFileDiffSource = {
  mode: 'full-file-diff';
  files: FullAsciiDocDiffFile[];
  sourceUrl?: string;
  title?: string;
  createdAt: number;
};

export type StoredSource = StoredAsciiDocSource | StoredFullFileDiffSource;

export type GitHubPullRequestRef = {
  platform: 'github';
  owner: string;
  repo: string;
  pullNumber: number;
  sourceUrl?: string;
};

export type GitLabMergeRequestRef = {
  platform: 'gitlab';
  host: string;
  projectPath: string;
  mergeRequestIid: number;
  sourceUrl?: string;
};

export type PreviewSettings = {
  allowedPreviewHosts: string[];
  allowedGitLabHosts: string[];
};

export const defaultSettings: PreviewSettings = {
  allowedPreviewHosts: [],
  allowedGitLabHosts: ['gitlab.com'],
};

export const asciiDocFilePattern = /\.(adoc|asciidoc|asc|ad)(?:[?#].*)?$/i;
